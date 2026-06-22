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
from dotenv import load_dotenv
import faiss
from sentence_transformers import SentenceTransformer
from numpy.linalg import norm

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
        print("Loading SentenceTransformer model...")
        self.encoder = SentenceTransformer("all-MiniLM-L6-v2")
        self.embedding_dim = self.encoder.get_sentence_embedding_dimension()
        self.index = faiss.IndexFlatL2(self.embedding_dim)
        self.chunks = []
        self.chunk_metadata = []
        self.meta_path = os.path.join(FAISS_DIR, "faiss_meta.json")
        self.index_path = os.path.join(FAISS_DIR, "faiss_index.bin")
        self.load_index()
        
    def load_index(self):
        if os.path.exists(self.meta_path) and os.path.exists(self.index_path):
            try:
                with open(self.meta_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    self.chunks = data["chunks"]
                    self.chunk_metadata = data["metadata"]
                self.index = faiss.read_index(self.index_path)
                print(f"Loaded FAISS index with {self.index.ntotal} vectors.")
            except Exception as e:
                print(f"Error loading index: {e}")
                self.rebuild_index_from_papers()
        else:
            print("Index files missing. Rebuilding index from papers directory...")
            self.rebuild_index_from_papers()

    def rebuild_index_from_papers(self):
        try:
            self.index = faiss.IndexFlatL2(self.embedding_dim)
            self.chunks = []
            self.chunk_metadata = []
            
            meta_files = glob.glob(os.path.join(PAPERS_DIR, "*.meta.json"))
            for meta_file in meta_files:
                paper_id = os.path.basename(meta_file).replace(".meta.json", "")
                text_path = os.path.join(PAPERS_DIR, f"{paper_id}.txt")
                if os.path.exists(text_path):
                    with open(meta_file, "r", encoding="utf-8") as f:
                        meta = json.load(f)
                    with open(text_path, "r", encoding="utf-8") as f:
                        text = f.read()
                    
                    filename = meta.get("filename", meta.get("title", f"{paper_id}.pdf"))
                    paragraphs = [p.strip() for p in text.split("\n\n") if len(p.strip()) > 50]
                    if not paragraphs:
                        paragraphs = [p.strip() for p in text.split("\n") if len(p.strip()) > 50]
                    if not paragraphs:
                        paragraphs = [text[i:i+1000] for i in range(0, len(text), 800) if len(text[i:i+1000].strip()) > 50]
                    
                    if paragraphs:
                        embeddings = self.encoder.encode(paragraphs, convert_to_numpy=True)
                        self.index.add(embeddings)
                        self.chunks.extend(paragraphs)
                        for p in paragraphs:
                            self.chunk_metadata.append({"paper_id": paper_id, "paper_name": filename, "text": p})
            
            if len(self.chunks) > 0:
                self.save_index()
                print(f"Successfully rebuilt FAISS index with {self.index.ntotal} vectors from papers.")
            else:
                print("No papers found in papers/ directory to index.")
        except Exception as e:
            print(f"Error rebuilding index: {e}")

    def save_index(self):
        with open(self.meta_path, "w", encoding="utf-8") as f:
            json.dump({"chunks": self.chunks, "metadata": self.chunk_metadata}, f)
        faiss.write_index(self.index, self.index_path)

    def add_document(self, paper_id: str, paper_name: str, text: str):
        paragraphs = [p.strip() for p in text.split("\n\n") if len(p.strip()) > 50]
        if not paragraphs:
            paragraphs = [p.strip() for p in text.split("\n") if len(p.strip()) > 50]
        if not paragraphs:
            paragraphs = [text[i:i+1000] for i in range(0, len(text), 800) if len(text[i:i+1000].strip()) > 50]
        if not paragraphs: return
        
        embeddings = self.encoder.encode(paragraphs, convert_to_numpy=True)
        self.index.add(embeddings)
        self.chunks.extend(paragraphs)
        for p in paragraphs:
            self.chunk_metadata.append({"paper_id": paper_id, "paper_name": paper_name, "text": p})
            
        self.save_index()

    def search(self, query: str, top_k: int = 3, paper_id: Optional[str] = None):
        if self.index.ntotal == 0:
            return []
        search_k = min(50, self.index.ntotal) if paper_id else top_k
        query_vec = self.encoder.encode([query], convert_to_numpy=True)
        distances, indices = self.index.search(query_vec, search_k)
        
        results = []
        for dist, idx in zip(distances[0], indices[0]):
            if idx != -1:
                meta = self.chunk_metadata[idx]
                if paper_id and meta.get("paper_id") != paper_id:
                    continue
                results.append(meta)
                if len(results) == top_k:
                    break
        return results

rag_system = RAGSystem()

def extract_summary_tfidf(text: str, num_sentences: int = 15) -> str:
    """Extractive summarization using SentenceTransformers to keep LLM context small"""
    try:
        sentences = [s.strip() for s in text.replace('!', '.').replace('?', '.').split('.') if len(s.strip()) > 20]
        if len(sentences) <= num_sentences:
            return text
            
        # Get embeddings for all sentences
        sentence_embeddings = rag_system.encoder.encode(sentences, convert_to_numpy=True)
        
        # Document embedding is the mean of sentence embeddings
        doc_embedding = np.mean(sentence_embeddings, axis=0)
        
        # Calculate cosine similarities
        similarities = np.dot(sentence_embeddings, doc_embedding) / (norm(sentence_embeddings, axis=1) * norm(doc_embedding))
        
        # Get top N indices
        top_indices = similarities.argsort()[-num_sentences:][::-1]
        top_indices.sort() # keep original order
        
        return ". ".join([sentences[i] for i in top_indices]) + "."
    except Exception as e:
        print(f"SentenceTransformer Summarization failed: {e}")
        sentences = [s.strip() for s in text.replace('!', '.').replace('?', '.').split('.') if len(s.strip()) > 20]
        return ". ".join(sentences[:num_sentences]) + "."


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
    paper_id: Optional[str] = None

class SummarizeRequest(BaseModel):
    paper_id: str

class SearchRequest(BaseModel):
    query: str
    max_results: int = 10
    sort_by: str = "relevance"
    year_range: str = ""
    publisher: str = ""

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

        if res_text.startswith("[Error]"):
            raise Exception(res_text)

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
    results = search_crossref(req.query, max_results=req.max_results, year_range=req.year_range, publisher=req.publisher)
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
    if len(req.paper_ids) < 1:
        raise HTTPException(status_code=400, detail="Need at least 1 paper for a literature review")

    # Load all paper data
    papers_data = []
    missing = []
    for pid in req.paper_ids:
        data = load_paper_data(pid)
        if data:
            papers_data.append(data)
        else:
            missing.append(pid)

    if len(papers_data) < 1:
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
    if len(req.paper_ids) < 1:
        raise HTTPException(status_code=400, detail="Need at least 1 paper for gap analysis")

    papers_data = []
    for pid in req.paper_ids:
        data = load_paper_data(pid)
        if data:
            papers_data.append(data)

    if len(papers_data) < 1:
        raise HTTPException(status_code=400, detail="Could not load enough papers")

    summaries_text = build_paper_summaries_text(papers_data)

    prompt = GAP_ANALYSIS_PROMPT.format(
        num_papers=len(papers_data),
        topic=req.topic,
        paper_summaries=summaries_text,
    )

    try:
        res_text = registry.generate(prompt, json_mode=True)

        if res_text.startswith("[Error]"):
            raise Exception(res_text)

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
        
        if res_text.startswith("[Error]"):
            raise Exception(res_text)

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
    context_chunks = rag_system.search(req.message, top_k=3, paper_id=req.paper_id)
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


@app.get("/")
def root():
    return {
        "name": "Research Scholar Agent API",
        "version": "2.0",
        "status": "running",
        "docs": "/docs",
        "active_provider": registry.active_provider_name,
        "active_model": registry.active_model,
    }

@app.delete("/api/papers/{paper_id}")
def delete_paper(paper_id: str):
    """Delete a paper and all its associated files from the library."""
    meta_path = os.path.join(PAPERS_DIR, f"{paper_id}.meta.json")
    if not os.path.exists(meta_path):
        raise HTTPException(status_code=404, detail="Paper not found")

    # Delete all associated files
    extensions = [".pdf", ".txt", ".meta.json", ".summary.json"]
    for ext in extensions:
        fpath = os.path.join(PAPERS_DIR, f"{paper_id}{ext}")
        if os.path.exists(fpath):
            os.remove(fpath)

    # Remove from RAG index
    new_chunks = []
    new_meta = []
    for chunk, meta in zip(rag_system.chunks, rag_system.chunk_metadata):
        if meta.get("paper_id") != paper_id:
            new_chunks.append(chunk)
            new_meta.append(meta)
    rag_system.chunks = new_chunks
    rag_system.chunk_metadata = new_meta

    rag_system.index = faiss.IndexFlatL2(rag_system.embedding_dim)
    if len(rag_system.chunks) > 0:
        embeddings = rag_system.encoder.encode(rag_system.chunks, convert_to_numpy=True)
        rag_system.index.add(embeddings)
    rag_system.save_index()

    return {"status": "deleted", "paper_id": paper_id}

@app.post("/api/test-provider")
def test_provider():
    """Quick health check against the active LLM provider."""
    try:
        result = registry.generate("Respond with exactly: OK", system="You are a test assistant. Respond with only the word OK.")
        is_ok = "OK" in result.upper() and "[Error]" not in result
        return {
            "status": "ok" if is_ok else "error",
            "provider": registry.active_provider_name,
            "model": registry.active_model,
            "response": result[:200],
        }
    except Exception as e:
        return {
            "status": "error",
            "provider": registry.active_provider_name,
            "model": registry.active_model,
            "response": str(e),
        }
