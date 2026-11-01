# Vercel-only Runner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the always-on WhatsApp worker with short "lease → connect → work → flush → disconnect" runs on Vercel's free plan. Runs are started every 30 minutes by cron-job.org and immediately by website actions.

**Architecture:**
- The WhatsApp code and jobs move from `apps/worker` into a new shared package, `packages/runner`, which adds a one-shot connection and a `runOnce` orchestrator guarded by a database lease row.
- `apps/web` exposes `GET /api/run` for schedulers and starts runs from server actions with `after()`.
- `apps/worker` stays as a thin always-on entry that holds the same lease.

**Tech Stack:** Node 24, TypeScript (strict), Next.js 16 on Vercel Hobby, Baileys `7.0.0-rc14`, Drizzle + Supabase Postgres (PGlite in tests), Vitest, Playwright.

**Spec:** [docs/superpowers/specs/2026-11-01-vercel-only-runner-design.md](../specs/2026-11-01-vercel-only-runner-design.md). It builds on [2026-10-24-family-wishes-design.md](../specs/2026-10-24-family-wishes-design.md) and [the original plan](2026-10-24-family-wishes.md).

## Global Constraints

Everything in the original plan's *Global Constraints* still applies, notably:

- an unapproved draft never posts;
- the worker sends only to the group, the admin's own chat and listed members;
- no `console.log`;
- zod at boundaries;
- functions under 50 lines;
- at least 80% line coverage;
- commits use `<type>: <description>` with no `Co-Authored-By` trailer.

The additions below come from the new spec.

**Timings and limits**

- Vercel Hobby limits: cron jobs at most once a day (±59 min); `maxDuration` at most **300 s**; 4 active CPU-hours a month.
- Runs are scheduled at **:00 and :30** by cron-job.org. The Vercel daily backstop crons are at **20:00 and 08:00 IST** (`30 14 * * *` and `30 2 * * *` in UTC).
- Mutual exclusion uses a **lease row** (`wa_lease`), never `pg_advisory_lock`, because Supabase's transaction pooler can't hold session locks.
- `LEASE_TTL_MS = 330_000`. It is longer than `maxDuration`, so a killed run's lease expires before anyone could still be using it.
- Run timings per trigger:

  | Trigger | Lease wait | Work budget (from lease) |
  | --- | --- | --- |
  | `schedule` | 0 | 200 000 ms |
  | `login_code`, `run_now`, `post_now` | 60 000 ms | 200 000 ms |
  | `link` | 15 000 ms | 260 000 ms, of which up to 180 000 ms waiting for the QR scan |

**WhatsApp connection**

- Connection timeouts: wait up to **30 s** for `open`, then up to **20 s** for `receivedPendingNotifications`; flush (send acks and auth writes) for up to **10 s**.
- Baileys socket options for runs: `syncFullHistory: false`, `shouldSyncHistoryMessage: () => false`, `markOnlineOnConnect: false`, `browser: Browsers.ubuntu('Family Wishes')` (unchanged, so WhatsApp sees the same device).
- A scheduled or website-started run **never shows a QR**. If there is no linked session it doesn't connect. Only a `link` run shows QRs.
- Admin replies are applied **before** any new drafts are sent in a run.
- Sent message ids are stored in `wa_sent_ids` and pruned after **7 days**.

**WhatsApp page, backups and secrets**

- "Linked" means `linkedPhone !== null` and `state` is not `logged_out`, `wrong_number` or `qr`.
- The WhatsApp page warns when the last successful run is more than **2 hours** old.
- Backups when there is no disk (`backupDir === null`): **weekly**, on Sunday, at the first run at or after **02:00**, as a JSON document to the admin's self-chat. Over **10 MB**, send a warning instead.
- `CRON_SECRET` is at least **32** characters, compared in constant time; the web app refuses to start without it.

**Copy**

| Where | Exact text |
| --- | --- |
| Verify page | "The code can take up to a minute to arrive on WhatsApp." |
| Settings hint | "Times are checked every 30 minutes, at :00 and :30." |
| Stale warning | "No check has reached WhatsApp since {time}. The scheduler may have stopped; see the deployment guide." |

## Review Focus

1. **A run is killed at 300 s mid-send.** Expected: the next run marks that wish or code failed and never resends it, and the lease has already expired. Test lives in Task 8.
2. **A login code and the scheduled run start at the same moment.** Expected: only one connects; the code still goes out through that run's final drain. Test lives in Task 8.
3. **The admin types a reply while a run is mid-way.** Expected: it is answered in the same run before the disconnect. Test lives in Task 8.
4. **WhatsApp is unlinked from the phone.** Expected:
   - scheduled runs never show a QR or retry in a loop (Task 6);
   - the status becomes `logged_out` (Task 6);
   - **Approve & post now** says WhatsApp isn't connected (Task 11).
5. **cron-job.org silently stops calling.** Expected: after 2 hours the WhatsApp page shows the stale warning. Test lives in Task 12.

---

## File Structure

