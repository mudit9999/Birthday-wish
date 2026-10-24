import { sql } from 'drizzle-orm'
import {
  boolean,
  date,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uuid
} from 'drizzle-orm/pg-core'

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
const timestamptz = (name: string) => timestamp(name, { withTimezone: true })

export const members = pgTable('members', {
  id: uuid('id').primaryKey().defaultRandom(),
  phone: text('phone').notNull().unique(),
  name: text('name').notNull(),
  isAdmin: boolean('is_admin').notNull().default(false),
  createdAt: createdAt()
})

export const events = pgTable('events', {
  id: uuid('id').primaryKey().defaultRandom(),
  type: text('type', { enum: ['birthday', 'anniversary', 'special'] }).notNull(),
  names: text('names').notNull(),
  familyCallsThem: text('family_calls_them'),
  title: text('title'),
  day: smallint('day').notNull(),
  month: smallint('month').notNull(),
  year: smallint('year'),
  repeatsYearly: boolean('repeats_yearly').notNull().default(true),
  note: text('note'),
  archived: boolean('archived').notNull().default(false),
  addedBy: uuid('added_by').references(() => members.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
  updatedAt: timestamptz('updated_at')
})

export const festivals = pgTable(
  'festivals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    date: date('date', { mode: 'string' }).notNull(),
    createdAt: createdAt()
  },
  (t) => [unique().on(t.name, t.date)]
)

export const drafts = pgTable(
  'drafts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    occurrenceDate: date('occurrence_date', { mode: 'string' }).notNull(),
    eventId: uuid('event_id').references(() => events.id, { onDelete: 'cascade' }),
    festivalId: uuid('festival_id').references(() => festivals.id, { onDelete: 'cascade' }),
    number: smallint('number').notNull(),
    text: text('text').notNull(),
    source: text('source', { enum: ['ai', 'template', 'admin'] }).notNull(),
    status: text('status', {
      enum: ['pending', 'approved', 'sending', 'sent', 'skipped', 'expired', 'failed']
    }).notNull(),
    error: text('error'),
    sentMessageId: text('sent_message_id'),
    createdAt: createdAt(),
    updatedAt: timestamptz('updated_at'),
    approvedAt: timestamptz('approved_at'),
    sentAt: timestamptz('sent_at')
  },
  (t) => [
    unique().on(t.occurrenceDate, t.eventId),
    unique().on(t.occurrenceDate, t.festivalId),
    unique().on(t.occurrenceDate, t.number)
  ]
)

export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  createdAt: createdAt()
})

export const loginCodes = pgTable('login_codes', {
  id: uuid('id').primaryKey().defaultRandom(),
  phone: text('phone').notNull(),
  codeHash: text('code_hash').notNull(),
  expiresAt: timestamptz('expires_at').notNull(),
  attempts: smallint('attempts').notNull().default(0),
  createdAt: createdAt()
})

export const sessions = pgTable('sessions', {
  tokenHash: text('token_hash').primaryKey(),
  memberId: uuid('member_id')
    .notNull()
    .references(() => members.id, { onDelete: 'cascade' }),
  expiresAt: timestamptz('expires_at').notNull(),
  createdAt: createdAt()
})

export const outbox = pgTable('outbox', {
  id: uuid('id').primaryKey().defaultRandom(),
  toPhone: text('to_phone').notNull(),
  body: text('body').notNull(),
  status: text('status', { enum: ['queued', 'sending', 'sent', 'failed'] })
    .notNull()
    .default('queued'),
  error: text('error'),
  sentAt: timestamptz('sent_at'),
  createdAt: createdAt()
})

export const waAuth = pgTable('wa_auth', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  createdAt: createdAt(),
  updatedAt: timestamptz('updated_at')
})

export const waStatus = pgTable('wa_status', {
  id: smallint('id').primaryKey(),
  state: text('state').notNull().default('starting'),
  qr: text('qr'),
  groups: jsonb('groups').notNull().default(sql`'[]'::jsonb`),
  linkedPhone: text('linked_phone'),
  createdAt: createdAt(),
  updatedAt: timestamptz('updated_at')
})

export const jobRuns = pgTable(
  'job_runs',
  {
    job: text('job').notNull(),
    runDate: date('run_date', { mode: 'string' }).notNull(),
    ranAt: timestamptz('ran_at').notNull().defaultNow(),
    createdAt: createdAt()
  },
  (t) => [primaryKey({ columns: [t.job, t.runDate] })]
)

export const jobRequests = pgTable('job_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  job: text('job', { enum: ['draft', 'send'] }).notNull(),
  requestedAt: timestamptz('requested_at').notNull().defaultNow(),
  doneAt: timestamptz('done_at'),
  createdAt: createdAt()
})
