# Backend Infrastructure — `src/`

This covers the files at the `src/` level that handle packaging and running the backend — the local entry point, the Docker build, and the pinned dependency list.

## Entry Point (`src/main.py`)

A thin script that imports uvicorn and runs the FastAPI app. This is used for local development outside Docker. It hardcodes port `8002`, which differs from the Dockerfile's port `8000` — but docker-compose maps host 8002 to container 8000, so the Vue client always talks to port 8002 regardless of how the backend is run.

## Dockerfile (multi-stage)

Uses a two-stage build to keep the production image small. The builder stage installs compilation tools (gcc, libssl, libffi, libpq-dev) needed to compile C extensions for packages like `asyncpg` and `psycopg2`. The production stage only carries runtime libraries (`libpq5` for PostgreSQL, `curl` for the health check). It creates a non-root `app` user for security.

| Stage | Base | Purpose |
|-------|------|---------|
| `builder` | `python:3.13-slim` | Installs build deps (libssl, libffi, libpq-dev), pip installs requirements |
| Production | `python:3.13-slim` | Runtime only (libpq5, curl), copies site-packages from builder |

- Runs as non-root user `app:app`
- Healthcheck: `curl -f http://localhost:8000/ping` every 30s
- Exposes port `8000`
- CMD: `uvicorn app.main:app --host 0.0.0.0 --port 8000`

## Key Dependencies (`requirements.txt`)

| Package | Version | Role |
|---------|---------|------|
| `fastapi` | 0.128.0 | Web framework |
| `uvicorn` | 0.40.0 | ASGI server |
| `pydantic` | 2.12.5 | Data validation |
| `SQLAlchemy` | 2.0.45 | SQL toolkit (table definitions) |
| `databases` | 0.9.0 | Async DB queries |
| `asyncpg` | 0.31.0 | Async PostgreSQL driver |
| `psycopg2-binary` | 2.9.11 | Sync PostgreSQL driver (used by create_engine) |
| `python-dotenv` | 1.2.1 | .env file loading |
| `starlette` | 0.50.0 | ASGI toolkit (CORS middleware) |
| `pytest` | 9.0.2 | Testing |
| `httpx` | 0.28.1 | Async HTTP client (for tests) |
