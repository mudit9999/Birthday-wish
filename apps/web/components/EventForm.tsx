'use client'

import { useActionState, useState } from 'react'
import type { EntryFormState } from '@/lib/actions/entries'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const DAYS = Array.from({ length: 31 }, (_, i) => String(i + 1))

function FieldError({ message }: { message?: string }) {
  return message ? <span className="error">{message}</span> : null
}

export function EventForm({
  action,
  initial,
  submitLabel
}: {
  action: (prev: EntryFormState, formData: FormData) => Promise<EntryFormState>
  initial: Record<string, string>
  submitLabel: string
}) {
  const [state, formAction, pending] = useActionState(action, { errors: {}, values: initial })
  const [type, setType] = useState(state.values.type ?? 'birthday')
  const v = state.values
  const e = state.errors
  const isSpecial = type === 'special'

  return (
    <form action={formAction} className="stack" noValidate>
      <label>
        What is it?
        <select name="type" value={type} onChange={(event) => setType(event.target.value)}>
          <option value="birthday">Birthday</option>
          <option value="anniversary">Anniversary</option>
          <option value="special">Special event</option>
        </select>
        <FieldError message={e.type} />
      </label>

      {isSpecial && (
        <label>
          Occasion
          <input name="title" defaultValue={v.title} placeholder="e.g. Housewarming" maxLength={100} />
          <FieldError message={e.title} />
        </label>
      )}

      <label>
        {type === 'anniversary' ? 'Couple' : isSpecial ? 'For whom' : 'Name'}
        <input
          name="names"
          defaultValue={v.names}
          required
          maxLength={100}
          placeholder={type === 'anniversary' ? 'e.g. Amit & Priya' : isSpecial ? 'e.g. Sharma family' : 'e.g. Rahul'}
        />
        <FieldError message={e.names} />
      </label>

      <label>
        What the family calls them <span className="hint">Optional, e.g. Nani, Mama ji, Chachu</span>
        <input name="familyCallsThem" defaultValue={v.familyCallsThem} maxLength={100} />
        <FieldError message={e.familyCallsThem} />
      </label>

      <div className="row">
        <label>
          Day
          <select name="day" defaultValue={v.day}>
            <option value="">–</option>
            {DAYS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <FieldError message={e.day} />
        </label>
        <label>
          Month
          <select name="month" defaultValue={v.month}>
            <option value="">–</option>
            {MONTHS.map((m, i) => (
              <option key={m} value={String(i + 1)}>
                {m}
              </option>
            ))}
          </select>
          <FieldError message={e.month} />
        </label>
      </div>

      {isSpecial ? (
        <fieldset>
          <legend>How often?</legend>
          <label>
            <input type="radio" name="repeatsYearly" value="true" defaultChecked={v.repeatsYearly !== 'false'} /> Repeats every year
          </label>
          <label>
            <input type="radio" name="repeatsYearly" value="false" defaultChecked={v.repeatsYearly === 'false'} /> One time only
          </label>
        </fieldset>
      ) : (
        <input type="hidden" name="repeatsYearly" value="true" />
      )}

      <label>
        Year{' '}
        <span className="hint">
          {isSpecial ? 'Needed for one-time events.' : 'Optional.'} Only you and the admin see it; wishes never mention age.
        </span>
        <input name="year" defaultValue={v.year} inputMode="numeric" pattern="[0-9]*" maxLength={4} />
        <FieldError message={e.year} />
      </label>

      <label>
        Note for the wish <span className="hint">Optional. Something the wish can mention, e.g. loves cricket</span>
        <textarea name="note" defaultValue={v.note} maxLength={300} />
        <FieldError message={e.note} />
      </label>

      {e.form && (
        <p role="alert" className="error">
          {e.form}
        </p>
      )}
      <button type="submit" disabled={pending}>
        {pending ? 'Saving…' : submitLabel}
      </button>
    </form>
  )
}
