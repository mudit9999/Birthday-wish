'use client'

import { useActionState, type ReactNode } from 'react'
import type { NoticeState } from '@/lib/actions/admin'

/** A form whose server action returns a short notice shown under the button. */
export function NoticeForm({
  action,
  submitLabel,
  className,
  children
}: {
  action: (prev: NoticeState, formData: FormData) => Promise<NoticeState>
  submitLabel: string
  className?: string
  children?: ReactNode
}) {
  const [state, formAction, pending] = useActionState(action, { message: null, error: false })
  return (
    <form action={formAction} className="form">
      {children}
      <div className="buttons">
        <button type="submit" className={className} disabled={pending}>
          {pending ? 'Please wait…' : submitLabel}
        </button>
      </div>
      {state.message && (
        <p role="status" className={state.error ? 'error' : 'muted'}>
          {state.message}
        </p>
      )}
    </form>
  )
}
