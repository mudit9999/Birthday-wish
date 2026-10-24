import { occurrenceLabel } from '@family-wishes/core'
import { listEvents } from '@family-wishes/db'
import Link from 'next/link'
import { ConfirmSubmit } from '@/components/ConfirmSubmit'
import { deleteEntryAction } from '@/lib/actions/entries'
import { getDb } from '@/lib/db'
import { dayMonthLabel } from '@/lib/entryForm'
import { requireMember } from '@/lib/guards'

export default async function MyEntriesPage() {
  const member = await requireMember()
  const events = await listEvents(await getDb(), { addedBy: member.id })

  return (
    <>
      <h1>My entries</h1>
      <p>
        <Link className="button" href="/entries/new">
          Add an entry
        </Link>
      </p>
      {events.length === 0 ? (
        <p className="empty">You haven’t added anyone yet.</p>
      ) : (
        <ul className="list">
          {events.map((event) => (
            <li key={event.id}>
              <span className="when">{dayMonthLabel(event)}</span>
              <span className="what">{occurrenceLabel({ kind: 'event', date: '', event })}</span>
              <span className="actions">
                <Link href={`/entries/${event.id}/edit`}>Edit</Link>
                <form action={deleteEntryAction.bind(null, event.id, '/entries')}>
                  <ConfirmSubmit className="danger" message={`Delete ${event.names}?`}>
                    Delete
                  </ConfirmSubmit>
                </form>
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
