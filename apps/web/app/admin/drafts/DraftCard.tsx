'use client'

import Image from 'next/image'
import { useActionState, useState } from 'react'
import type { NoticeState } from '@/lib/actions/admin'

export type DraftCardProps = {
  number: number
  label: string
  status: string
  source: string
  error: string | null
  text: string
  postsAt: string
  isToday: boolean
  cardSrc: string | null
  action: (prev: NoticeState, formData: FormData) => Promise<NoticeState>
}

const OPEN = ['pending', 'approved', 'skipped', 'failed']
const STATUS: Record<string, { label: string; pill: string }> = {
  pending: { label: 'Waiting for you', pill: 'warning' },
  approved: { label: 'Approved', pill: 'positive' },
  sending: { label: 'Sending', pill: 'accent' },
  sent: { label: 'Posted', pill: 'positive' },
  skipped: { label: 'Skipped', pill: '' },
  expired: { label: 'Expired', pill: '' },
  failed: { label: 'Failed', pill: 'negative' }
}
const SOURCE: Record<string, string> = { ai: 'Written by Gemini', template: 'Template (AI unavailable)', admin: 'Your text' }

export function DraftCard({ number, label, status, source, error, text, postsAt, isToday, cardSrc, action }: DraftCardProps) {
  const [state, formAction, pending] = useActionState(action, { message: null, error: false })
  const [intent, setIntent] = useState<string | null>(null)
  const open = OPEN.includes(status)
  const s = STATUS[status] ?? { label: status, pill: '' }
  const card = cardSrc && (
    <Image src={cardSrc} alt={`Greeting card for ${label}`} width={360} height={480} unoptimized className="card-image" />
  )

  return (
    <article className="panel">
      <div className="panel-head">
        <h3 style={{ fontSize: 16, fontWeight: 500 }}>
          <span className="num muted">{number}.</span> {label}
        </h3>
        <span className={`pill ${s.pill}`} style={{ marginLeft: 'auto' }}>
          {s.label}
        </span>
      </div>
      <form action={formAction} className="draft" onClickCapture={(event) => {
        const button = (event.target as HTMLElement).closest('button')
        if (button?.name === 'intent') setIntent(button.value)
      }}>
        <div className="form">
          {open ? (
            <>
              {card}
              <textarea name="text" defaultValue={text} aria-label={`Wish ${number}`} rows={5} className="message-edit" />
            </>
          ) : (
            <div className="message">
              {card}
              <p>{text}</p>
              <span className="stamp">{postsAt}</span>
            </div>
          )}
          {error && <p className="error">{error}</p>}
          {status === 'failed' && <p className="muted">Check the group first — it may have posted.</p>}
          {pending && intent === 'card_new' && (
            <p role="status" className="muted">
              Gemini is drawing the card. This takes up to a minute…
            </p>
          )}
          {!pending && state.message && (
            <p role="status" className={state.error ? 'error' : 'muted'}>
              {state.message}
            </p>
          )}
        </div>
        <div className="stack">
          <dl className="facts" style={{ margin: 0 }}>
            <div>
              <dt>Posts at</dt>
              <dd className="num">{postsAt}</dd>
            </div>
            <div>
              <dt>Words</dt>
              <dd>{SOURCE[source] ?? source}</dd>
            </div>
            <div>
              <dt>Posts as</dt>
              <dd>{cardSrc ? 'Card with the wish as its caption' : 'Text only'}</dd>
            </div>
          </dl>
          {open && (
            <div className="buttons">
              {isToday && (
                <button
                  type="submit"
                  name="intent"
                  value="post_now"
                  disabled={pending}
                  onClick={(event) => {
                    if (!window.confirm('Post this wish to the family group now?')) event.preventDefault()
                  }}
                >
                  Approve &amp; post now
                </button>
              )}
              <button
                type="submit"
                name="intent"
                value="approve"
                className={isToday ? 'secondary' : undefined}
                disabled={pending || status === 'approved'}
              >
                Approve
              </button>
              <button type="submit" name="intent" value="edit" className="secondary" disabled={pending}>
                Save my edit
              </button>
              <button type="submit" name="intent" value="redo" className="secondary" disabled={pending}>
                Write again
              </button>
              <button type="submit" name="intent" value="skip" className="text" disabled={pending || status === 'skipped'}>
                Skip this one
              </button>
            </div>
          )}
          {open && (
            <div className="buttons">
              <button type="submit" name="intent" value="card_new" className="secondary" disabled={pending}>
                {cardSrc ? 'New card' : 'Make a card'}
              </button>
              {cardSrc && (
                <button type="submit" name="intent" value="card_remove" className="text" disabled={pending}>
                  Remove card
                </button>
              )}
            </div>
          )}
        </div>
      </form>
    </article>
  )
}
