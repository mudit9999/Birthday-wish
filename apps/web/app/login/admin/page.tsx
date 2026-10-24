import { SimpleForm } from '@/components/SimpleForm'
import { adminLoginAction } from '@/lib/actions/auth'

export default function AdminLoginPage() {
  return (
    <main>
      <h1>Admin sign-in</h1>
      <SimpleForm action={adminLoginAction} submitLabel="Sign in">
        <label>
          Password
          <input name="password" type="password" autoComplete="current-password" required />
        </label>
      </SimpleForm>
    </main>
  )
}
