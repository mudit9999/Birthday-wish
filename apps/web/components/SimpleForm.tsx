'use client'

import { useActionState, type ReactNode } from 'react'
import type { FormState } from '@/lib/actions/auth'

/** A form whose server action returns `{ error }`; shows the error and disables the button while pending. */
export function SimpleForm({
  action,
  submitLabel,
  children
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>
  submitLabel: string
  children: ReactNode
}) {
  const [state, formAction, pending] = useActionState(action, { error: null })
  return (
    <form action={formAction} className="form">
      {children}
      {state.error && (
        <p role="alert" className="error">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending}>
        {pending ? 'Please wait…' : submitLabel}
      </button>
    </form>
  )
}
