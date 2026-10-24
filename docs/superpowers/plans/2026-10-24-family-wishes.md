# Family Wishes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Post admin-approved, Gemini-written wishes for family birthdays, anniversaries, special events and Hindu festivals into the existing family WhatsApp group, with a website where family members manage the dates.

**Architecture:** npm-workspaces monorepo. `packages/core` holds pure domain logic and the wish generator. `packages/db` holds the SQL migrations, Drizzle schema and data functions. `apps/web` is a Next.js site on Vercel. `apps/worker` is a Node/Baileys process in Docker on an Oracle Always Free VM. Web and worker never call each other: they share one Supabase Postgres database, and the worker polls it every 5 s (fast loop) and every 60 s (slow loop).

**Tech Stack:** Node 24 LTS, TypeScript (strict, ESM), Next.js 16 App Router, Drizzle ORM (`postgres` driver in production, `@electric-sql/pglite` in tests and local E2E), `baileys@7.0.0-rc14`, `@google/genai`, zod 4, Vitest 5, Playwright, `qrcode`, `pino`, `tsx`.

**Spec:** `docs/superpowers/specs/2026-10-24-family-wishes-design.md`

**Deviation from spec, my call:** the spec says both sides reach the database with the Supabase service-role key. This plan instead uses the Supabase **Postgres connection string** (`DATABASE_URL`, the transaction pooler on port 6543) through Drizzle. Reasons:
- Docker isn't installed on this machine, so we can't run local Supabase. With a direct connection, every data function and worker job can be tested against real Postgres in-process using PGlite.
- Conditional updates and transactions are plain SQL.

Nothing else changes: the database is still Supabase, RLS stays on with no policies, the browser never touches the database, and the secret stays server-only. As a result, `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` become `DATABASE_URL` in both secret lists.

## Global Constraints

- Node 24 LTS. `"type": "module"` in every package, TypeScript `strict: true`.
- Package names: `@family-wishes/core`, `@family-wishes/db`, `@family-wishes/web`, `@family-wishes/worker`. Workspace packages export TS source (`"exports": {".": "./src/index.ts"}`). Next consumes them via `transpilePackages`; the worker runs them via `tsx`.
- Baileys is pinned exactly: `"baileys": "7.0.0-rc14"`.
- Gemini runs through `@google/genai`. The model comes from env `GEMINI_MODEL`, default `gemini-3.5-flash-lite`.
- Settings defaults: `draft_time` `20:00`, `nudge_time` `07:00`, `send_time` `08:00`, `time_zone` `Asia/Kolkata`, `country_code` `91`.
- All "today/tomorrow" logic uses the `time_zone` setting, never the server clock's zone. Vercel runs in UTC.
- Wishes never mention age, birth year or years married. Years are never shown to non-admin members.
- An unapproved draft never posts.
- The worker sends only to:
  - the `group_id` group;
  - the admin's own chat (`ADMIN_PHONE`);
  - outbox messages addressed to phones in `members`.
- Login codes: 6 digits, stored as HMAC hashes, expire in 10 minutes, 5 wrong attempts max, at most 3 requests per number per 15 minutes.
- Sessions: random 32-byte token in an http-only cookie `fw_session` (`secure` in production, `sameSite: 'lax'`, 180 days). Only the SHA-256 of the token is stored.
- `ADMIN_PASSWORD` must be ≥ 16 characters and `SESSION_SECRET` ≥ 32 characters; the web app refuses to start otherwise.
- Phones are stored as international digits without `+` (e.g. `919876543210`). The default country code comes from settings.
- The UI is English and mobile-first.
- Coding rules (ECC):
  - Immutable updates.
  - Functions under 50 lines; files under 400 lines typical, 800 max.
  - No `console.log`; the worker logs with `pino`.
  - Validate all input with zod at the boundaries.
- Coverage of at least 80% lines for `packages/core`, `packages/db`, `apps/worker/src/jobs` and `apps/web/lib`.
- Commits use the form `<type>: <description>` with no `Co-Authored-By` trailer.

## Review Focus

1. **The worker reads its own messages as admin replies.** Drafts the worker posts into "Message yourself" come back as `fromMe` messages in that same chat. Expected: they are ignored, never parsed as `ok` or as edit text. Test lives in Task 12.
2. **A stray short reply replaces a draft and posts it.** For example "k", "thanks" or "nice". Expected: the text is rejected with a hint, never approved as the wish. `👍` and `yes` count as `ok`. Test lives in Task 5.
3. **The worker is down across draft time.** For example, the VM is off from 19:55 to 01:00. Expected: on startup, today's events still get drafted and sent to the admin, who can approve them that morning; they post once approved. Test lives in Task 13.
4. **A member's note leaks age.** For example a note like "turning 60", or Gemini inventing "your 25th anniversary". Expected: the age guard regenerates once, then falls back to the template. Test lives in Task 6.
5. **A server action is called directly, bypassing the page.** For example, a member edits someone else's entry or calls an admin action. Expected: every action re-checks the session and ownership. Tests live in Tasks 20 and 22.

---

## File Structure

```
package.json                    workspaces, root scripts (test, coverage, db:migrate, e2e)
tsconfig.base.json              strict ESM settings shared by all packages
vitest.config.ts                test.projects for the four packages
.env.example                    every env var for web and worker, no values
.gitignore                      node_modules, .env*, .next, coverage, .pglite*, backups
supabase/migrations/            *.sql, applied in filename order
packages/core/src/
  time.ts                       local date/time in a zone, date arithmetic, labels
  occurrences.ts                which events/festivals fall on a date, upcoming list, labels
  validation.ts                 event input schema, phone normalisation, time/zone checks
  draftState.ts                 draft status transition table
  replies.ts                    admin reply parser
  messages.ts                   self-chat texts (draft batch, nudge)
  wish/prompt.ts                WishInput, toWishInput, buildWishPrompt, DEFAULT_AI_STYLE
  wish/guard.ts                 mentionsAge
  wish/fallback.ts              template wishes
  wish/generate.ts              generateWish (model → guard → retry → fallback)
  wish/gemini.ts                createGeminiModel (@google/genai adapter)
  index.ts
packages/db/src/
  client.ts                     createDb(url) → DbHandle (postgres or pglite)
  migrate.ts                    runMigrations + CLI entry
  schema.ts                     Drizzle table definitions matching the SQL
  testing.ts                    createTestDb()
  settings.ts members.ts events.ts festivals.ts drafts.ts
  auth.ts                       login_codes, sessions, outbox inserts
  outbox.ts wa.ts jobs.ts backup.ts
  index.ts
apps/worker/
  src/env.ts deps.ts main.ts scheduler.ts
  src/wa/authState.ts connection.ts messenger.ts incoming.ts
  src/jobs/drafting.ts replies.ts posting.ts daily.ts outbox.ts backup.ts
  test/fakes.ts                 FakeMessenger, FakeModel, fixed clock
  Dockerfile
deploy/worker/docker-compose.yml
apps/web/
  next.config.ts
  lib/env.ts db.ts guards.ts
  lib/auth/otp.ts session.ts admin.ts
  lib/actions/                  thin server actions: auth.ts entries.ts admin.ts drafts.ts
  app/login/…  app/(member)/…  app/admin/…
  e2e/smoke.spec.ts  playwright.config.ts
docs/deploy.md                  Supabase, Vercel, Oracle VM runbook
```

Shared types (defined once, used everywhere; the defining task is in brackets):

```ts
type ISODate = string                                    // 'YYYY-MM-DD'          [1]
type EventType = 'birthday' | 'anniversary' | 'special'  //                       [2]
interface FamilyEvent { id: string; type: EventType; names: string; familyCallsThem: string | null;
  title: string | null; day: number; month: number; year: number | null; repeatsYearly: boolean;
  note: string | null; archived: boolean; addedBy: string | null }                //  [2]
interface Festival { id: string; name: string; date: ISODate }                    //  [2]
type Occurrence = { kind: 'event'; date: ISODate; event: FamilyEvent }
                | { kind: 'festival'; date: ISODate; festival: Festival }         //  [2]
type DraftStatus = 'pending'|'approved'|'sending'|'sent'|'skipped'|'expired'|'failed' // [4]
type DraftSource = 'ai' | 'template' | 'admin'                                    //  [4]
interface Draft { id: string; occurrenceDate: ISODate; eventId: string | null; festivalId: string | null;
  number: number; text: string; source: DraftSource; status: DraftStatus; error: string | null;
  sentMessageId: string | null }                                                  //  [9]
interface Member { id: string; phone: string; name: string; isAdmin: boolean }    //  [8]
interface Settings { groupId: string | null; draftTime: string; nudgeTime: string; sendTime: string;
  timeZone: string; aiStyle: string; countryCode: string; activeBatchDate: ISODate | null } // [8]
```

