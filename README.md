<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run the MindsAI focus-group app

This contains everything you need to run your app locally.

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Copy [.env.example](.env.example) to `.env` and set `MINDS_API_KEY`
3. Run the app:
   `npm run dev`

The app now runs as an Express BFF with a Vite frontend. The browser talks only to same-origin `/api/*` routes, and the MindsAI API key stays on the server.
