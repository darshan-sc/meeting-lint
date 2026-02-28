# Python API Setup (FastAPI + Supabase Postgres + pgvector)

Use this if you want everything implemented in Python.

## What Is Implemented

1. API endpoint to ingest documents into pgvector table:
   - `POST /ingest-document`
2. API endpoint to read transcript rows and run similarity search:
   - `POST /analyze-live`
3. SQL setup for Supabase tables + vector index:
   - `python_api/sql/001_setup.sql`

## Files

1. App code:
   `/Applications/Mix_N_Max/SDE/meet_lint/meeting-lint-main/python_api/main.py`
2. Dependencies:
   `/Applications/Mix_N_Max/SDE/meet_lint/meeting-lint-main/python_api/requirements.txt`
3. Env example:
   `/Applications/Mix_N_Max/SDE/meet_lint/meeting-lint-main/python_api/.env.example`
4. SQL:
   `/Applications/Mix_N_Max/SDE/meet_lint/meeting-lint-main/python_api/sql/001_setup.sql`

## Required Inputs From You

1. Supabase DB connection string (`DATABASE_URL`)
   - Supabase Dashboard -> Settings -> Database -> Connection string
   - Use pooler connection with SSL
2. OpenAI API key (`OPENAI_API_KEY`)
3. Supabase tables:
   - `transcript` with your rows
   - `document` for vectorized chunks (can be created by SQL file)

## Run SQL In Supabase

1. Open Supabase Dashboard -> SQL Editor -> New query
2. Paste `python_api/sql/001_setup.sql`
3. Click Run

## API Contract

### 1) Ingest document chunks

`POST /ingest-document`

Body (single):

```json
{
  "content": "OTP is mandatory for all password-based login attempts.",
  "metadata": {"source": "Auth_Flow_v3.pdf", "section": "OTP Rules"}
}
```

Body (batch):

```json
{
  "documents": [
    {
      "content": "MVP architecture is modular monolith.",
      "metadata": {"source": "FSD"}
    },
    {
      "content": "PostgreSQL + pgvector is required.",
      "metadata": {"source": "FSD"}
    }
  ]
}
```

### 2) Analyze transcript rows

`POST /analyze-live`

Body:

```json
{
  "top_k": 5,
  "min_similarity": 0.2,
  "user_id": "user_1",
  "max_rows": 100
}
```

All fields are optional.

## Can This Run Fully On Supabase?

If you insist on Python runtime: no, Supabase Edge Functions are Deno/TypeScript.

So Python API must run on a Python host (Render, Railway, Fly.io, EC2, etc.), while Supabase stays as DB/storage.

## Recommended No-Local Flow

1. Keep Supabase as database
2. Deploy this Python API to Render or Railway
3. Set env vars on hosting platform:
   - `DATABASE_URL`
   - `OPENAI_API_KEY`
   - `EMBED_MODEL=text-embedding-3-small`
4. Give deployed API URL to extension team

## Minimal Deploy Command

For a Python host, startup command is:

```bash
uvicorn main:app --host 0.0.0.0 --port 8000
```

Run it from `python_api` directory.

