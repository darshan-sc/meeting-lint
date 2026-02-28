# Deployment — Root Config

The project is designed to run via Docker Compose for the backend (FastAPI + PostgreSQL). The Vue client is run separately via `npm run dev` / `vite`. There is no single command that starts both frontend and backend together.

## Docker Compose (`docker-compose.yml`)

Defines a two-container stack on a shared Docker network named `hello_fastapi`. The `web` service waits for `db` to be healthy before starting (using `condition: service_healthy`), which prevents the FastAPI app from crashing on startup if PostgreSQL isn't ready yet. The source directory is volume-mounted into the container, so code changes trigger uvicorn's `--reload` without rebuilding the image.

### `web` (FastAPI app)

| Setting | Value |
|---------|-------|
| Build context | `./src` (uses `src/Dockerfile`) |
| Command | `uvicorn app.main:app --reload --workers 1 --host 0.0.0.0 --port 8000` |
| Port mapping | **8002 → 8000** (host:container) |
| Volume | `./src/` → `/usr/src/app/` (live reload) |
| `DATABASE_URL` | `postgresql://hello_fastapi:hello_fastapi@db/hello_fastapi_dev` |
| Depends on | `db` (waits for healthy) |

### `db` (PostgreSQL)

| Setting | Value |
|---------|-------|
| Image | `postgres:14-alpine` |
| Volume | `postgres_data` → `/var/lib/postgresql/data/` (persistent) |
| `POSTGRES_USER` | `hello_fastapi` |
| `POSTGRES_PASSWORD` | `hello_fastapi` |
| `POSTGRES_DB` | `hello_fastapi_dev` |
| Healthcheck | `pg_isready -U hello_fastapi -d hello_fastapi_dev` every 5s, 5 retries |

## `run.sh` (local dev without Docker)

An alternative to Docker Compose for running the backend locally. It expects you to have PostgreSQL running on your own machine and a virtualenv in `venv/`. The script adds `src/` to `PYTHONPATH` so that `app.main:app` resolves correctly. Note that it defaults to port 8000, which differs from `src/main.py`'s hardcoded 8002 — if you use `run.sh`, the Vue client's hardcoded API URL won't match unless you override the `PORT` env var to 8002.

- Defaults: `app.main:app` on `0.0.0.0:8000`
- Activates `venv/` if present
- Sets `PYTHONPATH` to include `src/`
- Runs `uvicorn --reload`

## Port Summary

| Context | Host Port | Container Port |
|---------|-----------|----------------|
| Docker Compose | 8002 | 8000 |
| `src/main.py` (local) | 8002 | — |
| `run.sh` (local) | 8000 | — |
| Vue client `Api.js` | calls 8002 | — |
