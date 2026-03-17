import io, uuid
from pathlib import Path
import chromadb
from chromadb.utils.embedding_functions import DefaultEmbeddingFunction

_DB_PATH = str(Path(__file__).parent.parent / "chroma_db")

_client = chromadb.PersistentClient(path=_DB_PATH)

_ef = DefaultEmbeddingFunction()

_collection = _client.get_or_create_collection(
    name="workshop_docs",
    embedding_function=_ef,
    metadata={"hnsw:space": "cosine"},  
)


# ---------------------------------------------------------------------------
# Text extraction  (PDF / DOCX / plain text)
# ---------------------------------------------------------------------------
def _extract_text(content: bytes, filename: str) -> str:
    ext = Path(filename).suffix.lower()
    if ext == ".pdf":
        try:
            import PyPDF2
            reader = PyPDF2.PdfReader(io.BytesIO(content))
            return "\n".join(p.extract_text() or "" for p in reader.pages)
        except Exception:
            return content.decode("utf-8", errors="ignore")
    elif ext == ".docx":
        try:
            from docx import Document
            doc = Document(io.BytesIO(content))
            return "\n".join(p.text for p in doc.paragraphs)
        except Exception:
            return content.decode("utf-8", errors="ignore")
    else:
        return content.decode("utf-8", errors="ignore")


def _chunk_text(text: str, size: int = 400, overlap: int = 80) -> list[str]:
    """Split into overlapping word-count windows."""
    words = text.split()
    chunks, i = [], 0
    while i < len(words):
        chunk = " ".join(words[i : i + size])
        if chunk.strip():
            chunks.append(chunk)
        i += size - overlap
    return chunks


# ---------------------------------------------------------------------------
# Public RAGService 
# ---------------------------------------------------------------------------
class RAGService:

    def ingest(self, content: bytes, filename: str) -> int:
        """Chunk + embed + store a document. Returns chunk count."""
        text = _extract_text(content, filename)
        chunks = _chunk_text(text)
        if not chunks:
            return 0

        _collection.add(
            documents=chunks,                        # raw text — ChromaDB embeds it
            ids=[f"{filename}_{i}_{uuid.uuid4().hex[:6]}" for i in range(len(chunks))],
            metadatas=[{"source": filename, "chunk_index": i} for i in range(len(chunks))],
        )
        return len(chunks)

    def search(self, query: str, k: int = 4) -> list[dict]:
        """Return k most relevant chunks for a query."""
        if _collection.count() == 0:
            return []

        results = _collection.query(
            query_texts=[query],                    # ChromaDB embeds the query too
            n_results=min(k, _collection.count()),
            include=["documents", "metadatas", "distances"],
        )

        return [
            {
                "text":   doc,
                "source": meta.get("source", "unknown"),
                "score":  round(1 - float(dist), 4),  # distance → similarity (1 = identical)
            }
            for doc, meta, dist in zip(
                results["documents"][0],
                results["metadatas"][0],
                results["distances"][0],
            )
        ]

    def list_sources(self) -> list[str]:
        """All unique filenames currently stored."""
        if _collection.count() == 0:
            return []
        metas = _collection.get(include=["metadatas"])["metadatas"]
        return sorted({m.get("source", "") for m in metas})

    def count(self) -> int:
        return _collection.count()

    def clear(self, source: str | None = None) -> int:
        """Delete by filename, or wipe everything if source=None."""
        global _collection
        if source:
            existing = _collection.get(where={"source": source})
            ids = existing["ids"]
            if ids:
                _collection.delete(ids=ids)
            return len(ids)
        else:
            n = _collection.count()
            _client.delete_collection("workshop_docs")
            _collection = _client.get_or_create_collection(
                name="workshop_docs",
                embedding_function=_ef,
                metadata={"hnsw:space": "cosine"},
            )
            return n
