import Link from 'next/link'
import { redirect } from 'next/navigation'
import { SimpleForm } from '@/components/SimpleForm'
import { requestCodeAction } from '@/lib/actions/auth'
import { getCurrentMember } from '@/lib/guards'

export default async function LoginPage() {
  if (await getCurrentMember()) redirect('/')
  return (
    <main>
      <h1>Family Wishes</h1>
      <p className="muted">Sign in with the mobile number the family has on its list. We’ll send a code on WhatsApp.</p>
      <SimpleForm action={requestCodeAction} submitLabel="Send me a code">
        <label>
          Mobile number
          <input name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="98765 43210" required />
        </label>
      </SimpleForm>
      <p className="muted" style={{ marginTop: '2rem' }}>
        <Link href="/login/admin">Admin sign-in</Link>
      </p>
    </main>
  )
}
