# Wilson Family ✦

A handcrafted family hub at **wilsonfamily.app**.
Each "room" is a small app, all sharing one design, one sign-in, one database.

Built on Cloudflare Pages + D1 + R2.

## Rooms

| Room | Path | Description |
|---|---|---|
| 🌱 Generosity Fund | `/generosity/` | Shared pot, contributions, suggestions, voting, disbursements, stories |
| 📅 Family Calendar | `/calendar/` | Birthdays, anniversaries, custom events, multi-day support |
| 📸 The Scrapbook | `/scrapbook/` | Photo uploads, captions, member tags, decorative page styles |
| 📝 Lists & Wishes | `/lists/` | Shared or private lists with checkboxes and visibility controls |
| 🙏 Prayer Wall | `/prayers/` | Prayers, praises, "praying" responses, mark answered |
| 🪨 Rocks of Remembrance | `/rocks/` | Words on stones with stories — text, audio, or video |
| 👤 Profile | `/profile/` | Editable name, emoji, favorites, fun facts |
| 👶 Kids | `/kids/` | Kids section with PIN-based auth |
| 🛡️ Admin | `/admin/` | Member management, content moderation (admin only) |
| 👨‍👩‍👧‍👦 My Family | `/family-members/` | View all family members |

### Supporting pages

| Page | Path | Description |
|---|---|---|
| Home | `/` | Hub with hero photo, sign-in/join, rooms grid |
| Setup | `/setup/` | First-time profile setup after joining |
| Sign in | `/signin/` | Magic-link sign-in (legacy) |
| Welcome | `/welcome/` | Invite acceptance + onboarding |
| Family Settings | `/family/` | Invite/manage members (parents only) |

## What's built

- 🌱 **Generosity Fund** — Full lifecycle: contribute to pot, suggest someone to bless, family votes, parents approve, disburse, record the God story
- 📅 **Calendar** — Auto-populates birthdays/anniversaries from member profiles + custom events
- 📸 **Scrapbook** — R2 photo uploads with captions, member tags, 10+ decorative page styles, book-flip view
- 📝 **Lists & Wishes** — Create lists (Christmas wishes, groceries, etc.), check items off, control who sees what
- 🙏 **Prayer Wall** — Post prayers or praises, tap "praying" to let family know, mark when God answers
- 🪨 **Rocks of Remembrance** — Place a rock with a word + story (text, audio recording, or video)
- 👤 **Profiles** — Fun favorites (ice cream, snack, color, game, movie, song, hobby, fun fact)
- 🔐 **Auth** — Family code join, username login, kid PIN auth (PBKDF2), legacy magic links via Postmark
- 🛡️ **Admin panel** — Manage members, delete content
- 📱 **PWA** — Installable on home screen with app icons
- 🗂️ **R2 media** — Upload and serve photos, audio, video through Cloudflare R2
- 💰 **Monthly pledges** — Recurring generosity commitments

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

Copy the `database_id` into `wrangler.toml`.

### 4. Create the R2 bucket

```
wrangler r2 bucket create wilsonfamily-media
```

### 5. Apply the schema + migrations (local first)

```
wrangler d1 execute wilsonfamily-db --local --file=./schema/schema.sql
wrangler d1 execute wilsonfamily-db --local --file=./schema/migration_002_invites.sql
wrangler d1 execute wilsonfamily-db --local --file=./schema/migration_003_kid_pins.sql
wrangler d1 execute wilsonfamily-db --local --file=./schema/migration_004_profiles.sql
wrangler d1 execute wilsonfamily-db --local --file=./schema/migration_005_rocks.sql
wrangler d1 execute wilsonfamily-db --local --file=./schema/migration_006_calendar.sql
wrangler d1 execute wilsonfamily-db --local --file=./schema/migration_007_suggestion_deadline.sql
wrangler d1 execute wilsonfamily-db --local --file=./schema/migration_008_scrapbook.sql
wrangler d1 execute wilsonfamily-db --local --file=./schema/migration_009_pledges.sql
wrangler d1 execute wilsonfamily-db --local --file=./schema/migration_010_prayers.sql
wrangler d1 execute wilsonfamily-db --local --file=./schema/migration_011_favorites.sql
wrangler d1 execute wilsonfamily-db --local --file=./schema/migration_012_lists.sql
wrangler d1 execute wilsonfamily-db --local --file=./schema/migration_013_photo_styles.sql
```

