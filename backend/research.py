"""
Research Features Module
Paper discovery (arXiv, Semantic Scholar), literature review generation,
and research gap analysis.
"""

import re
import json
import requests
import xml.etree.ElementTree as ET
from typing import List, Dict, Optional, Any
from datetime import datetime


# ──────────────────────────────────────────────
# arXiv Search
# ──────────────────────────────────────────────

ARXIV_API = "http://export.arxiv.org/api/query"
ARXIV_NS = {"atom": "http://www.w3.org/2005/Atom", "arxiv": "http://arxiv.org/schemas/atom"}


def search_arxiv(query: str, max_results: int = 10, sort_by: str = "relevance") -> List[Dict[str, Any]]:
    """Search arXiv for papers matching a query."""
    sort_map = {
        "relevance": "relevance",
        "date": "lastUpdatedDate",
        "submitted": "submittedDate",
    }
    params = {
        "search_query": f"all:{query}",
        "start": 0,
        "max_results": min(max_results, 30),
        "sortBy": sort_map.get(sort_by, "relevance"),
        "sortOrder": "descending",
    }

    try:
        resp = requests.get(ARXIV_API, params=params, timeout=30)
        resp.raise_for_status()
    except Exception as e:
        return [{"error": f"arXiv API error: {str(e)}"}]

    root = ET.fromstring(resp.text)
    results = []

    for entry in root.findall("atom:entry", ARXIV_NS):
        # Extract arXiv ID from the id URL
        id_url = entry.find("atom:id", ARXIV_NS).text
        arxiv_id = id_url.split("/abs/")[-1] if "/abs/" in id_url else id_url.split("/")[-1]

        title = entry.find("atom:title", ARXIV_NS).text.strip().replace("\n", " ")
        abstract = entry.find("atom:summary", ARXIV_NS).text.strip().replace("\n", " ")
        published = entry.find("atom:published", ARXIV_NS).text[:10]  # YYYY-MM-DD

        authors = []
        for author in entry.findall("atom:author", ARXIV_NS):
            name = author.find("atom:name", ARXIV_NS).text
            authors.append(name)

        # Get categories
        categories = []
        for cat in entry.findall("atom:category", ARXIV_NS):
            categories.append(cat.get("term", ""))
        primary_cat = entry.find("arxiv:primary_category", ARXIV_NS)
        primary = primary_cat.get("term", "") if primary_cat is not None else (categories[0] if categories else "")

        # PDF link
        pdf_link = ""
        for link in entry.findall("atom:link", ARXIV_NS):
            if link.get("title") == "pdf":
                pdf_link = link.get("href", "")
                break
        if not pdf_link:
            pdf_link = f"https://arxiv.org/pdf/{arxiv_id}"

        results.append({
            "arxiv_id": arxiv_id,
            "title": title,
            "authors": authors,
            "abstract": abstract[:500],
            "published": published,
            "categories": categories,
            "primary_category": primary,
            "pdf_url": pdf_link,
            "url": f"https://arxiv.org/abs/{arxiv_id}",
            "source": "arxiv",
        })

    return results


# ──────────────────────────────────────────────
# Semantic Scholar Search
# ──────────────────────────────────────────────

SEMANTIC_SCHOLAR_API = "https://api.semanticscholar.org/graph/v1"