| Path | Responsibility |
| --- | --- |
| `supabase/migrations/20261101000005_runner.sql` | `wa_lease`, `wa_sent_ids`, the `wa_status.last_run_*` columns |
| `packages/db/src/runs.ts` | Lease, sent-id and last-run data functions; `isWaLinked` |
| `packages/runner/` (new, `@family-wishes/runner`) | Code shared by both modes |
| `packages/runner/src/wa/*` | Moved from `apps/worker/src/wa`, plus `acks.ts` (send acks) and `once.ts` (one-shot connection) |
| `packages/runner/src/jobs/*`, `scheduler.ts`, `deps.ts` | Moved from `apps/worker/src` |
| `packages/runner/src/lease.ts` | `waitForLease`, `keepLease` |
| `packages/runner/src/run.ts` | `runOnce` orchestrator |
| `packages/runner/src/models.ts` | `createModels(env)` (moved out of `apps/worker/src/main.ts`) |
| `packages/runner/test/*` | Moved worker tests plus new ones; `fakes.ts` moves too |
| `apps/worker/src/main.ts`, `env.ts` | Thin always-on entry (keeps the lease while running) |
| `apps/web/lib/run/start.ts` | `startRun`, `scheduleRun` (server-only) |
| `apps/web/lib/run/auth.ts` | `isAuthorizedRunRequest` |
| `apps/web/app/api/run/route.ts` | Scheduler endpoint |
| `apps/web/vercel.json` | Backstop crons, region `bom1` |
| `apps/web/lib/waStatus.ts` | `describeRunStatus`, `nextCheckAt` |
| `docs/superpowers/spikes/2026-11-01-runner-spike.md` | Spike results (Task 1) |

---

## Phase 0: Spike (gate)

### Task 1: Prove offline replies and one run on Vercel

**Files:**
- Create (throwaway, delete before committing): `scripts/spike/run-once.ts` and `apps/web/app/api/spike/route.ts`
- Create (committed): `docs/superpowers/spikes/2026-11-01-runner-spike.md`

This is a spike: no tests, minimal error handling. It needs the **test WhatsApp number**, a Supabase dev project and a Vercel preview deployment.

- [ ] **Step 1: Write `scripts/spike/run-once.ts`.**
  1. Connect with `useDbAuthState` and the socket options from Global Constraints. Show the QR in the terminal on first use.
  2. Log every `messages.upsert` (type, `key.fromMe`, `key.id`, chat jid, text) and every `connection.update`.
  3. On `open`, wait for `receivedPendingNotifications`.
  4. Send one self-chat message, wait 5 s, then `end()`.
  5. Print the wall time and `process.cpuUsage()`.
- [ ] **Step 2: Check offline replies.**
  1. Link the device and run the script once.
  2. With the script stopped, type `ok` in *Message yourself* on the phone.
  3. Run the script again.
  4. Record: did `ok` arrive, with which `type`; did `receivedPendingNotifications` fire, and after how long; did the previous run's own self-chat message come back as an upsert?
- [ ] **Step 3: Run on Vercel.** Put the same flow behind `apps/web/app/api/spike/route.ts` (`maxDuration = 300`) on a preview deployment. Call it three times and record wall time, active CPU (Vercel Observability) and peak memory.
- [ ] **Step 4: Write the results file and decide.** Apply the spec's rules:
  - **Offline replies fail:** set `REPLIES_OVER_WHATSAPP = false` in the results. Task 8 then skips reply handling, and Task 6 makes the admin summary link to `/admin/drafts`.
  - **Over budget:** if a run is above 60 s wall time or 10 s CPU, stop the plan and report back. 1 440 runs × 10 s is 4 h, the whole Hobby allowance.
- [ ] **Step 5: Delete the spike code and commit the results only.**

```bash
git add docs/superpowers/spikes/2026-11-01-runner-spike.md
git commit -m "docs: runner spike results (offline replies, run cost on Vercel)"
```

---

## Phase 1: Database

### Task 2: Lease, sent ids and last-run status

**Files:**
- Create: `supabase/migrations/20261101000005_runner.sql`, `packages/db/src/runs.ts`, `packages/db/test/runs.test.ts`
- Modify: `packages/db/src/schema.ts` (new tables and columns), `packages/db/src/wa.ts` (`WaStatus` gains three fields), `packages/db/src/index.ts`

**Interfaces:**
- Produces:
  - `takeLease(db: Db, holder: string, ttlMs: number): Promise<boolean>`. It takes or renews the lease when it is expired or already held by `holder`, in one `UPDATE … RETURNING` that compares against `now()`.
  - `releaseLease(db: Db, holder: string): Promise<void>`. It sets `expires_at` to the epoch, but only if `holder` holds the lease.
  - `recordSentId(db: Db, id: string): Promise<void>` and `recentSentIds(db: Db, since: Date): Promise<string[]>`.
  - `pruneSentIds(db: Db, before: Date): Promise<number>`.
  - `setLastRun(db: Db, run: { ok: boolean; note: string }): Promise<void>`. It sets `last_run_at = now()`, and also `last_ok_at = now()` when `ok`.
  - `isWaLinked(status: WaStatus): boolean`.
  - `WaStatus` gains `lastRunAt: Date | null`, `lastRunOk: boolean | null`, `lastRunNote: string | null` and `lastOkAt: Date | null`. `lastOkAt` is needed because failed runs also update `lastRunAt`, so the stale warning can't rely on it.

- [ ] **Step 1: Write the migration.**
  - `wa_lease`: `id smallint primary key check (id = 1)`, `holder text`, `expires_at timestamptz not null default 'epoch'`, plus the usual `created_at`. Insert row 1.
  - `wa_sent_ids`: `id text primary key`, `created_at timestamptz not null default now()`.
  - `alter table wa_status add column last_run_at timestamptz, add column last_run_ok boolean, add column last_run_note text, add column last_ok_at timestamptz`.
  - `alter table … enable row level security` on both new tables.
