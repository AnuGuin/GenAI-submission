from __future__ import annotations

import json
import os
from typing import Any, TypedDict, Annotated, cast
import operator

import httpx
from dotenv import load_dotenv
from fastapi import APIRouter, UploadFile, File
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from langgraph.graph import StateGraph, START, END
from services.gemini import generate, stream_generate
from services.rag_service import RAGService

load_dotenv()

router = APIRouter()
rag    = RAGService()
TAVILY_API_KEY = os.getenv("TAVILY_API_KEY")


# ─────────────────────────────────────────────
# 1.  Agent State  — shared across all nodes
# ─────────────────────────────────────────────

class AgentState(TypedDict):
    query:        str
    intent:       str
    reason:       str
    tool_output:  str         
    final_answer: str
    sources:      list[str]    


# ─────────────────────────────────────────────
# 2.  Prompts
# ─────────────────────────────────────────────

CLASSIFIER_PROMPT = """\
Classify the user query into exactly one of these four intents:

  WEATHER    – asks about current or forecast weather for a location
  WEB_SEARCH – needs recent facts, news, or live internet data
  RAG        – question about uploaded documents or files
  DIRECT     – general knowledge, math, coding, reasoning (no live data needed)

Reply with ONLY: INTENT|one-sentence reason

Query: {query}"""

ANSWER_PROMPT = """\
You are a helpful student assistant. Answer the following question using the
tool output below. Be clear, concise, and accurate.

Question : {query}
Tool used : {intent}
Tool output:
{tool_output}

Final answer:"""

RAG_PROMPT = """\
Answer the question using ONLY the document context below.
If the answer is not present, say so clearly.

Context:
{context}

Question: {query}"""

WEATHER_CODE_LABELS = {
    0: "Clear sky",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Depositing rime fog",
    51: "Light drizzle",
    53: "Moderate drizzle",
    55: "Dense drizzle",
    61: "Slight rain",
    63: "Moderate rain",
    65: "Heavy rain",
    71: "Slight snow",
    73: "Moderate snow",
    75: "Heavy snow",
    80: "Rain showers",
    81: "Moderate rain showers",
    82: "Violent rain showers",
    95: "Thunderstorm",
}


# ─────────────────────────────────────────────
# 3.  Nodes  (each receives state, returns partial update)
# ─────────────────────────────────────────────

async def classifier_node(state: AgentState) -> dict:
    """Call Gemini to classify intent and extract routing reason."""
    raw = await generate(
        CLASSIFIER_PROMPT.format(query=state["query"]),
        temperature=0.1,
    )
    parts   = raw.strip().split("|", 1)
    intent  = parts[0].strip().upper()
    reason  = parts[1].strip() if len(parts) > 1 else ""

    if intent not in {"WEATHER", "WEB_SEARCH", "RAG", "DIRECT"}:
        intent = "DIRECT"
        reason = "Defaulted to direct answer (unrecognised intent)."

    return {"intent": intent, "reason": reason}


async def direct_node(state: AgentState) -> dict:
    """Answer directly using Gemini — no external tool needed."""
    answer = await generate(state["query"], temperature=0.6)
    return {"tool_output": answer}


async def rag_node(state: AgentState) -> dict:
    """Retrieve relevant chunks from ChromaDB then synthesise with Gemini."""
    results = rag.search(state["query"], k=4)
    if not results:
        return {
            "tool_output": "No documents uploaded yet. Please upload a document first.",
            "sources":     [],
        }
    context = "\n\n---\n\n".join(r["text"] for r in results)
    sources = list({r["source"] for r in results})
    answer  = await generate(
        RAG_PROMPT.format(context=context, query=state["query"]),
        temperature=0.3,
    )
    return {"tool_output": answer, "sources": sources}


async def geocode_location(location: str) -> dict[str, Any]:
    """Resolve a location name to coordinates using Open-Meteo geocoding."""
    geo_url = "https://geocoding-api.open-meteo.com/v1/search"
    params = {"name": location, "count": 1, "language": "en", "format": "json"}

    async with httpx.AsyncClient() as client:
        response = await client.get(geo_url, params=params, timeout=8)
        response.raise_for_status()

    data = response.json()
    results = data.get("results") or []
    if not results:
        raise ValueError(f"Could not resolve location: {location}")

    return results[0]


