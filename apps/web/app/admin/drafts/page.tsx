import { addDays, formatDateLabel, localDate, occurrenceLabel, type ISODate } from '@family-wishes/core'
import { cardTimes, getSettings, listDraftsForDates, occurrenceForDraft, type Db, type Draft } from '@family-wishes/db'
import { draftFormAction } from '@/lib/actions/drafts'
import { getDb } from '@/lib/db'
import { DraftCard } from './DraftCard'

const FAILED_LOOKBACK_DAYS = 7

async function labelFor(db: Db, draft: Draft): Promise<string> {
  const occurrence = await occurrenceForDraft(db, draft)
  return occurrence ? occurrenceLabel(occurrence) : `Wish ${draft.number}`
}

// The version query makes the browser fetch a replaced card instead of its cached copy.
function cardSrc(draftId: string, madeAt: Date | undefined): string | null {
  return madeAt ? `/admin/drafts/${draftId}/card?v=${madeAt.getTime()}` : null
}

async function Day({
  db,
  title,
  drafts,
  postsAt,
  empty,
  isToday = false
}: {
  db: Db
  title: string
  drafts: Draft[]
  postsAt: string
  empty: string
  isToday?: boolean
}) {
  const labels = await Promise.all(drafts.map((d) => labelFor(db, d)))
  const cards = await cardTimes(
    db,
    drafts.map((d) => d.id)
  )
  const waiting = drafts.filter((d) => d.status === 'pending').length
  return (
    <section className="section-gap">
      <div className="panel-head">
        <h2 style={{ fontSize: 18 }}>{title}</h2>
        {waiting > 0 && <span className="count">{waiting}</span>}
      </div>
      {drafts.length === 0 ? (
        <p className="empty">{empty}</p>
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
              postsAt={postsAt}
              isToday={isToday}
              cardSrc={cardSrc(d.id, cards.get(d.id))}
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
  const { timeZone, sendTime, draftTime } = await getSettings(db)
  const today = localDate(new Date(), timeZone)
  const tomorrow = addDays(today, 1)
  const dates: ISODate[] = Array.from({ length: FAILED_LOOKBACK_DAYS + 1 }, (_, i) => addDays(today, i - FAILED_LOOKBACK_DAYS + 1))
  const drafts = await listDraftsForDates(db, dates)
  const on = (date: ISODate) => drafts.filter((d) => d.occurrenceDate === date)
  const earlierFailed = drafts.filter((d) => d.occurrenceDate < today && d.status === 'failed')
  const waiting = drafts.filter((d) => d.status === 'pending' && d.occurrenceDate >= today).length

  return (
    <>
      <header className="title-row" style={{ marginBottom: 0 }}>
        <div>
          <h1 className="title">Drafts</h1>
          <p className="lede">
            {waiting === 0
              ? `Nothing is waiting for you. Approved wishes post at ${sendTime}.`
              : `${waiting} ${waiting === 1 ? 'wish is' : 'wishes are'} waiting for your OK. Unapproved drafts never post.`}
          </p>
        </div>
      </header>
      <Day db={db} title={`Today · ${formatDateLabel(today)}`} drafts={on(today)} postsAt={sendTime} empty="No wishes today." isToday />
      <Day
        db={db}
        title={`Tomorrow · ${formatDateLabel(tomorrow)}`}
        drafts={on(tomorrow)}
        postsAt={sendTime}
        empty={`Tomorrow’s drafts are written at ${draftTime}. Use “Draft tomorrow’s wishes” on the WhatsApp page to write them now.`}
      />
      {earlierFailed.length > 0 && (
        <Day db={db} title="Failed in the last week" drafts={earlierFailed} postsAt={sendTime} empty="" />
      )}
    </>
  )
}
