from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from services.gemini import stream_generate
import json

router = APIRouter()

RAW_SYSTEM = ""  # No system prompt - raw, inconsistent

ENGINEERED_SYSTEM = """You are a precise, helpful assistant. Follow these rules strictly:

FORMAT RULES:
- Always respond in 3 clearly labeled sections: [Direct Answer], [Key Details], [Caveats]
- Keep [Direct Answer] to 1-2 sentences max
- Use bullet points only in [Key Details] — maximum 4 bullets
- [Caveats] is optional; skip if not needed

TONE RULES:
- Match the user's language complexity
- Never use filler phrases like "Great question!" or "Certainly!"
- Be factual and direct

LENGTH RULES:
- Total response must stay under 150 words
- If the question is simple, keep it short — do not pad
"""


class EasyRequest(BaseModel):
    query: str
    mode: str  # "raw" or "engineered"


async def _sse(gen):
    async for chunk in gen:
        yield f"data: {json.dumps({'text': chunk})}\n\n"
    yield "data: [DONE]\n\n"


@router.post("/generate")
async def generate_easy(req: EasyRequest):
    system = "" if req.mode == "raw" else ENGINEERED_SYSTEM
    temperature = 0.9 if req.mode == "raw" else 0.3

    gen = stream_generate(
        prompt=req.query,
        system=system,
        temperature=temperature,
    )
    return StreamingResponse(_sse(gen), media_type="text/event-stream")


@router.get("/system-prompt")
async def get_system_prompt():
    return {
        "raw": RAW_SYSTEM,
        "engineered": ENGINEERED_SYSTEM,
    }
