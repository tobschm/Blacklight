# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the app

```
node server.js        # starts on http://localhost:3000 (default)
PORT=8080 node server.js  # custom port
npm start             # alias for the above
```

The server serves both the static frontend and the REST API from a single process. No build step is needed — the frontend is plain HTML/CSS/JS.

## Configuration

All runtime config lives in `config.properties` (Java-style `key=value`):

```
app.password=Test123
app.sessionSecret=change-me-in-production
```

The file is parsed at startup by `server.js`. To add a new config key, add a line here and read it via `config['your.key']` in the server. Change `app.sessionSecret` to a random string before hosting publicly — it signs the auth cookie.

## Architecture

**Single-process, single-file SQLite.** The Node/Express server (`server.js`) owns everything: config loading, auth, all REST routes, and static file serving. There is no build pipeline, no ORM, and no separate frontend server.

**Database layer (`db.js`).** Uses `sql.js` (pure-JS SQLite compiled to WASM — chosen because `better-sqlite3` requires native compilation and Visual Studio on Windows). The DB is held in memory and flushed to `data.db` via `persist()` after every write. `getDb()` is async (WASM init) but returns the same singleton after the first call. Any new write route must call `persist()` after mutating the DB or changes will be lost on restart.

**Auth.** Stateless HMAC cookie: `POST /api/login` compares the plain-text password from `config.properties`, then sets an `httpOnly` cookie (`auth=authenticated.<hmac>`). The `requireAuth` middleware verifies the HMAC on every protected request. There are no user accounts or sessions stored in the DB.

**Frontend (`public/`).** Single HTML page with three toggled `<div>` sections: `#login-view`, `#dashboard-view`, `#detail-view`. `app.js` switches between them by setting `.hidden`. State is kept in the module-level `currentItem` variable. All persistence goes through `fetch` calls to the REST API — there is no localStorage.

**Drag-and-drop.** Uses the native HTML5 DnD API. Cards are `draggable="true"`; lane `.lane-cards` divs are drop targets. On drop, the card is moved in the DOM immediately (optimistic UI), then a `PUT /api/items/:id` updates the status on the server.

**Auto-save in detail view.** Title saves on `blur`, description saves on `input` with a 600 ms debounce, status saves immediately on `change`. `flushSave()` is called before navigating back to the dashboard to ensure pending debounced saves are not lost.

**DB query helpers.** `dbOne(db, sql, params)` and `dbAll(db, sql, params)` in `server.js` wrap `db.exec()` (which returns `[{columns, values}]`) into plain objects. Always use these helpers rather than calling `db.exec()` directly in route handlers.

## REST API

All routes under `/api/items*` require the auth cookie. `/api/login` and `/api/logout` are public.

| Method | Path | Body | Notes |
|---|---|---|---|
| POST | `/api/login` | `{password}` | Sets `auth` cookie |
| POST | `/api/logout` | — | Clears cookie |
| GET | `/api/items` | — | All items, ordered by `created_at` |
| POST | `/api/items` | `{title?}` | Creates with status `todo` |
| GET | `/api/items/:id` | — | Single item |
| PUT | `/api/items/:id` | `{title?, description?, status?}` | Partial update; omitted fields keep existing values |
| DELETE | `/api/items/:id` | — | Returns 204 |

Valid status values: `todo`, `in_progress`, `done`.

## SQLite schema

```sql
CREATE TABLE work_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL DEFAULT 'Untitled',
  description TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'todo',
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
```

`description` is stored as raw HTML (from `contenteditable`).
