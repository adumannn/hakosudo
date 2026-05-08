# Sudoku

A modern Sudoku web app with daily challenges, leaderboard, and an AI coach.

## Stack

- Next.js 14 (App Router) + TypeScript
- Tailwind CSS + shadcn/ui
- Supabase (Postgres + Auth + RLS)
- Anthropic Claude Haiku 4.5 (coach, streaming)
- Zustand (game state) with localStorage fallback for guests
- Stripe Checkout (test mode, webhook stubbed)
- Framer Motion (cell input + win celebration)
- Vitest (engine tests)

## Setup

1. Install deps:
   ```bash
   npm install
   ```

2. **Supabase**
   - Create a project at supabase.com
   - In SQL editor, run each migration in order:
     - `supabase/migrations/0001_initial.sql`
     - `supabase/migrations/0002_games_unique.sql`
     - `supabase/migrations/0003_daily_results_insert.sql`
   - In Auth → Providers, enable Google. Set Site URL to `http://localhost:3000` and add `http://localhost:3000/auth/callback` to redirect URLs.
   - Copy URL + anon key + service role key into `.env.local` (start from `.env.example`)

3. **Anthropic**
   - Get an API key from console.anthropic.com → `ANTHROPIC_API_KEY`

4. **Stripe** (test mode)
   - Create a product + price → `STRIPE_PRICE_ID_PRO`
   - Copy keys to `STRIPE_SECRET_KEY` and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`

5. **Seed puzzles** (must run before the app is playable):
   ```bash
   npm run verify-generator   # sanity check (10 per difficulty)
   npm run seed               # 200 puzzles + 30 daily challenges
   ```

6. **Run**
   ```bash
   npm run dev
   ```

## Schema

- `profiles` — extends `auth.users` with `is_pro`, `username`, `city`
- `puzzles` — pre-generated pool, 50 per difficulty
- `daily_puzzles` — one per UTC date with `min_seconds` cheat-check
- `games` — in-progress + finished games, RLS to owner; partial unique indexes for upsert
- `daily_results` — leaderboard entries, world-readable, server-validated insert
- `ai_usage` — coach rate limit (20/day free, unlimited Pro)

## Tests

```bash
npm test                # vitest, 20 unit tests on the sudoku engine
npm run typecheck       # tsc --noEmit
```

## What's stubbed

- **Stripe webhook:** `/api/stripe/checkout` creates a Checkout Session, but the success path does NOT flip `profiles.is_pro`. To test Pro features, manually run in Supabase SQL editor:
  ```sql
  update profiles set is_pro = true where id = '<your-uuid>';
  ```
  TODO: implement `app/api/stripe/webhook/route.ts` listening for `customer.subscription.created`.
- **Custom themes (Pro feature):** light/dark/system only. Accent-color picker not built.
- **Ad placeholder:** No ad slot rendered; Pro feature listed for parity.
- **Hint techniques:** `findHint` covers naked-single + hidden-single. The 6-element `Technique` union exists for future expansion (locked candidate, naked/hidden pair, X-wing); the AI Coach prompt mentions all six so the model can name them even when the local hint button can't.

## Deploy to Vercel

1. Push to GitHub
2. Import in Vercel; copy env vars from `.env.local`
3. Set `NEXT_PUBLIC_SITE_URL` to the production URL
4. Update Supabase Auth redirect URL to `<vercel-url>/auth/callback`
