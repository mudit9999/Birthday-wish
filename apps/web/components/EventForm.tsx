'use client'

import { useActionState, useState } from 'react'
import type { EntryFormState } from '@/lib/actions/entries'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const DAYS = Array.from({ length: 31 }, (_, i) => String(i + 1))
const TYPES = [
  { value: 'birthday', label: 'Birthday' },
  { value: 'anniversary', label: 'Anniversary' },
  { value: 'special', label: 'Special event' }
]

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
    <form action={formAction} className="form" noValidate>
      <fieldset>
        <legend>What is it?</legend>
        {TYPES.map((t) => (
          <label key={t.value} className="choice">
            <input type="radio" name="type" value={t.value} checked={type === t.value} onChange={() => setType(t.value)} />
            {t.label}
          </label>
        ))}
        <FieldError message={e.type} />
      </fieldset>

      {isSpecial && (
        <label className="field">
          Occasion
          <input name="title" defaultValue={v.title} placeholder="e.g. Housewarming" maxLength={100} />
          <FieldError message={e.title} />
        </label>
      )}

      <label className="field">
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

      <label className="field">
        What the family calls them
        <span className="hint">Optional, e.g. Nani, Mama ji, Chachu. The wish uses this name.</span>
        <input name="familyCallsThem" defaultValue={v.familyCallsThem} maxLength={100} />
        <FieldError message={e.familyCallsThem} />
      </label>

      <div className="pair">
        <label className="field">
          Day
          <select name="day" defaultValue={v.day}>
            <option value="">Choose</option>
            {DAYS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <FieldError message={e.day} />
        </label>
        <label className="field">
          Month
          <select name="month" defaultValue={v.month}>
            <option value="">Choose</option>
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
          <label className="choice">
            <input type="radio" name="repeatsYearly" value="true" defaultChecked={v.repeatsYearly !== 'false'} />
            Every year
          </label>
          <label className="choice">
            <input type="radio" name="repeatsYearly" value="false" defaultChecked={v.repeatsYearly === 'false'} />
            One time only
          </label>
        </fieldset>
      ) : (
        <input type="hidden" name="repeatsYearly" value="true" />
      )}

      <label className="field">
        Year
        <span className="hint">
          {isSpecial ? 'Needed for a one-time event.' : 'Optional.'} Only you and the admin see it; wishes never mention age.
        </span>
        <input name="year" defaultValue={v.year} inputMode="numeric" pattern="[0-9]*" maxLength={4} className="num" style={{ maxWidth: 160 }} />
        <FieldError message={e.year} />
      </label>

      <label className="field">
        Note for the wish
        <span className="hint">Optional. Something the wish can mention, e.g. loves cricket.</span>
        <textarea name="note" defaultValue={v.note} maxLength={300} />
        <FieldError message={e.note} />
      </label>

      {e.form && (
        <p role="alert" className="error">
          {e.form}
        </p>
      )}
      <div className="buttons">
        <button type="submit" disabled={pending}>
          {pending ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  )
}
