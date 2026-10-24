import Link from 'next/link'
import { SimpleForm } from '@/components/SimpleForm'
import { verifyCodeAction } from '@/lib/actions/auth'

export default async function VerifyPage({ searchParams }: PageProps<'/login/verify'>) {
  const { phone } = await searchParams
  const number = typeof phone === 'string' ? phone : ''
  return (
    <main>
      <h1>Enter your code</h1>
      <p className="notice">If this number is on the family list, a code is on its way on WhatsApp. It works for 10 minutes.</p>
      <SimpleForm action={verifyCodeAction} submitLabel="Sign in">
        <input type="hidden" name="phone" value={number} />
        <label>
          6-digit code
          <input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required autoFocus />
        </label>
      </SimpleForm>
      <p className="muted" style={{ marginTop: '2rem' }}>
        No code? <Link href="/login">Try again</Link>
      </p>
    </main>
  )
}
