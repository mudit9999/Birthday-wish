import { occurrenceLabel } from '@family-wishes/core'
import { listEvents, listMembers } from '@family-wishes/db'
import Link from 'next/link'
import { ConfirmSubmit } from '@/components/ConfirmSubmit'
import { deleteEntryAction } from '@/lib/actions/entries'
import { getDb } from '@/lib/db'
import { dayMonthLabel } from '@/lib/entryForm'
import { personTint } from '@/lib/present'

export default async function AllEntriesPage() {
  const db = await getDb()
  const [events, members] = await Promise.all([listEvents(db, { includeArchived: true }), listMembers(db)])
  const nameOf = new Map(members.map((m) => [m.id, m.name]))
  const archived = events.filter((e) => e.archived).length

  return (
    <>
      <header className="title-row">
        <div>
          <h1 className="title">All entries</h1>
          <p className="lede">
            {events.length} {events.length === 1 ? 'entry' : 'entries'} from the whole family{archived > 0 ? `, ${archived} of them past one-time events` : ''}. Only you can see the years here.
          </p>
        </div>
        <Link className="button" href="/entries/new">
          Add an entry
        </Link>
      </header>
      <section className="panel">
        <div className="panel-head">
          <h2>Everyone</h2>
          <span className="count">{events.length}</span>
        </div>
        {events.length === 0 ? (
          <p className="empty">No entries yet.</p>
        ) : (
          <ul className="rows">
            {events.map((event) => (
              <li key={event.id} className="row">
                <span className="avatar" style={{ background: personTint(event.names) }} aria-hidden="true">
                  {event.names.charAt(0).toUpperCase()}
                </span>
                <span className="body">
                  <span className="line1" style={{ display: 'block' }}>
                    {occurrenceLabel({ kind: 'event', date: '', event })}
                  </span>
                  <span className="line2" style={{ display: 'block' }}>
                    Added by {event.addedBy ? (nameOf.get(event.addedBy) ?? 'a removed member') : 'nobody'}
                    {event.note ? ` · ${event.note}` : ''}
                  </span>
                </span>
                {event.archived && <span className="pill">Past</span>}
                <span className="meta">
                  <strong>{dayMonthLabel(event)}</strong>
                  {event.year ?? '—'}
                </span>
                <span className="actions">
                  <Link className="button secondary" href={`/entries/${event.id}/edit?back=/admin/entries`}>
                    Edit
                  </Link>
                  <form action={deleteEntryAction.bind(null, event.id, '/admin/entries')}>
                    <ConfirmSubmit className="danger" message={`Delete ${event.names}?`}>
                      Delete
                    </ConfirmSubmit>
                  </form>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}
