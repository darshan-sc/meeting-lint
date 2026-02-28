import os
from typing import Any

import psycopg
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI
from pydantic import BaseModel, Field
from psycopg.rows import dict_row
from psycopg.types.json import Json

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
EMBED_MODEL = os.getenv("EMBED_MODEL", "text-embedding-3-small")

if not DATABASE_URL:
    raise RuntimeError("Missing DATABASE_URL environment variable.")

if not OPENAI_API_KEY:
    raise RuntimeError("Missing OPENAI_API_KEY environment variable.")

openai_client = OpenAI(api_key=OPENAI_API_KEY)

app = FastAPI(title="Meeting Lint Python API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


CONFLICT_RULES: list[dict[str, str]] = [
    {"keyword": "microservice", "reason": "MVP requires modular monolith."},
    {"keyword": "kafka", "reason": "MVP avoids external distributed queue in v1."},
    {"keyword": "mongodb", "reason": "MVP requires PostgreSQL + pgvector as primary DB."},
    {"keyword": "zoom", "reason": "Meeting provider integrations are out of v1 scope."},
    {"keyword": "google meet", "reason": "Meeting provider integrations are out of v1 scope."},
    {"keyword": "video", "reason": "Video processing is a non-goal in v1."},
    {"keyword": "optional otp", "reason": "FSD examples indicate OTP is mandatory."},
]


class DocumentItem(BaseModel):
    content: str = Field(..., min_length=1)
    metadata: dict[str, Any] = Field(default_factory=dict)


class IngestRequest(BaseModel):
    documents: list[DocumentItem] = Field(default_factory=list)
    content: str | None = None
    metadata: dict[str, Any] | None = None


class AnalyzeRequest(BaseModel):
    top_k: int = Field(default=5, ge=1, le=20)
    min_similarity: float = Field(default=0.0, ge=0.0, le=1.0)
    max_rows: int | None = Field(default=None, ge=1, le=10000)
    user_id: str | None = None


def get_db_connection() -> psycopg.Connection:
    return psycopg.connect(DATABASE_URL, row_factory=dict_row)


def vector_literal(values: list[float]) -> str:
    return "[" + ",".join(f"{v:.8f}" for v in values) + "]"


def create_embedding(text: str) -> list[float]:
    response = openai_client.embeddings.create(model=EMBED_MODEL, input=text)
    embedding = response.data[0].embedding
    if not embedding:
        raise RuntimeError("Embedding API returned empty vector.")
    return embedding


def create_embeddings(texts: list[str]) -> list[list[float]]:
    response = openai_client.embeddings.create(model=EMBED_MODEL, input=texts)
    vectors = [row.embedding for row in response.data]
    if len(vectors) != len(texts):
        raise RuntimeError("Embedding API response length mismatch.")
    return vectors


def detect_conflicts(text: str) -> list[str]:
    normalized = text.lower()
    return [rule["reason"] for rule in CONFLICT_RULES if rule["keyword"] in normalized]


def fetch_transcripts(conn: psycopg.Connection, user_id: str | None, max_rows: int | None) -> list[dict[str, Any]]:
    sql = """
        select id, text, user_id, created_at
        from public.transcript
        where (%s is null or user_id = %s)
        order by id asc
        limit %s
    """
    limit_value = max_rows if max_rows is not None else 1000000
    with conn.cursor() as cur:
        cur.execute(sql, (user_id, user_id, limit_value))
        return cur.fetchall()


def match_documents(
    conn: psycopg.Connection,
    query_embedding: list[float],
    top_k: int,
    min_similarity: float,
) -> list[dict[str, Any]]:
    emb = vector_literal(query_embedding)
    sql = """
        select
            id,
            content,
            metadata,
            1 - (embedding <=> %s::vector) as similarity
        from public.document
        where embedding is not null
          and (1 - (embedding <=> %s::vector)) >= %s
        order by embedding <=> %s::vector
        limit %s
    """
    with conn.cursor() as cur:
        cur.execute(sql, (emb, emb, min_similarity, emb, top_k))
        return cur.fetchall()


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/ingest-document")
def ingest_document(payload: IngestRequest) -> dict[str, Any]:
    docs = payload.documents
    if not docs and payload.content:
        docs = [DocumentItem(content=payload.content, metadata=payload.metadata or {})]

    if not docs:
        raise HTTPException(status_code=400, detail="Provide content or documents[].")

    cleaned_docs = [d for d in docs if d.content.strip()]
    if not cleaned_docs:
        raise HTTPException(status_code=400, detail="All document content values are empty.")

    texts = [d.content.strip() for d in cleaned_docs]
    vectors = create_embeddings(texts)

    insert_sql = """
        insert into public.document (content, metadata, embedding)
        values (%s, %s, %s::vector)
        returning id, content, metadata, created_at
    """
    inserted_rows: list[dict[str, Any]] = []
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            for idx, doc in enumerate(cleaned_docs):
                cur.execute(
                    insert_sql,
                    (doc.content.strip(), Json(doc.metadata), vector_literal(vectors[idx])),
                )
                inserted_rows.append(cur.fetchone())
        conn.commit()

    return {
        "status": "ok",
        "inserted": len(inserted_rows),
        "embed_model": EMBED_MODEL,
        "rows": inserted_rows,
    }


@app.post("/analyze-live")
def analyze_live(payload: AnalyzeRequest) -> dict[str, Any]:
    with get_db_connection() as conn:
        transcript_rows = fetch_transcripts(conn, payload.user_id, payload.max_rows)
        results = []

        for row in transcript_rows:
            transcript_text = (row.get("text") or "").strip()
            if not transcript_text:
                continue

            query_embedding = create_embedding(transcript_text)
            matches = match_documents(
                conn=conn,
                query_embedding=query_embedding,
                top_k=payload.top_k,
                min_similarity=payload.min_similarity,
            )
            conflict_reasons = detect_conflicts(transcript_text)

            fact_check_summary = "No explicit contradiction markers detected."
            if conflict_reasons:
                fact_check_summary = "Potential contradiction detected. Review matched evidence."
            elif not matches:
                fact_check_summary = "No supporting evidence found in document embeddings."

            results.append(
                {
                    "transcript_id": row["id"],
                    "user_id": row["user_id"],
                    "created_at": row["created_at"],
                    "text": transcript_text,
                    "conflict_detected": len(conflict_reasons) > 0,
                    "conflict_reasons": conflict_reasons,
                    "fact_check_summary": fact_check_summary,
                    "best_similarity": matches[0]["similarity"] if matches else None,
                    "matches": matches,
                }
            )

    return {
        "status": "ok",
        "total_transcripts_read": len(transcript_rows),
        "total_transcripts_processed": len(results),
        "embed_model": EMBED_MODEL,
        "top_k": payload.top_k,
        "min_similarity": payload.min_similarity,
        "results": results,
    }
