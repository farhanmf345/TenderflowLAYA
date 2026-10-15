"""
ChromaDB singleton client for TenderFlow v4.0
Used by the Validator Agent for semantic deduplication.
Ported from v3.0 - no schema changes needed.
"""

import logging
from typing import Optional, Tuple
import chromadb
from chromadb.config import Settings as ChromaSettings
from sentence_transformers import SentenceTransformer

from config.settings import settings

logger = logging.getLogger(__name__)

EMBEDDING_MODEL = "all-MiniLM-L6-v2"
COLLECTION_NAME = "tenderflow_v4_tenders"
DEDUP_THRESHOLD = 0.92   # cosine similarity above this = duplicate

_client: Optional[chromadb.Client] = None
_collection = None
_model: Optional[SentenceTransformer] = None


# ─── Singleton Initializers ───────────────────────────────────────────────────

def _get_model() -> SentenceTransformer:
    global _model
    if _model is None:
        logger.info(f"[ChromaDB] Loading embedding model: {EMBEDDING_MODEL}")
        try:
            # Load from local cache — avoids ~20 redundant HuggingFace HEAD requests
            _model = SentenceTransformer(EMBEDDING_MODEL, local_files_only=True)
        except Exception:
            # First-time run: model not cached yet, download it
            logger.info("[ChromaDB] Model not cached. Downloading from HuggingFace (first run only)...")
            _model = SentenceTransformer(EMBEDDING_MODEL)
        logger.info("[ChromaDB] ✓ Embedding model loaded")
    return _model


def get_collection():
    """Return the singleton ChromaDB collection, initializing if needed."""
    global _client, _collection
    if _client is None:
        _client = chromadb.PersistentClient(
            path=settings.chroma_path,
            settings=ChromaSettings(anonymized_telemetry=False),
        )
        _collection = _client.get_or_create_collection(
            name=COLLECTION_NAME,
            metadata={"hnsw:space": "cosine"},
        )
        logger.info(f"[ChromaDB] ✓ Initialized - collection: {COLLECTION_NAME}")
    return _collection


# ─── Public API ───────────────────────────────────────────────────────────────

def embed_text(text: str) -> list:
    """Encode text to a dense normalized vector."""
    model = _get_model()
    return model.encode(text, normalize_embeddings=True).tolist()


def check_dedup(text: str, threshold: float = DEDUP_THRESHOLD) -> Tuple[bool, Optional[str]]:
    """
    Check whether a semantically similar tender already exists in ChromaDB.

    Returns:
        (is_duplicate, existing_chroma_id)
    """
    collection = get_collection()

    if collection.count() == 0:
        return False, None

    embedding = embed_text(text)
    results = collection.query(
        query_embeddings=[embedding],
        n_results=1,
        include=["distances"],
    )

    if not results or not results.get("ids") or not results["ids"][0]:
        return False, None

    # cosine distance = 1 - similarity
    similarity = 1.0 - results["distances"][0][0]
    logger.debug(f"[ChromaDB] Dedup similarity: {similarity:.4f} (threshold: {threshold})")

    if similarity >= threshold:
        existing_id = results["ids"][0][0]
        logger.info(f"[ChromaDB] Duplicate detected (sim={similarity:.3f}) - existing: {existing_id}")
        return True, existing_id

    return False, None


def add_embedding(chroma_id: str, text: str, metadata: dict) -> str:
    """
    Add a new tender embedding to ChromaDB.

    Args:
        chroma_id: Unique ID e.g. "tender-{Tender_ID}"
        text:      Combined tender text (title + keywords)
        metadata:  Dict of scalar metadata (str/int/float/bool only)

    Returns:
        chroma_id
    """
    collection = get_collection()
    embedding = embed_text(text)

    # ChromaDB requires scalar metadata values
    safe_meta = {k: (str(v) if v is not None else "") for k, v in metadata.items()}

    collection.add(
        ids=[chroma_id],
        embeddings=[embedding],
        metadatas=[safe_meta],
        documents=[text[:1000]],
    )
    logger.info(f"[ChromaDB] ✓ Embedding stored: {chroma_id}")
    return chroma_id
