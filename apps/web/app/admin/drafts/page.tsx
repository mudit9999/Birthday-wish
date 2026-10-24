import { addDays, formatDateLabel, localDate, occurrenceLabel, type ISODate } from '@family-wishes/core'
import { getSettings, listDraftsForDates, occurrenceForDraft, type Db, type Draft } from '@family-wishes/db'
import { draftFormAction } from '@/lib/actions/drafts'
import { getDb } from '@/lib/db'
import { DraftCard } from './DraftCard'

const FAILED_LOOKBACK_DAYS = 7

async function labelFor(db: Db, draft: Draft): Promise<string> {
  const occurrence = await occurrenceForDraft(db, draft)
  return occurrence ? occurrenceLabel(occurrence) : `Wish ${draft.number}`
}

async function Section({ db, title, drafts }: { db: Db; title: string; drafts: Draft[] }) {
  const labels = await Promise.all(drafts.map((d) => labelFor(db, d)))
  return (
    <section>
      <h2>{title}</h2>
      {drafts.length === 0 ? (
        <p className="empty">No wishes.</p>
      ) : (
        <div className="stack">
          {drafts.map((d, i) => (
            <DraftCard
              key={d.id}
              number={d.number}
              label={labels[i] ?? ''}
              status={d.status}
              source={d.source}
              error={d.error}
              text={d.text}
              action={draftFormAction.bind(null, d.id)}
            />
          ))}
        </div>
      )}
    </section>
  )
}

export default async function DraftsPage() {
  const db = await getDb()
  const { timeZone, sendTime } = await getSettings(db)
  const today = localDate(new Date(), timeZone)
  const tomorrow = addDays(today, 1)
  const dates: ISODate[] = Array.from({ length: FAILED_LOOKBACK_DAYS + 1 }, (_, i) => addDays(today, i - FAILED_LOOKBACK_DAYS + 1))
  const drafts = await listDraftsForDates(db, dates)
  const on = (date: ISODate) => drafts.filter((d) => d.occurrenceDate === date)
  const earlierFailed = drafts.filter((d) => d.occurrenceDate < today && d.status === 'failed')

  return (
    <>
      <h1>Drafts</h1>
      <p className="muted">Approved wishes post at {sendTime}. Unapproved drafts never post.</p>
      <Section db={db} title={`Today · ${formatDateLabel(today)}`} drafts={on(today)} />
      <Section db={db} title={`Tomorrow · ${formatDateLabel(tomorrow)}`} drafts={on(tomorrow)} />
      {earlierFailed.length > 0 && <Section db={db} title="Failed in the last week" drafts={earlierFailed} />}
    </>
  )
}