---

## Phase 0 — Foundation

### Task 1: Monorepo scaffold and time helpers

**Files:**
- Create: `package.json`, `tsconfig.base.json`, `vitest.config.ts`, `.gitignore`, `.env.example`
- Create: `packages/core/package.json`, `packages/core/tsconfig.json`, `packages/core/src/time.ts`, `packages/core/src/index.ts`
- Test: `packages/core/test/time.test.ts`

**Interfaces:**
- Produces:
  - `localDate(now: Date, timeZone: string): ISODate`
  - `localTime(now: Date, timeZone: string): string` (`'HH:MM'`, 24 h)
  - `addDays(date: ISODate, days: number): ISODate`
  - `isLeapYear(year: number): boolean`
  - `formatDateLabel(date: ISODate): string` (`'Sun 25 Oct'`)
  - `isTimeReached(now: string, at: string): boolean` (compares `'HH:MM'`)

- [ ] **Step 1: Scaffold.**
  - Root `package.json`: `"private": true`, `"workspaces": ["packages/*", "apps/*"]`, scripts `test` (`vitest run`), `coverage` (`vitest run --coverage`), `db:migrate` (`tsx packages/db/src/migrate.ts`).
  - `vitest.config.ts` uses `test.projects: ['packages/*', 'apps/worker', 'apps/web']` and v8 coverage with an 80% lines threshold.
  - `.env.example` lists `DATABASE_URL`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `ADMIN_PHONE`, `ADMIN_PASSWORD`, `SESSION_SECRET`, `BACKUP_DIR`, `LOG_LEVEL`, each with a one-line comment.
  - The repo already exists (`git init` done, no commits). Commit the spec and this plan first: `git add docs .claude && git commit -m "docs: add family wishes design and plan"`. If git reports "Author identity unknown", stop and ask the user to set `user.name`/`user.email`; never set git config yourself.

- [ ] **Step 2: Write the failing test**

```ts
test('local date and time use the given zone, not UTC', () => {
  const now = new Date('2026-10-24T20:00:00Z')              // 01:30 on 25 Oct in India
  expect(localDate(now, 'Asia/Kolkata')).toBe('2026-10-25')
  expect(localTime(now, 'Asia/Kolkata')).toBe('01:30')
})
test('addDays crosses month, year and leap day', () => {
  expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
  expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
})
test('isLeapYear', () => { expect([2024, 2026, 2100, 2000].map(isLeapYear)).toEqual([true, false, false, true]) })
test('formatDateLabel', () => { expect(formatDateLabel('2026-10-25')).toBe('Sun 25 Oct') })
test('isTimeReached', () => { expect(isTimeReached('08:00', '08:00')).toBe(true); expect(isTimeReached('07:59', '08:00')).toBe(false) })
```

- [ ] **Step 3: Run it.** `npm install && npx vitest run packages/core`. Expected: FAIL, functions not defined.
- [ ] **Step 4: Implement `time.ts`.** Use `Intl.DateTimeFormat('en-CA', { timeZone, … })` with `hourCycle: 'h23'` for local parts. Do date arithmetic on UTC-midnight `Date`s built from the ISO string. No date library.
- [ ] **Step 5: Run it.** Expected: PASS.
- [ ] **Step 6: Commit.** `git commit -m "chore: scaffold monorepo with time helpers"`

---

## Phase 1 — Core logic (pure, no I/O)

### Task 2: Occurrence matching and upcoming list

**Files:**
- Create: `packages/core/src/occurrences.ts`
- Test: `packages/core/test/occurrences.test.ts`

**Interfaces:**
- Consumes: `addDays`, `isLeapYear` (Task 1).
- Produces:
  - the `EventType`, `FamilyEvent`, `Festival` and `Occurrence` types;
  - `occursOn(event: FamilyEvent, date: ISODate): boolean`;
  - `occurrencesOn(date: ISODate, events: FamilyEvent[], festivals: Festival[]): Occurrence[]`;
  - `upcoming(from: ISODate, days: number, events, festivals): Occurrence[]` (inclusive of `from`, sorted by date, festivals before events on the same day);
  - `occurrenceLabel(o: Occurrence): string`.

- [ ] **Step 1: Write the failing tests.** Use an `ev(overrides)` builder.
  - `occursOn` matches day+month for yearly events in any year.
  - A yearly 29 Feb event occurs on `2027-02-28` and not on `2027-03-01`, and on `2028-02-29` but not on `2028-02-28`.
  - A one-time event (`repeatsYearly: false, year: 2026`) occurs on `2026-11-02` but not on `2027-11-02`.
  - Archived events never occur.
  - `upcoming('2026-12-25', 10, …)` includes an event on 2 Jan 2027 and sorts across the year boundary.
  - `occurrenceLabel` returns `'Birthday — Rahul (Chachu)'`, `'Anniversary — Amit & Priya'`, `'Housewarming — Sharma family'` (special uses `title`) and `'Diwali'`. Assert that the label for an event with `year: 1965` does not contain `'1965'`.
- [ ] **Step 2: Run it.** `npx vitest run packages/core/test/occurrences.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement `occurrences.ts`.**
- [ ] **Step 4: Run it.** Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(core): event occurrence matching and upcoming list"`

### Task 3: Input validation and phone numbers

**Files:**
- Create: `packages/core/src/validation.ts`
- Test: `packages/core/test/validation.test.ts`

**Interfaces:**
- Produces:
  - `EventInput` = `{ type; names; familyCallsThem: string | null; title: string | null; day; month; year: number | null; repeatsYearly: boolean; note: string | null }`;
  - `parseEventInput(raw: unknown, today: ISODate): { ok: true; value: EventInput } | { ok: false; errors: Record<string, string> }`;
  - `normalizePhone(input: string, countryCode: string): string | null`;
  - `phoneToJid(phone: string): string` (`'<digits>@s.whatsapp.net'`);
  - `isValidTime(s: string): boolean`;
  - `isValidTimeZone(s: string): boolean`.

- [ ] **Step 1: Write the failing tests.**
  - `parseEventInput` rejects:
    - 30 Feb;
    - 31 Apr;
    - 29 Feb with year 2027;
    - empty `names`;
    - `names` > 100 characters;
    - `note` > 300 characters;
    - year < 1900 or > the current year + 5;
    - a special event without a `title`;
    - a one-time event without a year;
    - a one-time event dated before `today`.
  - `parseEventInput` accepts 29 Feb with no year, and forces `repeatsYearly: true` for birthday and anniversary even if `false` is passed. Strings are trimmed; empty optional strings become `null`. Errors are keyed by field name.
  - `normalizePhone('+91 98765 43210','91')`, `('098765-43210','91')` and `('9876543210','91')` all give `'919876543210'`.
  - `normalizePhone('+44 7700 900123','91')` gives `'447700900123'`.
  - `normalizePhone('12345','91')` and `normalizePhone('abc','91')` give `null`.
  - `isValidTime('20:00')` is true; `isValidTime('24:00')` is false. `isValidTimeZone('Asia/Kolkata')` is true; `isValidTimeZone('Mars/Base')` is false.
- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Implement with zod 4.**
  - Use `superRefine` for the day-in-month and one-time rules.
  - Phone rule: strip non-digits. A leading `+` means the number is already international. A single leading `0` plus 10 digits means a local number: drop the 0 and prefix the country code. Exactly 10 digits also gets the country code. The result must be 8–15 digits.
- [ ] **Step 4: Run it.** Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(core): event input validation and phone normalisation"`

### Task 4: Draft state machine

**Files:**
- Create: `packages/core/src/draftState.ts`
- Test: `packages/core/test/draftState.test.ts`

**Interfaces:**
- Produces:
  - the `DraftStatus` and `DraftSource` types;
  - `type DraftAction = 'approve'|'edit'|'skip'|'redo'|'claim'|'markSent'|'markFailed'|'expire'`;
  - `nextStatus(from: DraftStatus, action: DraftAction): DraftStatus | null`;
  - `allowedFrom(action: DraftAction): DraftStatus[]`.

The transition table is decided here:

| action | from → to |
|---|---|
| approve | pending, skipped, failed → approved |
| edit | pending, approved, skipped, failed → approved |
| skip | pending, approved, failed → skipped |
| redo | pending, approved, skipped, failed → pending |
| claim | approved → sending |
| markSent | sending → sent |
| markFailed | sending → failed |
| expire | pending → expired; approved → failed |

Every other combination returns `null`. `sent` and `expired` are terminal.

- [ ] **Step 1: Write the failing test.**
  - A table-driven test that asserts every row above.
  - `nextStatus('sent', a)` is `null` for every action, and so is `nextStatus('pending', 'claim')`.
  - `allowedFrom('approve')` equals `['pending','skipped','failed']`.
- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Implement as a constant lookup object.**
- [ ] **Step 4: Run it.** Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(core): draft status transitions"`

### Task 5: Admin reply parser and self-chat messages

**Files:**
- Create: `packages/core/src/replies.ts`, `packages/core/src/messages.ts`
- Test: `packages/core/test/replies.test.ts`, `packages/core/test/messages.test.ts`

**Interfaces:**
- Produces:
  - `type Reply = { kind: 'approve' | 'skip' | 'redo'; number: number | 'all' } | { kind: 'edit'; number: number; text: string } | { kind: 'invalid'; reason: string }`;
  - `parseReply(text: string, openNumbers: number[]): Reply`;
  - `MIN_EDIT_LENGTH = 15`;
  - `formatDraftBatch(heading: string, items: BatchItem[]): string`;
  - `formatNudge(items: BatchItem[]): string`;
  - `BatchItem` = `{ number: number; label: string; text: string; source: DraftSource }`.

- [ ] **Step 1: Write the failing tests.**

```ts
test.each([
  ['ok', [1], { kind: 'approve', number: 1 }],
  ['OK 2', [1, 2], { kind: 'approve', number: 2 }],
  ['ok', [1, 2], { kind: 'approve', number: 'all' }],
  ['👍', [1], { kind: 'approve', number: 1 }],
  ['yes', [3], { kind: 'approve', number: 3 }],
  ['skip 2', [1, 2], { kind: 'skip', number: 2 }],
  ['redo', [4], { kind: 'redo', number: 4 }],
  ['2 Happy birthday Nani! Lots of love 🎂', [1, 2], { kind: 'edit', number: 2, text: 'Happy birthday Nani! Lots of love 🎂' }],
  ['Happy birthday Nani! Lots of love 🎂', [1], { kind: 'edit', number: 1, text: 'Happy birthday Nani! Lots of love 🎂' }],
])('parseReply(%s)', (text, open, expected) => expect(parseReply(text, open)).toEqual(expected))

test.each([
  ['skip', [1, 2]],                       // which one?
  ['redo', [1, 2]],
  ['ok 5', [1, 2]],                       // no draft 5
  ['k', [1]], ['thanks', [1]], ['nice one', [1]], // too short to be a wish
  ['Happy birthday Nani! Lots of love', [1, 2]],  // edit needs a number when several are open
  ['ok', []],                             // nothing waiting
])('parseReply(%s) is invalid with a reason', (text, open) => {
  const r = parseReply(text, open)
  expect(r.kind).toBe('invalid')
  expect((r as { reason: string }).reason.length).toBeGreaterThan(0)
})
```

  - The `messages` test checks three things:
    1. `formatDraftBatch` output contains each `"<n>) <label>"` and its text.
    2. The output ends with a help line containing `ok`, `skip 2`, `redo 2` and `2 <your text>`.
    3. Items with `source: 'template'` are tagged `(template — AI unavailable)`.
  - `formatNudge` lists the pending numbers and labels.
- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Commands match the regex `/^(ok|okay|yes|👍|skip|redo)(?:\s+(\d+))?$/iu` after trimming. `okay`, `yes` and `👍` all mean approve.
  - Edit replies match `/^(\d+)[\s.):-]+([\s\S]+)$/`.
  - Edit text shorter than `MIN_EDIT_LENGTH` is invalid, with a reason telling the admin to reply `ok`, `skip`, `redo` or the full new text.
  - Invalid reasons are user-facing English sentences.
- [ ] **Step 4: Run it.** Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(core): admin reply parser and self-chat message formats"`

### Task 6: Wish generation with age guard and fallback

**Files:**
- Create: `packages/core/src/wish/prompt.ts`, `guard.ts`, `fallback.ts`, `generate.ts`, `gemini.ts`
- Test: `packages/core/test/wish.test.ts`

**Interfaces:**
- Consumes: the `Occurrence` type (Task 2).
- Produces:
  - `WishInput` = `{ occasion: EventType | 'festival'; names: string | null; familyCallsThem: string | null; title: string | null; festivalName: string | null; note: string | null }`. It has **no year field**.
  - `toWishInput(o: Occurrence): WishInput`
  - `buildWishPrompt(input: WishInput, style: string): { system: string; prompt: string }`
  - `DEFAULT_AI_STYLE: string`
  - `mentionsAge(text: string): boolean`
  - `fallbackWish(input: WishInput): string`
  - `interface WishModel { generate(req: { system: string; prompt: string }): Promise<string> }`
  - `generateWish(input: WishInput, style: string, model: WishModel | null): Promise<{ text: string; source: 'ai' | 'template' }>`
  - `createGeminiModel(opts: { apiKey: string; model: string }): WishModel`
  - `DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash-lite'`

- [ ] **Step 1: Write the failing tests.**
  - `toWishInput` on an event with `year: 1965` gives a result where `JSON.stringify(result)` has no `1965`.
  - `buildWishPrompt`:
    - `system` contains the style text plus the rules: whole family's voice, never mention age, birth year or years married, 2–4 lines, no hashtags, plain text only;
    - `prompt` contains names, `familyCallsThem` and note when present, and the festival name for festivals.
  - `mentionsAge` is true for:
    - `'Happy 60th birthday!'`
    - `'25 years of togetherness'`
    - `'turning 40 today'`
    - `'aged 70'`
    - `'Silver jubilee wishes'`
    - `'Happy sixtieth birthday'`
    - `'50 saal'`
  - `mentionsAge` is false for `'Happy birthday Nani 🎂'`, `'Happy Diwali 2026! 🪔'` and `'Wishing you 100 reasons to smile'`.
  - `generateWish` behaviour with fakes:
    - A model returning good text gives `{ source: 'ai' }` with surrounding quotes and whitespace trimmed.
    - A model that throws gives `{ source: 'template' }`.
    - A `null` model gives the template.
    - A model returning `'Happy 60th birthday'` and then a clean wish gives the clean wish. Assert it was called twice.
    - A model that always mentions age gives the template.
    - A model that hangs past the 20 s timeout gives the template. Use `vi.useFakeTimers()`.
  - `fallbackWish` uses `familyCallsThem` when set, otherwise `names`. It never contains a digit.
- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Implement.**
  - `gemini.ts` calls `new GoogleGenAI({ apiKey }).models.generateContent({ model, contents: prompt, config: { systemInstruction: system, temperature: 0.9 } })` and returns `response.text ?? ''`.
  - `generateWish` races the model call against a 20 s timeout, applies `mentionsAge` and an empty-text check, retries once, then falls back.
  - `DEFAULT_AI_STYLE` comes from the spec: "Warm and short (2–4 lines), mostly English with a natural Hindi touch, a couple of fitting emojis, no hashtags."
- [ ] **Step 4: Run it.** Expected: PASS. Then run `npx vitest run --coverage packages/core`. Expected: ≥ 80% lines.
- [ ] **Step 5: Commit.** `git commit -m "feat(core): Gemini wish generator with age guard and template fallback"`

---

## Phase 2 — Database

### Task 7: Schema migration, migrator and test database

**Files:**
- Create: `supabase/migrations/20261024000001_init.sql`
- Create: `packages/db/package.json`, `tsconfig.json`, `src/client.ts`, `src/migrate.ts`, `src/schema.ts`, `src/testing.ts`, `src/index.ts`
- Test: `packages/db/test/migrate.test.ts`

**Interfaces:**
- Produces:
  - `type Db`: a Drizzle Postgres database typed with `schema`. Both drivers must satisfy it; use `PgDatabase<PgQueryResultHKT, typeof schema>`.
  - `interface DbHandle { db: Db; execRaw(sql: string): Promise<void>; close(): Promise<void> }`
  - `createDb(url: string): Promise<DbHandle>`. URLs: `pglite:memory`, `pglite:<dir>`, or a `postgres://` URL. For the last, use the `postgres` driver with `{ prepare: false, max: 3 }`, which the Supabase transaction pooler requires.
  - `runMigrations(h: DbHandle, dir?: string): Promise<string[]>` returns newly applied files.
  - `createTestDb(): Promise<DbHandle>`

The SQL defines these tables. All ids are `uuid default gen_random_uuid()` and every table has `created_at timestamptz default now()`.
- `members`:
  - `phone text unique not null check (phone ~ '^[0-9]{8,15}$')`
  - `name text not null`
  - `is_admin boolean not null default false`
- `events`:
  - `type text check in ('birthday','anniversary','special')`
  - `names text not null`, `family_calls_them text`, `title text`
  - `day smallint check 1–31`, `month smallint check 1–12`, `year smallint`
  - `repeats_yearly boolean not null default true`
  - `note text`, `archived boolean not null default false`
  - `added_by uuid references members on delete set null`
  - `updated_at timestamptz`
