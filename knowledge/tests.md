# Tests — `src/tests/`

The test suite validates the API's HTTP contract — status codes, response shapes, and input validation — without ever touching a real database. Every test monkeypatches the CRUD functions (`crud.post`, `crud.get`, etc.) with async mock functions that return hardcoded data. This means the tests verify routing, Pydantic validation, error handling, and query parameter parsing, but do not test actual SQL queries or database behavior.

## Test Setup (`conftest.py`)

The `test_app` fixture replaces the database lifecycle hooks (`connect`, `disconnect`, `create_all`) with no-ops so the app can start without PostgreSQL. It uses Starlette's synchronous `TestClient`, which internally runs the async FastAPI handlers in an event loop. The fixture is scoped to `module`, so one client instance is shared across all tests in a file.

- **Fixture:** `test_app` (scope: `module`) — provides a `starlette.testclient.TestClient`
- **DB mocking:** Patches `database.connect`, `database.disconnect`, and `metadata.create_all` with no-ops
- All CRUD calls are monkeypatched per-test

## Test Coverage Summary

### `test_ping.py` — Health Check

| Test | Asserts |
|------|---------|
| `test_ping_success` | GET `/ping` → 200, response has `status` ∈ {healthy, degraded} and `message` |
| `test_ping_response_schema` | `status` and `message` are non-empty strings |

### `test_notes.py` — Notes CRUD

**TestCreateNote**

| Test | Asserts |
|------|---------|
| `test_create_note_success` | POST `/notes/` with valid body → 201, returns `NoteDB` |
| `test_create_note_validation` (parametrized) | Empty body → 422; missing title → 422; title <3 chars → 422; description <3 → 422; title >255 → 422; description >1000 → 422; valid with completed=true → 201 |

**TestReadNotes**

| Test | Asserts |
|------|---------|
| `test_read_single_note` | GET `/notes/1` → 200 |
| `test_read_note_not_found` | GET `/notes/999` → 404, detail contains "not found" |
| `test_read_note_invalid_id` | GET `/notes/0` or `/notes/invalid` → 422 |
| `test_read_all_notes` | GET `/notes/` → 200, returns list |
| `test_read_notes_with_pagination` | `?skip=0&limit=1` → returns 1 item |
| `test_read_notes_pagination_invalid_limit` | `?limit=101` → 422 |
| `test_read_notes_filter_by_completion` | `?completed=true` → only completed notes |
| `test_read_notes_search` | `?search=unique` → matching notes |
| `test_read_notes_combined_filters` | `?search=test&completed=true` → combined filter |

**TestUpdateNote**

| Test | Asserts |
|------|---------|
| `test_update_note_success` | PUT `/notes/1` → 200 |
| `test_update_note_not_found` | PUT `/notes/999` → 404 |
| `test_update_note_validation` (parametrized) | Same field constraints as create; id=0 → 422; id=999 → 404 |

**TestDeleteNote**

| Test | Asserts |
|------|---------|
| `test_delete_note_success` | DELETE `/notes/1` → 200, returns deleted note |
| `test_delete_note_not_found` | DELETE `/notes/999` → 404 |
| `test_delete_note_invalid_id` | DELETE `/notes/0` or `/notes/invalid` → 422 |
