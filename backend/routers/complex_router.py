from fastapi import APIRouter, UploadFile, File
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from services.gemini import generate, stream_generate
import pandas as pd
import sqlite3, io, json, os, tempfile
import math

router = APIRouter()

# In-memory state for uploaded dataset
_df: pd.DataFrame | None = None
_db_path: str = ""
_schema_info: str = ""
_table_name: str = "uploaded_data"

TEXT_TO_SQL_PROMPT = """You are an expert SQL generator.
Given a SQLite table schema and a natural language question, write a valid SQLite SQL query.
Return ONLY the SQL query — no explanation, no markdown, no backticks.

Table schema:
{schema}

Question: {question}

SQL:"""

APPROACH_COMPARE_PROMPT = """You are explaining why RAG (retrieval-augmented generation) is a poor fit for structured tabular data.

The user asked: "{question}"
The table schema is: {schema}

Explain in 3 bullet points:
1. Why RAG would struggle with this question on structured data
2. What approach was actually used (text-to-SQL)
3. One other alternative approach (e.g., pandas query, semantic search on summaries)

Be concrete and reference the actual schema."""


def _build_schema(df: pd.DataFrame, table: str) -> str:
    cols = ", ".join(f"{c} ({str(df[c].dtype)})" for c in df.columns)
    sample = df.head(3).to_string(index=False)
    return f"Table: {table}\nColumns: {cols}\nSample rows:\n{sample}"


def _load_df_to_sqlite(df: pd.DataFrame) -> str:
    path = os.path.join(tempfile.gettempdir(), "workshop_data.db")
    conn = sqlite3.connect(path)
    df.to_sql(_table_name, conn, if_exists="replace", index=False)
    conn.close()
    return path


def _sanitize_value(v):
    """Convert any non-JSON-compliant float (NaN, Inf, -Inf) to None."""
    if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
        return None
    return v


def _df_to_json_records(df: pd.DataFrame, limit: int = 20) -> list[dict]:
    """
    Convert a DataFrame to a list of dicts that are safe for JSON serialization.
    Handles NaN, Infinity, and -Infinity by converting them to None.
    
    The naive fillna(None) approach fails for float columns because pandas
    internally re-converts None back to NaN. We fix this by casting float
    columns to object dtype before assignment, then do a final value-level
    safety pass over every cell.
    """
    preview = df.head(limit).copy()

    # Replace +inf / -inf with NaN first so they're caught by notna() below
    preview = preview.replace([float("inf"), float("-inf")], float("nan"))

    # Cast each float column to object dtype so None actually sticks
    for col in preview.select_dtypes(include=["float", "float64", "float32"]).columns:
        preview[col] = preview[col].astype(object).where(preview[col].notna(), None)

    records = preview.to_dict(orient="records")

    # Final safety pass — catches any edge-case floats that slipped through
    return [
        {k: _sanitize_value(v) for k, v in row.items()}
        for row in records
    ]


def _safe_json_dumps(obj, **kwargs) -> str:
    """json.dumps with a fallback default that converts bad floats to None."""
    return json.dumps(obj, default=lambda x: None if isinstance(x, float) and (math.isnan(x) or math.isinf(x)) else x, **kwargs)


@router.post("/upload")
async def upload_structured(file: UploadFile = File(...)):
    global _df, _db_path, _schema_info
    content = await file.read()
    filename = file.filename or "data.csv"
    ext = os.path.splitext(filename)[1].lower()
    try:
        if ext == ".csv":
            _df = pd.read_csv(io.BytesIO(content))
        elif ext in (".xlsx", ".xls"):
            _df = pd.read_excel(io.BytesIO(content))
        elif ext == ".json":
            _df = pd.read_json(io.BytesIO(content))
        else:
            return {"error": f"Unsupported format: {ext}"}
    except Exception as e:
        return {"error": str(e)}

    _db_path = _load_df_to_sqlite(_df)
    _schema_info = _build_schema(_df, _table_name)

    return {
        "status": "ok",
        "rows": len(_df),
        "columns": list(_df.columns),
        "schema": _schema_info,
        "sample": _df_to_json_records(_df, limit=5),
    }


class ComplexRequest(BaseModel):
    question: str


@router.post("/query")
async def query_structured(req: ComplexRequest):
    if _df is None:
        return {"error": "No dataset uploaded yet."}

    # Step 1: Generate SQL
    sql = await generate(
        TEXT_TO_SQL_PROMPT.format(schema=_schema_info, question=req.question),
        temperature=0.1,
    )
    sql = sql.strip().strip(";")

    # Step 2: Execute SQL
    query_error = None
    results = []
    try:
        conn = sqlite3.connect(_db_path)
        result_df = pd.read_sql_query(sql, conn)
        conn.close()
        results = _df_to_json_records(result_df, limit=20)
    except Exception as e:
        query_error = str(e)

    # Step 3: Natural language answer
    # Use _safe_json_dumps instead of json.dumps to avoid NaN crash in prompt building
    if results:
        nl_prompt = (
            f"Given this SQL query result for '{req.question}':\n"
            f"{_safe_json_dumps(results[:10], indent=2)}\n\n"
            f"Write a clear, concise natural language answer (2-4 sentences)."
        )
        nl_answer = await generate(nl_prompt, temperature=0.4)
    else:
        nl_answer = f"Query failed: {query_error}" if query_error else "No results found."

    # Step 4: RAG comparison
    comparison = await generate(
        APPROACH_COMPARE_PROMPT.format(
            question=req.question, schema=_schema_info
        ),
        temperature=0.4,
    )

    return {
        "sql": sql,
        "results": results,
        "nl_answer": nl_answer,
        "rag_comparison": comparison,
        "error": query_error,
    }


@router.get("/schema")
async def get_schema():
    if _df is None:
        return {"schema": None}
    return {"schema": _schema_info, "columns": list(_df.columns), "rows": len(_df)}