- `festivals`: `name text not null`, `date date not null`, `unique(name, date)`.
- `drafts`:
  - `occurrence_date date not null`
  - `event_id uuid references events on delete cascade`, `festival_id uuid references festivals on delete cascade`, with `check (num_nonnulls(event_id, festival_id) = 1)`
  - `number smallint not null`, `text text not null`
  - `source text check in ('ai','template','admin')`
  - `status text not null check in (the 7 statuses)`
  - `error text`, `sent_message_id text`
  - timestamps `updated_at`, `approved_at`, `sent_at`
  - uniques: `(occurrence_date, event_id)`, `(occurrence_date, festival_id)`, `(occurrence_date, number)`
- `settings`: `key text primary key`, `value text not null`. The migration seeds the defaults from Global Constraints, plus `ai_style` = `DEFAULT_AI_STYLE` text, `group_id` = `''` and `active_batch_date` = `''`.
- `login_codes`: `phone`, `code_hash`, `expires_at`, `attempts smallint default 0`.
- `sessions`: `token_hash text primary key`, `member_id uuid references members on delete cascade`, `expires_at`.
- `outbox`:
  - `to_phone`, `body`
  - `status text check in ('queued','sending','sent','failed') default 'queued'`
  - `error`, `sent_at`
- `wa_auth`: `key text primary key`, `value jsonb not null`, `updated_at`.
- `wa_status`: a single row (`id smallint primary key check (id = 1)`), seeded:
  - `state text not null default 'starting'`
  - `qr text`, `groups jsonb not null default '[]'`, `linked_phone text`, `updated_at`
- `job_runs`: `job text`, `run_date date`, `ran_at`, primary key `(job, run_date)`.
- `job_requests`: `job text check in ('draft','send')`, `requested_at`, `done_at`.
- Finally, `alter table … enable row level security` on every table, with no policies.

- [ ] **Step 1: Write the failing test.**
  - `createTestDb()` applies the migration.
  - Running `runMigrations` again returns `[]`.
  - `select relname from pg_class where relrowsecurity` contains all 12 tables.
  - The `settings` rows include `send_time = '08:00'` and `time_zone = 'Asia/Kolkata'`.
  - Inserting a draft with both `event_id` and `festival_id` set throws.
  - Inserting a member with phone `'+91 98'` throws.
- [ ] **Step 2: Run it.** `npx vitest run packages/db`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - `migrate.ts` keeps a `schema_migrations(name text primary key, applied_at timestamptz)` table and applies each pending file with `execRaw` inside `begin; … commit;`.
  - When run as a script, it reads `DATABASE_URL`.
  - `execRaw` uses `pglite.exec` for PGlite and `sql.unsafe` for `postgres`.
  - `schema.ts` mirrors the SQL exactly, in camelCase.
- [ ] **Step 4: Run it.** Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(db): initial schema, migrator and PGlite test database"`

### Task 8: Settings, members, events and festivals data functions

**Files:**
- Create: `packages/db/src/settings.ts`, `members.ts`, `events.ts`, `festivals.ts`
- Test: `packages/db/test/{settings,members,events,festivals}.test.ts`

**Interfaces:**
- Consumes: `EventInput`, `FamilyEvent`, `Festival` (core), `createTestDb` (Task 7).
- Produces:
  - `getSettings(db): Promise<Settings>`. An empty `group_id` or `active_batch_date` maps to `null`.
  - `type SettingKey = 'group_id' | 'draft_time' | 'nudge_time' | 'send_time' | 'time_zone' | 'ai_style' | 'country_code' | 'active_batch_date'`
  - `setSetting(db, key: SettingKey, value: string): Promise<void>`
  - `findMemberByPhone(db, phone): Promise<Member | null>`, `getMember(db, id)`, `listMembers(db)`
  - `addMember(db, { phone, name }): Promise<Member | 'duplicate'>`
  - `removeMember(db, id): Promise<'ok' | 'is_admin'>`
  - `ensureAdmin(db, phone: string): Promise<Member>`, which upserts with `is_admin = true` and `name` `'Admin'` if new.
  - `type Actor = { id: string; isAdmin: boolean }`
  - `listEvents(db, opts?: { addedBy?: string; includeArchived?: boolean }): Promise<FamilyEvent[]>`
  - `getEvent(db, id)`
  - `createEvent(db, input: EventInput, addedBy: string): Promise<FamilyEvent>`
  - `updateEvent(db, id, input: EventInput, actor: Actor): Promise<'ok' | 'not_found' | 'forbidden'>`
  - `deleteEvent(db, id, actor): Promise<'ok' | 'not_found' | 'forbidden'>`
  - `archivePastOneTimeEvents(db, today: ISODate): Promise<number>`
  - `listFestivals(db, range?: { from: ISODate; to: ISODate }): Promise<Festival[]>`
  - `createFestival(db, { name, date })`, `updateFestival(db, id, { name, date })`, `deleteFestival(db, id)`

- [ ] **Step 1: Write the failing tests.**
  - A non-admin `updateEvent`/`deleteEvent` on another member's event returns `'forbidden'` and leaves the row unchanged. On their own event it returns `'ok'`. An admin can update anyone's event.
  - `archivePastOneTimeEvents('2026-11-03')` archives a one-time event dated `2026-11-02`. It does not archive one dated `2026-11-03`, nor any yearly event.
  - `removeMember` on the admin returns `'is_admin'`.
  - `ensureAdmin` is idempotent.
  - `addMember` with an existing phone returns `'duplicate'`.
  - `setSetting('send_time','09:15')` then `getSettings` gives `sendTime: '09:15'`.
- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Implement with Drizzle query builder.** Write ownership checks as `where id = ? and (added_by = actor.id or actor.isAdmin)`, then tell `not_found` from `forbidden` with an existence check.
- [ ] **Step 4: Run it.** Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(db): settings, members, events and festivals data functions"`

### Task 9: Draft data functions with conditional transitions

**Files:**
- Create: `packages/db/src/drafts.ts`
- Test: `packages/db/test/drafts.test.ts`

**Interfaces:**
- Consumes: `nextStatus`, `allowedFrom`, `DraftAction` (Task 4).
- Produces:
  - the `Draft` type
  - `insertDraftIfMissing(db, d: { occurrenceDate: ISODate; eventId?: string; festivalId?: string; text: string; source: DraftSource }): Promise<Draft | null>`. It assigns `number` = max for that date + 1 and returns `null` if a draft for that source and date already exists.
  - `applyDraftAction(db, id: string, action: Exclude<DraftAction, 'expire'>, patch?: { text?: string; source?: DraftSource; error?: string; sentMessageId?: string }): Promise<Draft | null>`. It does a single `update … where id = $1 and status = any(allowedFrom(action)) returning`, and returns `null` when the transition isn't allowed. It sets `approved_at` on approve/edit and `sent_at` on markSent.
  - `listDraftsForDates(db, dates: ISODate[]): Promise<Draft[]>`, ordered by date and number.
  - `openDraftNumbers(db, date): Promise<number[]>` covers status pending, approved, skipped or failed.
  - `findDraftByNumber(db, date, number): Promise<Draft | null>`
  - `approvedDraftsFor(db, date): Promise<Draft[]>`
  - `expireDraftsBefore(db, date: ISODate): Promise<number>`. Pending becomes expired; approved becomes failed with error `'The day ended before it could be posted.'`.
  - `failInterruptedSends(db): Promise<number>`. `sending` becomes failed with error `'Worker stopped while sending — check the group before retrying.'`.

- [ ] **Step 1: Write the failing tests.**
  - The second `insertDraftIfMissing` for the same event and date returns `null`. Two different events on the same date get numbers 1 and 2.
  - Two concurrent `applyDraftAction(id,'claim')` calls (`Promise.all`) leave exactly one non-null result. This is the **no-double-send** test.
  - Approving a `sent` draft returns `null`.
  - An `edit` sets the text, `source: 'admin'` and status `approved`.
  - `expireDraftsBefore('2026-10-25')` turns yesterday's pending draft into `expired` and yesterday's approved draft into `failed`, and leaves today's untouched.
  - `failInterruptedSends` moves `sending` to `failed`.
- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run it.** Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(db): draft data functions with conditional status updates"`

### Task 10: Festival seed for 2026 and 2027

**Files:**
- Create: `supabase/migrations/20261024000002_festivals_seed.sql`
- Test: `packages/db/test/festivalsSeed.test.ts`

**Interfaces:**
- Produces: rows in `festivals`, nothing else.

- [ ] **Step 1: Write the failing test.**