- [ ] **Step 2: Write the failing tests** in `packages/db/test/runs.test.ts` with `createTestDb()`:
  - `takeLease grants a free lease and refuses a second holder until it expires`: `takeLease(db,'a',60_000)` → true; `takeLease(db,'b',60_000)` → false; `takeLease(db,'a',60_000)` → true (renew).
  - `an expired lease can be taken by anyone`: `takeLease(db,'a',1)`, wait 20 ms, then `takeLease(db,'b',60_000)` → true.
  - `releaseLease frees only the holder's lease`: `releaseLease(db,'b')` while `'a'` holds it → `takeLease(db,'b',…)` is still false; `releaseLease(db,'a')` → true.
  - `sent ids round-trip and prune`: record `'X1'`, then `recentSentIds(db, new Date(0))` contains `'X1'`; `pruneSentIds(db, new Date(Date.now()+1000))` → 1.
  - `setLastRun is visible on getWaStatus`: after `setLastRun(db,{ok:true,note:'ok'})`, `lastRunOk === true`, `lastRunNote === 'ok'`, and `lastRunAt` and `lastOkAt` are Dates. After a later `setLastRun(db,{ok:false,note:'x'})`, `lastOkAt` is unchanged.
  - `isWaLinked`: `{state:'connected', linkedPhone:'91…'}` → true. Each of `logged_out`, `wrong_number` and `qr` with a phone → false. `linkedPhone: null` → false.
- [ ] **Step 3: Run them and see them fail.** Run `npx vitest run packages/db/test/runs.test.ts`. Expected: FAIL, because the functions are not exported.
- [ ] **Step 4: Implement `runs.ts` and the schema/`WaStatus` changes.** `getWaStatus` maps the three new columns.
- [ ] **Step 5: Run the db tests and the typecheck.** Run `npx vitest run packages/db` and `npm run typecheck -w @family-wishes/db`. Expected: PASS. `migrate.test.ts` still lists every file.
- [ ] **Step 6: Commit.**

```bash
git add supabase/migrations/20261101000005_runner.sql packages/db
git commit -m "feat(db): WhatsApp lease, stored sent ids and last-run status"
```

---

## Phase 2: Runner package

### Task 3: Move the worker's shared code into `packages/runner`

**Files:**
- Create: `packages/runner/package.json`, `packages/runner/tsconfig.json` (same shape as `packages/db`), `packages/runner/src/index.ts`, `packages/runner/src/models.ts`
- Move with `git mv`, no behaviour change:
  - `apps/worker/src/{deps.ts,scheduler.ts,jobs/,wa/}` → `packages/runner/src/`
  - `apps/worker/test/*` → `packages/runner/test/`, except `env.test.ts`
- Modify:
  - `apps/worker/src/main.ts`: import from `@family-wishes/runner` and use `createModels`.
  - `apps/worker/package.json`: depend on `@family-wishes/runner`; `baileys`, `pino` and `drizzle-orm` move to the runner's dependencies with the same exact versions.
  - `vitest.config.ts` coverage: change the exclude `apps/worker/src/wa/connection.ts` to `packages/runner/src/wa/connection.ts`. Keep `apps/worker/src/**` in the include (it still holds `env.ts`).

**Interfaces:**
- Produces:
  - `@family-wishes/runner` exports `startConnection`, `startLoops`, `fastTick`, `slowTick`, `handleAdminReply` and `createModels`.
  - It exports the types `WorkerDeps`, `Messenger` and `OutgoingCard`.
- `createModels(env: { GEMINI_API_KEY: string; GEMINI_MODEL: string; GEMINI_IMAGE_MODEL: string; POLLINATIONS_API_KEY?: string; POLLINATIONS_IMAGE_MODEL: string }): { model: WishModel; cardModel: CardModel }`. It moves the two constructors out of `main.ts` unchanged.

- [ ] **Step 1: Do the moves and update relative imports.** Add the `@family-wishes/runner` package with `"exports": {".": "./src/index.ts"}`.
- [ ] **Step 2: Run `npm install`** so the new workspace is linked. Expected: `package-lock.json` gains `packages/runner`.
- [ ] **Step 3: Check nothing changed.** Run `npm test` and `npm run typecheck`. Expected: the same 372 tests pass, now partly under the `packages/runner` project, and the typecheck is clean.
- [ ] **Step 4: Commit.**

```bash
git add -A packages/runner apps/worker vitest.config.ts package.json package-lock.json
git commit -m "refactor: move WhatsApp connection and jobs into @family-wishes/runner"
```

### Task 4: Sent ids that survive across runs

**Files:**
- Modify: `packages/runner/src/wa/messenger.ts`, `packages/runner/src/wa/connection.ts`
- Test: `packages/runner/test/messenger.test.ts`, `packages/runner/test/incoming.test.ts`

**Interfaces:**
- Consumes: `recordSentId` and `recentSentIds` (Task 2).
- Produces:
  - `new SentIds(opts?: { limit?: number; persist?: (id: string) => Promise<void> })`.
  - `add(id: string): Promise<void>` stores the id in memory and then awaits `persist`.
  - `has(id: string): boolean`.
  - `seed(ids: string[]): void`.
  - The messenger awaits `sentIds.add(messageId)` **before** `sendMessage`, so the id is stored before the message can echo back.
  - `startConnection` builds its `SentIds` with `persist: (id) => recordSentId(db, id)` and seeds it from `recentSentIds(db, sevenDaysAgo)`.

- [ ] **Step 1: Write the failing tests.**
  - `the messenger stores the id before sending`: a `persist` spy and a fake socket record call order; expect `['persist:ID1', 'send:ID1']`.
  - `a reply echo from an earlier run is ignored once seeded`: a fresh `SentIds` with `seed(['OLD1'])`; `extractAdminReply` on a `fromMe` self-chat message with id `OLD1` → `null`.
  - Update the existing `SentIds` tests to `await add(…)`.