### 6. Seed the family

Edit `schema/seed.sql` with real names and emails, then:

```
wrangler d1 execute wilsonfamily-db --local --file=./schema/seed.sql
```

### 7. Run locally

```
wrangler pages dev public --d1=DB=wilsonfamily-db
```

Open http://localhost:8788. Use the family code (set in `wrangler.toml` as `FAMILY_CODE`) to join or sign in.

---

## Going live

### Domain

Buy `wilsonfamily.app` via Cloudflare Registrar (~$14/year, automatic DNS).

### Postmark (for magic-link emails)

1. Postmark → Sender Signatures → Add `hello@wilsonfamily.app`
2. Add DKIM + Return-Path DNS records to Cloudflare DNS
3. Verify the signature
4. Copy the Server API Token

### Remote database + migrations

```
wrangler d1 execute wilsonfamily-db --remote --file=./schema/schema.sql
wrangler d1 execute wilsonfamily-db --remote --file=./schema/seed.sql
```

Then run each migration in order against `--remote`.

### Secrets

```
wrangler pages secret put POSTMARK_API_KEY --project-name=wilsonfamily-app
wrangler pages secret put FROM_EMAIL --project-name=wilsonfamily-app
```

### Deploy

```
wrangler pages deploy public --project-name=wilsonfamily-app --branch=main
```

### Connect domain

Cloudflare dashboard → Pages → wilsonfamily-app → Custom domains → Add `wilsonfamily.app`.
Update `APP_URL` in `wrangler.toml` to `https://wilsonfamily.app` and redeploy.

---

## File map

```
wilsonfamily-app/
├── wrangler.toml                 ← Config: D1, R2, env vars
├── schema/
│   ├── schema.sql                ← Base tables
│   ├── seed.sql                  ← Family members
│   └── migration_002–013_*.sql   ← Feature migrations
├── functions/
│   ├── _lib.js                   ← Shared auth/helpers
│   └── api/
│       ├── auth/                 ← join, login, pin, setup, me, request-link, verify, signout
│       ├── invites/              ← create, accept, revoke
│       ├── kids/                 ← kid management, PIN reset
│       ├── admin/members.js      ← Admin member management
│       ├── media/upload.js       ← R2 uploads
│       ├── media/[[path]].js     ← R2 serving
│       ├── photos/update.js      ← Scrapbook photo updates
│       ├── pot.js                ← Generosity pot
│       ├── pledges.js            ← Monthly pledges
│       ├── suggestions.js        ← Generosity suggestions
│       ├── votes.js              ← Suggestion voting
│       ├── disburse.js           ← Disbursements
│       ├── receptions.js         ← God story updates
│       ├── events.js             ← Calendar events
│       ├── rocks.js              ← Rocks of Remembrance
│       ├── prayers.js            ← Prayer wall
│       ├── pray.js               ← "Praying" responses
│       ├── lists.js              ← Lists CRUD
│       ├── list-items.js         ← List items CRUD
│       ├── photos.js             ← Scrapbook photos
│       └── profile.js            ← Profile editing
└── public/
    ├── manifest.webmanifest      ← PWA manifest
    ├── shared.css                ← Shared design system
    ├── icons/                    ← App icons (SVG, PNG, maskable)
    ├── images/family-hero.jpg    ← Homepage hero photo
    ├── index.html + home.*       ← Hub homepage
    ├── setup/                    ← First-time profile setup
    ├── signin/                   ← Sign-in page
    ├── welcome/                  ← Invite acceptance
    ├── generosity/               ← Generosity Fund room
    ├── calendar/                 ← Family Calendar room
    ├── scrapbook/                ← Photo Scrapbook room
    ├── lists/                    ← Lists & Wishes room
    ├── prayers/                  ← Prayer Wall room
    ├── rocks/                    ← Rocks of Remembrance room
    ├── profile/                  ← Profile page
    ├── kids/                     ← Kids section
    ├── admin/                    ← Admin panel
    ├── family/                   ← Family settings
    └── family-members/           ← My Family page
```
