from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from services.gemini import generate, stream_generate
import json

router = APIRouter()

STRATEGIES = {
    "sliding_window": {
        "name": "Sliding Window",
        "description": "Keep only the last N tokens. Fast but loses early context.",
    },
    "summarization_chain": {
        "name": "Summarization Chain",
        "description": "Periodically compress older turns into a running summary.",
    },
    "hierarchical_memory": {
        "name": "Hierarchical Memory",
        "description": "Store facts in episodic (short), semantic (medium), and archival (long-term) layers.",
    },
}

SUMMARIZE_PROMPT = """You are a context compressor. Given a long conversation or document,
produce a dense, information-preserving summary under 200 words.
Retain: key facts, decisions, names, numbers, and unresolved questions.
Discard: pleasantries, redundant explanations, filler.

Text to compress:
{text}

Compressed summary:"""

HIERARCHICAL_PROMPT = """Extract and organize information into three memory tiers:

EPISODIC (recent events, last few turns):
- List 3-5 specific recent events

SEMANTIC (key facts and entities):
- List 5-7 important facts, names, numbers

ARCHIVAL (core context, background):
- 2-3 sentence background summary

Text:
{text}

Respond in JSON format with keys: episodic (list), semantic (list), archival (string)"""


class HardRequest(BaseModel):
    text: str
    strategy: str
    window_size: int = 500  # words for sliding window
    query: str = ""


def sliding_window(text: str, window_size: int) -> dict:
    words = text.split()
    total = len(words)
    kept = words[-window_size:]
    dropped = max(0, total - window_size)
    return {
        "compressed": " ".join(kept),
        "original_words": total,
        "kept_words": len(kept),
        "dropped_words": dropped,
        "compression_ratio": round(len(kept) / max(total, 1), 3),
    }


async def _sse(gen):
    async for chunk in gen:
        yield f"data: {json.dumps({'type': 'text', 'text': chunk})}\n\n"
    yield "data: [DONE]\n\n"


@router.post("/analyze")
async def analyze_context(req: HardRequest):
    words = req.text.split()
    word_count = len(words)

    if req.strategy == "sliding_window":
        result = sliding_window(req.text, req.window_size)
        context_for_query = result["compressed"]
        meta = {
            "strategy": "sliding_window",
            "original_words": result["original_words"],
            "kept_words": result["kept_words"],
            "dropped_words": result["dropped_words"],
            "compression_ratio": result["compression_ratio"],
        }

    elif req.strategy == "summarization_chain":
        # Chunk into segments and summarize each, then combine
        chunk_size = 300
        chunk_words = [words[i : i + chunk_size] for i in range(0, len(words), chunk_size)]
        summaries = []
        for chunk in chunk_words:
            s = await generate(
                SUMMARIZE_PROMPT.format(text=" ".join(chunk)), temperature=0.3
            )
            summaries.append(s.strip())
        # Final meta-summary
        combined = "\n\n".join(summaries)
        final_summary = await generate(
            SUMMARIZE_PROMPT.format(text=combined), temperature=0.3
        )
        context_for_query = final_summary
        summary_words = len(final_summary.split())
        meta = {
            "strategy": "summarization_chain",
            "original_words": word_count,
            "summary_words": summary_words,
            "chunks_processed": len(chunk_words),
            "compression_ratio": round(summary_words / max(word_count, 1), 3),
            "summary": final_summary,
        }

    elif req.strategy == "hierarchical_memory":
        raw = await generate(
            HIERARCHICAL_PROMPT.format(text=req.text[:3000]), temperature=0.2
        )
        try:
            # Strip markdown code fences if present
            clean = raw.strip().lstrip("```json").lstrip("```").rstrip("```").strip()
            layers = json.loads(clean)
        except Exception:
            layers = {"episodic": [], "semantic": [], "archival": raw}
        context_for_query = (
            f"ARCHIVAL: {layers.get('archival', '')}\n"
            f"SEMANTIC: {'; '.join(layers.get('semantic', []))}\n"
            f"EPISODIC: {'; '.join(layers.get('episodic', []))}"
        )
        meta = {
            "strategy": "hierarchical_memory",
            "original_words": word_count,
            "layers": layers,
        }
    else:
        return {"error": "Unknown strategy"}

    # If a follow-up query was provided, answer it using compressed context
    answer = ""
    if req.query:
        answer = await generate(
            f"Using this context:\n{context_for_query}\n\nAnswer: {req.query}",
            temperature=0.4,
        )

    return {"meta": meta, "answer": answer, "context_preview": context_for_query[:600]}


@router.get("/strategies")
async def get_strategies():
    return STRATEGIES