```ts
const NAMES = ['Lohri','Makar Sankranti','Vasant Panchami','Maha Shivratri','Holi','Chaitra Navratri','Ram Navami',
  'Hanuman Jayanti','Raksha Bandhan','Janmashtami','Ganesh Chaturthi','Sharad Navratri','Dussehra','Karwa Chauth',
  'Dhanteras','Diwali','Govardhan Puja','Bhai Dooj','Chhath']
test.each([2026, 2027])('every festival seeded exactly once in %i', async (year) => {
  const rows = await listFestivals(db, { from: `${year}-01-01`, to: `${year}-12-31` })
  expect(rows.map(r => r.name).sort()).toEqual([...NAMES].sort())
})
test('Diwali precedes Govardhan Puja precedes Bhai Dooj; Dhanteras precedes Diwali', …)
```

- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Research and write the seed.**
  - Take every date from drikpanchang.com with location set to New Delhi (North Indian, Purnimanta). Navratri entries are day 1. Chhath is the main (Sandhya Arghya) day.
  - Put a comment header citing the source URLs and the date you checked them.
  - Check each date against the festival's own drikpanchang page, not memory.
  - Insert with `on conflict (name, date) do nothing`.
- [ ] **Step 4: Run it.** Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(db): seed North Indian festival dates for 2026-2027"`

---

## Phase 3 — WhatsApp worker

### Task 11: Baileys auth state stored in the database

**Files:**
- Create: `apps/worker/package.json` (deps: `baileys@7.0.0-rc14`, `pino`, `zod`, `tsx`, the workspace packages), `apps/worker/tsconfig.json`, `apps/worker/src/wa/authState.ts`, `packages/db/src/wa.ts`
- Test: `apps/worker/test/authState.test.ts`

**Interfaces:**
- Produces:
  - `useDbAuthState(db): Promise<{ state: AuthenticationState; saveCreds: () => Promise<void>; clear: () => Promise<void> }>`, mirroring Baileys' `useMultiFileAuthState`.
  - `getWaStatus(db): Promise<WaStatus>` and `setWaStatus(db, patch: Partial<WaStatus>): Promise<void>`, where `WaStatus` = `{ state: 'starting'|'qr'|'connected'|'reconnecting'|'logged_out'|'wrong_number'; qr: string | null; groups: { id: string; name: string }[]; linkedPhone: string | null; updatedAt: Date }`.

- [ ] **Step 1: Write the failing tests** (PGlite).
  - With fresh state, `state.creds` comes from `initAuthCreds()`. After `saveCreds()`, a second `useDbAuthState` returns equal creds, and `Buffer` fields stay `Buffer`s.
  - `state.keys.set({ 'pre-key': { '1': keyPair } })` then `get('pre-key', ['1','2'])` gives `{ '1': keyPair }`.
  - Setting a key to `null` deletes its row.
  - `clear()` empties `wa_auth`.
  - `setWaStatus({ state: 'qr', qr: 'abc' })` round-trips.
- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Row key is `creds` or `<type>:<id>`.
  - Serialise with `JSON.stringify(v, BufferJSON.replacer)` and revive with `BufferJSON.reviver`.
  - For `app-state-sync-key` values, revive through `proto.Message.AppStateSyncKeyData.fromObject`, as `useMultiFileAuthState` does.
  - Batch `keys.set` into one upsert.
- [ ] **Step 4: Run it.** Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(worker): store WhatsApp auth state in the database"`

### Task 12: Connection, messenger and incoming-reply filter

**Files:**
- Create: `apps/worker/src/wa/messenger.ts`, `incoming.ts`, `connection.ts`, `apps/worker/src/deps.ts`, `apps/worker/test/fakes.ts`
- Test: `apps/worker/test/incoming.test.ts`, `apps/worker/test/messenger.test.ts`

**Interfaces:**
- Consumes: `useDbAuthState`, `setWaStatus` (Task 11), `phoneToJid` (Task 3).
- Produces:
  - `interface Messenger { isReady(): boolean; sendToGroup(groupJid: string, text: string): Promise<string>; sendToSelf(text: string): Promise<string>; sendToPhone(phone: string, text: string): Promise<string> }`. Each send returns the WhatsApp message id.
  - `createHumanMessenger(sock: SocketLike, opts: { selfJid: string; sentIds: SentIds; delayMs?: () => number }): Messenger`. Group and phone sends show `composing` presence, wait `delayMs()` (default random 2000–5000), then send and set `paused`. Self-chat sends skip the delay. Every returned id is added to `sentIds`.
  - `class SentIds`: a bounded set (last 500) with `add(id)` and `has(id)`.
  - `extractAdminReply(msg: WAMessage, ctx: { selfJids: string[]; sentIds: SentIds }): string | null`
  - `startConnection(deps: { db; adminPhone; log; onReply: (text: string) => Promise<void> }): Promise<{ messenger: Messenger; stop(): Promise<void> }>`
  - `interface WorkerDeps { db: Db; messenger: Messenger; model: WishModel | null; adminPhone: string; backupDir: string; log: Logger; now: () => Date }`
  - In `test/fakes.ts`:
    - `FakeMessenger`, which records `{ to: 'group' | 'self' | phone, text }[]` and has `ready` and `failNext` switches;
    - `FakeModel(outputs: string[])`;
    - `fixedNow(iso)`.