def search_semantic_scholar(query: str, max_results: int = 10, year_range: str = "") -> List[Dict[str, Any]]:
    """Search Semantic Scholar for papers."""
    params = {
        "query": query,
        "limit": min(max_results, 20),
        "fields": "title,authors,abstract,year,citationCount,url,externalIds,publicationTypes,openAccessPdf",
    }
    if year_range:
        params["year"] = year_range  # e.g., "2020-2024"

    try:
        resp = requests.get(f"{SEMANTIC_SCHOLAR_API}/paper/search", params=params, timeout=15)
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        return [{"error": f"Semantic Scholar API error: {str(e)}"}]

    results = []
    for paper in data.get("data", []):
        authors = [a.get("name", "") for a in paper.get("authors", [])]
        ext_ids = paper.get("externalIds", {}) or {}
        arxiv_id = ext_ids.get("ArXiv", "")
        doi = ext_ids.get("DOI", "")

        pdf_url = ""
        oa = paper.get("openAccessPdf")
        if oa and isinstance(oa, dict):
            pdf_url = oa.get("url", "")
        elif arxiv_id:
            pdf_url = f"https://arxiv.org/pdf/{arxiv_id}"

        results.append({
            "title": paper.get("title", ""),
            "authors": authors,
            "abstract": (paper.get("abstract") or "")[:500],
            "year": paper.get("year"),
            "citation_count": paper.get("citationCount", 0),
            "url": paper.get("url", ""),
            "arxiv_id": arxiv_id,
            "doi": doi,
            "pdf_url": pdf_url,
            "source": "semantic_scholar",
        })

    return results


# ──────────────────────────────────────────────
# CrossRef Search (IEEE, ACM, Springer, Elsevier, etc.)
# ──────────────────────────────────────────────

CROSSREF_API = "https://api.crossref.org/works"


def search_crossref(query: str, max_results: int = 10, year_range: str = "") -> List[Dict[str, Any]]:
    """Search CrossRef for papers from IEEE, ACM, Springer, Elsevier, and all major publishers."""
    params = {
        "query": query,
        "rows": min(max_results, 20),
        "select": "DOI,title,author,abstract,published-print,published-online,container-title,type,is-referenced-by-count,link,URL",
        "sort": "relevance",
        "order": "desc",
    }
    if year_range:
        parts = year_range.split("-")
        if len(parts) == 2:
            params["filter"] = f"from-pub-date:{parts[0]},until-pub-date:{parts[1]}"

    headers = {
        "User-Agent": "AcademicCompass/1.0 (mailto:research@academiccompass.app)",
    }

    try:
        resp = requests.get(CROSSREF_API, params=params, headers=headers, timeout=20)
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        return [{"error": f"CrossRef API error: {str(e)}"}]

    results = []
    for item in data.get("message", {}).get("items", []):
        titles = item.get("title", [])
        title = titles[0] if titles else "Untitled"

        authors = []
        for a in item.get("author", []):
            given = a.get("given", "")
            family = a.get("family", "")
            authors.append(f"{given} {family}".strip())

        abstract = item.get("abstract", "")
        if abstract:
            abstract = re.sub(r'<[^>]+>', '', abstract)[:500]

        date_parts = None
        for date_field in ["published-print", "published-online"]:
            dp = item.get(date_field, {}).get("date-parts", [[]])
            if dp and dp[0]:
                date_parts = dp[0]
                break
        year = date_parts[0] if date_parts else None
        published = f"{date_parts[0]}-{date_parts[1]:02d}" if date_parts and len(date_parts) >= 2 else str(year) if year else ""

        doi = item.get("DOI", "")
        url = item.get("URL", f"https://doi.org/{doi}" if doi else "")

        container = item.get("container-title", [])
        venue = container[0] if container else ""

        citation_count = item.get("is-referenced-by-count", 0)

        pdf_url = ""
        for link in item.get("link", []):
            if link.get("content-type") == "application/pdf":
                pdf_url = link.get("URL", "")
                break

        results.append({
            "title": title,
            "authors": authors,
            "abstract": abstract,
            "year": year,
            "published": published,
            "citation_count": citation_count,
            "url": url,
            "doi": doi,
            "pdf_url": pdf_url,
            "venue": venue,
            "source": "crossref",
        })

    return results


# ──────────────────────────────────────────────
# Import Paper from arXiv
# ──────────────────────────────────────────────

