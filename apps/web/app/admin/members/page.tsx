import { listMembers } from '@family-wishes/db'
import { ConfirmSubmit } from '@/components/ConfirmSubmit'
import { NoticeForm } from '@/components/NoticeForm'
import { addMemberAction, removeMemberAction } from '@/lib/actions/admin'
import { getDb } from '@/lib/db'
import { requireAdmin } from '@/lib/guards'

export default async function MembersPage() {
  const admin = await requireAdmin()
  const members = await listMembers(await getDb())

  return (
    <>
      <h1>Members</h1>
      <p className="muted">Only these numbers can sign in. Login codes are sent to them on WhatsApp.</p>
      <ul className="list">
        {members.map((m) => (
          <li key={m.id}>
            <span className="what">
              {m.name}
              {m.isAdmin && <span className="tag">admin</span>}
              <br />
              <span className="muted">+{m.phone}</span>
            </span>
            <span className="actions">
              {!m.isAdmin && m.id !== admin.id && (
                <form action={removeMemberAction.bind(null, m.id)}>
                  <ConfirmSubmit className="danger" message={`Remove ${m.name}? They won't be able to sign in.`}>
                    Remove
                  </ConfirmSubmit>
                </form>
              )}
            </span>
          </li>
        ))}
      </ul>

      <h2>Add a member</h2>
      <NoticeForm action={addMemberAction} submitLabel="Add member">
        <label>
          Name
          <input name="name" required maxLength={60} />
        </label>
        <label>
          Mobile number <span className="hint">Without the country code is fine for Indian numbers</span>
          <input name="phone" type="tel" inputMode="tel" required />
        </label>
      </NoticeForm>
    </>
  )
}
