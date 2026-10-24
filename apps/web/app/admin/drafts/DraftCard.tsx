'use client'

import { useActionState } from 'react'
import type { NoticeState } from '@/lib/actions/admin'

export type DraftCardProps = {
  number: number
  label: string
  status: string
  source: string
  error: string | null
  text: string
  action: (prev: NoticeState, formData: FormData) => Promise<NoticeState>
}

const OPEN = ['pending', 'approved', 'skipped', 'failed']

export function DraftCard({ number, label, status, source, error, text, action }: DraftCardProps) {
  const [state, formAction, pending] = useActionState(action, { message: null, error: false })
  const open = OPEN.includes(status)
  return (
    <article className="card">
      <header>
        <strong>
          {number}) {label}
        </strong>
        <span className={`badge status-${status}`}>{status}</span>
        {source !== 'ai' && <span className="tag">{source === 'admin' ? 'your text' : 'template'}</span>}
      </header>
      {error && <p className="error">{error}</p>}
      <form action={formAction} className="stack">
        <textarea name="text" defaultValue={text} readOnly={!open} aria-label={`Wish ${number} text`} rows={4} />
        {open && (
          <div className="buttons">
            <button type="submit" name="intent" value="approve" disabled={pending || status === 'approved'}>
              Approve
            </button>
            <button type="submit" name="intent" value="edit" className="secondary" disabled={pending}>
              Save and approve
            </button>
            <button type="submit" name="intent" value="redo" className="secondary" disabled={pending}>
              Redo
            </button>
            <button type="submit" name="intent" value="skip" className="danger" disabled={pending || status === 'skipped'}>
              Skip
            </button>
          </div>
        )}
        {status === 'failed' && <p className="muted">Check the group first — it may have posted.</p>}
        {state.message && (
          <p role="status" className={state.error ? 'error' : 'muted'}>
            {state.message}
          </p>
        )}
      </form>
    </article>
  )
}