- [ ] **Step 2: Run them and see them fail.** Run `npx vitest run packages/runner/test/messenger.test.ts packages/runner/test/incoming.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement**, then run the same command. Expected: PASS.
- [ ] **Step 4: Commit.**

```bash
git commit -am "feat(runner): store sent message ids so echoes are ignored across runs"
```

### Task 5: Waiting for send acks and auth writes

**Files:**
- Create: `packages/runner/src/wa/acks.ts`
- Modify: `packages/runner/src/wa/authState.ts`
- Test: `packages/runner/test/acks.test.ts`, `packages/runner/test/authState.test.ts`

**Interfaces:**
- Produces:
  - `class PendingAcks` with:
    - `track(id: string): void`;
    - `onUpdate(updates: { key: { id?: string | null }; update: { status?: number | null } }[]): void`, which clears ids whose `status >= proto.WebMessageInfo.Status.SERVER_ACK`;
    - `waitAll(timeoutMs: number): Promise<{ unacked: string[] }>`.
  - `useDbAuthState(db)` additionally returns `flush(): Promise<void>`. It awaits every `keys.set` and `saveCreds` write started so far, including the fire-and-forget `creds.update` saves.

- [ ] **Step 1: Write the failing tests.**
  - `waitAll resolves once every tracked id is server-acked`: track `A` and `B`; `onUpdate` with status SERVER_ACK for both → `{ unacked: [] }`.
  - `waitAll gives up after the timeout and names what is missing`: track `A`, no update, `waitAll(30)` → `{ unacked: ['A'] }`.
  - `flush waits for in-flight key writes`: start `state.keys.set(...)` without awaiting, then `await flush()`; `readWaAuth` now finds the key.
- [ ] **Step 2: Run them and see them fail.** Run `npx vitest run packages/runner/test/acks.test.ts packages/runner/test/authState.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** `flush` keeps a `Set<Promise<unknown>>` of in-flight writes and awaits `Promise.allSettled` until the set is empty.
- [ ] **Step 4: Run the same command.** Expected: PASS.
- [ ] **Step 5: Commit.**

```bash
git commit -am "feat(runner): track send acks and flush pending auth writes"
```

### Task 6: One-shot connection

**Files:**
- Create: `packages/runner/src/wa/once.ts`
- Test: `packages/runner/test/once.test.ts`, using a fake socket: an `EventEmitter`-backed `ev`, `user`, `end`, `groupFetchAllParticipating`, `sendMessage` and `sendPresenceUpdate`.

**Interfaces:**
- Consumes: `SentIds` (Task 4), `PendingAcks` and `flush` (Task 5), `setWaStatus` (existing), `useDbAuthState`, `extractAdminReply`, `createHumanMessenger`.
- Produces:
  - `connectOnce(opts: ConnectOnceOptions): Promise<OnceResult>`, where `ConnectOnceOptions` has:
    - `db: Db`, `adminPhone: string`, `log: Logger`;
    - `mode: 'run' | 'link'`;
    - `timeouts: { openMs: number; pendingMs: number; linkMs: number }`;
    - `makeSocket?: SocketFactory` (defaults to `makeWASocket` with the Global Constraints options).
  - `OnceResult` is either:
    - `{ kind: 'open'; messenger: Messenger; replies: ReplyQueue; groups: WaGroup[]; close(): Promise<{ unacked: string[] }> }`, or
    - `{ kind: 'logged_out' | 'wrong_number' | 'timeout' }`.
  - `class ReplyQueue` with `take(): string[]`, which returns and clears the queued admin reply texts in arrival order.
  - `close()` does three things in order: wait for acks (10 s), `flush()` the auth writes, then `end()` the socket.
  - `REPLIES_OVER_WHATSAPP: boolean` in `packages/runner/src/config.ts`, set from the spike result (Task 1).

- [ ] **Step 1: Write the failing tests.**
  - `run mode resolves open after pending notifications and queues offline replies`:
    1. The fake emits `open`.
    2. It emits a `messages.upsert` (`type: 'notify'`) self-chat `ok` from the phone.
    3. It emits `{ receivedPendingNotifications: true }`.
    4. Expect the result to be `kind: 'open'`, with `replies.take()` equal to `['ok']`, and `wa_status` `connected` with `groups`.
  - `run mode never shows a QR`: the fake emits `{ qr: 'x' }`. Expect `kind: 'logged_out'`, `wa_status.qr === null`, `wa_status.state === 'logged_out'`, and `end()` called. (Review Focus 4)
  - `a loggedOut close clears the stored session`: the close has DisconnectReason `loggedOut`. Expect `kind: 'logged_out'` and `wa_auth` empty.
  - `link mode stores the QR and waits for the scan`: the fake emits `qr` and the test asserts `wa_status.qr === 'x'`; it then emits `open` and pending → `kind: 'open'`.
  - `wrong linked number sends nothing`: `user.id` is another phone. Expect `kind: 'wrong_number'` and no `sendMessage` calls.
  - `open never arrives`: `openMs: 30` → `kind: 'timeout'`.
  - `pending notifications never arrive`: still `kind: 'open'` after `pendingMs`.
  - `close waits for acks then flushes`: send one message through the messenger, emit its SERVER_ACK, then `close()`. Expect `{ unacked: [] }` and `end` called after the flush.
