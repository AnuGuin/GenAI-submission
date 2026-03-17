# GenAI Workshop — Problem Solving Round

A full-stack agentic AI application demonstrating solutions to all 4 workshop problems using **Gemini 1.5 Flash**, **FastAPI**, and **Next.js**.

---

## Architecture

```
frontend/   → Next.js 16 (TypeScript, Tailwind, Framer Motion)
backend/    → FastAPI (Python 3.13)
  routers/
    easy.py           → Prompt engineering demo
    medium.py         → Agentic 4-tool router
    hard.py           → Context rot strategies
    complex_router.py → Text-to-SQL + structured data
  services/
    gemini.py         → Gemini 2.5 Flash wrapper
    rag_service.py    → ChromaDB
```

---

## Problem Solutions

| Problem | Difficulty | Approach |
|---------|-----------|----------|
| Inconsistent chatbot responses | Easy | Engineered system prompt with format/tone/length rules |
| Student assistant routing | Medium | Gemini intent classifier → 4 tools (LLM, Web, Weather, RAG) |
| Context rot in long conversations | Hard | Sliding window, summarization chain, hierarchical memory |
| RAG vs structured data | Complex | Text-to-SQL via Gemini → SQLite execution |

---

## Quick Start

### 1. API Keys

```bash
cp backend/.env.example backend/.env
# Edit .env and add your keys:
# GEMINI_API_KEY=your_key      (required)
# OPENWEATHER_API_KEY=your_key (optional, for weather routing)
```

Get Gemini API key free at: https://aistudio.google.com/

### 2. Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
# Open http://localhost:3000
```

---

## API Endpoints

### Easy — Prompt Engineering
```
POST /api/easy/generate
{ "query": "...", "mode": "raw" | "engineered" }
→ SSE stream of text chunks
```

### Medium — Agentic Router
```
POST /api/medium/query
{ "query": "..." }
→ SSE stream: first { type: "routing", intent, reason }, then { type: "text", text }

POST /api/medium/upload-doc
form-data: file (PDF/TXT/DOCX)
→ { status, filename, chunks }
```

### Hard — Context Strategies
```
POST /api/hard/analyze
{ "text": "...", "strategy": "sliding_window|summarization_chain|hierarchical_memory",
  "window_size": 150, "query": "..." }
→ { meta, answer, context_preview }
```

### Complex — Text-to-SQL
```
POST /api/complex/upload
form-data: file (CSV/XLSX/JSON)
→ { rows, columns, schema, sample }

POST /api/complex/query
{ "question": "..." }
→ { sql, results, nl_answer, rag_comparison }
```

---

## Running in Google Colab

See `colab_demo.ipynb` — installs dependencies, runs the FastAPI backend with ngrok tunnel, and demonstrates all 4 endpoints programmatically.

---

## Tech Stack

- **LLM**: Google Gemini 1.5 Flash (`google-generativeai`)
- **Vector Search**: FAISS + `sentence-transformers` (all-MiniLM-L6-v2)
- **Structured Queries**: SQLite via pandas + Gemini text-to-SQL
- **Backend**: FastAPI with async streaming (SSE)
- **Frontend**: Next.js 14, Tailwind CSS, Framer Motion
- **Fonts**: Syne (display) + DM Sans (body) + JetBrains Mono (code)
