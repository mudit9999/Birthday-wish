import Link from 'next/link'
import { AuthFrame } from '@/components/AuthFrame'
import { SimpleForm } from '@/components/SimpleForm'
import { verifyCodeAction } from '@/lib/actions/auth'

export default async function VerifyPage({ searchParams }: PageProps<'/login/verify'>) {
  const { phone } = await searchParams
  const number = typeof phone === 'string' ? phone : ''
  return (
    <AuthFrame>
      <h1 className="title">Enter your code</h1>
      <p className="notice info">If this number is on the family list, a code is on its way on WhatsApp. It works for 10 minutes.</p>
      <SimpleForm action={verifyCodeAction} submitLabel="Sign in">
        <input type="hidden" name="phone" value={number} />
        <label className="field">
          6-digit code
          <input
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            autoFocus
            className="num"
            style={{ fontSize: 22, letterSpacing: '0.3em' }}
          />
        </label>
      </SimpleForm>
      <p className="auth-foot">
        No message? <Link href="/login">Ask for a new code</Link>
      </p>
    </AuthFrame>
  )
}
