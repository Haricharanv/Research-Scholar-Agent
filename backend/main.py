import os
import glob
import json
import uuid
import re
import numpy as np
from typing import List, Optional
from fastapi import FastAPI, UploadFile, File, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from pypdf import PdfReader
import requests
import math
from collections import Counter
from dotenv import load_dotenv

# Load API keys from .env
load_dotenv()

from providers import ProviderRegistry
from research import (
    search_arxiv, search_semantic_scholar, search_crossref,
    download_arxiv_pdf, get_arxiv_metadata,
    ENHANCED_SUMMARY_PROMPT, LITERATURE_REVIEW_PROMPT,
    GAP_ANALYSIS_PROMPT, build_paper_summaries_text,
    COMPARE_PAPERS_PROMPT, DRAFT_SECTION_PROMPT,
)

class TfidfVectorizer:
    def __init__(self, max_features=1000, stop_words='english'):
        self.vocab = {}
        self.idf = {}
        
    def _tokenize(self, text):
        return [w.lower() for w in ''.join(c if c.isalnum() else ' ' for c in text).split() if len(w) > 2]
        
    def fit(self, docs):
        df = Counter()
        for d in docs:
            tokens = self._tokenize(d)
            for w in set(tokens):
                df[w] += 1
        N = len(docs)
        for w, count in df.items():
            self.idf[w] = math.log((N + 1) / (count + 1)) + 1
        self.vocab = {w: i for i, w in enumerate(self.idf.keys())}
        
    def transform(self, docs):
        out = np.zeros((len(docs), len(self.vocab)), dtype=np.float32)
        for i, d in enumerate(docs):
            tokens = self._tokenize(d)
            counts = Counter(tokens)
            for w, c in counts.items():
                if w in self.vocab:
                    out[i, self.vocab[w]] = c * self.idf[w]
        norms = np.linalg.norm(out, axis=1, keepdims=True)
        norms[norms == 0] = 1
        return out / norms
        
    def fit_transform(self, docs):
        self.fit(docs)
        return self.transform(docs)

