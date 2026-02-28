# App Core — `src/app/`

This directory is the application root. It has two files: `db.py` sets up the database connection and table schema, and `main.py` configures the FastAPI application instance with middleware, lifespan hooks, and route mounting.

## Database (`db.py`)

The database setup uses a dual-driver approach. A synchronous SQLAlchemy `create_engine` exists solely for `metadata.create_all()` at startup — this is what creates the `notes` table if it doesn't already exist. All runtime queries go through an async `databases.Database` instance, which uses `asyncpg` under the hood for non-blocking I/O. The table is defined using SQLAlchemy Core (not ORM), so there are no model classes or sessions — just a `Table` object that CRUD functions reference directly for building queries.

**Env var:** `DATABASE_URL` — default: `postgresql://hello_fastapi:hello_fastapi@localhost/hello_fastapi_dev`

### `notes` Table

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `Integer` | PK, autoincrement |
| `title` | `String(255)` | NOT NULL |
| `description` | `String(1000)` | NOT NULL |
| `completed` | `Boolean` | NOT NULL, default `False` |
| `created_date` | `DateTime` | NOT NULL, default `func.now()` (server-side) |

## FastAPI App (`main.py`)

This is the application factory. It creates the FastAPI instance, attaches CORS middleware, and mounts two routers. The app uses the modern `lifespan` async context manager pattern (not the deprecated `on_event` decorators) to handle startup and shutdown. On startup it ensures the DB table exists and opens the async connection pool; on shutdown it closes the pool cleanly.

**App title:** "Notes API" — version `1.0.0`

### Lifespan (startup/shutdown)

1. **Startup:** `metadata.create_all(engine)` (creates tables if missing), then `database.connect()`
2. **Shutdown:** `database.disconnect()`

### CORS Middleware

- **Origins:** env `ALLOWED_ORIGINS`, default `http://localhost, :8080, :5173`
- **Methods:** DELETE, GET, POST, PUT
- **Headers:** `*` (all allowed)
- **Credentials:** enabled

### Route Mounting

| Router | Prefix | Tags |
|--------|--------|------|
| `ping.router` | (none — mounts at `/ping`) | `["health"]` |
| `notes.router` | `/notes` | `["notes"]` |

## Environment Variables (`.env-example`)

| Variable | Default | Purpose |
|----------|---------|---------|
| `DATABASE_URL` | `postgresql://hello_fastapi:hello_fastapi@localhost/hello_fastapi_dev` | Postgres connection string |
| `ENVIRONMENT` | `development` | App environment (not used in code currently) |
| `ALLOWED_ORIGINS` | `http://localhost,http://localhost:8080,http://localhost:5173` | CORS whitelist, comma-separated |
