# TerroirOS Watch

**An open-source AI transparency engine for agricultural origin claims.**

TerroirOS Watch helps journalists, watchdogs, cooperatives, and the public verify origin claims, understand certification decisions, and hold agricultural institutions accountable — by comparing documents, extracting structured claims, and explaining inconsistencies in plain language.

---

## What it does

Upload 2–5 documents about the same batch or product (PDO certificates, lab reports, export declarations, product labels) and Watch will:

1. Extract structured claims — producer name, PDO/GI region, harvest/bottling dates, varietal, batch identifiers
2. Compare claims across all submitted documents
3. Flag discrepancies with severity ratings (high / medium / low)
4. Generate a plain-language AI summary of what the documents assert and where conflicts exist
5. Produce a shareable Watch Report

---

## Tech Stack

- **Framework:** Next.js 16 (App Router), TypeScript
- **Database:** PostgreSQL (Neon / Supabase / local) with `pg`
- **AI:** OpenAI `gpt-4o` for structured extraction and discrepancy analysis
- **Document parsing:** `pdf-parse` for PDF text extraction
- **Styling:** Custom CSS design system (warm cream palette, serif headings)

---

## Getting Started

### 1. Prerequisites

- Node.js 18+
- A PostgreSQL database (Neon serverless recommended for Vercel deploys)
- An OpenAI API key

### 2. Install

```bash
npm install
```

### 3. Configure environment

```bash
cp .env.local.example .env.local
```

Edit `.env.local` and set:

```
DATABASE_URL=postgres://...
OPENAI_API_KEY=sk-...
```

### 4. Initialize the database

```bash
npx tsx scripts/setup-db.ts
```

This creates the `cases`, `documents`, `extracted_claims`, and `discrepancies` tables.

### 5. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Routes

| Route | Description |
|---|---|
| `/` | Landing page |
| `/cases` | All watch cases list |
| `/cases/new` | Upload documents and open a new case |
| `/cases/[id]` | Watch Report for a specific case |
| `/schema` | Public data model and discrepancy taxonomy docs |
| `POST /api/cases/upload` | Create a case, process documents, run AI analysis |
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

## Deploying to Vercel

1. Push the repo to GitHub.
2. Create a new Vercel project from the repo.
3. Add environment variables in Vercel dashboard: `DATABASE_URL` and `OPENAI_API_KEY`.
4. Run the DB setup script once against your production database.
5. Deploy.

---

## Part of TerroirOS

TerroirOS Watch is the accountability and interpretation layer of the broader TerroirOS ecosystem:

- **Trace** — Creates trusted product passports and attestations
- **Shield** — Adds climate-risk event tracking and payout transparency
- **Watch** — Reads records, compares claims, flags inconsistencies, explains decisions in plain language

---

## License

MIT — open-source and freely deployable.
