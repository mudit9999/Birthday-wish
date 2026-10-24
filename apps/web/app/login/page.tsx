import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AuthFrame } from '@/components/AuthFrame'
import { SimpleForm } from '@/components/SimpleForm'
import { requestCodeAction } from '@/lib/actions/auth'
import { getCurrentMember } from '@/lib/guards'

export default async function LoginPage() {
  if (await getCurrentMember()) redirect('/')
  return (
    <AuthFrame>
      <h1 className="title">Sign in</h1>
      <p className="muted">Use the mobile number the family has on its list. We’ll send a code on WhatsApp.</p>
      <SimpleForm action={requestCodeAction} submitLabel="Send me a code">
        <label className="field">
          Mobile number
          <input name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="98765 43210" required />
        </label>
      </SimpleForm>
      <p className="auth-foot">
        Looking after the family group? <Link href="/login/admin">Admin sign-in</Link>
      </p>
    </AuthFrame>
  )
}
