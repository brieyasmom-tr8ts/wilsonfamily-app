# Wilson Family App — Claude Code Instructions

## Project Overview
Family hub at wilsonfamily.app. Each "room" is a small app sharing one design, one auth, one database. Built for the Wilson family — parents + kids.

## Tech Stack
- **Frontend**: Cloudflare Pages (static HTML/CSS/JS in `public/`)
- **Backend**: Cloudflare Pages Functions (in `functions/`)
- **Database**: Cloudflare D1 (SQLite) — `wilsonfamily-db`, binding `DB`
- **Media Storage**: Cloudflare R2 — `wilsonfamily-media`, binding `MEDIA`
- **Auth**: Family code join + username/code login, cookie-based sessions (`gf_session`)
- **Email**: Postmark (magic links print to console in local dev)
- **PWA**: manifest.webmanifest with app icons, installable on home screen

## Live Rooms
- `/` — Hub homepage with hero photo, sign-in/join forms, rooms grid (rooms hidden until signed in)
- `/generosity/` — Generosity Fund: pot balance, contributions, suggestions, voting, disbursements, stories/receptions
- `/calendar/` — Family Calendar: birthdays (from members), anniversaries, custom events, multi-day support
- `/scrapbook/` — Photo scrapbook: R2 uploads, captions, member tags, decorative page styles, book-flip view
- `/lists/` — Lists & Wishes: shared/private lists, checkboxes, visibility controls (everyone/only/hide_from)
- `/prayers/` — Prayer & Praise Wall: prayers, praises, "praying" responses, mark answered
- `/rocks/` — Rocks of Remembrance: word on a stone + story (text/audio/video via R2)
- `/profile/` — Editable profile: name, emoji, favorites (ice cream, snack, color, game, movie, song, hobby, fun fact)
- `/kids/` — Kids section
- `/admin/` — Admin panel: manage members, delete suggestions/disbursements/stories (admin role only)
- `/family-members/` — My Family page (view all members)
- `/setup/` — First-time profile setup (redirected here after join if profile_complete=0)
- `/signin/` — Sign-in page (legacy magic-link flow)
- `/welcome/` — Invite acceptance + onboarding
- `/family/` — Family settings (invite/manage, parents only)

## Auth System
- **Join flow**: Name + email + family code → creates member → redirects to `/setup/`
- **Sign in**: Username + family code → session cookie
- **Kid PIN auth**: Kids without email use PIN login (PBKDF2 hashed)
- **Magic links**: Legacy flow via Postmark (still functional)
- **Session cookie**: `gf_session` (HttpOnly, Secure, SameSite=Lax, 30-day expiry)
- **Roles**: `admin` (full access + admin panel), `parent`, `member`
- **Family code**: Set in `wrangler.toml` as `FAMILY_CODE`
- Use `getCurrentMember(request, env)` from `_lib.js` to get authed user

## Key Files
- `wrangler.toml` — Cloudflare config (D1, R2, env vars)
- `functions/_lib.js` — Shared helpers: auth, session cookies, PIN hashing (PBKDF2), JSON responses
- `functions/api/auth/` — join, login, pin, setup, me, request-link, verify, signout
- `functions/api/suggestions.js` — Generosity suggestions CRUD
- `functions/api/votes.js` — Voting on suggestions
- `functions/api/disburse.js` — Record disbursements
- `functions/api/receptions.js` — God story updates on disbursed suggestions
- `functions/api/pot.js` — Pot balance + contributions
- `functions/api/pledges.js` — Monthly recurring pledges
- `functions/api/events.js` — Calendar events CRUD
- `functions/api/rocks.js` — Rocks of Remembrance CRUD
- `functions/api/prayers.js` + `pray.js` — Prayer wall + "praying" responses
- `functions/api/lists.js` + `list-items.js` — Lists & Wishes CRUD
- `functions/api/photos.js` — Scrapbook photos
- `functions/api/media/upload.js` — R2 media uploads
- `functions/api/media/[[path]].js` — R2 media serving (nested keys)
- `functions/api/profile.js` — Profile editing
- `functions/api/kids/` — Kids management + PIN reset
- `functions/api/admin/members.js` — Admin member management
- `functions/api/invites/` — Invite system (create, accept, revoke)
- `public/shared.css` — Shared design system
- `public/manifest.webmanifest` — PWA manifest

## Database
### Base tables (schema.sql)
members, magic_tokens, sessions, contributions, suggestions, votes, disbursements, receptions, reflections, invites

### Added by migrations
- 003: pin_hash on members, pin_attempts table
- 004: username, birthday, anniversary, profile_complete on members
- 005: rocks table
- 006: events table
- 007: decision_needed_by on suggestions
- 008: photos + photo_tags tables
- 009: pledges table
- 010: prayers + prayer_responses tables
- 011: favorite_* and fun_fact columns on members
- 012: lists + list_items tables
- 013: page_style on photos

## Dev Commands
- Local dev: `wrangler pages dev public --d1=DB=wilsonfamily-db`
- Deploy: `wrangler pages deploy public --project-name=wilsonfamily-app --branch=main`
- Schema (local): `wrangler d1 execute wilsonfamily-db --local --file=./schema/schema.sql`
- Schema (remote): `wrangler d1 execute wilsonfamily-db --remote --file=./schema/schema.sql`
- Migration: `wrangler d1 execute wilsonfamily-db --remote --file=./schema/migration_NNN_name.sql`
- D1 query: `wrangler d1 execute wilsonfamily-db --remote --command "SQL HERE"`

## D1 Rules
- D1 crashes on `undefined` in `.bind()` — always use `|| null` or `|| ""` fallbacks
- Use `Promise.allSettled()` for parallel D1 queries, never `Promise.all()`
- All timestamps are unix epoch integers
- Dates stored as TEXT in YYYY-MM-DD format

## Conventions
- No build step — plain HTML/CSS/JS, no bundler
- Each room: own folder in `public/` with index.html, room.css, room.js
- API routes: `functions/api/` following Cloudflare Pages file-based routing
- Default branch: `main`
- Font: Plus Jakarta Sans (body + headings)
- Design: warm tones (#FAF6EF background), blue accent (#2563eb)
- Rooms grid hidden until signed in; auth section shown when signed out
