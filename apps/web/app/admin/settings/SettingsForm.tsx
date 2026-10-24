'use client'

import { useActionState } from 'react'
import type { SettingsFormState } from '@/lib/actions/admin'

type Values = Record<'draft_time' | 'nudge_time' | 'send_time' | 'time_zone' | 'country_code' | 'ai_style', string>

function Err({ message }: { message?: string }) {
  return message ? <span className="error">{message}</span> : null
}

export function SettingsForm({
  action,
  values,
  cardImages,
  sample
}: {
  action: (prev: SettingsFormState, formData: FormData) => Promise<SettingsFormState>
  values: Values
  cardImages: boolean
  sample: string
}) {
  const [state, formAction, pending] = useActionState(action, { errors: {}, saved: false })
  const e = state.errors
  return (
    <form action={formAction}>
      <div className="settings-row">
        <div>
          <h2>Daily schedule</h2>
          <p className="desc">
            Drafts reach you at {values.draft_time}, a reminder at {values.nudge_time} if anything is still waiting, and approved wishes post at{' '}
            {values.send_time}. Times use the time zone below.
          </p>
        </div>
        <div className="panel form">
          <div className="pair">
            <label className="field">
              Drafts written
              <input name="draft_time" defaultValue={values.draft_time} inputMode="numeric" placeholder="20:00" className="num" />
              <Err message={e.draft_time} />
            </label>
            <label className="field">
              Morning reminder
              <input name="nudge_time" defaultValue={values.nudge_time} inputMode="numeric" placeholder="07:00" className="num" />
              <Err message={e.nudge_time} />
            </label>
          </div>
          <div className="pair">
            <label className="field">
              Wishes posted
              <input name="send_time" defaultValue={values.send_time} inputMode="numeric" placeholder="08:00" className="num" />
              <Err message={e.send_time} />
            </label>
            <label className="field">
              Time zone
              <input name="time_zone" defaultValue={values.time_zone} />
              <Err message={e.time_zone} />
            </label>
          </div>
        </div>
      </div>

      <div className="settings-row">
        <div>
          <h2>Phone numbers</h2>
          <p className="desc">Added to numbers typed without a country code, on sign-in and when adding members.</p>
        </div>
        <div className="panel form">
          <label className="field" style={{ maxWidth: 200 }}>
            Country code
            <input name="country_code" defaultValue={values.country_code} inputMode="numeric" maxLength={3} className="num" />
            <Err message={e.country_code} />
          </label>
        </div>
      </div>

      <div className="settings-row">
        <div>
          <h2>Wish style</h2>
          <p className="desc">How Gemini should write. If Gemini is unavailable, a simple template like this one is used instead:</p>
          <p className="message" style={{ marginTop: 12 }}>
            {sample}
            <span className="stamp">{values.send_time}</span>
          </p>
        </div>
        <div className="panel form">
          <label className="field">
            Style
            <textarea name="ai_style" defaultValue={values.ai_style} maxLength={1000} rows={5} />
            <Err message={e.ai_style} />
          </label>
        </div>
      </div>

      <div className="settings-row">
        <div>
          <h2>Greeting cards</h2>
          <p className="desc">
            Gemini draws a card for each occasion, and the wish posts as its caption in one message. You can redraw or remove a card on the
            Drafts page. If a card can’t be made, the wish posts as text.
          </p>
        </div>
        <div className="panel form">
          <label className="choice" style={{ alignSelf: 'flex-start' }}>
            <input type="checkbox" name="card_images" defaultChecked={cardImages} />
            Make a greeting card for every wish
          </label>
          {e.form && <p className="error">{e.form}</p>}
          <div className="buttons">
            <button type="submit" disabled={pending}>
              {pending ? 'Saving…' : 'Save settings'}
            </button>
            {state.saved && (
              <span role="status" className="muted" style={{ alignSelf: 'center' }}>
                Saved.
              </span>
            )}
          </div>
        </div>
      </div>
    </form>
  )
}