- [ ] **Step 2: Run them and see them fail.** Run `npx vitest run packages/runner/test/once.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement `connectOnce`.**
  - Seed `SentIds` from `recentSentIds(db, now − 7 days)` with `persist: recordSentId`.
  - In link mode, the timeout for `open` is `linkMs`; QR updates go to `wa_status` exactly as `startConnection` does today.
  - If `REPLIES_OVER_WHATSAPP` is false, `ReplyQueue` stays empty. `ensureDraftsFor`'s batch message (in `jobs/drafting.ts`) then ends with "Approve them at /admin/drafts" instead of asking for a reply.
- [ ] **Step 4: Run the same command.** Expected: PASS.
- [ ] **Step 5: Commit.**

```bash
git commit -am "feat(runner): one-shot WhatsApp connection with reply queue and clean close"
```

### Task 7: Lease helpers, and the always-on worker holds the lease

**Files:**
- Create: `packages/runner/src/lease.ts`
- Test: `packages/runner/test/lease.test.ts`
- Modify: `apps/worker/src/main.ts`

**Interfaces:**
- Consumes: `takeLease` and `releaseLease` (Task 2).
- Produces:
  - `LEASE_TTL_MS = 330_000`.
  - `waitForLease(db: Db, holder: string, opts: { ttlMs: number; waitMs: number; pollMs?: number }): Promise<boolean>`. `pollMs` defaults to 2 000.
  - `keepLease(db: Db, holder: string, opts: { ttlMs: number; renewEveryMs: number; onLost: () => void }): { stop(): Promise<void> }`. `stop` releases the lease.

- [ ] **Step 1: Write the failing tests.**
  - `waitForLease returns false at once when busy and waitMs is 0`.
  - `waitForLease gets the lease once the holder releases it`: `'a'` holds it; `release` after 50 ms; `waitForLease(db,'b',{waitMs:1000,pollMs:10})` → true.
  - `keepLease renews and calls onLost when someone else takes it`:
    1. Start `keepLease` for `'a'` with `ttlMs: 30, renewEveryMs: 10`.
    2. Expect a second holder to stay locked out for 100 ms.
    3. Force `'b'` in by expiring the row through SQL.
    4. Expect `onLost` to be called.
- [ ] **Step 2: Run them and see them fail.** Run `npx vitest run packages/runner/test/lease.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement the helpers.**
- [ ] **Step 4: Update `main.ts`.**
  - Before `startConnection`, call `waitForLease(db, 'always-on', { ttlMs: LEASE_TTL_MS, waitMs: Infinity })`, logging "waiting for a running Vercel run to finish" once a minute.
  - Then `keepLease(…, { renewEveryMs: 60_000, onLost: () => shutdown('lease lost') })`.
  - The shutdown path calls `lease.stop()`.
- [ ] **Step 5: Run the tests.** Run `npx vitest run packages/runner/test/lease.test.ts` and `npm run typecheck`. Expected: PASS.
- [ ] **Step 6: Commit.**

```bash
git commit -am "feat(runner): lease helpers; always-on worker holds the WhatsApp lease"
```

### Task 8: `runOnce`

**Files:**
- Create: `packages/runner/src/run.ts`
- Test: `packages/runner/test/run.test.ts`
- Modify:
  - `packages/runner/src/deps.ts`: add `deadline?: number`, in epoch ms.
  - `packages/runner/src/jobs/drafting.ts`: `createMissingDrafts` stops creating once `deps.now().getTime() >= deps.deadline`.
  - `packages/runner/src/index.ts`.

**Interfaces:**
- Consumes:
  - `connectOnce` and `OnceResult` (Task 6);
  - `waitForLease` and `LEASE_TTL_MS` (Task 7);
  - `releaseLease`, `setLastRun`, `pruneSentIds`, `getWaStatus` and `isWaLinked` (Task 2);
  - `fastTick`, `slowTick`, `handleAdminReply` and `recoverInterruptedSends` (existing).
- Produces:
  - `type RunTrigger = 'schedule' | 'login_code' | 'run_now' | 'post_now' | 'link'`.
  - `RUN_LIMITS: Record<RunTrigger, { waitForLeaseMs: number; budgetMs: number }>`, with the values from Global Constraints.
  - `interface RunContext`:
    - `db: Db`, `log: Logger`, `adminPhone: string`;
    - `model: WishModel | null`, `cardModel: CardModel | null`;
    - `backupDir: string | null`;
    - `now: () => Date`;
    - `connect: (mode: 'run' | 'link') => Promise<OnceResult>`.
  - `interface RunSummary`:
    - `status: 'done' | 'busy' | 'not_linked' | 'not_connected' | 'failed'`;
    - `replies: number`;
    - `durationMs: number`;
    - `note: string`. It is built only from status words and counts, or for `failed` the error's `message` cut to 200 characters. It never contains message or reply text.
  - `runOnce(ctx: RunContext, trigger: RunTrigger, limits: { waitForLeaseMs: number; budgetMs: number } = RUN_LIMITS[trigger]): Promise<RunSummary>`.
  - `createRunContext(env: RunnerEnv, db: Db, log: Logger): RunContext` wires the real `connectOnce` and `createModels`. `RunnerEnv` is `ADMIN_PHONE` plus the model env from Task 3, plus `BACKUP_DIR?: string`.

**Algorithm** (each numbered line is one helper, under 50 lines each):

