# Blacklight

A simple, lightweight project management tool for individuals and small teams.

## About

Blacklight is a no-frills kanban board designed to get out of your way. It's built for a single person tracking their own work, or a small group collaborating on a shared project — think student teams, hobby projects, or freelancers who just need to move tasks across a board without dealing with enterprise software.

**What it does:**

- Organizes work items across three columns: **To Do**, **In Progress**, and **Done**
- Lets you add a title and rich-text description to each item
- Supports drag-and-drop to move cards between columns
- Optionally assigns items to configurable categories
- Password-protects the board so only your team can access it

There is no user account system, no role management, and no notification system — by design. Blacklight is deliberately small.

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | [Node.js](https://nodejs.org) |
| Web framework | [Express 5](https://expressjs.com) |
| Database | [sql.js](https://sql.js.org) (SQLite compiled to WebAssembly — no native dependencies) |
| Auth | Stateless HMAC-signed cookie (`crypto` built-in + `cookie-parser`) |
| Frontend | Plain HTML, CSS, and JavaScript — no framework, no build step |
| Persistence | Single SQLite file (`data.db`) written to disk after every change |
| Containerization | Docker + Docker Compose |
| Config | Java-style `.properties` file (`config.properties`) |

sql.js is used instead of `better-sqlite3` specifically because it is pure JavaScript (compiled from C via Emscripten), which means it runs without native compilation or Visual Studio — making it easy to set up on any OS.

## Running

### Locally

```sh
npm install
npm start          # http://localhost:3000
```

Or with a custom port:

```sh
PORT=8080 node server.js
```

### With Docker

```sh
docker compose up
```

The app will be available at `http://localhost:3000`. The SQLite database is stored in `./data/` on the host, mounted as a volume so data persists across container restarts.

## Configuration

Edit `config.properties` before starting:

```properties
app.password=your-password-here
app.sessionSecret=change-me-to-a-random-string
categories=Design,Backend,Frontend
```

- `app.password` — the single shared password for the board
- `app.sessionSecret` — signs the auth cookie; change this to a random string before hosting publicly
- `categories` — optional comma-separated list of category labels for items
