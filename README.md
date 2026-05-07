# Wilson Family ✦

A handcrafted family hub at **wilsonfamily.app**.
Each "room" is a small app, all sharing one design, one sign-in, one database.

Built on Cloudflare Pages + Workers + D1.

## Rooms

| Room | Path | Status |
|---|---|---|
| Home | `/` | ✅ Live (this build) |
| Sign in | `/signin/` | ✅ Live |
| 🌱 Generosity Fund | `/generosity/` | ✅ Stage 1 (this build) |
| 🎂 Birthdays & Days | `/birthdays/` | 🔜 Coming |
| 📅 Family Calendar | `/calendar/` | 🔜 Coming |
| 📝 Lists & Wishes | `/lists/` | 🔜 Coming |
| 📸 Memories | `/memories/` | 🔜 Coming |
| ✏️ Notes & Verses | `/notes/` | 🔜 Coming |

## What's in this build (Stage 1)

- ✨ Beautiful family hub homepage with rooms grid
- 🔐 Magic-link auth (Postmark, no passwords for the kids)
- 🌱 Generosity Fund: shared pot, contributions, role-aware
- 🪴 Shared design system across all rooms
- 📱 Mobile-friendly throughout

## What's coming next

**Stage 2** — Generosity: Suggestions, voting, parent approve/decline
**Stage 3** — Generosity: Disbursements, story archive, reception, reflections
**Stage 4+** — New rooms: birthdays, calendar, etc.

---

## Important: build locally first, no email needed

Magic links print to the wrangler console. You can test the whole app
with no domain and no email service. Add Postmark only when you're ready
to invite the kids.

---

## First-time setup

### 1. Install Wrangler

```
npm install -g wrangler
```

### 2. Log in to Cloudflare

```
wrangler login
```

### 3. Create the D1 database

```
wrangler d1 create wilsonfamily-db
```

Copy the `database_id` it prints out and paste it into `wrangler.toml`.

### 4. Apply the schema (local first)

```
wrangler d1 execute wilsonfamily-db --local --file=./schema/schema.sql
```

### 5. Edit and seed the family

Open `schema/seed.sql` and put in **real names + real emails** for everyone.

```
wrangler d1 execute wilsonfamily-db --local --file=./schema/seed.sql
```

### 6. Run locally

```
wrangler pages dev public --d1=DB=wilsonfamily-db
```

Open http://localhost:8788. The homepage shows. Click "Sign in" or "Open the fund"
to enter. Magic links will print in the wrangler console — paste into your browser
to sign in.

---

## When you're ready to go live

### Buy wilsonfamily.app

Use Cloudflare Registrar (cheapest, .app domains ~$14/year, automatic DNS).

### Set up Postmark sender for wilsonfamily.app

1. In Postmark → **Sender Signatures** → Add `hello@wilsonfamily.app` (or `fund@wilsonfamily.app`)
2. Add the DKIM and Return-Path DNS records to Cloudflare DNS for `wilsonfamily.app`
3. Verify the signature
4. Copy your Server API Token from "My First Server" (or rename the server "Wilson Family")

### Apply schema and seed to remote D1

```
wrangler d1 execute wilsonfamily-db --remote --file=./schema/schema.sql
```

```
wrangler d1 execute wilsonfamily-db --remote --file=./schema/seed.sql
```

### Set up production secrets

```
wrangler pages secret put POSTMARK_API_KEY --project-name=wilsonfamily-app
```

```
wrangler pages secret put FROM_EMAIL --project-name=wilsonfamily-app
```

### Deploy to main

```
wrangler pages deploy public --project-name=wilsonfamily-app --branch=main
```

### Connect the domain

In Cloudflare dashboard → Pages → wilsonfamily-app → Custom domains → Add `wilsonfamily.app`. Then update `APP_URL` in `wrangler.toml` to `https://wilsonfamily.app` and redeploy.

---

## File map

```
wilsonfamily-app/
├── wrangler.toml              ← Cloudflare config (edit DB id)
├── schema/
│   ├── schema.sql             ← All tables for all rooms
│   └── seed.sql               ← Family members
├── functions/
│   ├── _lib.js                ← Shared auth helpers
│   └── api/
│       ├── pot.js             ← Generosity: GET/POST /api/pot
│       └── auth/
│           ├── request-link.js  ← Magic link (uses Postmark)
│           ├── verify.js        ← Verify magic link
│           ├── me.js            ← Current user
│           └── signout.js       ← End session
└── public/
    ├── shared.css             ← Shared design system (used by all rooms)
    ├── index.html             ← Family hub homepage
    ├── home.css               ← Homepage-only styles
    ├── home.js                ← Homepage auth state check
    ├── signin/
    │   ├── index.html         ← Shared sign-in page
    │   ├── signin.css
    │   └── signin.js
    └── generosity/
        ├── index.html         ← Generosity room
        ├── generosity.css
        └── generosity.js
```
