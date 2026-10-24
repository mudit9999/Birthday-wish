import { occurrenceLabel } from '@family-wishes/core'
import { listEvents } from '@family-wishes/db'
import Link from 'next/link'
import { ConfirmSubmit } from '@/components/ConfirmSubmit'
import { deleteEntryAction } from '@/lib/actions/entries'
import { getDb } from '@/lib/db'
import { dayMonthLabel } from '@/lib/entryForm'
import { requireMember } from '@/lib/guards'
import { personTint } from '@/lib/present'

export default async function MyEntriesPage() {
  const member = await requireMember()
  const events = await listEvents(await getDb(), { addedBy: member.id })

  return (
    <>
      <header className="title-row">
        <div>
          <h1 className="title">My entries</h1>
          <p className="lede">
            {events.length === 0
              ? 'You haven’t added anyone yet.'
              : `${events.length} ${events.length === 1 ? 'person or occasion' : 'people and occasions'} you look after, in calendar order.`}
          </p>
        </div>
        <Link className="button" href="/entries/new">
          Add an entry
        </Link>
      </header>
      <section className="panel">
        <div className="panel-head">
          <h2>Your entries</h2>
          <span className="count">{events.length}</span>
        </div>
        {events.length === 0 ? (
          <p className="empty">
            Start with someone whose birthday is coming up. <Link href="/entries/new">Add an entry</Link>
          </p>
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
                    {dayMonthLabel(event)}
                    {event.note ? ` · ${event.note}` : ''}
                  </span>
                </span>
                <span className="actions">
                  <Link className="button secondary" href={`/entries/${event.id}/edit`}>
                    Edit
                  </Link>
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
      </section>
    </>
  )
}
