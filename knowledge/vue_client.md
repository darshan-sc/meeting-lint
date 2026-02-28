# Vue Client — `vue-client/`

A minimal Vue 3 single-page application that serves as a read-only dashboard for notes. It fetches all notes from the FastAPI backend on page load and renders them in an HTML table. There is no routing, no state management library, and no forms — the client can only view notes, not create, edit, or delete them. Three extra components (`Note.vue`, `Test.vue`, `HelloWorld.vue`) exist in the codebase but are never imported or rendered by `App.vue`, suggesting they are leftovers from scaffolding or incomplete features.

## Stack

| Tech | Version | Role |
|------|---------|------|
| Vue | 3.5.29 | UI framework |
| Vite | 7.3.1 | Dev server + bundler |
| Axios | 1.13.4 | HTTP client |

Dev server: `vite` on default port `5173`.

## API Integration (`src/Api.js`)

The API layer is a single function that returns an Axios GET promise. The backend URL is hardcoded to `http://localhost:8002/notes/` — there's no environment variable or config file for it. This means the client only works when the backend is running on the same machine at port 8002 (which matches both `src/main.py` local mode and docker-compose's host port mapping).

## Components

### `App.vue` (root)

The root component uses Vue's Options API (not Composition API, despite the empty `<script setup>` block at the top). On mount (`created` hook), it calls the `Api()` function and stores the response array into `this.notes`. The template iterates over notes with `v-for` and renders a table. The `completed` field is displayed as "Yes"/"No" (ternary), and `created_date` is formatted via `new Date().toLocaleString()`. There is no loading state, no error handling if the API call fails, and no empty-state message if there are zero notes.

- State: `notes: []`
- Renders columns: ID, Title, Description, Completed (Yes/No), Created Date
- **Read-only** — no create/update/delete UI

### `Note.vue`

- Props: `note: Object`
- Displays `note.title` (h1) and `note.content` (p)
- **Not used** in `App.vue` currently

### `Test.vue`

- Props: `notes: []`
- Debug component — dumps raw `notes` data
- **Not used** in `App.vue` currently

### `HelloWorld.vue`

- Props: `msg: String`
- Displays message, has a commented-out counter button
- **Not used** in `App.vue` currently

## Key Observations

- The client is **read-only**: only fetches notes via GET, no forms for CRUD operations
- `Note.vue` references `note.content` but the API model uses `note.description` — mismatch if ever wired up
- Three components (`Note`, `Test`, `HelloWorld`) exist but are unused
