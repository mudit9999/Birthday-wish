# Family Wishes — Design

## Context

The family keeps forgetting birthdays, anniversaries and festivals. The user wants WhatsApp to post a warm wish into the existing family group on the day, with nobody having to remember. Family members add their own dates, and their relatives', through a small website. MVP is text-only wishes; image greeting cards and more come later.

## Goals

- Wishes for birthdays, wedding anniversaries, custom special events and Hindu festivals post into the existing family WhatsApp group.
- Every wish is AI-written, personal, and approved by the user before it posts.
- Family members sign in with their WhatsApp number and manage the dates they added.
- Runs unattended on free-tier infrastructure.

## Non-goals (MVP)

- Image or video greeting cards (next phase; design leaves room for media).
- Multiple groups, multiple admins, other messengers.
- Automatic lunar/panchang date calculation.
- Messaging anyone individually except one-time login codes and the admin's own chat.

## Anti-goals (failure even if it "works")

- An unreviewed or odd AI message reaching the family under the user's name.
- Getting the user's personal WhatsApp number banned through spammy behaviour.
- A skipped birthday because something silently failed.
- Exposing relatives' birth years / ages to everyone.

## Constraints

- **Sender is the user's own WhatsApp number** (user's choice). The official WhatsApp Cloud API cannot post into an existing user-made group (only business-created groups of ≤8 people, needs an Official Business Account), so the app connects as a linked device via an unofficial library. This breaks WhatsApp ToS; ban risk is accepted by the user and kept low by sending very little.
- **Website on Vercel, database on Supabase free tier, wishes by Gemini** (user decision).
- Vercel runs code only per request, so it cannot hold a WhatsApp connection. A separate always-on **WhatsApp worker** runs on an **Oracle Cloud Always Free VM** (user decision).
- Supabase free tier pauses after ~7 days without activity; the worker's constant activity prevents this.
- Developed on Windows 11.

## Approaches considered

| | Approach | Trade-off |
|---|---|---|
| **A (chosen)** | TypeScript throughout: Next.js website on Vercel + Node/Baileys worker on a VM, sharing one TypeScript core package and one Supabase Postgres database | One language; shared logic tested once. Two deploy targets (forced by Vercel). Baileys is community-maintained. |
| B | Python website + Node WhatsApp service | Two languages, more to deploy. |
| C | All Go with whatsmeow | Most stable WhatsApp library; website is more work, and Go doesn't fit Vercel/Next well. |

Ruled out: whatsapp-web.js (runs headless Chrome; heavy, breaks more often); running Baileys on Vercel (no persistent process or connection).

## Decided by the user

- Wishes come from **the user's own number** into the existing family group.
- Website sign-in is **by phone number with a one-time code**; members edit only their own entries; the user (admin) edits everything.
- Wishes are **AI-written each time**, by **Gemini**.
- **Every wish must be approved** by the user; if not approved, it does not post.
- Wishes **never mention age or years married**.
- Festivals: **Hindu, North Indian calendar**.
- Hosting: **Vercel** (website), **Supabase free tier** (database), **Oracle Cloud Always Free VM** (WhatsApp worker).
- Language: **TypeScript throughout**.

## Architecture

```
Family phones ──► Vercel: Next.js website ──┐
                                            ├──► Supabase Postgres (all state)
Oracle VM: WhatsApp worker (Baileys) ───────┘
      │  schedule (8 PM / 7 AM / 8 AM), Gemini drafts, reads admin replies,
      │  sends login codes, posts to group
      ▼
  WhatsApp (admin's own number → family group / admin self-chat / login codes)
```

- **Repo:** npm workspaces monorepo *(my call)*: `apps/web` (Next.js, deployed to Vercel), `apps/worker` (Node, Docker on the VM), `packages/core` (shared domain logic: date matching, reply parsing, draft state rules, wish prompt + Gemini call, DB types).
- **The website and worker never call each other.** They communicate only through Supabase tables. The worker polls for work every 5 seconds *(my call; simple and robust)*.
- **Database access:** both sides use the Supabase service-role key on the server only (Next.js server code and the worker). Row Level Security is enabled on every table with no public policies, so the public anon key can read nothing. The browser never talks to Supabase directly. Schema changes are SQL migrations in `supabase/migrations/`.

