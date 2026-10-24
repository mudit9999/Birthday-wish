import { EntryLayout } from '@/components/EntryLayout'
import { EventForm } from '@/components/EventForm'
import { saveEntryAction } from '@/lib/actions/entries'
import { EMPTY_ENTRY } from '@/lib/entryForm'

export default function NewEntryPage() {
  return (
    <EntryLayout title="Add an entry" lede="A birthday, an anniversary or a special day for someone in the family.">
      <EventForm action={saveEntryAction.bind(null, null, '/entries')} initial={EMPTY_ENTRY} submitLabel="Save entry" />
    </EntryLayout>
  )
}
