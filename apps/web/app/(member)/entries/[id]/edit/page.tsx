import { getEvent } from '@family-wishes/db'
import { notFound } from 'next/navigation'
import { EventForm } from '@/components/EventForm'
import { saveEntryAction } from '@/lib/actions/entries'
import { getDb } from '@/lib/db'
import { entryFormValues, safeReturnPath } from '@/lib/entryForm'
import { requireMember } from '@/lib/guards'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function EditEntryPage({ params, searchParams }: PageProps<'/entries/[id]/edit'>) {
  const { id } = await params
  const { back } = await searchParams
  const member = await requireMember()
  const event = UUID.test(id) ? await getEvent(await getDb(), id) : null
  if (!event || (!member.isAdmin && event.addedBy !== member.id)) notFound()

  return (
    <>
      <h1>Edit entry</h1>
      <EventForm
        action={saveEntryAction.bind(null, event.id, safeReturnPath(typeof back === 'string' ? back : undefined, '/entries'))}
        initial={entryFormValues(event)}
        submitLabel="Save changes"
      />
    </>
  )
}