- [ ] **Step 1: Write the failing tests.**
  - `extractAdminReply` returns the text for a `fromMe` message in the self chat. The self chat is matched by either the phone JID or the `@lid` JID.
  - It returns `null` for:
    - a message whose id is in `sentIds` (**the worker's own draft**);
    - a non-`fromMe` message;
    - a message in any other chat;
    - a message with no text.
  - It reads both `conversation` and `extendedTextMessage.text`.
  - `createHumanMessenger` with a fake socket and `delayMs: () => 0`:
    - a group send calls `sendPresenceUpdate('composing', jid)` before `sendMessage`;
    - the returned id is in `sentIds`;
    - `sendToSelf` sends to `selfJid`.
- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Implement `incoming.ts` and `messenger.ts`.**
- [ ] **Step 4: Run it.** Expected: PASS.
- [ ] **Step 5: Implement `connection.ts`.** Covered manually in Task 18 and by the spec's verification step 2.
  - Call `makeWASocket({ auth: { creds, keys: makeCacheableSignalKeyStore(keys, log) }, logger, browser: Browsers.ubuntu('Family Wishes'), markOnlineOnConnect: false })`.
  - Handle `connection.update` events:
    - `qr` → `setWaStatus({ state: 'qr', qr })`.
    - `open`, when the linked number is `ADMIN_PHONE` → `setWaStatus({ state: 'connected', qr: null, linkedPhone, groups })`, where `groups` comes from `groupFetchAllParticipating()` as `{ id, name: subject }`.
    - `open`, when the linked number (`jidNormalizedUser(sock.user.id)` digits) differs from `ADMIN_PHONE` → `setWaStatus({ state: 'wrong_number' })`; `isReady()` stays false.
    - `close` with `DisconnectReason.loggedOut` → `clear()` auth, set state `logged_out`, start again for a fresh QR.
    - any other `close` → set state `reconnecting` and reconnect with backoff 1 s, 2 s, 4 s … capped at 60 s.
  - On `messages.upsert` with `type === 'notify'`, pass each message through `extractAdminReply` and send any result to `onReply`.
  - `selfJids` = `[jidNormalizedUser(sock.user.id), sock.user.lid && jidNormalizedUser(sock.user.lid)]`.
- [ ] **Step 6: Commit.** `git commit -m "feat(worker): WhatsApp connection, human-paced messenger and self-chat reply filter"`

### Task 13: Drafting (ensure drafts exist and tell the admin)

**Files:**
- Create: `apps/worker/src/jobs/drafting.ts`
- Test: `apps/worker/test/drafting.test.ts`

**Interfaces:**
- Consumes:
  - from core: `occurrencesOn`, `toWishInput`, `generateWish`, `occurrenceLabel`, `formatDraftBatch`, `formatDateLabel`;
  - from db: `listEvents`, `listFestivals`, `insertDraftIfMissing`, `getSettings`, `setSetting`;
  - `WorkerDeps`.
- Produces: `ensureDraftsFor(date: ISODate, deps: WorkerDeps): Promise<Draft[]>`, which returns only newly created drafts. When any are created, it sends one batch message with `sendToSelf` and sets `active_batch_date = date`. With none, it sends nothing.

- [ ] **Step 1: Write the failing tests** (PGlite, `FakeMessenger`, `FakeModel`).
  - With a birthday tomorrow and a festival tomorrow:
    - two drafts are created, numbered 1 and 2, with status `pending`;
    - one self-chat message contains both labels;
    - `active_batch_date` is tomorrow.
  - A second call creates nothing and sends nothing (**idempotent**).
  - An event added after the first call is drafted on the next call as number 3, sent on its own.
  - The model receives no birth year. Capture the prompt in `FakeModel` and assert `'1958'` is absent.
  - With the messenger not ready, drafts are still created and the batch message waits. The next call with the messenger ready sends the unsent pending drafts.
  - Implementation: record "told admin" via `drafts.notified_at`. Add the column in a migration `20261024000003_draft_notified.sql` and to `schema.ts`. `ensureDraftsFor` sends every draft for `date` with `notified_at is null`, then stamps them.
- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run it.** Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(worker): idempotent drafting with admin notification"`

### Task 14: Applying admin replies

**Files:**
- Create: `apps/worker/src/jobs/replies.ts`
- Test: `apps/worker/test/replies.test.ts`

**Interfaces:**
- Consumes: `parseReply`, `generateWish`, `toWishInput` (core); `getSettings`, `openDraftNumbers`, `findDraftByNumber`, `applyDraftAction`, `getEvent`, `listFestivals` (db).
- Produces: `handleAdminReply(text: string, deps: WorkerDeps): Promise<void>`. It acts on `active_batch_date` and always answers with exactly one `sendToSelf` confirmation or error.

- [ ] **Step 1: Write the failing tests.** Seed two pending drafts for the active date.
  - `ok 2` approves draft 2 and the reply contains `'Approved'` and draft 2's label.
  - `ok` approves both.
  - `skip 1` leaves draft 1 `skipped`.
  - `redo 2` replaces the text using the model's next output, sets the status `pending`, and sends a self message containing the new text.
  - `2 Happy birthday Nani, lots of love!` gives text equal to that string, `source: 'admin'` and status `approved`.
  - `k` changes nothing, and the reply contains the parser's reason.
  - With no `active_batch_date`, the reply is "No drafts are waiting".
- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run it.** Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(worker): apply admin approve/skip/redo/edit replies"`

### Task 15: Posting, expiry and crash recovery

**Files:**
- Create: `apps/worker/src/jobs/posting.ts`
- Test: `apps/worker/test/posting.test.ts`

**Interfaces:**
- Consumes: `approvedDraftsFor`, `applyDraftAction`, `expireDraftsBefore`, `failInterruptedSends`, `getSettings` (db); `localDate`, `localTime`, `isTimeReached` (core).
- Produces:
  - `postDueDrafts(deps: WorkerDeps, opts?: { ignoreSendTime?: boolean }): Promise<number>`. It does nothing if:
    - the local time is before `send_time`, unless `ignoreSendTime` is set;
    - the messenger is not ready;
    - `group_id` is unset. In that case it logs a warning once per day.

    Otherwise, for each approved draft for today it claims, sends, then calls `markSent` with the message id, or `markFailed` with the error message.
  - `expireOldDrafts(deps): Promise<number>` calls `expireDraftsBefore(today)`.
  - `recoverInterruptedSends(deps): Promise<number>`

- [ ] **Step 1: Write the failing tests.**
  - At 07:59 nothing posts. At 08:00 two approved drafts post as two group messages and become `sent` with `sentMessageId`. A pending draft is not posted.
  - Running `postDueDrafts` again sends nothing (**no resend**).
  - A draft approved at 10:30 posts on the next call.
  - A send that throws marks the draft `failed` with the error text, and the other draft still posts.
  - With the messenger not ready, drafts stay `approved`.
  - `ignoreSendTime` posts at 06:00.
- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run it.** Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(worker): post approved drafts once, expire stale ones, recover interrupted sends"`

### Task 16: Scheduler loops, daily jobs and run-now requests

**Files:**
- Create: `apps/worker/src/scheduler.ts`, `apps/worker/src/jobs/daily.ts`, `packages/db/src/jobs.ts`
- Test: `apps/worker/test/scheduler.test.ts`, `apps/worker/test/daily.test.ts`

**Interfaces:**
- Consumes: Tasks 13–15, `archivePastOneTimeEvents` (Task 8), `formatNudge` (Task 5).
- Produces:
  - `claimJobRun(db, job: string, date: ISODate): Promise<boolean>` uses insert … on conflict do nothing.
  - `requestJob(db, job: 'draft' | 'send'): Promise<void>`
  - `takeJobRequests(db): Promise<('draft' | 'send')[]>` marks them done.
  - `sendNudge(deps): Promise<boolean>` sends one self message if today has pending drafts and sets `active_batch_date = today`.
  - `sendFestivalReminder(deps): Promise<void>` sends text asking the admin to review next year's festival dates on the website.
  - `fastTick(deps): Promise<void>` runs `postDueDrafts` and run-now requests (Task 17 adds the outbox sender here):
    - `draft` → `ensureDraftsFor(tomorrow)`;
    - `send` → `postDueDrafts({ ignoreSendTime: true })`.
  - `slowTick(deps): Promise<void>` runs, in order:
    1. `expireOldDrafts`;
    2. `ensureDraftsFor(today)`;
    3. `ensureDraftsFor(tomorrow)`, if `draft_time` has been reached;
    4. once per day via `claimJobRun`:
       - `nudge` at `nudge_time`;
       - `archive` after 00:00;
       - `festival_reminder` on 12-01 at `draft_time`;
       - `backup` after 02:00 is added by Task 17.
  - `startLoops(deps): { stop(): void }` calls `recoverInterruptedSends` once, then runs `slowTick` immediately and every 60 s, and `fastTick` every 5 s. A tick never overlaps itself, and errors are logged, never thrown.

- [ ] **Step 1: Write the failing tests.**
  - **Worker down across draft time:**
    - `slowTick` at 01:00 on the 25th drafts the 25th's birthday and sends it to the admin.
    - At 19:59 nothing is drafted for the 26th; at 20:00 it is.
  - The nudge is sent once at 07:00 when there are pending drafts, and not again at 07:01. Without pending drafts nothing is sent.
  - On 1 Dec at 20:00 the festival reminder is sent exactly once.
  - The `send` request posts approved drafts at 06:00. The `draft` request drafts tomorrow at 14:00.
  - A tick that throws inside one job still runs the others. Use a fake that throws.
- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run it.** Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(worker): fast/slow scheduler loops, daily jobs and run-now requests"`

### Task 17: Login-code outbox sender and nightly backup

**Files:**
- Create: `packages/db/src/outbox.ts`, `packages/db/src/backup.ts`, `apps/worker/src/jobs/outbox.ts`, `apps/worker/src/jobs/backup.ts`
- Modify: `apps/worker/src/scheduler.ts` (call `sendOutbox` in `fastTick`; claim `backup` once per day after 02:00 in `slowTick`), `apps/worker/src/jobs/posting.ts` (`recoverInterruptedSends` also fails `sending` outbox rows)
- Test: `apps/worker/test/outbox.test.ts`, `apps/worker/test/backup.test.ts`, extend `apps/worker/test/scheduler.test.ts`

**Interfaces:**
- Produces:
  - `enqueueOutbox(db, toPhone: string, body: string): Promise<void>`. Task 19 uses it.
  - `claimQueuedOutbox(db, limit: number): Promise<OutboxRow[]>`. It claims rows with one `update outbox set status = 'sending' where id in (select id … where status = 'queued' order by created_at limit $1) returning *`.
  - `finishOutbox(db, id, result: { ok: true } | { ok: false; error: string })` sets `sent` or `failed` and blanks `body` so codes don't linger.
  - On startup, `recoverInterruptedSends` (Task 15) also fails outbox rows left in `sending`. Never resend a login code.
  - `sendOutbox(deps): Promise<number>` skips rows whose `to_phone` is not a member, marking them `failed: 'not a member'`. Rows older than 10 minutes are failed as `'expired'` without sending.
  - `exportBackup(db): Promise<{ exportedAt: string; members; events; festivals; settings }>`
  - `writeBackup(deps): Promise<string>` writes `<BACKUP_DIR>/backup-<date>.json`, deletes all but the newest 14 files, and returns the path.

- [ ] **Step 1: Write the failing tests.**
  - A queued code to a member is sent once via `sendToPhone`, with status `sent` and an empty body.
  - A non-member number is never sent.
  - A row 11 minutes old is not sent.
  - With the messenger not ready, the row stays queued.
  - Backups: with 15 existing files in a temp dir, `writeBackup` leaves 14, including the new one. The JSON contains the seeded festival rows. `sessions` and `login_codes` are not exported.
  - Scheduler: `slowTick` at 02:00 writes one backup, and again at 02:01 writes none. `fastTick` sends a queued code.
- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run it.** Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(worker): login code outbox sender and nightly JSON backup"`

### Task 18: Worker entry point and Docker image

**Files:**
- Create: `apps/worker/src/env.ts`, `apps/worker/src/main.ts`, `apps/worker/Dockerfile`, `deploy/worker/docker-compose.yml`
- Test: `apps/worker/test/env.test.ts`

**Interfaces:**
- Consumes: everything in Phase 3, `createGeminiModel`, `ensureAdmin`.
- Produces:
  - `loadWorkerEnv(env: NodeJS.ProcessEnv): WorkerEnv`, a zod-parsed object with:
    - `DATABASE_URL`, `ADMIN_PHONE` (8–15 digits), `GEMINI_API_KEY`;
    - `GEMINI_MODEL`, default `DEFAULT_GEMINI_MODEL`;
    - `BACKUP_DIR`, default `/data/backups`;
    - `LOG_LEVEL`, default `info`.
  - Root script `worker:dev` (`tsx --env-file=.env apps/worker/src/main.ts`).

- [ ] **Step 1: Write the failing test.** A missing `DATABASE_URL` throws a message naming the variable; `ADMIN_PHONE: '+91 98…'` is rejected; the defaults apply.
- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Implement.**
  - `main.ts`:
    1. load env;
    2. `createDb`, then `runMigrations` is **not** run here (migrations are an explicit deploy step);
    3. `ensureAdmin`;
    4. `startConnection` with `onReply` → `handleAdminReply`;
    5. `startLoops`;
    6. `SIGTERM`/`SIGINT` → stop loops, close the socket, close the db.
  - The Dockerfile uses a `node:24-slim` base and a root build context. It copies the root `package*.json` and the workspace manifests, runs `npm ci --omit=dev --workspace @family-wishes/worker --include-workspace-root`, copies the source, and sets `CMD ["npx","tsx","apps/worker/src/main.ts"]`.
  - In compose:
    - `build: { context: ../.., dockerfile: apps/worker/Dockerfile }`;
    - `env_file: .env`, `restart: unless-stopped`, volume `./data:/data`, no ports;
    - log rotation `max-size: 10m`, `max-file: 3`.
- [ ] **Step 4: Run it.** Expected: PASS.
- [ ] **Step 5: Manual smoke.** With `.env` pointing at a Supabase dev project, run `npm run db:migrate`, then `npm run worker:dev`. Expected: the logs show the state `qr`, and `select state, length(qr) from wa_status` returns `qr` with a non-zero length.
- [ ] **Step 6: Commit.** `git commit -m "feat(worker): entry point, env validation and Docker image"`

---

## Phase 4 — Website

### Task 19: Next.js app, env, and login-code/session library

**Files:**
- Create: `apps/web` via `npx create-next-app@latest apps/web --ts --app --eslint --no-tailwind --src-dir=false --import-alias "@/*"`. Then set `"name": "@family-wishes/web"` and add the workspace deps.
- Create: `apps/web/next.config.ts`, `lib/env.ts`, `lib/db.ts`, `lib/auth/otp.ts`, `lib/auth/session.ts`, `lib/auth/admin.ts`, `packages/db/src/auth.ts`
- Test: `apps/web/test/otp.test.ts`, `apps/web/test/session.test.ts`, `apps/web/test/admin.test.ts`

**Interfaces:**
- Consumes: `normalizePhone` (core), `findMemberByPhone`, `ensureAdmin`, `enqueueOutbox` (db).
- Produces:
  - In `next.config.ts`: `transpilePackages: ['@family-wishes/core','@family-wishes/db']`, `serverExternalPackages: ['@electric-sql/pglite']`.
  - `getWebEnv(): WebEnv` (zod, cached). It requires `DATABASE_URL`, `GEMINI_API_KEY`, `ADMIN_PHONE`, `ADMIN_PASSWORD` (≥ 16) and `SESSION_SECRET` (≥ 32); `GEMINI_MODEL` is optional.
  - `getDb(): Promise<Db>` is a module-level singleton.
  - `requestLoginCode(db, rawPhone: string, opts: { countryCode: string; secret: string; now: Date }): Promise<'sent' | 'invalid_phone' | 'rate_limited'>`. It returns `'sent'` for unknown numbers too, without storing or sending anything.
  - `verifyLoginCode(db, rawPhone, code, opts: { countryCode; secret; now }): Promise<{ ok: true; memberId: string } | { ok: false; reason: 'invalid' | 'expired' | 'too_many_attempts' }>`
  - `createSession(db, memberId, now): Promise<string>`
  - `findSessionMember(db, token, now): Promise<Member | null>`
  - `deleteSession(db, token)`
  - `checkAdminPassword(input: string, expected: string): boolean`
  - `LOGIN_CODE_TEXT(code)` = `` `Your Family Wishes login code is ${code}. It expires in 10 minutes. Don't share it with anyone.` ``

- [ ] **Step 1: Write the failing tests** (PGlite).
  - A member's request creates one `login_codes` row and one outbox row whose body contains the 6-digit code. The `code_hash` is not the code.
  - The 4th request within 15 minutes is `rate_limited`; it succeeds again after 15 minutes.
  - An unknown number gets `'sent'` with zero rows written.
  - Verification:
    - the right code gives `ok`, and deletes the phone's codes;
    - a wrong code gives `invalid` and increments `attempts`;
    - after 5 wrong attempts even the right code gives `too_many_attempts`;
    - after 10 minutes and 1 second, `expired`.
  - Sessions:
    - `findSessionMember` with a valid token returns the member;
    - an expired token or an unknown token returns `null`;
    - the stored `token_hash` is not the token.
  - `checkAdminPassword` is false on a length mismatch and doesn't throw.
- [ ] **Step 2: Run it.** `npx vitest run apps/web`. Expected: FAIL.
- [ ] **Step 3: Implement.** Use `crypto.randomInt(0, 1_000_000)` zero-padded, `createHmac('sha256', secret).update(`${phone}:${code}`)`, `timingSafeEqual`, and `randomBytes(32).toString('base64url')`.
- [ ] **Step 4: Run it.** Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(web): Next app with WhatsApp login code and session library"`

### Task 20: Sign-in pages, guards and member entries

**Files:**
- Create: `apps/web/lib/guards.ts`, `lib/actions/auth.ts`, `lib/actions/entries.ts`
- Create: `app/login/page.tsx`, `app/login/verify/page.tsx`, `app/login/admin/page.tsx`
- Create: `app/(member)/layout.tsx`, `app/(member)/page.tsx`, `app/(member)/entries/page.tsx`, `app/(member)/entries/new/page.tsx`, `app/(member)/entries/[id]/edit/page.tsx`
- Create: `components/EventForm.tsx`, `app/globals.css`
- Test: `apps/web/test/entriesActions.test.ts`

**Interfaces:**
- Consumes: Task 19, `parseEventInput`, `upcoming`, `occurrenceLabel`, `localDate`, the event functions (Task 8).
- Produces:
  - `getCurrentMember(): Promise<Member | null>`, which reads the `fw_session` cookie.
  - `requireMember(): Promise<Member>`, which redirects to `/login`.
  - `requireAdmin(): Promise<Member>`, which redirects to `/` for non-admins.
  - The core of each action is a plain function taking `(db, actor, formData-like input)` so it can be tested without Next:
    - `saveEntry(db, actor: Member, raw: unknown, id: string | null, today: ISODate): Promise<{ ok: true } | { ok: false; errors: Record<string, string> }>`
    - `removeEntry(db, actor: Member, id: string): Promise<'ok' | 'forbidden' | 'not_found'>`

    The exported `'use server'` actions call `requireMember()` and then these functions.

- [ ] **Step 1: Write the failing tests.**
  - `saveEntry` by member A on member B's entry id returns `{ ok: false, errors: { form: … } }` and leaves the row unchanged. **This is the direct-call bypass test.**
  - An admin may edit it.
  - Invalid input returns field errors.
  - `removeEntry` on another member's entry returns `forbidden`.
- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Implement the functions, actions and pages.**
  - Login flow pages:
    - `/login` takes the phone and calls `requestLoginCode`. On success it shows "If this number is on the family list, a code is on its way on WhatsApp", then goes to `/login/verify?phone=…`.
    - `/login/verify` takes the code, then sets the cookie and redirects to `/`.
    - `/login/admin` takes the password, then `ensureAdmin(ADMIN_PHONE)` and a session. On a wrong password it waits 1 s before responding.
  - Member pages:
    - Upcoming lists 60 days from `localDate(now, settings.timeZone)` as date label plus `occurrenceLabel`. It never renders `year`.
    - My entries lists `listEvents({ addedBy })` with edit/delete.
  - `EventForm`:
    - fields: type, names, "What the family calls them", a title (shown for special only), day, month, optional year, "Repeats every year / One time only" (special only), and a note with the hint "Something the wish can mention, e.g. loves cricket";
    - it shows the field errors.
  - The nav bar has Upcoming, My entries, Add and Sign out; Admin is shown only to the admin.
  - Mobile-first CSS: single column, 16 px+ inputs.
- [ ] **Step 4: Run it.** Expected: PASS.
- [ ] **Step 5: Manual check.** Run `npm run dev -w @family-wishes/web` with `DATABASE_URL=pglite:./.pglite-dev` after `npm run db:migrate`. Sign in through `/login/admin`, add a birthday with a year, and confirm Upcoming shows it without the year.
- [ ] **Step 6: Commit.** `git commit -m "feat(web): sign-in pages, guards and member entries"`

### Task 21: Admin — WhatsApp link, group picker, run-now

**Files:**
- Create: `apps/web/lib/actions/admin.ts` (group and run-now parts), `app/admin/layout.tsx`, `app/admin/page.tsx`, `app/admin/RefreshWhileWaiting.tsx` (client)
- Test: `apps/web/test/adminActions.test.ts`

**Interfaces:**
- Consumes: `getWaStatus` (Task 11), `setSetting`, `getSettings`, `requestJob` (Task 16).
- Produces:
  - `chooseGroup(db, actor: Member, groupId: string): Promise<'ok' | 'forbidden' | 'unknown_group'>`. The `groupId` must be in `wa_status.groups`.
  - `runNow(db, actor: Member, job: 'draft' | 'send'): Promise<'ok' | 'forbidden'>`

- [ ] **Step 1: Write the failing tests.** A non-admin actor gets `forbidden` from both functions. A group id not in the list gives `unknown_group`. A valid choice saves `group_id`.
- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Implement.**
  - The `/admin` page shows:
    - a state badge, red for `logged_out`, `wrong_number` or `reconnecting`;
    - when the state is `qr`, the QR rendered server-side with `qrcode.toDataURL(qr)`, with the warning "Scan with the admin's WhatsApp → Linked devices. Anyone who scans this controls the link.";
    - `wrong_number` explains that the linked number must be `ADMIN_PHONE`;
    - the group `<select>` populated from `groups`, with a save button;
    - "Draft tomorrow's wishes now" and "Post approved wishes now" buttons;
    - the last updated time.
  - `RefreshWhileWaiting` calls `router.refresh()` every 5 s while the state isn't `connected`.
  - The admin layout calls `requireAdmin()` and has sub-nav links to Drafts, Members, Festivals, Settings and All entries.
- [ ] **Step 4: Run it.** Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(web): admin WhatsApp link page, group picker and run-now buttons"`

### Task 22: Admin — drafts page

**Files:**
- Create: `apps/web/lib/actions/drafts.ts`, `app/admin/drafts/page.tsx`
- Test: `apps/web/test/draftActions.test.ts`

**Interfaces:**
- Consumes: `applyDraftAction`, `listDraftsForDates` (Task 9); `generateWish`, `toWishInput`, `createGeminiModel` (Task 6); `MIN_EDIT_LENGTH` (Task 5).
- Produces: `draftAction(db, actor: Member, id: string, input: { action: 'approve' | 'skip' | 'redo' } | { action: 'edit'; text: string }, model: WishModel | null): Promise<'ok' | 'forbidden' | 'not_allowed' | 'too_short'>`

- [ ] **Step 1: Write the failing tests.**
  - A non-admin gets `forbidden` and the draft is unchanged.
  - Approving a `sent` draft gives `not_allowed`.
  - An edit shorter than `MIN_EDIT_LENGTH` gives `too_short`.
  - `redo` with a `FakeModel` replaces the text and sets the status `pending`.
  - An edit sets `source: 'admin'` and status `approved`.
- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Implement.**
  - The page shows today's and tomorrow's drafts (in the settings zone) plus `failed` drafts from the last 7 days. Each draft shows its number, label, status, source and error, its text in an editable `<textarea>`, and Approve / Skip / Redo / Save-and-approve buttons.
  - A failed draft shows "Check the group first — it may have posted" next to Approve.
- [ ] **Step 4: Run it.** Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(web): admin drafts page with approve, skip, redo and edit"`

### Task 23: Admin — members, festivals, settings, all entries

**Files:**
- Modify: `apps/web/lib/actions/admin.ts`
- Create: `app/admin/members/page.tsx`, `app/admin/festivals/page.tsx`, `app/admin/settings/page.tsx`, `app/admin/entries/page.tsx`
- Test: `apps/web/test/adminManage.test.ts`

**Interfaces:**
- Consumes: member, festival and settings functions (Task 8); `normalizePhone`, `isValidTime`, `isValidTimeZone` (Task 3); `saveEntry`/`removeEntry` (Task 20).
- Produces:
  - `addFamilyMember(db, actor, { phone, name }): Promise<'ok' | 'forbidden' | 'invalid_phone' | 'duplicate'>`
  - `saveFestival(db, actor, id: string | null, { name, date }): Promise<'ok' | 'forbidden' | 'invalid'>`
  - `saveSettings(db, actor, raw): Promise<{ ok: true } | { ok: false; errors: Record<string, string> }>`. Times must pass `isValidTime`, the zone `isValidTimeZone`, `ai_style` must be 1–1000 characters, and `country_code` must be 1–3 digits.

- [ ] **Step 1: Write the failing tests.**
  - Each function returns `forbidden` for a non-admin.
  - `saveSettings({ send_time: '25:00' })` gives an error keyed `send_time`.
  - `addFamilyMember({ phone: '98765 43210' })` stores `'919876543210'`.
  - `saveFestival` with the date `'2027-02-30'` gives `invalid`.
- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Members: list, add, and remove (removing yourself is disabled).
  - Festivals: grouped by year, with add/edit/delete.
  - Settings: a form with the help text "Times use the time zone below".
  - All entries: every event with its year visible (admin only), edited through `EventForm` with the admin as actor.
- [ ] **Step 4: Run it.** Expected: PASS. Then run `npm run coverage`. Expected: ≥ 80% lines in every package.
- [ ] **Step 5: Commit.** `git commit -m "feat(web): admin members, festivals, settings and all entries pages"`

### Task 24: Smoke E2E

**Files:**
- Create: `apps/web/playwright.config.ts`, `apps/web/e2e/smoke.spec.ts`, `apps/web/e2e/setup.ts`
- Modify: root `package.json` to add the `e2e` script.

**Interfaces:**
- Consumes: the whole website.

- [ ] **Step 1: Write the test.**
  - The admin signs in via `/login/admin`, adds member "Test Member" with phone `9999900001`, and adds a birthday for tomorrow with the year 1958.
  - Upcoming shows "Birthday — …", and the page text doesn't contain `1958`.
  - `/admin/settings` rejects `25:00`.
  - Signing out redirects `/admin` to `/login`.
- [ ] **Step 2: Configure.**
  - `globalSetup` deletes `.pglite-e2e`, runs migrations on `pglite:./.pglite-e2e` and returns.
  - The `webServer` runs `next dev -p 3100` with `DATABASE_URL=pglite:./.pglite-e2e` and fixed test values for `ADMIN_PASSWORD`/`SESSION_SECRET`/`ADMIN_PHONE`/`GEMINI_API_KEY`.
  - If PGlite proves unstable inside `next dev`, point `DATABASE_URL` at a Supabase dev project and note it in `docs/deploy.md`.
- [ ] **Step 3: Run it.** `npm run e2e`. Expected: 1 passed.
- [ ] **Step 4: Commit.** `git commit -m "test(web): Playwright smoke test for sign-in, entries and settings"`

---

## Phase 5 — Deploy

### Task 25: Deployment runbook and go-live

**Files:**
- Create: `docs/deploy.md`

- [ ] **Step 1: Write `docs/deploy.md`** with these sections.
  1. **Supabase.**
     - Create the project in region `ap-south-1` (Mumbai).
     - Copy the transaction pooler URI (port 6543) as `DATABASE_URL`.
     - Run `DATABASE_URL=… npm run db:migrate`.
  2. **Vercel.**
     - Import the repo with root directory `apps/web`.
     - Set the env vars `DATABASE_URL`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `ADMIN_PHONE`, `ADMIN_PASSWORD`, `SESSION_SECRET` (generate with `openssl rand -base64 48`).
     - Deploy.
  3. **Oracle VM.**
     - Create an Always Free Ampere A1 instance (1 OCPU / 6 GB is plenty) running Ubuntu 24.04. Ingress stays SSH only.
     - Install Docker Engine and the compose plugin.
     - `git clone`, then create `deploy/worker/.env` with the worker vars.
     - `cd deploy/worker && docker compose up -d --build`, then `docker compose logs -f`.
     - To update: `git pull && docker compose up -d --build`.
     - Backups live in `deploy/worker/data/backups`.
  4. **Linking.** Open `/admin`, scan the QR, then pick the group.
  5. **The spec's verification steps 2–7**, copied as a checklist.
- [ ] **Step 2: Run the verification checklist** against a test number and a test group (spec steps 2–6), then deploy and repeat steps 3–5 (spec step 7). Record the results in the PR description.
- [ ] **Step 3: Commit.** `git commit -m "docs: deployment runbook for Supabase, Vercel and Oracle VM"`
