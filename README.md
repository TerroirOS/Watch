# TerroirOS Watch

**An open-source AI transparency engine for agricultural origin claims.**

TerroirOS Watch helps journalists, watchdogs, cooperatives, and the public verify origin claims, understand certification decisions, and hold agricultural institutions accountable by comparing documents, extracting structured claims, and explaining inconsistencies in plain language.

---

## What it does

Upload 2-5 documents about the same batch or product and Watch will:

1. Extract structured claims such as producer name, PDO/GI region, harvest or bottling dates, varietal, and batch identifiers.
2. Compare claims across all submitted documents.
3. Flag discrepancies with severity ratings.
4. Generate a plain-language AI summary of what the documents assert and where conflicts exist.
5. Produce a shareable Watch Report.

---

## Tech Stack

- **Framework:** Next.js 16 (App Router), TypeScript
- **Database:** SQLite by default via `better-sqlite3` with a PostgreSQL-style query adapter
- **AI:** OpenAI with a local mock fallback when `OPENAI_API_KEY` is not configured
- **Document parsing:** `pdf-parse` for PDF text extraction
- **Styling:** Custom CSS design system

---

## Getting Started

### 1. Prerequisites

- Node.js 20+
- npm access to the required packages, either through the public registry or a warm local cache
- An OpenAI API key only if you want real extraction calls during local testing

### 2. Install dependencies

```bash
npm.cmd install
npm.cmd run check:env
```

If PowerShell blocks the `npm` shim on Windows, use `npm.cmd` for all commands.
If your environment is offline and npm is configured in cache-only mode, a cold install will fail until the required tarballs are already present in the local cache.

### 3. Configure environment

```bash
copy .env.local.example .env.local
```

Edit `.env.local` and set the values you need:

```dotenv
OPENAI_API_KEY=sk-...
WATCH_DB_PATH=./watch.db
WATCH_USE_MOCK_AI=true
```

`OPENAI_API_KEY` is optional when `WATCH_USE_MOCK_AI=true` or omitted.
`WATCH_DB_PATH` defaults to `./watch.db`.

### 4. Initialize the local database

```bash
npm.cmd run setup:local
```

This creates the `cases`, `documents`, `extracted_claims`, and `discrepancies` tables in the configured SQLite database.

### 5. Run locally

```bash
npm.cmd run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Routes

| Route | Description |
| --- | --- |
| `/` | Landing page |
| `/cases` | All Watch cases |
| `/cases/new` | Upload documents and open a new case |
| `/cases/[id]` | Watch Report for a specific case |
| `/schema` | Public data model and discrepancy taxonomy docs |
| `POST /api/cases/upload` | Create a case, process documents, and run AI analysis |
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

## Deploying

1. Push the repo to GitHub.
2. Create a deployment target such as Vercel.
3. Add the required environment variables in the deployment platform.
4. Run the database setup script once against the provisioned database volume.
5. Deploy.

---

## Part of TerroirOS

- **Trace** - Creates trusted product passports and attestations
- **Shield** - Adds climate-risk event tracking and payout transparency
- **Watch** - Reads records, compares claims, flags inconsistencies, and explains decisions in plain language

---

## License

MIT
