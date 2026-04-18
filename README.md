# SocietySimOs

Synthetic market research powered by real ICP conversations, MindsAI Sparks, and live focus-group simulations.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue?logo=typescript)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61dafb?logo=react)](https://react.dev/)
[![Express](https://img.shields.io/badge/Express-4.21-black?logo=express)](https://expressjs.com/)
[![Minds AI](https://img.shields.io/badge/Minds_AI-Sparks-purple)](https://getminds.ai)
[![Apify](https://img.shields.io/badge/Apify-Scraper-orange)](https://apify.com)

## What it does

SocietySimOs is a terminal-style research cockpit for testing products with synthetic focus groups.

The app can:

1. Scrape live ICP conversations from Reddit and X/Twitter with Apify.
2. Synthesize buyer personas from that corpus.
3. Create and enrich MindsAI Sparks for each persona.
4. Run live focus-group simulations and structured analysis.
5. Run batch panels with baseline, relay, and aggregate synthesis.

The output is meant to answer two questions quickly:

- What does each persona think individually?
- What does the overall market consensus look like after multiple groups compare notes?

## Core workflows

- `Simulation`: run one saved group against one saved product.
- `Batch Runs`: run multiple saved groups in parallel, then synthesize a global relay and final aggregate read.
- `Visualization`: inspect single-run metrics or batch `baseline`, `relay`, and `aggregate` phases.
- `Simulate From Real Data`: build personas and Sparks from scraped ICP conversations instead of relying only on default local personas.

## Architecture

```text
Browser (React + Vite)
    |
    +-- /api/icp/generate
    |      |
    |      +-- Apify actors
    |      |     +-- trudax~reddit-scraper-lite
    |      |     +-- apidojo~tweet-scraper
    |      |
    |      +-- persona synthesis
    |      +-- MindsAI spark creation
    |      +-- MindsAI knowledge upload
    |
    +-- /api/minds/*
    |      +-- spark and panel sync
    |
    +-- /api/simulations/panel-run
    |      +-- live focus-group turn streaming
    |
    +-- /api/simulations/batch-run
           +-- baseline -> consensus -> relay -> aggregate
```

The app runs as an Express BFF with a Vite frontend. The browser talks only to same-origin `/api/*` routes, so `MINDS_API_KEY` and `APIFY_API_KEY` stay server-side.

## Setup

### Prerequisites

- Node.js 18+
- A MindsAI account and API key
- An Apify account and API key

### Install

```bash
npm install
```

### Configure environment

Create a `.env` file in the project root:

```env
MINDS_API_KEY=your_minds_key
APIFY_API_KEY=your_apify_key
MINDS_API_BASE_URL=https://getminds.ai/api/v1
MINDS_MAX_PANEL_MINDS=5
PORT=3000
```

Notes:

- `MINDS_API_KEY` is required for simulations and sync operations.
- `APIFY_API_KEY` is required for `Simulate From Real Data`.
- `MINDS_MAX_PANEL_MINDS` defaults to `5`.
- `PORT` defaults to `3000`.

### Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Using MindsAI

MindsAI is the persona engine and simulation runtime.

### Where it is used

- `server/minds-client.ts`: typed client for the MindsAI API.
- `server/routes/icp.ts`: creates persona Sparks and uploads knowledge files.
- `server/routes/minds.ts`: keeps local personas and groups in sync with remote Sparks and panels.
- `server/routes/simulations.ts`: runs panel conversations, analysis, and batch synthesis.
- `server/simulation-core.ts`: shared batch synthesis and aggregate logic.

### What SocietySimOs does with MindsAI

1. Creates one Spark per synthesized persona.
2. Updates each Spark with generated prompt, tags, description, and discipline.
3. Uploads the scraped ICP corpus as knowledge so each Spark speaks with the market's language instead of a generic archetype.
4. Uses Sparks during live turns in `panel-run` and batch phases.
5. Uses structured analysis to produce summaries, persona metrics, and aggregate synthesis.

### Practical usage notes

- If `MINDS_API_KEY` is missing, simulations are disabled but local editing still works.
- Personas generated from real data preserve remote metadata like `sparkId`, `fingerprint`, and `lastSyncedAt`.
- Batch runs use MindsAI for both group-level analysis and final aggregate synthesis.

## Using Apify

Apify powers the real-data enrichment path behind `Simulate From Real Data`.

### Where it is used

- `server/routes/icp.ts`

### Actors currently used

- `trudax~reddit-scraper-lite`
- `apidojo~tweet-scraper`

### What SocietySimOs does with Apify

1. Scrapes Reddit posts for the product keyword or ICP keyword.
2. Scrapes X/Twitter posts for the same market language.
3. Normalizes the corpus into `RawPost[]`.
4. Builds a knowledge document from the corpus.
5. Synthesizes personas from the corpus before Spark creation.
6. Uploads the same corpus into each MindsAI Spark as knowledge.

### Practical usage notes

- If `APIFY_API_KEY` is missing, `/api/icp/generate` returns `503`.
- If live scraping returns too little data, the pipeline falls back to demo posts so the flow still works end-to-end.
- The current scraper limits are tuned for fast exploratory runs, not deep research crawls.

## Typical usage

### Single group simulation

1. Add or select a product.
2. Add or select a group.
3. Run `START GROUP RUN`.
4. Review the transcript and structured visualization.

### Simulate from real data

1. Set a product and ICP keyword.
2. Click `SIMULATE FROM REAL DATA`.
3. Apify scrapes live ICP conversations.
4. The backend synthesizes personas and creates MindsAI Sparks.
5. The personas become available for simulation and visualization.

### Batch runs

1. Choose a saved product.
2. Select multiple saved groups.
3. Start `BATCH RUN`.
4. Inspect:
   - `baseline` for direct group reactions
   - `relay` for post-consensus reactions
   - `aggregate` for overall market consensus and cross-group comparison

## Validation

- Type-check: `npm run lint`
- Tests: `npm run test`
- Production build: `npm run build`

## Project structure

```text
src/
  App.tsx                  Main React app and UI state
  types.ts                 Shared frontend and backend types
  lib/
    api.ts                 API helpers
    metrics.ts             Metric normalization helpers
    storage.ts             Local persistence and migrations

server/
  index.ts                 Express + Vite entrypoint
  config.ts                Environment parsing
  minds-client.ts          MindsAI client
  simulation-core.ts       Batch synthesis and shared simulation logic
  routes/
    icp.ts                 Apify scrape + persona synthesis + Spark creation
    minds.ts               Spark and panel sync endpoints
    simulations.ts         Single run, batch run, and analysis endpoints
    health.ts              Health and config status
```
