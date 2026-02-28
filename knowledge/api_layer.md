# API Layer — `src/app/api/`

This directory contains the entire REST API logic. It follows a clean three-file separation: `models.py` defines the Pydantic schemas for validation and serialization, `crud.py` contains the raw database query functions, and `notes.py` wires them together as FastAPI route handlers. There is also a `ping.py` health-check endpoint. The `__init__.py` is empty — the modules are imported directly by `app/main.py`.

## Data Models (`models.py`)

The models use Pydantic v2 inheritance. `NoteBase` holds the three user-editable fields with validation constraints. `NoteSchema` inherits it unchanged and is used as the request body type for create/update. `NoteDB` extends it with server-generated fields (`id`, `created_date`) and is used as the response model — this means every API response includes the full note record.

| Model | Parent | Fields | Constraints |
|-------|--------|--------|-------------|
| `NoteBase` | `BaseModel` | `title: str`, `description: str`, `completed: bool` | title: 3–255 chars; description: 3–1000 chars; completed defaults `False` |
| `NoteSchema` | `NoteBase` | (inherits all) | Used for create/update request bodies |
| `NoteDB` | `NoteBase` | + `id: int`, `created_date: datetime` | Represents DB row; used as response model |
| `ErrorResponse` | `BaseModel` | `detail: str` | Standard error shape |
| `PingResponse` | `BaseModel` | `status: str`, `message: str` | Defined in `ping.py` |

## CRUD Functions (`crud.py`)

This is the data-access layer. All functions are `async` and use the `databases` library for non-blocking PostgreSQL queries against the `notes` SQLAlchemy table object defined in `db.py`. The functions are thin wrappers around SQL — no ORM sessions or models, just raw `insert/select/update/delete` built with SQLAlchemy Core expressions. The `get_notes` function is the most complex: it dynamically builds a query with optional `ILIKE` search across title+description, a completed-status filter, and pagination with a hardcoded max limit of 100 to prevent abuse.

| Function | Signature | Returns | Notes |
|----------|-----------|---------|-------|
| `post` | `(payload: NoteSchema) → int` | New note ID | Inserts title, description, completed |
| `get` | `(id: int) → Optional[Dict]` | Single row or None | Select by primary key |
| `get_notes` | `(skip=0, limit=10, search=None, completed=None) → List[Dict]` | List of rows | Limit capped at 100; search uses `ILIKE` on title+description; ordered by `created_date DESC` |
| `put` | `(id: int, payload: NoteSchema) → Optional[int]` | Updated note ID | Uses `.returning(notes.c.id)` |
| `delete` | `(id: int) → int` | Row count | Deletes single note |
| `delete_all` | `() → int` | Row count | Deletes ALL notes |

## REST Endpoints (`notes.py`)

The route handlers in `notes.py` follow a consistent pattern: call a CRUD function, handle not-found cases with 404, and wrap everything in a try/except that converts unexpected errors to 400. For create and update, the handler first writes to the DB, then re-fetches the row to return the full `NoteDB` object (including server-generated `id` and `created_date`). The delete handler also returns the deleted note's data by fetching it before deletion. All query parameters use FastAPI's `Query()` with built-in validation constraints (e.g., `limit` is capped at 100 at the route level via `le=100`, and also enforced in `crud.py` via `min(limit, 100)`).

**Router prefix:** mounted at `/notes` (see `app/main.py`)

| Method | Path | Handler | Status | Response | Query Params |
|--------|------|---------|--------|----------|--------------|
| POST | `/notes/` | `create_note` | 201 | `NoteDB` | — body: `NoteSchema` |
| GET | `/notes/` | `read_notes` | 200 | `List[NoteDB]` | `skip` (≥0), `limit` (1–100), `search` (max 100 chars), `completed` (bool) |
| GET | `/notes/{id}` | `read_note` | 200 | `NoteDB` | `id` path param (>0) |
| PUT | `/notes/{id}` | `update_note` | 200 | `NoteDB` | `id` path param + body: `NoteSchema` |
| DELETE | `/notes/{id}` | `delete_note` | 200 | `NoteDB` (returns deleted note) | `id` path param (>0) |

**Error pattern:** All handlers catch generic exceptions → HTTP 400. `read_note`, `update_note`, `delete_note` raise HTTP 404 if note not found. HTTPExceptions are re-raised as-is.

## Health Check (`ping.py`)

The health endpoint is intentionally forgiving. It checks if the `database` object has an `is_connected()` method and reports the connection status, but it never raises an HTTP error or returns a 5xx code. If the DB is down or an exception occurs, it returns a 200 with `status: "degraded"` instead of failing hard. This means load balancers using this endpoint won't pull the service out of rotation on transient DB issues.

| Method | Path | Handler | Response |
|--------|------|---------|----------|
| GET | `/ping` | `pong` | `PingResponse` — checks `database.is_connected()`; returns `"healthy"` or `"degraded"` |

No auth on any endpoint.
