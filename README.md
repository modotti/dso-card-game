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
- `npm run build:production` — explicit production build used by hosting
- `npm test` — unit tests
- `npm run lint` — TypeScript lint
- `npm run format` — format project files

## Product analytics

Production analytics uses the official Umami tracker through `AnalyticsService`. Development analytics is disabled in `environment.development.ts`, and automatic pageviews, click tracking, path tracking, and performance tracking are disabled.

To enable analytics in production, create a Website in Umami and copy its **Website ID** into `environment.analytics.umamiWebsiteId` in `src/environments/environment.ts`. Keep `umamiHostUrl` as `https://cloud.umami.is` for Umami Cloud or replace it with the origin of a self-hosted instance. No Umami account token or API key belongs in the browser application.

## Current architecture

- `core`: application-wide infrastructure such as auth, Supabase, analytics, and translations.
- `features/home`: landing and low-friction room entry.
- `features/lobby`: lobby domain, Supabase repository, state facade, and UI.
- `features/cards`: pure card definition model and a small static JSON catalog.
- `supabase/migrations`: authoritative database operations and RLS.

Anonymous authentication is created only after the player confirms Create or Join. The display name is stored locally for the next visit. Realtime sends only persisted lobby membership/status changes; visual state remains local.

## Deployment

The Angular build is static and includes a Cloudflare Pages SPA fallback in `src/_redirects`, so direct access to routes such as `/join/:code`, `/lobby/:code`, and `/game/:code` works correctly.

Cloudflare Pages configuration:

- Production branch: `main`
- Framework preset: `Angular`
- Build command: `npm run build:production`
- Build output directory: `dist/dso-card-game`
- Root directory: `/` (repository root)
- Node.js version: `20.20.2` (declared in `.nvmrc`)

No Pages Functions, Workers, KV, R2, custom domain, or paid service is required. The Supabase URL and publishable browser key are compiled into the client intentionally; never add a `service_role` key or another private credential.
