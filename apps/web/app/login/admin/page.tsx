import Link from 'next/link'
import { AuthFrame } from '@/components/AuthFrame'
import { SimpleForm } from '@/components/SimpleForm'
import { adminLoginAction } from '@/lib/actions/auth'

export default function AdminLoginPage() {
  return (
    <AuthFrame>
      <h1 className="title">Admin sign-in</h1>
      <p className="muted">For the person who links WhatsApp and approves the wishes.</p>
      <SimpleForm action={adminLoginAction} submitLabel="Sign in">
        <label className="field">
          Password
          <input name="password" type="password" autoComplete="current-password" required />
        </label>
      </SimpleForm>
      <p className="auth-foot">
        <Link href="/login">Sign in with your phone instead</Link>
      </p>
    </AuthFrame>
  )
}