app = FastAPI(title="Research Scholar Agent API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Global State ---
PAPERS_DIR = "papers"
FAISS_DIR = "faiss_index"

os.makedirs(PAPERS_DIR, exist_ok=True)
os.makedirs(FAISS_DIR, exist_ok=True)

# Initialize the unified provider registry
registry = ProviderRegistry()

class RAGSystem:
    def __init__(self):
        self.vectorizer = None
        self.vectors = None
        self.chunks = []
        self.chunk_metadata = []
        self.meta_path = "faiss_meta.json"
        self.load_index()
        
    def load_index(self):
        if os.path.exists(self.meta_path):
            try:
                with open(self.meta_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    self.chunks = data["chunks"]
                    self.chunk_metadata = data["metadata"]
                
                if len(self.chunks) > 0:
                    self.vectorizer = TfidfVectorizer(max_features=1000, stop_words='english')
                    self.vectors = self.vectorizer.fit_transform(self.chunks).astype(np.float32)
            except Exception as e:
                print(f"Error loading index: {e}")
                self.vectorizer = None
                self.vectors = None
                self.chunks = []
                self.chunk_metadata = []

    def save_index(self):
        with open(self.meta_path, "w", encoding="utf-8") as f:
            json.dump({"chunks": self.chunks, "metadata": self.chunk_metadata}, f)

    def add_document(self, paper_id: str, paper_name: str, text: str):
        # Split on double-newlines first (natural paragraphs)
        paragraphs = [p.strip() for p in text.split("\n\n") if len(p.strip()) > 50]
        if not paragraphs:
            # Fallback: split on single newlines
            paragraphs = [p.strip() for p in text.split("\n") if len(p.strip()) > 50]
        if not paragraphs:
            # Last resort: fixed-size chunks with overlap
            paragraphs = [text[i:i+1000] for i in range(0, len(text), 800) if len(text[i:i+1000].strip()) > 50]
        if not paragraphs: return
        self.chunks.extend(paragraphs)
        for p in paragraphs:
            self.chunk_metadata.append({"paper_id": paper_id, "paper_name": paper_name, "text": p})
            
        self.vectorizer = TfidfVectorizer(max_features=1000, stop_words='english')
        self.vectors = self.vectorizer.fit_transform(self.chunks).astype(np.float32)
        self.save_index()

    def search(self, query: str, top_k: int = 3):
        if self.vectorizer is None or len(self.chunks) == 0:
            return []
        query_vec = self.vectorizer.transform([query]).astype(np.float32)
        scores = np.dot(self.vectors, query_vec.T).flatten()
        top_indices = scores.argsort()[-top_k:][::-1]
        
        results = []
        for idx in top_indices:
            if scores[idx] > 0:
                results.append(self.chunk_metadata[idx])
        return results

rag_system = RAGSystem()

def extract_summary_tfidf(text: str, num_sentences: int = 15) -> str:
    """Fallback extractive summarization to keep LLM context small"""
    try:
        sentences = [s.strip() for s in text.replace('!', '.').replace('?', '.').split('.') if len(s.strip()) > 20]
        if len(sentences) <= num_sentences:
            return text
            
        vectorizer = TfidfVectorizer(stop_words='english')
        tfidf_matrix = vectorizer.fit_transform(sentences)
        scores = np.array(tfidf_matrix.sum(axis=1)).flatten()
        
        top_indices = scores.argsort()[-num_sentences:][::-1]
        top_indices.sort()
        
        return ". ".join([sentences[i] for i in top_indices]) + "."
    except Exception as e:
        print(f"TF-IDF Summarization failed: {e}")
        return text[:6000]


# ──────────────────────────────────────────────
# Helper: load paper data for review/gap analysis
# ──────────────────────────────────────────────

def load_paper_data(paper_id: str) -> Optional[dict]:
    """Load a paper's metadata, summary cache, and text excerpt."""
    meta_path = os.path.join(PAPERS_DIR, f"{paper_id}.meta.json")
    text_path = os.path.join(PAPERS_DIR, f"{paper_id}.txt")
    summary_path = os.path.join(PAPERS_DIR, f"{paper_id}.summary.json")

    if not os.path.exists(meta_path):
        return None

    with open(meta_path, "r", encoding="utf-8") as f:
        meta = json.load(f)

    text_excerpt = ""
    if os.path.exists(text_path):
        with open(text_path, "r", encoding="utf-8") as f:
            raw = f.read()
            text_excerpt = extract_summary_tfidf(raw, num_sentences=20)

    summary = {}
    if os.path.exists(summary_path):
        with open(summary_path, "r", encoding="utf-8") as f:
            summary = json.load(f)

    return {"meta": meta, "summary": summary, "text_excerpt": text_excerpt}


# ──────────────────────────────────────────────
# API Models
# ──────────────────────────────────────────────

class ModelConfigRequest(BaseModel):
    provider: str = "ollama"
    model_name: str = ""

class ChatRequest(BaseModel):
    message: str

class SummarizeRequest(BaseModel):
    paper_id: str

class SearchRequest(BaseModel):
    query: str
    max_results: int = 10
    sort_by: str = "relevance"
    year_range: str = ""

class ImportPaperRequest(BaseModel):
    arxiv_id: str  # Can be an ID like "2301.00001" or a full URL

class GenerateReviewRequest(BaseModel):
    topic: str
    paper_ids: List[str]

class GapAnalysisRequest(BaseModel):
    topic: str
    paper_ids: List[str]

class ComparePapersRequest(BaseModel):
    paper_ids: List[str]

class DraftSectionRequest(BaseModel):
    topic: str
    section_type: str
    notes: str
    paper_ids: List[str]


# ──────────────────────────────────────────────
# Existing Endpoints
# ──────────────────────────────────────────────

@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "index_size": len(rag_system.chunks),
        "active_provider": registry.active_provider_name,
        "active_model": registry.active_model,
    }

@app.get("/api/providers")
def get_providers():
    status = registry.get_status()
    return {
        "providers": status,
        "active_provider": registry.active_provider_name,
        "active_model": registry.active_model,
    }

@app.post("/api/set-model-config")
def set_model_config(req: ModelConfigRequest):
    registry.set_active(req.provider, req.model_name)
    return {
        "status": "success",
        "provider": registry.active_provider_name,
        "model": registry.active_model,
    }

@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    paper_id = str(uuid.uuid4())
    file_path = os.path.join(PAPERS_DIR, f"{paper_id}.pdf")
    
    with open(file_path, "wb") as f:
        f.write(await file.read())
        
    reader = PdfReader(file_path)
    text = ""
    for page in reader.pages:
        text += page.extract_text() + "\n"
        
    rag_system.add_document(paper_id, file.filename, text)
    
    with open(os.path.join(PAPERS_DIR, f"{paper_id}.txt"), "w", encoding="utf-8") as f:
        f.write(text)
        
    with open(os.path.join(PAPERS_DIR, f"{paper_id}.meta.json"), "w", encoding="utf-8") as f:
        json.dump({"id": paper_id, "filename": file.filename}, f)
        
    return {"id": paper_id, "filename": file.filename, "message": "Uploaded and indexed"}

@app.get("/api/papers")
def get_papers():
    papers = []
    for meta_file in glob.glob(f"{PAPERS_DIR}/*.meta.json"):
        with open(meta_file, "r", encoding="utf-8") as f:
            papers.append(json.load(f))
    return {"papers": papers}


# ──────────────────────────────────────────────
# Enhanced Summarization
# ──────────────────────────────────────────────

@app.post("/api/summarize")
def summarize_paper(req: SummarizeRequest):
    text_path = os.path.join(PAPERS_DIR, f"{req.paper_id}.txt")
    if not os.path.exists(text_path):
        raise HTTPException(status_code=404, detail="Paper not found")
        
    with open(text_path, "r", encoding="utf-8") as f:
        text = " ".join(f.read().split())
    
    ext_summary = extract_summary_tfidf(text, num_sentences=20)
    prompt = ENHANCED_SUMMARY_PROMPT.format(text=ext_summary[:8000])
    
    try:
        res_text = registry.generate(prompt, json_mode=True)

        json_match = re.search(r'\{.*\}', res_text, re.DOTALL)
        if json_match:
            clean_json = json_match.group(0)
        else:
            clean_json = res_text
            
        structured_data = json.loads(clean_json)

        # Cache the summary for use in literature review / gap analysis
        summary_path = os.path.join(PAPERS_DIR, f"{req.paper_id}.summary.json")
        with open(summary_path, "w", encoding="utf-8") as f:
            json.dump(structured_data, f, indent=2)

        return {"summary": structured_data}
    except Exception as e:
        return {"error": str(e), "raw": res_text if 'res_text' in locals() else ""}


# ──────────────────────────────────────────────
# Paper Discovery & Search
# ──────────────────────────────────────────────

@app.post("/api/search/arxiv")
def search_arxiv_endpoint(req: SearchRequest):
    results = search_arxiv(req.query, max_results=req.max_results, sort_by=req.sort_by)
    return {"results": results, "source": "arxiv", "query": req.query}

@app.post("/api/search/semantic-scholar")
def search_semantic_scholar_endpoint(req: SearchRequest):
    results = search_semantic_scholar(req.query, max_results=req.max_results, year_range=req.year_range)
    return {"results": results, "source": "semantic_scholar", "query": req.query}

@app.post("/api/search/crossref")
def search_crossref_endpoint(req: SearchRequest):
    results = search_crossref(req.query, max_results=req.max_results, year_range=req.year_range)
    return {"results": results, "source": "crossref", "query": req.query}

@app.post("/api/import-paper")
def import_paper(req: ImportPaperRequest):
    """Download a paper from arXiv by ID/URL and add it to the library."""
    # Get metadata first
    meta = get_arxiv_metadata(req.arxiv_id)
    if not meta:
        raise HTTPException(status_code=404, detail=f"Could not find arXiv paper: {req.arxiv_id}")

    paper_id = str(uuid.uuid4())
    file_path = os.path.join(PAPERS_DIR, f"{paper_id}.pdf")

    # Download PDF
    if not download_arxiv_pdf(req.arxiv_id, file_path):
        raise HTTPException(status_code=500, detail="Failed to download PDF from arXiv")

    # Extract text
    try:
        reader = PdfReader(file_path)
        text = ""
        for page in reader.pages:
            page_text = page.extract_text()
            if page_text:
                text += page_text + "\n"
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read PDF: {str(e)}")

    if not text.strip():
        raise HTTPException(status_code=500, detail="PDF appears to be empty or image-based")

    # Index in RAG
    filename = f"{meta['title'][:80]}.pdf"
    rag_system.add_document(paper_id, filename, text)

    # Save text
    with open(os.path.join(PAPERS_DIR, f"{paper_id}.txt"), "w", encoding="utf-8") as f:
        f.write(text)

    # Save metadata (enriched with arXiv info)
    paper_meta = {
        "id": paper_id,
        "filename": filename,
        "title": meta["title"],
        "authors": meta["authors"],
        "abstract": meta["abstract"],
        "published": meta["published"],
        "arxiv_id": meta["arxiv_id"],
        "source": "arxiv",
    }
    with open(os.path.join(PAPERS_DIR, f"{paper_id}.meta.json"), "w", encoding="utf-8") as f:
        json.dump(paper_meta, f, indent=2)

    return {
        "id": paper_id,
        "filename": filename,
        "title": meta["title"],
        "authors": meta["authors"],
        "message": "Paper imported from arXiv and indexed",
    }


# ──────────────────────────────────────────────
# Literature Review Generator
# ──────────────────────────────────────────────

@app.post("/api/generate-review")
def generate_review(req: GenerateReviewRequest):
    """Generate a literature review from selected papers."""
    if len(req.paper_ids) < 2:
        raise HTTPException(status_code=400, detail="Need at least 2 papers for a literature review")

    # Load all paper data
    papers_data = []
    missing = []
    for pid in req.paper_ids:
        data = load_paper_data(pid)
        if data:
            papers_data.append(data)
        else:
            missing.append(pid)

    if len(papers_data) < 2:
        raise HTTPException(status_code=400, detail=f"Could not load enough papers. Missing: {missing}")

    # Build the summaries text
    summaries_text = build_paper_summaries_text(papers_data)

    # Generate the review
    prompt = LITERATURE_REVIEW_PROMPT.format(
        num_papers=len(papers_data),
        topic=req.topic,
        paper_summaries=summaries_text,
    )

    try:
        review_text = registry.generate(prompt, system="You are an expert academic writer specializing in computer science literature reviews.")
        return {
            "review": review_text,
            "papers_used": len(papers_data),
            "topic": req.topic,
        }
    except Exception as e:
        return {"error": str(e)}


# ──────────────────────────────────────────────
# Research Gap Analysis
# ──────────────────────────────────────────────

@app.post("/api/gap-analysis")
def gap_analysis(req: GapAnalysisRequest):
    """Analyze research gaps across selected papers."""
    if len(req.paper_ids) < 2:
        raise HTTPException(status_code=400, detail="Need at least 2 papers for gap analysis")

    papers_data = []
    for pid in req.paper_ids:
        data = load_paper_data(pid)
        if data:
            papers_data.append(data)

    if len(papers_data) < 2:
        raise HTTPException(status_code=400, detail="Could not load enough papers")

    summaries_text = build_paper_summaries_text(papers_data)

    prompt = GAP_ANALYSIS_PROMPT.format(
        num_papers=len(papers_data),
        topic=req.topic,
        paper_summaries=summaries_text,
    )

    try:
        res_text = registry.generate(prompt, json_mode=True)

        json_match = re.search(r'\{.*\}', res_text, re.DOTALL)
        if json_match:
            clean_json = json_match.group(0)
        else:
            clean_json = res_text

        gaps = json.loads(clean_json)
        return {
            "gaps": gaps,
            "papers_analyzed": len(papers_data),
            "topic": req.topic,
        }
    except Exception as e:
        return {"error": str(e), "raw": res_text if 'res_text' in locals() else ""}


# ──────────────────────────────────────────────
# Paper Comparison
# ──────────────────────────────────────────────

@app.post("/api/compare-papers")
def compare_papers(req: ComparePapersRequest):
    """Compare selected papers and return a JSON matrix."""
    if len(req.paper_ids) < 2:
        raise HTTPException(status_code=400, detail="Need at least 2 papers to compare")

    papers_data = []
    for pid in req.paper_ids:
        data = load_paper_data(pid)
        if data:
            papers_data.append(data)

    if len(papers_data) < 2:
        raise HTTPException(status_code=400, detail="Could not load enough papers")

    summaries_text = build_paper_summaries_text(papers_data)
    prompt = COMPARE_PAPERS_PROMPT.format(num_papers=len(papers_data), paper_summaries=summaries_text)

    try:
        res_text = registry.generate(prompt, json_mode=True)
        json_match = re.search(r'\[.*\]', res_text, re.DOTALL)
        if json_match:
            clean_json = json_match.group(0)
        else:
            clean_json = res_text

        comparison = json.loads(clean_json)
        return {"comparison": comparison, "papers_analyzed": len(papers_data)}
    except Exception as e:
        return {"error": str(e), "raw": res_text if 'res_text' in locals() else ""}


# ──────────────────────────────────────────────
# Paper Writing Assistant
# ──────────────────────────────────────────────

@app.post("/api/draft-section")
def draft_section(req: DraftSectionRequest):
    """Draft a section of a research paper."""
    papers_data = []
    if req.paper_ids:
        for pid in req.paper_ids:
            data = load_paper_data(pid)
            if data:
                papers_data.append(data)

    summaries_text = build_paper_summaries_text(papers_data) if papers_data else "No reference papers provided."
    prompt = DRAFT_SECTION_PROMPT.format(
        topic=req.topic,
        section_type=req.section_type,
        notes=req.notes or "None",
        paper_summaries=summaries_text
    )

    try:
        draft_text = registry.generate(prompt, system="You are an expert academic writer.")
        return {"draft": draft_text, "papers_used": len(papers_data)}
    except Exception as e:
        return {"error": str(e)}


# ──────────────────────────────────────────────
# RAG Chat
# ──────────────────────────────────────────────

@app.post("/api/chat")
async def chat(req: ChatRequest):
    context_chunks = rag_system.search(req.message, top_k=3)
    context = "\n".join([c['text'] for c in context_chunks])
    context = context[:4000]
    
    system = "You are a helpful research assistant. Answer questions based strictly on the provided context from academic papers."
    
    prompt = f"""
    Answer the user's question based strictly on the text provided.
    
    CONTEXT:
    {context}
    
    USER QUESTION:
    {req.message}
    """
    
    try:
        def generate():
            for chunk in registry.generate_stream(prompt, system=system):
                yield chunk
                            
        return StreamingResponse(generate(), media_type="text/plain")
    except Exception as e:
        return StreamingResponse(iter([f"Error: {str(e)}"]), media_type="text/plain")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