async def weather_node(state: AgentState) -> dict:
    """Extract location → hit Open-Meteo APIs → return structured summary."""
    location = (
        await generate(
            "Extract only the city or place name from this query, "
            f"reply with just the location name: {state['query']}",
            temperature=0.1,
        )
    ).strip()

    try:
        place = await geocode_location(location)
        lat = place["latitude"]
        lon = place["longitude"]

        forecast_url = "https://api.open-meteo.com/v1/forecast"
        params = {
            "latitude": lat,
            "longitude": lon,
            "current": "temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code",
            "timezone": "auto",
        }

        async with httpx.AsyncClient() as client:
            resp = await client.get(
                forecast_url,
                params=params,
                timeout=8,
            )
            resp.raise_for_status()

        data = resp.json()
        current = data.get("current", {})
        units = data.get("current_units", {})

        city = place.get("name", location)
        admin1 = place.get("admin1") or ""
        country = place.get("country") or ""
        location_label = ", ".join(part for part in [city, admin1, country] if part)

        weather_code = current.get("weather_code")
        weather_label = WEATHER_CODE_LABELS.get(weather_code, f"Weather code {weather_code}")

        tool_output = (
            f"Location: {location_label}\n"
            f"Coordinates: {lat}, {lon}\n"
            f"Timezone: {data.get('timezone', 'unknown')}\n"
            f"Condition: {weather_label}\n"
            f"Temperature: {current.get('temperature_2m')} {units.get('temperature_2m', '')}\n"
            f"Feels like: {current.get('apparent_temperature')} {units.get('apparent_temperature', '')}\n"
            f"Humidity: {current.get('relative_humidity_2m')} {units.get('relative_humidity_2m', '')}\n"
            f"Wind speed: {current.get('wind_speed_10m')} {units.get('wind_speed_10m', '')}\n"
            f"Observed at: {current.get('time')}"
        )
    except ValueError:
        tool_output = f"I couldn't find the location '{location}'. Please try being more specific (e.g., city and country)."
    except Exception as exc:
        tool_output = f"Weather fetch failed: {exc}"

    return {"tool_output": tool_output}


async def web_node(state: AgentState) -> dict:
    """Query Tavily search and return concise result summaries."""
    if not TAVILY_API_KEY:
        return {
            "tool_output": "Web search is not configured. Set TAVILY_API_KEY in the environment.",
        }

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                "https://api.tavily.com/search",
                json={
                    "api_key": TAVILY_API_KEY,
                    "query": state["query"],
                    "topic": "general",
                    "search_depth": "advanced",
                    "max_results": 5,
                    "include_answer": True,
                    "include_raw_content": False,
                },
                timeout=12,
            )
            resp.raise_for_status()

        data = resp.json()
        lines: list[str] = []
        answer = data.get("answer")
        if answer:
            lines.append(f"Tavily summary: {answer}")

        for index, result in enumerate(data.get("results", []), start=1):
            title = result.get("title") or "Untitled"
            url = result.get("url") or ""
            content = result.get("content") or ""
            lines.append(
                f"{index}. {title}\nURL: {url}\nSnippet: {content}"
            )

        tool_output = "\n\n".join(lines) if lines else "No web results found."
    except httpx.HTTPStatusError as exc:
        tool_output = f"Tavily search failed: {exc.response.status_code} {exc.response.text[:500]}"
    except Exception as exc:
        tool_output = f"Tavily search failed: {exc}"

    return {"tool_output": tool_output}


async def answer_node(state: AgentState) -> dict:
    """
    Final formatting node.
    - DIRECT / RAG: tool_output is already a clean answer — pass through.
    - WEATHER / WEB_SEARCH: run one more Gemini call to turn raw data into prose.
    """
    if state["intent"] in ("DIRECT", "RAG"):
        return {"final_answer": state["tool_output"]}

    final = await generate(
        ANSWER_PROMPT.format(
            query=state["query"],
            intent=state["intent"],
            tool_output=state["tool_output"],
        ),
        temperature=0.4,
    )
    return {"final_answer": final}


# ─────────────────────────────────────────────
# 4.  Routing function  (conditional edge)
# ─────────────────────────────────────────────

def route_on_intent(state: AgentState) -> str:
    """LangGraph calls this after classifier_node to pick the next node."""
    return {
        "DIRECT":     "direct_node",
        "RAG":        "rag_node",
        "WEATHER":    "weather_node",
        "WEB_SEARCH": "web_node",
    }.get(state["intent"], "direct_node")


# ─────────────────────────────────────────────
# 5.  Build the graph
# ─────────────────────────────────────────────

def build_graph():
    g = StateGraph(AgentState)

    # Register nodes
    g.add_node("classifier_node", classifier_node)
    g.add_node("direct_node",     direct_node)
    g.add_node("rag_node",        rag_node)
    g.add_node("weather_node",    weather_node)
    g.add_node("web_node",        web_node)
    g.add_node("answer_node",     answer_node)

    # Entry edge
    g.add_edge(START, "classifier_node")

    # Conditional edge — branches to one of 4 tool nodes
    g.add_conditional_edges(
        "classifier_node",
        route_on_intent,
        {
            "direct_node":  "direct_node",
            "rag_node":     "rag_node",
            "weather_node": "weather_node",
            "web_node":     "web_node",
        },
    )

    # All tool nodes converge to answer_node → END
    for tool_node in ("direct_node", "rag_node", "weather_node", "web_node"):
        g.add_edge(tool_node, "answer_node")

    g.add_edge("answer_node", END)

    return g.compile()


