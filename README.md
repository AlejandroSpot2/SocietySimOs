<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />

# SocietySimOs

**Synthetic market research powered by real human conversations.**

Run AI focus groups trained on actual Reddit threads and tweets — not fictional personas.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue?logo=typescript)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61dafb?logo=react)](https://react.dev/)
[![Express](https://img.shields.io/badge/Express-4.21-black?logo=express)](https://expressjs.com/)
[![Minds AI](https://img.shields.io/badge/Minds_AI-Sparks-purple)](https://getminds.ai)
[![Apify](https://img.shields.io/badge/Apify-Scraper-orange)](https://apify.com)

</div>

---

## What it does

SocietySimOs is a terminal-style focus group simulator. Enter a product, click one button, and watch 10 AI personas — trained on real social media conversations about your market — debate it in real time.

**The old way:** 10 hardcoded fictional personas (Chad the Biohacker, Susan the Mom, etc.) powered by a generic LLM prompt.

**The new way:** Scrape Reddit and Twitter for real ICP conversations → extract buyer archetypes from the data → train Minds AI Sparks on that data → run a live simulation → get sentiment, persuasion, and passion metrics per persona.

---

## Demo flow

```
1. Enter your product + ICP keyword (e.g. "sales automation SaaS")
2. Click "SIMULATE FROM REAL DATA"
3. Watch the terminal:
   → Apify scrapes Reddit (r/sales, r/SaaS, r/startups) + Twitter
   → 10 Minds AI Sparks created, each trained on real ICP posts
   → Live focus group simulation streams in real time
   → Analyst Spark generates structured metrics
4. Go to Visualization → scatter plot of sentiment × passion × persuasion
```

---

## Architecture

```
Browser (React + Vite)
    │
    ├── /api/icp/generate          ← Main pipeline endpoint
    │       │
    │       ├── Apify Actors
    │       │     ├── trudax~reddit-scraper-lite  → Reddit posts
    │       │     └── apidojo~tweet-scraper       → Tweets
    │       │
    │       ├── Keyword extraction from scraped posts
    │       │
    │       └── Minds AI (via MindsClient)
    │             ├── POST /sparks (mode: keywords) × 10  → train Sparks
    │             └── POST /sparks/{id}/knowledge × 10    → upload ICP posts
    │
    ├── /api/simulations/panel-run  ← SSE streaming simulation
    │       └── Minds AI completeSpark() per persona per round
    │
    └── /api/simulations/analyze    ← Structured metrics
            └── Analyst Spark → JSON { summary, metrics[] }
```

**Stack:**
- **Frontend:** React 19, Vite, Tailwind CSS, Recharts, Lucide React, Geist font
- **Backend:** Express 4 (BFF — browser never calls external APIs directly)
- **AI Personas:** Minds AI (Sparks API, keywords mode, knowledge upload, completions)
- **Data:** Apify (Reddit Scraper Lite, Tweet Scraper V2)

---

## Sponsors

### Apify
We use two Apify Actors to scrape real ICP conversations:

| Actor | ID | Purpose |
|---|---|---|
| Reddit Scraper Lite | `trudax~reddit-scraper-lite` | Scrapes up to 20 posts per keyword across all of Reddit |
| Tweet Scraper V2 | `apidojo~tweet-scraper` | Scrapes up to 20 tweets per keyword |

The scraped posts are formatted into a structured knowledge text and uploaded to each Minds AI Spark. This gives each persona the real vocabulary, pain points, and language patterns of your actual ICP — not what an LLM imagines they sound like.

### Minds AI
We use Minds AI as the persona engine:

| Endpoint | Usage |
|---|---|
| `POST /sparks` (mode: keywords) | Creates 10 Sparks, each auto-trained via Tavily + YouTube on archetype-specific keywords |
| `POST /sparks/{id}/knowledge` | Uploads scraped Apify posts as a `.txt` knowledge file to each Spark |
| `POST /sparks/{id}/completion` | Powers each persona's turn in the focus group simulation |
| Analyst Spark + structured output | Generates `{ summary, metrics[] }` with sentiment/persuasion/passion per persona |

---

## 10 ICP Archetypes

Each run generates these 10 archetypes, but their actual behavior is trained on your specific scraped data:

| Persona | Archetype | Discipline |
|---|---|---|
| The Skeptic | Data-Driven Doubter | Analytics |
| The Champion | Internal Evangelist | Product Management |
| The Budget Owner | ROI Gatekeeper | Finance |
| The End User | Daily Practitioner | Operations |
| The Executive | Strategic Buyer | Executive Leadership |
| The Tech Lead | Technical Evaluator | Engineering |
| The Early Adopter | Innovation Seeker | Growth |
| The Traditionalist | Status Quo Defender | Sales |
| The Pragmatist | Practical Implementer | Customer Success |
| The Influencer | Peer Opinion Leader | Marketing |

---

## Setup

### Prerequisites
- Node.js 18+
- Minds AI account + API key → [getminds.ai](https://getminds.ai)
- Apify account + API key → [apify.com](https://apify.com)

### Install

```bash
git clone https://github.com/AlejandroSpot2/SocietySimOs.git
cd SocietySimOs
npm install
```

### Configure

```bash
cp .env.example .env
```

Edit `.env`:

```env
MINDS_API_KEY=minds_your_key_here
APIFY_API_KEY=apify_api_your_key_here
```

### Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Usage

### Simulate from real data (recommended)

1. Go to **Products** tab → enter your product details + ICP keyword
2. Go to **Simulation** tab → click **SIMULATE FROM REAL DATA**
3. The terminal logs every step of the pipeline in real time
4. After completion → go to **Visualization** tab for metrics

### Simulate with default personas (fallback)

1. Go to **Personas** tab → configure the 10 default personas
2. Go to **Groups** tab → create a group
3. Go to **Simulation** tab → select group + product → click **START SIM**

---

## Project structure

```
/
├── src/
│   ├── App.tsx                    ← Main React app (all UI logic)
│   ├── types.ts                   ← Shared TypeScript interfaces
│   ├── components/ui/             ← UI components (Logo, KpiCard, AnimatedBackground, etc.)
│   └── theme/                     ← Design tokens (personas.ts, charts.ts)
├── server/
│   ├── index.ts                   ← Express + Vite server entry point
│   ├── config.ts                  ← Environment config
│   ├── minds-client.ts            ← Minds AI API client
│   └── routes/
│       ├── icp.ts                 ← ICP pipeline (Apify + Minds AI)
│       ├── minds.ts               ← Spark + Panel sync
│       ├── simulations.ts         ← Panel run (SSE) + analyze
│       └── health.ts              ← Health check
├── .env.example
└── package.json
```
