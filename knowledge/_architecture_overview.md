# Architecture Overview — Fast-Api-example

## What It Is

A **notes CRUD API** built with FastAPI + PostgreSQL, with a Vue 3 read-only frontend. Lets users create, read, update, delete notes with search/filter/pagination.

## System Diagram

```
┌──────────────┐       GET /notes/       ┌──────────────────┐       SQL        ┌──────────────┐
│  Vue Client  │ ─────────────────────→  │  FastAPI (uvicorn)│ ──────────────→  │  PostgreSQL  │
│  (port 5173) │  ← JSON (NoteDB[])     │  (port 8000/8002) │  ← rows         │  14-alpine   │
└──────────────┘                         └──────────────────┘                   └──────────────┘
                                          │                                      │
                                          ├─ /ping (health)                      └─ DB: hello_fastapi_dev
                                          ├─ /notes/ (CRUD)                         Table: notes
                                          └─ /docs (Swagger UI)
```

## Module Map

| Doc File | Covers | Key Facts |
|----------|--------|-----------|
| [api_layer.md](api_layer.md) | `src/app/api/` | Pydantic models, CRUD functions, REST endpoints, health check |
| [app_core.md](app_core.md) | `src/app/` | DB table definition, FastAPI app setup, CORS, lifespan |
| [backend_infra.md](backend_infra.md) | `src/` | Dockerfile (multi-stage, Python 3.13), dependencies |
| [tests.md](tests.md) | `src/tests/` | Pytest with monkeypatched CRUD, no real DB |
| [vue_client.md](vue_client.md) | `vue-client/` | Vue 3 + Vite + Axios, read-only table view |
| [deployment.md](deployment.md) | Root | Docker Compose (web + postgres), run.sh, port mapping |

## Data Flow: Create a Note

1. Client → `POST /notes/` with `{"title", "description", "completed"}`
2. FastAPI validates against `NoteSchema` (Pydantic) — 422 if invalid
3. `crud.post()` → `INSERT INTO notes` via async `databases` library
4. `crud.get(new_id)` → re-fetches the created row to get server-generated `id` and `created_date`
5. Returns `NoteDB` (id, title, description, completed, created_date) — 201

## Data Flow: List Notes (Vue Client)

1. Vue `App.vue` mounts → `Api()` fires `GET http://localhost:8002/notes/`
2. FastAPI routes to `read_notes()` → `crud.get_notes(skip=0, limit=10)`
3. SQL: `SELECT * FROM notes ORDER BY created_date DESC LIMIT 10`
4. Returns `List[NoteDB]` as JSON
5. Vue stores array in `this.notes`, `v-for` renders table rows

## Cross-Cutting Concerns

- **Auth:** None — all endpoints are public
- **CORS:** Whitelist via `ALLOWED_ORIGINS` env var (defaults: localhost origins)
- **Error handling:** Generic catch → 400; not-found → 404; validation → 422 (Pydantic)
- **DB lifecycle:** Connect on startup, disconnect on shutdown (lifespan context)
- **Tables auto-created:** `metadata.create_all(engine)` at startup

## Known Gotchas

| Issue | Detail |
|-------|--------|
| Port mismatch | Dockerfile exposes 8000, `src/main.py` uses 8002, docker-compose maps 8002→8000 |
| Vue `note.content` vs API `note.description` | `Note.vue` component references wrong field name |
| Vue is read-only | No create/update/delete UI — only fetches and displays |
| `delete_all` exists in CRUD | No endpoint exposes it, but the function exists in `crud.py` |
| No auth | All endpoints are completely open |
| `run.sh` uses port 8000 | Different from `src/main.py` port 8002 |
