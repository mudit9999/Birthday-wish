import { occurrenceLabel } from '@family-wishes/core'
import { listEvents, listMembers } from '@family-wishes/db'
import Link from 'next/link'
import { ConfirmSubmit } from '@/components/ConfirmSubmit'
import { deleteEntryAction } from '@/lib/actions/entries'
import { getDb } from '@/lib/db'
import { dayMonthLabel } from '@/lib/entryForm'

export default async function AllEntriesPage() {
  const db = await getDb()
  const [events, members] = await Promise.all([listEvents(db, { includeArchived: true }), listMembers(db)])
  const nameOf = new Map(members.map((m) => [m.id, m.name]))

  return (
    <>
      <h1>All entries</h1>
      <p className="muted">Only you can see years here. Wishes never mention them.</p>
      <p>
        <Link className="button" href="/entries/new">
          Add an entry
        </Link>
      </p>
      <ul className="list">
        {events.map((event) => (
          <li key={event.id}>
            <span className="when">
              {dayMonthLabel(event)}
              {event.year !== null && ` ${event.year}`}
            </span>
            <span className="what">
              {occurrenceLabel({ kind: 'event', date: '', event })}
              {event.archived && <span className="tag">archived</span>}
              <br />
              <span className="muted">Added by {event.addedBy ? (nameOf.get(event.addedBy) ?? 'removed member') : 'nobody'}</span>
            </span>
            <span className="actions">
              <Link href={`/entries/${event.id}/edit?back=/admin/entries`}>Edit</Link>
              <form action={deleteEntryAction.bind(null, event.id, '/admin/entries')}>
                <ConfirmSubmit className="danger" message={`Delete ${event.names}?`}>
                  Delete
                </ConfirmSubmit>
              </form>
            </span>
          </li>
        ))}
      </ul>
    </>
  )
}
