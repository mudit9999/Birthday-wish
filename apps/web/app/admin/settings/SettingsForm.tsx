'use client'

import { useActionState } from 'react'
import type { SettingsFormState } from '@/lib/actions/admin'

type Values = Record<'draft_time' | 'nudge_time' | 'send_time' | 'time_zone' | 'country_code' | 'ai_style', string>

function Err({ message }: { message?: string }) {
  return message ? <span className="error">{message}</span> : null
}

export function SettingsForm({
  action,
  values
}: {
  action: (prev: SettingsFormState, formData: FormData) => Promise<SettingsFormState>
  values: Values
}) {
  const [state, formAction, pending] = useActionState(action, { errors: {}, saved: false })
  const e = state.errors
  return (
    <form action={formAction} className="stack">
      <p className="muted">Times use the time zone below.</p>
      <div className="row">
        <label>
          Draft time
          <input name="draft_time" defaultValue={values.draft_time} inputMode="numeric" placeholder="20:00" />
          <Err message={e.draft_time} />
        </label>
        <label>
          Reminder
          <input name="nudge_time" defaultValue={values.nudge_time} inputMode="numeric" placeholder="07:00" />
          <Err message={e.nudge_time} />
        </label>
        <label>
          Post time
          <input name="send_time" defaultValue={values.send_time} inputMode="numeric" placeholder="08:00" />
          <Err message={e.send_time} />
        </label>
      </div>
      <div className="row">
        <label>
          Time zone
          <input name="time_zone" defaultValue={values.time_zone} />
          <Err message={e.time_zone} />
        </label>
        <label>
          Country code
          <input name="country_code" defaultValue={values.country_code} inputMode="numeric" maxLength={3} />
          <Err message={e.country_code} />
        </label>
      </div>
      <label>
        Wish style <span className="hint">How Gemini should write the wishes</span>
        <textarea name="ai_style" defaultValue={values.ai_style} maxLength={1000} />
        <Err message={e.ai_style} />
      </label>
      {e.form && <p className="error">{e.form}</p>}
      <button type="submit" disabled={pending}>
        {pending ? 'Saving…' : 'Save settings'}
      </button>
      {state.saved && (
        <p role="status" className="muted">
          Settings saved.
        </p>
      )}
    </form>
  )
}