```
1. holder = `${trigger}-${randomUUID()}`
   if !waitForLease(db, holder, {ttlMs: LEASE_TTL_MS, waitMs: limits.waitForLeaseMs}) → return busy
2. try:
   a. recoverInterruptedSends(deps)            // Review Focus 1
   b. if trigger !== 'link' and !isWaLinked(getWaStatus) → setLastRun(false,'not linked'); return not_linked
   c. session = connect(trigger === 'link' ? 'link' : 'run'); if kind !== 'open' → setLastRun(false, kind); return not_connected
   d. deps = { …ctx, messenger: session.messenger, deadline: start + limits.budgetMs }
   e. for text of session.replies.take(): handleAdminReply(text, deps)   // before any drafting
   f. fastTick(deps); if before deadline: slowTick(deps)
   g. drain: replies.take() → handleAdminReply; fastTick(deps)          // Review Focus 2 and 3
   h. pruneSentIds(db, now − 7 days); session.close(); setLastRun(true, summary note)
   catch → setLastRun(false, error message); return failed
   finally → releaseLease(db, holder)
```

- [ ] **Step 1: Write the failing tests** with `createTestDb`, `testDeps`-style fakes and a fake `connect` that returns `{ kind:'open', messenger: FakeMessenger, replies, groups: [], close }`:
  - `a busy lease skips the run without connecting`: another holder holds the lease, trigger `schedule` → `status: 'busy'` and `connect` not called.
  - `an unlinked account never connects`: `wa_status` is in its default state → `not_linked`, `connect` not called, and `lastRunOk === false`.
  - `admin replies are applied before tomorrow's drafts are sent`: at 20:30 with an event tomorrow, an open batch for today and queued reply `ok` → the self-chat answer "Approved: …" comes before the "Wishes for … — please check:" message.
  - `a code queued during the run goes out in the drain` (Review Focus 2): the fake `connect` enqueues an outbox row after `open`; after `runOnce` the FakeMessenger sent it to that phone.
  - `two runs started together never connect at the same time` (Review Focus 2):
    1. Run `Promise.all([runOnce(ctx,'schedule'), runOnce(ctx,'login_code',{waitForLeaseMs:5_000,budgetMs:200_000})])`, with a fake `connect` that takes 50 ms and counts `inFlight`.
    2. Expect `inFlight` never to go above 1.
    3. Expect the queued login code to be sent exactly once, whichever run took the lease first.
  - `a reply that arrives mid-run is answered before disconnect` (Review Focus 3): the fake pushes `ok` into `replies` while `fastTick` runs → the self-chat answer is sent, and `close` is called afterwards.
  - `a wish left sending by a killed run is failed, not resent` (Review Focus 1): seed an approved draft, `applyDraftAction(…,'claim')` → after `runOnce` at 08:30 the draft is `failed` and nothing went to the group.
  - `the lease is released after an error`: `connect` throws → `status: 'failed'`, then `takeLease(db,'other',1000)` → true.
  - `past the deadline no new drafts are written`: `runOnce(ctx,'schedule',{waitForLeaseMs:0,budgetMs:0})` → no drafts are created, and the run is still `done`.
  - `a link run connects in link mode even when not linked`: trigger `link` → `connect` called with `'link'`.
- [ ] **Step 2: Run them and see them fail.** Run `npx vitest run packages/runner/test/run.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement `run.ts`** and the `deadline` check in drafting.
- [ ] **Step 4: Run the runner suite.** Run `npx vitest run packages/runner`. Expected: PASS, with the moved scheduler and drafting tests unchanged.
- [ ] **Step 5: Commit.**

```bash
git commit -am "feat(runner): runOnce with lease, replies-first order, drain and time budget"
```

### Task 9: Weekly backup to the admin's self-chat

**Files:**
- Modify:
  - `packages/runner/src/wa/messenger.ts`: add `sendDocumentToSelf`.
  - `packages/runner/src/jobs/backup.ts`, `packages/runner/src/scheduler.ts`.
  - `packages/runner/src/deps.ts`: `backupDir: string | null`.
  - `packages/runner/test/fakes.ts`: `FakeMessenger.sendDocumentToSelf` records `{ to: 'self', text: fileName, document }`.
- Test: `packages/runner/test/backup.test.ts`, `packages/runner/test/scheduler.test.ts`

**Interfaces:**
- Produces:
  - `Messenger.sendDocumentToSelf(fileName: string, data: Uint8Array, mimeType: string): Promise<string>`, sent as a Baileys `{ document, fileName, mimetype }` without typing.
  - `sendBackupToSelf(deps: WorkerDeps): Promise<'sent' | 'too_large'>` sends `family-wishes-backup-<YYYY-MM-DD>.json`.
  - `BACKUP_DOC_MAX_BYTES = 10 * 1024 * 1024`.
  - The too-large message is "This week's backup is over 10 MB, so it wasn't sent. Export the tables from Supabase instead."
- In `slowTick`:
  - `backupDir !== null` keeps today's daily file backup.
  - `backupDir === null` runs `oncePerDay(deps, 'backup_self', today, …)` only when `today` is a Sunday (`new Date(`${today}T00:00:00Z`).getUTCDay() === 0`) and the time is at least `02:00`.

- [ ] **Step 1: Write the failing tests.**
  - `sendBackupToSelf sends the JSON export as a document`: the document's parsed JSON has the `members` key, and `fileName` is `family-wishes-backup-2026-12-06.json`.
  - `an export over 10 MB sends the warning instead`: inject `maxBytes: 10`.
  - `without a backup folder the backup goes to the self-chat on Sunday after 02:00, once`: a `slowTick` at Sun 2026-12-06 02:30 sends it, and a second `slowTick` doesn't.
  - `… not on other days`: a `slowTick` at Sat 2026-12-05 02:30 doesn't send it.
- [ ] **Step 2: Run them and see them fail.** Run `npx vitest run packages/runner/test/backup.test.ts packages/runner/test/scheduler.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement**, then run the same command. Expected: PASS.
- [ ] **Step 4: Commit.**

