# 🎓 Research Scholar Agent

An AI-powered academic assistant that streamlines the research workflow for students and scholars. The system discovers papers from academic databases (arXiv, Semantic Scholar, CrossRef), provides interactive RAG-based chat, builds side-by-side comparison matrices, and auto-generates literature reviews and section drafts.

---

## 🚀 Key Features

*   **🔍 Paper Discovery:** Multi-source academic database search (arXiv, Semantic Scholar, CrossRef) with one-click library imports.
*   **📄 Intelligent Summarization:** Dual-stage summarization using **BERT Extractive Summarizer** to select core sentences followed by **LLMs** to format into structured academic insights (Problem Statement, Methodology, Findings, Limitations, Implications).
*   **💬 RAG Q&A Chat:** Retrieval-Augmented Generation using a custom **TF-IDF + Cosine Similarity** local index to retrieve paragraph-level context from uploaded papers.
*   **📊 Paper Comparison:** Generates dynamic side-by-side comparison tables analyzing methodologies, datasets, metrics, and limitations.
*   **✍️ Writing Assistant:** Drafts academic sections (Introduction, Related Work, Methodology) grounded directly in library references.
*   **🔌 Multi-LLM Provider Engine:** Run queries across **Groq**, **Google Gemini**, **OpenRouter**, or fully offline using **Ollama** (local models).

---

## 🛠️ Tech Stack

*   **Frontend:** React 19, Vite, TanStack Router, Tailwind CSS 4, Radix UI
*   **Backend:** FastAPI (Python 3.10+), pypdf, BERT extractive summarizer, NumPy (TF-IDF vector math)

---

## 💻 Setup & Run Instructions

To run this project on a local machine, follow these steps:

### 1. Clone & Exclusions
If sharing this repository:
*   Ensure that local files like virtual environments (`acvenv`, `venv`), frontend dependencies (`node_modules`), and the credentials file (`.env`) are excluded. A `.gitignore` has been pre-configured for this.

### 2. Backend Setup
1.  Navigate to the backend directory:
    ```bash
    cd backend
    ```
2.  Create a virtual environment:
    ```bash
    python -m venv acvenv
    ```
3.  Activate the virtual environment:
    *   **Windows (CMD/PowerShell):** `acvenv\Scripts\activate`
    *   **Mac/Linux:** `source acvenv/bin/activate`
4.  Install dependencies:
    ```bash
    pip install -r requirements.txt
    ```
5.  Set up your environment variables:
    *   Duplicate `.env.example` and rename it to `.env`.
    *   Fill in your API keys for Groq, Gemini, or OpenRouter.
6.  Start the FastAPI backend:
    ```bash
    python main.py
    ```
    *(The backend will run on `http://localhost:8000`)*

### 3. Frontend Setup
1.  Navigate to the frontend directory:
    ```bash
    cd ../frontend
    ```
2.  Install packages:
    ```bash
    npm install
    ```
3.  Start the development server:
    ```bash
    npm run dev
    ```
    *(The frontend will run on `http://localhost:5173`)*

---

## 📖 Presentation Demo Guide

If you are presenting this project for an evaluation or demo, please refer to the detailed, step-by-step presentation script in [DEMO_GUIDE.md](../DEMO_GUIDE.md) at the root folder of this project!
