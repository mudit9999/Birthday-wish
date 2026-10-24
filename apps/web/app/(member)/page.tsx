import { addDays, formatDateLabel, localDate, occurrenceLabel, upcoming } from '@family-wishes/core'
import { getSettings, listEvents, listFestivals } from '@family-wishes/db'
import Link from 'next/link'
import { getDb } from '@/lib/db'
import { requireMember } from '@/lib/guards'

const DAYS_AHEAD = 60

export default async function UpcomingPage() {
  const member = await requireMember()
  const db = await getDb()
  const { timeZone } = await getSettings(db)
  const today = localDate(new Date(), timeZone)
  const tomorrow = addDays(today, 1)
  const [events, festivals] = await Promise.all([
    listEvents(db),
    listFestivals(db, { from: today, to: addDays(today, DAYS_AHEAD - 1) })
  ])
  const items = upcoming(today, DAYS_AHEAD, events, festivals)

  return (
    <>
      <h1>Hello, {member.name}</h1>
      <p className="muted">The next {DAYS_AHEAD} days of family occasions and festivals.</p>
      {items.length === 0 ? (
        <p className="empty">
          Nothing coming up yet. <Link href="/entries/new">Add a birthday or anniversary</Link>.
        </p>
      ) : (
        <ul className="list">
          {items.map((item) => (
            <li key={`${item.date}-${item.kind === 'event' ? item.event.id : item.festival.id}`}>
              <span className="when">{formatDateLabel(item.date)}</span>
              <span className="what">
                {occurrenceLabel(item)}
                {item.date === today && <span className="tag">Today</span>}
                {item.date === tomorrow && <span className="tag">Tomorrow</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