```bash
git commit -am "feat(runner): weekly JSON backup to the admin's self-chat when there is no disk"
```

---

## Phase 3: Website

### Task 10: The `/api/run` endpoint and backstop crons

**Files:**
- Create:
  - `apps/web/lib/run/auth.ts`
  - `apps/web/lib/run/start.ts`
  - `apps/web/app/api/run/route.ts`
  - `apps/web/vercel.json`
  - `apps/web/test/runAuth.test.ts`
- Modify:
  - `apps/web/lib/env.ts`: add `CRON_SECRET` (min 32, message `must be at least 32 characters`) and `LOG_LEVEL` (same enum and default as the worker).
  - `apps/web/test/` env test.
  - `apps/web/package.json`: add `"@family-wishes/runner": "*"` and `pino`.
  - `apps/web/next.config.ts`: add `@family-wishes/runner` to `transpilePackages`.
  - `apps/web/e2e/env.ts`: add `CRON_SECRET`.

**Interfaces:**
- Consumes: `runOnce`, `createRunContext`, `RunTrigger` and `RunSummary` (Task 8).
- Produces:
  - `isAuthorizedRunRequest(authorization: string | null, secret: string): boolean`. It expects `Bearer <secret>` and compares with `timingSafeEqual` on equal-length buffers; a different length → false.
  - `startRun(trigger: RunTrigger): Promise<RunSummary>`, server-only. It builds the context from `getWebEnv()` and `getDb()` with `backupDir: null`.
  - `scheduleRun(trigger: RunTrigger): void`. It calls `after(() => startRun(trigger))` and logs failures; it never throws into the action.
  - The route `GET /api/run` exports `maxDuration = 300` and `dynamic = 'force-dynamic'`.
    - Unauthorized → 401 `{ error: 'unauthorized' }`.
    - Otherwise → 200 with the `RunSummary` as JSON.
  - `vercel.json`: `{"regions":["bom1"],"crons":[{"path":"/api/run","schedule":"30 14 * * *"},{"path":"/api/run","schedule":"30 2 * * *"}]}`.

- [ ] **Step 1: Write the failing tests.**
  - `accepts the exact bearer secret`.
  - `rejects a missing header, the wrong scheme, a wrong secret and a secret of different length`.
  - The env test: `CRON_SECRET` shorter than 32 characters → throws, naming `CRON_SECRET`.
- [ ] **Step 2: Run them and see them fail.** Run `npx vitest run apps/web/test/runAuth.test.ts apps/web/test/env.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `auth.ts`, the env change, `start.ts`, the route and `vercel.json`.
- [ ] **Step 4: Run the unit tests, then build.** Run the same tests (expected: PASS), then `npx next build` in `apps/web`. Expected: success, with `/api/run` listed as `ƒ`. If bundling Baileys fails, add `baileys` to `serverExternalPackages` and rebuild.
- [ ] **Step 5: Try it locally.**
  1. Start `next dev` with a PGlite `DATABASE_URL`.
  2. `curl -H "Authorization: Bearer <secret>" http://localhost:3000/api/run` → `{"status":"not_linked",…}`.
  3. Without the header → 401.
- [ ] **Step 6: Commit.**

```bash
git commit -am "feat(web): /api/run scheduler endpoint with secret check and backstop crons"
```

### Task 11: Runs started by the website

**Files:**
- Modify:
  - `apps/web/lib/actions/auth.ts`: `requestCodeAction` calls `scheduleRun('login_code')` on every `'sent'` result, including unknown numbers, so the timing doesn't reveal who is a member. A run with an empty outbox is cheap.
  - `apps/web/lib/actions/admin.ts`: `runNowAction` calls `scheduleRun('run_now')` after `runNow` returns `ok`.
  - `apps/web/lib/actions/drafts.ts`: after the `post_now` result `ok`, call `scheduleRun('post_now')`.
  - `apps/web/lib/drafts.ts`: in `postNow`, `(await getWaStatus(db)).state !== 'connected'` becomes `!isWaLinked(await getWaStatus(db))`.
  - `apps/web/app/login/verify/page.tsx`: add the verify copy from Global Constraints.
  - Add `export const maxDuration = 300` to `app/login/page.tsx` and `app/admin/layout.tsx`.
  - `apps/web/test/draftActions.test.ts`.
- Test: `apps/web/test/draftActions.test.ts`

**Interfaces:**
- Consumes: `scheduleRun` (Task 10) and `isWaLinked` (Task 2).

- [ ] **Step 1: Write the failing tests.**
  - `post now works when linked even though no socket is open`: `wa_status` is `{state:'starting', linkedPhone: ADMIN}` after a previous run → `ok`, and a `send` job request exists.
  - `post now says not connected when WhatsApp was unlinked` (Review Focus 4): `{state:'logged_out', linkedPhone: null}` → `'not_connected'`, and the draft is unchanged.
- [ ] **Step 2: Run them and see them fail.** Run `npx vitest run apps/web/test/draftActions.test.ts`. Expected: the first test FAILS.
- [ ] **Step 3: Implement the changes listed under Files.**
- [ ] **Step 4: Run the unit tests, then E2E.** Run `npx vitest run apps/web` (expected: PASS), then `npm run e2e`. Expected: 1 passed. The scheduled runs in E2E return `not_linked` without network access.
- [ ] **Step 5: Commit.**

```bash
git commit -am "feat(web): start a WhatsApp run for login codes, post now and run now"
```

### Task 12: WhatsApp page and settings hint