## How it works

### WhatsApp worker
- **Baileys**. The WhatsApp login (auth credentials and keys) is stored in Supabase (`wa_auth` table) rather than on the VM's disk, so the VM can be rebuilt without re-linking.
- **Linking:** when not linked, the worker writes the current QR string to `wa_status`; the admin-only Link page on the website shows it as a QR image and refreshes it. The worker also writes connection state (connected / waiting for QR / logged out) and the list of groups the number is in.
- **Group:** admin picks the family group on the website from that list; its group ID is saved in settings.
- The worker only ever sends to: (1) the chosen family group, (2) the admin's own "Message yourself" chat, (3) one-time login codes to pre-approved family numbers.
- Sending etiquette: short "typing…" indicator and a random few-second delay between messages. Low volume is guidance, not a hard cap *(my call)*: every approved wish is sent.
- Reconnects with backoff. If logged out, status shows red on the admin page and a fresh QR is needed.
- Deployed as a Docker container (`restart: unless-stopped`) on the Oracle VM. No inbound ports needed. Oracle's Ampere (ARM) VM is fine; the image must build for arm64.

### Daily cycle (run by the worker; times in settings, default time zone Asia/Kolkata)
1. **20:00 — drafting.** Find everything happening tomorrow: birthdays, anniversaries, special events, festivals. For each, ask Gemini for a wish and save it as a *pending draft*. Send the drafts to the admin's "Message yourself" chat, numbered when there's more than one.
2. **Admin replies** in that chat (or uses the Drafts page on the website):
   - `ok` / `ok 2` → approve
   - `skip` / `skip 2` → cancel
   - `redo` / `redo 2` → ask Gemini for a new draft and resend it
   - any other text (optionally prefixed with the number, e.g. `2 Happy birthday Nani!`) → replaces the draft and approves it
   - The worker replies with a short confirmation each time.
3. **07:00 — one nudge** if any of today's drafts are still pending.
4. **08:00 — posting.** Approved drafts post to the group, one message per event. Drafts approved later that same day (in WhatsApp or on the website) post on the worker's next poll. Pending drafts expire at midnight and are never sent.
- Each draft records its status (`pending → approved → sent`, or `skipped` / `expired` / `failed`) so nothing is sent twice (e.g. after a restart) and failures are visible on the Drafts page. The worker claims a draft for sending with a conditional update so a draft can't be sent twice.
- If the worker was down at a scheduled time, it runs any missed job for the current day on startup *(my call)*.
- 29 February birthdays are wished on 28 February in non-leap years.

### AI wishes
- **Gemini** via the `@google/genai` SDK. Model from env `GEMINI_MODEL`, default `gemini-3.5-flash-lite` (current fast/cheap stable model; free tier covers this volume).
- Prompt inputs: event type, name(s), "what the family calls them" (e.g. "Nani", "Mama ji"), optional note, festival name, admin's style setting. **Never** the birth year, age or years married. Years are stored only for the admin's reference.
- Voice *(my call)*: the wish speaks for the whole family ("from all of us"), not as the admin personally.
- Default style: warm, short (2–4 lines), mostly English with a natural Hindi touch, a couple of fitting emojis, no hashtags. Style text editable in settings.
- If the Gemini call fails, use a simple built-in template so the admin still gets a draft.
- "Redo" from the website calls the shared core generator from Next.js server code directly.

### Festivals
- `festivals` table of name + date, pre-filled for 2026 and 2027 with North Indian (Purnimanta) Hindu festivals: Lohri, Makar Sankranti, Vasant Panchami, Maha Shivratri, Holi, Chaitra Navratri, Ram Navami, Hanuman Jayanti, Raksha Bandhan, Janmashtami, Ganesh Chaturthi, Sharad Navratri, Dussehra, Karwa Chauth, Dhanteras, Diwali, Govardhan Puja, Bhai Dooj, Chhath. Dates sourced from a published North Indian panchang (e.g. drikpanchang.com, New Delhi), source cited in the seed migration.
- Admin can add/edit/remove festivals and dates on the website.
- Each 1 December the worker sends the admin a note in their own chat to review next year's festival dates.