def download_arxiv_pdf(arxiv_id: str, save_path: str) -> bool:
    """Download a PDF from arXiv given an ID."""
    # Clean the ID
    arxiv_id = arxiv_id.strip()
    if "arxiv.org" in arxiv_id:
        # Extract ID from URL
        arxiv_id = arxiv_id.rstrip("/")
        arxiv_id = arxiv_id.split("/")[-1]
        if arxiv_id.endswith(".pdf"):
            arxiv_id = arxiv_id[:-4]

    pdf_url = f"https://arxiv.org/pdf/{arxiv_id}.pdf"

    try:
        resp = requests.get(pdf_url, timeout=30, stream=True)
        resp.raise_for_status()
        with open(save_path, "wb") as f:
            for chunk in resp.iter_content(chunk_size=8192):
                f.write(chunk)
        return True
    except Exception as e:
        print(f"Failed to download arXiv PDF {arxiv_id}: {e}")
        return False


def get_arxiv_metadata(arxiv_id: str) -> Optional[Dict[str, Any]]:
    """Fetch metadata for a single arXiv paper."""
    arxiv_id = arxiv_id.strip()
    if "arxiv.org" in arxiv_id:
        arxiv_id = arxiv_id.rstrip("/").split("/")[-1]
        if arxiv_id.endswith(".pdf"):
            arxiv_id = arxiv_id[:-4]

    params = {"id_list": arxiv_id, "max_results": 1}
    try:
        resp = requests.get(ARXIV_API, params=params, timeout=10)
        resp.raise_for_status()
        root = ET.fromstring(resp.text)
        entry = root.find("atom:entry", ARXIV_NS)
        if entry is None:
            return None

        title = entry.find("atom:title", ARXIV_NS).text.strip().replace("\n", " ")
        authors = [a.find("atom:name", ARXIV_NS).text for a in entry.findall("atom:author", ARXIV_NS)]
        abstract = entry.find("atom:summary", ARXIV_NS).text.strip()
        published = entry.find("atom:published", ARXIV_NS).text[:10]

        return {
            "arxiv_id": arxiv_id,
            "title": title,
            "authors": authors,
            "abstract": abstract,
            "published": published,
        }
    except Exception:
        return None


# ──────────────────────────────────────────────
# Enhanced Summary Prompt
# ──────────────────────────────────────────────

ENHANCED_SUMMARY_PROMPT = """You are a research paper analysis expert. Read the following academic text and produce a structured JSON analysis with EXACTLY these 8 keys. Each key must map to a single string value. Be thorough and specific.

{{
    "Research Question": "What specific question or problem is this paper addressing? State it clearly.",
    "Methodology": "What methods, algorithms, models, or experimental setup did the authors use? Be detailed about the approach.",
    "Key Contributions": "What is novel about this work? What new ideas, methods, or findings does it introduce compared to prior work?",
    "Results & Metrics": "What are the concrete results? Include specific numbers, benchmarks, accuracy scores, performance comparisons where available.",
    "Limitations & Future Work": "What limitations do the authors acknowledge? What future directions do they suggest?",
    "Key Terms & Definitions": "List and briefly define 3-5 important technical terms or concepts used in this paper.",
    "Related Work": "What prior work does this paper build on? Mention key referenced papers or methods.",
    "Practical Implications": "How could this research be applied in practice? What real-world impact could it have?"
}}

TEXT:
{text}
"""


# ──────────────────────────────────────────────
# Literature Review Generator
# ──────────────────────────────────────────────

LITERATURE_REVIEW_PROMPT = """You are an expert academic writer. Based on the following summaries of {num_papers} research papers on the topic of "{topic}", write a comprehensive literature review.

REQUIREMENTS:
1. Start with an introduction to the research area and why it matters.
2. Group the papers thematically (by methodology, sub-topic, or chronologically — whichever makes most sense).
3. For each group, discuss what the papers found, how they relate to each other, and any disagreements.
4. Use in-text citations in (Author et al., Year) format based on the paper titles and metadata provided.
5. End with a synthesis paragraph summarizing the current state of the field and identifying research gaps.
6. Write in formal academic English suitable for a research paper.
7. Output in clean Markdown format with ## section headers.
8. Aim for 800-1500 words.

PAPER SUMMARIES:
{paper_summaries}
"""