# Compile once at import time — reused across all requests
agent = build_graph()


# ─────────────────────────────────────────────
# 6.  SSE streaming  (FastAPI endpoint)
# ─────────────────────────────────────────────

async def _run_and_stream(query: str):
    """
    Run the LangGraph agent and yield SSE events:
      1. routing event  — as soon as classifier_node finishes
      2. text events    — final_answer streamed word-by-word
      3. sources event  — doc sources if RAG was used
      4. [DONE]
    """
    initial_state: AgentState = {
        "query":        query,
        "intent":       "",
        "reason":       "",
        "tool_output":  "",
        "final_answer": "",
        "sources":      [],
    }

    # Stream node-by-node updates from LangGraph
    intent_sent = False
    final_state: AgentState = initial_state

    async for event in agent.astream(initial_state):
        # event is a dict: { node_name: partial_state_update }
        for node_name, update in event.items():

            # Emit routing decision right after classifier finishes
            if node_name == "classifier_node" and not intent_sent:
                yield (
                    f"data: {json.dumps({'type': 'routing', 'intent': update.get('intent',''), 'reason': update.get('reason','')})}\n\n"
                )
                intent_sent = True

            # Capture final answer from answer_node
            if node_name == "answer_node" and update.get("final_answer"):
                final_state = cast(AgentState, {**final_state, **update})

            # Carry forward sources from rag_node
            if node_name == "rag_node" and update.get("sources"):
                final_state = cast(AgentState, {**final_state, **update})

    # Stream the final answer word-by-word for a live feel
    answer = final_state.get("final_answer", "")
    words  = answer.split(" ")
    for i, word in enumerate(words):
        token = word if i == 0 else " " + word
        yield f"data: {json.dumps({'type': 'text', 'text': token})}\n\n"

    # Emit sources if RAG was used
    sources = final_state.get("sources", [])
    if sources:
        yield f"data: {json.dumps({'type': 'sources', 'sources': sources})}\n\n"

    yield "data: [DONE]\n\n"


# ─────────────────────────────────────────────
# 7.  FastAPI routes
# ─────────────────────────────────────────────

class MediumRequest(BaseModel):
    query: str


@router.post("/query")
async def medium_query(req: MediumRequest):
    return StreamingResponse(
        _run_and_stream(req.query),
        media_type="text/event-stream",
    )


@router.post("/upload-doc")
async def upload_doc(file: UploadFile = File(...)):
    content  = await file.read()
    filename = file.filename or "document"
    chunks   = rag.ingest(content, filename)
    return {"status": "ok", "filename": filename, "chunks": chunks}


@router.get("/docs")
async def list_docs():
    return {"sources": rag.list_sources(), "total_chunks": rag.count()}


@router.delete("/docs")
async def clear_docs(source: str | None = None):
    deleted = rag.clear(source=source)
    return {"deleted_chunks": deleted, "remaining": rag.count()}


@router.get("/graph")
async def get_graph_structure():
    """Return the graph node/edge structure for frontend visualization."""
    return {
        "nodes": [
            {"id": "START"},
            {"id": "classifier_node", "label": "Classifier",   "type": "llm"},
            {"id": "direct_node",     "label": "Direct LLM",   "type": "tool"},
            {"id": "rag_node",        "label": "RAG",           "type": "tool"},
            {"id": "weather_node",    "label": "Weather API",   "type": "tool"},
            {"id": "web_node",        "label": "Web Search",    "type": "tool"},
            {"id": "answer_node",     "label": "Answer",        "type": "llm"},
            {"id": "END"},
        ],
        "edges": [
            {"from": "START",            "to": "classifier_node", "type": "fixed"},
            {"from": "classifier_node",  "to": "direct_node",     "type": "conditional"},
            {"from": "classifier_node",  "to": "rag_node",        "type": "conditional"},
            {"from": "classifier_node",  "to": "weather_node",    "type": "conditional"},
            {"from": "classifier_node",  "to": "web_node",        "type": "conditional"},
            {"from": "direct_node",      "to": "answer_node",     "type": "fixed"},
            {"from": "rag_node",         "to": "answer_node",     "type": "fixed"},
            {"from": "weather_node",     "to": "answer_node",     "type": "fixed"},
            {"from": "web_node",         "to": "answer_node",     "type": "fixed"},
            {"from": "answer_node",      "to": "END",             "type": "fixed"},
        ],
    }
