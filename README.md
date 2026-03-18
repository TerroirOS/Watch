# TerroirOS Watch

**A local-first document review prototype for agricultural origin claims.**

This local checkout currently lives in the `Shield/` folder, but the app itself is the `TerroirOS/Watch` prototype: a single Next.js application with SQLite for local persistence and optional OpenAI-backed analysis. The instructions below describe the code that exists today.

---

## What it does

Upload 1-5 documents about the same batch or product and Watch will:

1. Extract structured origin-related claims from PDFs and JSON files
2. Compare claims across submitted documents
3. Flag discrepancies with severity ratings
4. Generate a plain-language summary of the case
5. Store the case locally for review in the dashboard

---

## Tech Stack

- **Framework:** Next.js 16 (App Router), TypeScript
- **Database:** SQLite via `better-sqlite3`
- **AI:** OpenAI chat completions when configured, otherwise deterministic mock analysis
- **Document parsing:** `pdf-parse`
- **Styling:** Custom CSS

---

## Getting Started

### 1. Prerequisites

- Node.js 20+
- npm
- An OpenAI API key only if you want live AI analysis

### 2. Install

```bash
npm install
```

If PowerShell blocks the `npm` shim on Windows, use `npm.cmd` instead.

### 3. Configure environment

```bash
cp .env.local.example .env.local
```

Edit `.env.local` as needed:

```bash
WATCH_DB_PATH=watch.db
WATCH_USE_MOCK_AI=true
OPENAI_API_KEY=sk-...
```

### 4. Validate environment and initialize the database

```bash
npm run setup:local
```

This runs the Day 1 bootstrap audit and creates the local SQLite schema in `WATCH_DB_PATH`.

### 5. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Local Environment Contract

- `WATCH_DB_PATH`: optional SQLite database path, defaults to `watch.db`
- `WATCH_USE_MOCK_AI`: `true`, `false`, or empty for auto-detect
- `OPENAI_API_KEY`: required only when mock mode is disabled
- `npm run check:env`: validates Node version, dependency install state, env values, and local DB target

---

## Routes

| Route | Description |
|---|---|
| `/` | Landing page |
| `/cases` | All watch cases list |
| `/cases/new` | Upload documents and open a new case |
| `/cases/[id]` | Report for a specific case |
| `/schema` | Public data model and discrepancy taxonomy docs |
| `POST /api/cases/upload` | Create a case, process documents, run analysis |
| `GET /api/cases` | JSON list of all cases |

---

## Database Schema

```sql
cases            (id, title, description, ai_summary, status, created_at, updated_at)
documents        (id, case_id, filename, file_url, file_type, extracted_text, created_at)
extracted_claims (id, case_id, document_id, claim_type, claim_value, confidence_score, created_at)
discrepancies    (id, case_id, title, plain_language_summary, severity, created_at)
```

---

## Deployment Notes

The current app is optimized for local development and demos. A hosted deployment still needs production-safe storage and persistence decisions for uploaded files before it is operationally ready.

---

## Part of TerroirOS

Watch sits alongside the broader TerroirOS ecosystem:

- **Trace**: trusted product passports and attestations
- **Shield**: climate-risk event tracking and payout transparency roadmap
- **Watch**: record comparison, inconsistency detection, and operator-facing explanations

---

## License

MIT
