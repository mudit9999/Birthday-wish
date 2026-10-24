import { addDays, localDate, localTime, upcoming, type ISODate, type Occurrence } from '@family-wishes/core'
import { getSettings, listEvents, listFestivals } from '@family-wishes/db'
import Link from 'next/link'
import { DayStrip, OccasionRow } from '@/components/Occasions'
import { getDb } from '@/lib/db'
import { requireMember } from '@/lib/guards'
import { greetingFor, occasionParts, relativeDay } from '@/lib/present'

const DAYS_AHEAD = 60
const WEEK = 7
const DAY_MONTH = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })

function factLine(next: Occurrence | undefined, today: ISODate): string {
  if (!next) return `Nothing in the next ${DAYS_AHEAD} days yet.`
  const { who, what } = occasionParts(next)
  const when = relativeDay(today, next.date)
  return next.kind === 'festival' ? `${who} is ${when}.` : `${who}’s ${what.toLowerCase()} is ${when}.`
}

const shortDate = (date: ISODate) => DAY_MONTH.format(new Date(`${date}T00:00:00Z`))

export default async function UpcomingPage() {
  const member = await requireMember()
  const db = await getDb()
  const { timeZone, sendTime } = await getSettings(db)
  const now = new Date()
  const today = localDate(now, timeZone)
  const [events, festivals] = await Promise.all([
    listEvents(db),
    listFestivals(db, { from: today, to: addDays(today, DAYS_AHEAD - 1) })
  ])
  const items = upcoming(today, DAYS_AHEAD, events, festivals)
  const thisWeek = items.filter((o) => o.date < addDays(today, WEEK))
  const festivalCount = items.filter((o) => o.kind === 'festival').length
  const mine = events.filter((e) => e.addedBy === member.id).length
  const next = items[0]
  const half = Math.ceil(items.length / 2)

  return (
    <>
      <header className="title-row">
        <div>
          <h1 className="greeting">
            {greetingFor(localTime(now, timeZone))}, {member.name}.
          </h1>
          <p className="lede">
            <strong>{factLine(next, today)}</strong> Wishes go to the family group at {sendTime} once they’re approved.
          </p>
        </div>
        <Link className="button" href="/entries/new">
          Add an entry
        </Link>
      </header>

      <div className="grid">
        <section className="panel tile span-3">
          <h2 className="label">This week</h2>
          <p className="value">{thisWeek.length}</p>
          <p className="caption">{thisWeek.length === 0 ? 'A quiet week' : `Up to ${shortDate(addDays(today, WEEK - 1))}`}</p>
        </section>
        <section className="panel tile span-3">
          <h2 className="label">Next {DAYS_AHEAD} days</h2>
          <p className="value">{items.length}</p>
          <p className="caption">Birthdays, anniversaries and festivals</p>
        </section>
        <section className="panel tile span-3">
          <h2 className="label">Festivals ahead</h2>
          <p className="value">{festivalCount}</p>
          <p className="caption">In the next {DAYS_AHEAD} days</p>
        </section>
        <section className="panel tile span-3">
          <h2 className="label">You’ve added</h2>
          <p className="value">{mine}</p>
          <p className="caption">
            <Link href="/entries">See your entries</Link>
          </p>
        </section>

        <section className="panel span-9 stretch">
          <div className="panel-head">
            <h2>The next {DAYS_AHEAD} days</h2>
            <span className="end hover-hint">Hover a day for who it is</span>
          </div>
          <DayStrip from={today} days={DAYS_AHEAD} items={items} />
        </section>
        <section className="panel span-3 stretch next">
          <div className="panel-head">
            <h2>Next up</h2>
          </div>
          {next ? (
            <>
              <p className="date">{shortDate(next.date)}</p>
              <p className="who">{occasionParts(next).who}</p>
              <p className="muted">{occasionParts(next).what}</p>
              <p className="when">{relativeDay(today, next.date).replace(/^./, (c) => c.toUpperCase())}</p>
            </>
          ) : (
            <p className="muted">Nothing yet. Add a birthday and it will show here.</p>
          )}
        </section>

        <section className="panel span-12">
          <div className="panel-head">
            <h2>Coming up</h2>
            <span className="count">{items.length}</span>
          </div>
          {items.length === 0 ? (
            <p className="empty">
              Nothing in the next {DAYS_AHEAD} days. <Link href="/entries/new">Add a birthday or anniversary</Link> so it’s never missed.
            </p>
          ) : (
            <div className="grid">
              {[items.slice(0, half), items.slice(half)].map((column, i) => (
                <ul key={i} className="rows span-6">
                  {column.map((item) => (
                    <OccasionRow key={`${item.date}-${item.kind === 'event' ? item.event.id : item.festival.id}`} item={item} today={today} />
                  ))}
                </ul>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  )
}
