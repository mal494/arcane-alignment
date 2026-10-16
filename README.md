# Arcane Alignment (Vite + React + TypeScript)

Arcane Alignment is a fantasy-themed match-3 game built with React and Vite.  
The app now includes an optional **Gemini-powered gameplay tip** button that calls a serverless API route, so your API key never ships to the browser.

## What this app does

- Renders an 8x8 element-matching board.
- Handles swapping, matching, gravity/refill, score, mana, and chain multipliers.
- Lets players request a short tactical tip from Gemini during gameplay.

## Tech stack

- Vite + React + TypeScript
- Tailwind CSS v4
- Vercel Serverless Function (`/api/gemini-tip`) for Gemini calls

## Environment variables

Copy `.env.example` to `.env.local` for local development:

```bash
cp .env.example .env.local
```

Required:

- `GEMINI_API_KEY` - Gemini API key used **server-side only** in the Vercel function.

Optional:

- `GEMINI_MODEL` - defaults to `gemini-2.5-flash`.

## Local development

Install dependencies:

```bash
npm install
```

Run frontend only (Vite):

```bash
npm run dev
```

Run frontend + API together (recommended for Gemini tip testing):

```bash
npm run dev:vercel
```

Then open the local URL shown by Vercel CLI.

## Scripts

- `npm run dev` - run Vite dev server
- `npm run dev:vercel` - run Vercel local dev environment (includes `/api/*`)
- `npm run build` - production build
- `npm run preview` - preview production build
- `npm run typecheck` - TypeScript type check
- `npm run lint` - currently runs typecheck

## Deploying to Vercel

1. Push this repo to GitHub/GitLab/Bitbucket.
2. Import the project in Vercel.
3. In **Project Settings -> Environment Variables**, set:
   - `GEMINI_API_KEY` (required)
   - `GEMINI_MODEL` (optional)
4. Deploy.

No extra `vercel.json` is required for this setup.

## Security note

Never expose Gemini credentials in client code (`import.meta.env` or Vite `define` client injection).  
This app keeps `GEMINI_API_KEY` on the server in `/api/gemini-tip` and only returns generated text to the browser.