**Files:**
- Create: `apps/web/lib/waStatus.ts`, `apps/web/test/waStatus.test.ts`
- Modify:
  - `apps/web/app/admin/page.tsx`: the Link button, the status line, the stale warning, and copy that no longer mentions a "worker on the server".
  - `apps/web/lib/actions/admin.ts`: add `linkWhatsAppAction`.
  - `apps/web/app/admin/settings/SettingsForm.tsx`: the hint.
  - `apps/web/e2e/smoke.spec.ts`.

**Interfaces:**
- Consumes: `WaStatus.lastRun*` and `isWaLinked` (Task 2); `scheduleRun('link')` (Task 10).
- Produces:
  - `nextCheckAt(now: Date): Date`, the next :00 or :30 strictly after `now`.
  - `describeRunStatus(status: WaStatus, now: Date): { linked: boolean; stale: boolean; lastCheck: Date | null; nextCheck: Date }`. `linked` is `isWaLinked(status)`. `stale` is true when `linked` and (`lastOkAt` is null, or `now − lastOkAt > 2 h`). `lastCheck` is `lastRunAt`.
  - `linkWhatsAppAction(_prev: NoticeState): Promise<NoticeState>`. It calls `requireAdmin()`, then `setWaStatus(db, { state: 'starting', qr: null })`, then `scheduleRun('link')`, and returns "Starting… a QR code appears here in a few seconds."

- [ ] **Step 1: Write the failing tests.**
  - `nextCheckAt rounds up to :00 or :30`: 14:07 → 14:30, 14:30 → 15:00, 23:45 → 00:00 the next day.
  - `a run that last succeeded 2 h 01 min ago is stale; 1 h 59 min ago is not` (Review Focus 5). A failed run 5 minutes ago doesn't reset the clock: `lastRunAt` is 5 min ago with `lastRunOk` false, and `lastOkAt` is 3 h ago → stale.
  - `an unlinked account is never stale` (the page shows the Link button instead).
  - Update the E2E smoke test to also visit `/admin` after signing in and expect the button `Link WhatsApp` to be visible.
- [ ] **Step 2: Run them and see them fail.** Run `npx vitest run apps/web/test/waStatus.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - The page shows `Linked to +{phone} · last checked {HH:MM} · next check by {HH:MM}` in the settings time zone.
  - It shows the stale warning from Global Constraints when `stale`.
  - It shows a `NoticeForm` with submit label **Link WhatsApp** when not linked, or when `state` is `logged_out`.
  - `RefreshWhileWaiting` is active while `state` is `starting` or `qr`.
  - Add the settings hint from Global Constraints.
- [ ] **Step 4: Run the checks.** Run `npx vitest run apps/web`, `npm run e2e` and `npm run lint -w @family-wishes/web`. Expected: all pass.
- [ ] **Step 5: Commit.**

```bash
git commit -am "feat(web): WhatsApp page shows last and next check, stale warning and Link button"
```

---

## Phase 4: Docs and go-live

### Task 13: Deployment guide and README

**Files:**
- Modify: `docs/deploy.md`, `README.md`

- [ ] **Step 1: Rewrite `docs/deploy.md`.**
  - **Section 3 → "Scheduler (cron-job.org)":**
    1. Create a free account.
    2. Create a job: URL `https://<domain>/api/run`, schedule every 30 minutes at :00 and :30, time zone Asia/Kolkata, header `Authorization: Bearer <CRON_SECRET>`, notify on failure.
    3. Test-run it and expect HTTP 200.
  - Mention the GitHub Actions fallback in one paragraph.
  - **Section 2:** add `CRON_SECRET` (`openssl rand -base64 48`) and `LOG_LEVEL` to the Vercel environment variables.
  - **Section 4 (Link WhatsApp):** press **Link WhatsApp**, scan within 3 minutes, then pick the group.
  - **Checklist:** add the spec's three new checks.
  - Move the Oracle and Google Cloud VM sections under **Appendix: always-on worker**.
- [ ] **Step 2: Update `README.md`.**
  - The mermaid diagram gets a scheduler node.
  - The "How it fits together" paragraph changes from "checks every 5 seconds" to "runs every 30 minutes and when the website needs it".
  - Add a sentence to the daily schedule: "times are checked at :00 and :30".
  - Local development: `npm run worker:dev` still works as the always-on mode, or call `/api/run` with curl.
- [ ] **Step 3: Commit.**

```bash
git commit -am "docs: deploy on Vercel with a 30-minute scheduler; VM moves to an appendix"
```

### Task 14: Deploy on the test number and run the 7-day account-health test

Manual. It gates switching to the real number, as in the spec.

- [ ] **Step 1: Deploy and link.** Run `npm run db:migrate` against Supabase. Deploy to Vercel with `CRON_SECRET`, create the cron-job.org job, and link the **test number** with **Link WhatsApp**.
- [ ] **Step 2: Run the go-live checklist** in `docs/deploy.md`, steps 2–6 plus the three new checks.
- [ ] **Step 3: Leave it running for 7 days** with normal use. Every day, note how many runs reached `open` (Vercel logs and `wa_status.last_run_note`), any `loggedOut` closes, and any WhatsApp warnings.
- [ ] **Step 4: Apply the spec's pass / extend / fail rules.**
  - **Pass:** switch to the real number (`docs/deploy.md`, "Switching from the test number").
  - **Fail:** add the "skip connecting when there's nothing to do" pre-check and repeat once. If it fails again, go back to approach C.
- [ ] **Step 5: Record the results** in the PR description. Merge `dev` → `main`.