### Website (Next.js on Vercel)
- **Sign-in:** enter WhatsApp number → website saves a hashed 6-digit code and a send request in Supabase → worker sends the code from the admin's number → member enters code → signed in (long-lived, http-only cookie session stored in `sessions`). Only numbers on the admin's allowed list can request a code. Codes expire after 10 minutes, max 5 attempts, and requests are rate-limited per number. Supabase Auth is not used (it can't send codes over WhatsApp).
- **Admin password sign-in** *(my call)*: the admin can also sign in with `ADMIN_PASSWORD` (Vercel env), so first-time linking and re-linking work when WhatsApp is down. The Link/QR page is admin-only and the most sensitive page (whoever scans controls the WhatsApp link).
- **Member pages:**
  - *Upcoming* — the next 60 days of family events and festivals (names and occasions; no birth years/ages shown to members).
  - *My entries* — events this member added; add / edit / delete.
  - *Add entry* — type (Birthday / Anniversary / Special event), person name(s), "What the family calls them", day + month, optional year, optional note for the AI ("loves cricket"). Special events have a **Repeats every year / One time only** choice *(my call)*; one-time events need a year and are archived after they pass.
- **Admin pages:** WhatsApp status + QR, group picker, Members (allowed numbers + names), Festivals, Drafts (today/tomorrow with approve/skip/redo/edit), Settings (times, time zone, AI style), all entries.
- Phone numbers stored in international format; default country code +91, editable.
- Mobile-first layout (family will open it on phones). English UI.

### Data (Supabase Postgres)
- `members` (id, phone unique, name, is_admin, created_at)
- `events` (id, type, names, family_calls_them, day, month, year?, repeats_yearly, note, archived, added_by → members)
- `festivals` (id, name, date)
- `drafts` (id, occurrence_date, event_id? / festival_id?, number, text, status, timestamps, sent_message_id, error)
- `settings` (key/value: group_id, draft_time, nudge_time, send_time, time_zone, ai_style, country_code)
- `login_codes` (phone, code_hash, expires_at, attempts, send_status), `sessions` (token_hash, member_id, expires_at)
- `wa_auth` (key, value jsonb), `wa_status` (single row: state, qr, groups jsonb, updated_at)

### Secrets
- Vercel: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `ADMIN_PHONE`, `ADMIN_PASSWORD`, `SESSION_SECRET`.
- Worker (`.env` on VM): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `ADMIN_PHONE`.

### Backups
- Supabase free tier has no downloadable backups, so the worker writes a nightly JSON export of members, events, festivals and settings to the VM disk, keeping the last 14 *(my call)*.

### Later phases (not MVP, keep room for them)
- Image greeting cards (draft gets an optional media attachment; Baileys can send images; Supabase Storage for images).
- Photos of the person on their card, voice notes, multiple groups, other admins.

## Left to the builder
- Exact folder structure inside each app, UI styling, component library.
- Reconnect/backoff details, logging format.
- Exact prompt wording within the style above.
- Test layout (unit tests for date matching, reply parsing, draft state machine; integration tests for API routes and worker jobs with Baileys and Gemini mocked).

## Verification (end to end)
1. `npm test` — unit + integration tests pass (date matching incl. 29 Feb, reply parsing, draft states, OTP flow, no-double-send).
2. Run web (`next dev`) and worker locally against a Supabase project; link a **test WhatsApp number** by QR on the Link page; create a test group with 2–3 numbers.
3. Sign in from a phone using a code; add a birthday for tomorrow.
4. Trigger the drafting job manually (admin "run now" button); confirm draft arrives in Message-yourself chat with no age mentioned; test `redo`, a text edit, and `ok`.
5. Trigger posting; confirm one message lands in the test group, status shows `sent`, and re-running doesn't resend.
6. Leave a draft unapproved; confirm nudge, then nothing posts.
7. Deploy web to Vercel and worker to the Oracle VM; repeat steps 3–5, then switch to the real number and family group.