# ──────────────────────────────────────────────
# Research Gap Analysis
# ──────────────────────────────────────────────

GAP_ANALYSIS_PROMPT = """You are a research methodology expert. Analyze the following summaries of {num_papers} research papers on "{topic}" and identify research gaps and opportunities.

Produce a structured JSON with EXACTLY these 5 keys. Each key maps to an array of strings.

{{
    "Unexplored Methods": ["Method/technique that no paper has tried but could work for this problem", ...],
    "Missing Datasets or Domains": ["Dataset, domain, or application area that hasn't been tested", ...],
    "Conflicting Findings": ["Where papers disagree or report contradictory results", ...],
    "Open Questions": ["Specific research questions that remain unanswered based on the literature", ...],
    "Suggested Research Directions": ["Concrete, actionable research ideas combining insights from these papers", ...]
}}

Each array should have 2-5 items. Be specific and actionable — reference actual papers where relevant.

PAPER SUMMARIES:
{paper_summaries}
"""


def build_paper_summaries_text(papers_data: List[Dict]) -> str:
    """Build a formatted text block of paper summaries for the AI prompt."""
    parts = []
    for i, paper in enumerate(papers_data, 1):
        meta = paper.get("meta", {})
        summary = paper.get("summary", {})
        text_excerpt = paper.get("text_excerpt", "")

        header = f"### Paper {i}: {meta.get('filename', meta.get('title', 'Unknown'))}"
        if meta.get("authors"):
            header += f"\nAuthors: {', '.join(meta['authors'][:3])}"
        if meta.get("published") or meta.get("year"):
            header += f"\nYear: {meta.get('published', meta.get('year', 'N/A'))}"

        body = ""
        if summary:
            for key, val in summary.items():
                if isinstance(val, str) and val.strip():
                    body += f"\n**{key}**: {val}"
        elif text_excerpt:
            body = f"\n{text_excerpt[:2000]}"

        parts.append(f"{header}\n{body}")

    return "\n\n---\n\n".join(parts)


# ──────────────────────────────────────────────
# Paper Comparison
# ──────────────────────────────────────────────

COMPARE_PAPERS_PROMPT = """You are a research analysis expert. Compare the following {num_papers} research papers based on their summaries.

Produce a structured JSON array of objects. Each object represents a paper and must have EXACTLY these keys:
- "id": The paper's ID (use the exact ID provided in the paper header)
- "title": The paper's title
- "method": A brief description of the methodology used
- "dataset": The dataset(s) or domain used for evaluation (say "Not specified" if unknown)
- "metrics": The key performance metrics reported
- "results": The main outcome or result
- "limitations": Key limitations mentioned

Make the descriptions concise (1-2 sentences per field).

PAPER SUMMARIES:
{paper_summaries}
"""

# ──────────────────────────────────────────────
# Paper Writing Assistant
# ──────────────────────────────────────────────

DRAFT_SECTION_PROMPT = """You are an expert academic writer and researcher. Your task is to draft the "{section_type}" section of a research paper based on the provided reference papers and user instructions.

Topic: {topic}
Section to Draft: {section_type}
User Instructions/Notes: {notes}

REQUIREMENTS:
1. Write in a formal, academic tone suitable for a top-tier computer science conference (e.g., NeurIPS, ACL, CVPR).
2. Integrate insights from the provided reference papers.
3. Use in-text citations in (Author, Year) format based on the paper headers.
4. If writing an Introduction, ensure a strong hook, clear problem statement, and outline of contributions.
5. If writing a Methodology, clearly explain the technical approach and architecture.
6. Return the drafted text in clean Markdown format. Do not wrap it in a JSON block. Just output the Markdown text directly.

REFERENCE PAPERS:
{paper_summaries}
"""

