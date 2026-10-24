import { EventForm } from '@/components/EventForm'
import { saveEntryAction } from '@/lib/actions/entries'
import { EMPTY_ENTRY } from '@/lib/entryForm'

export default function NewEntryPage() {
  return (
    <>
      <h1>Add an entry</h1>
      <EventForm action={saveEntryAction.bind(null, null, '/entries')} initial={EMPTY_ENTRY} submitLabel="Save" />
    </>
  )
}
