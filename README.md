# Deep Space Duel

Experimental 1v1 card game featuring real deep-sky objects. This first increment contains the landing page and a realtime, two-player lobby; gameplay rules are intentionally out of scope.

## Requirements

- Node.js 20.19+ (Node 20 LTS recommended)
- npm
- A Supabase project or the Supabase CLI for local development

## Setup

1. Install dependencies with `npm install`.
2. Enable **Anonymous Sign-Ins** in Supabase Auth.
3. Apply the migration in `supabase/migrations` with the Supabase CLI or dashboard.
4. Add the project URL and publishable key to `src/environments/environment.ts`.
5. Start the app with `npm start`.

The publishable key is expected to be present in the browser. Authorization is enforced with Postgres grants, RLS policies, membership checks, and transactional RPCs. Never add a `service_role` key to this application.

## Commands

- `npm start` — development server
- `npm run build` — production build
- `npm test` — unit tests
- `npm run lint` — TypeScript lint
- `npm run format` — format project files

## Current architecture

- `core`: application-wide infrastructure such as auth, Supabase, analytics, and translations.
- `features/home`: landing and low-friction room entry.
- `features/lobby`: lobby domain, Supabase repository, state facade, and UI.
- `features/cards`: pure card definition model and a small static JSON catalog.
- `supabase/migrations`: authoritative database operations and RLS.

Anonymous authentication is created only after the player confirms Create or Join. The display name is stored locally for the next visit. Realtime sends only persisted lobby membership/status changes; visual state remains local.

## Deployment

The Angular build is static and includes a Cloudflare Pages SPA redirect. Build with `npm run build` and publish `dist/dso-card-game`.
