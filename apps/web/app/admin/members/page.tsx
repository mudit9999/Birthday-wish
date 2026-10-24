import { listMembers } from '@family-wishes/db'
import { ConfirmSubmit } from '@/components/ConfirmSubmit'
import { NoticeForm } from '@/components/NoticeForm'
import { addMemberAction, removeMemberAction } from '@/lib/actions/admin'
import { getDb } from '@/lib/db'
import { requireAdmin } from '@/lib/guards'
import { personTint } from '@/lib/present'

export default async function MembersPage() {
  const admin = await requireAdmin()
  const members = await listMembers(await getDb())

  return (
    <>
      <header className="title-row">
        <div>
          <h1 className="title">Members</h1>
          <p className="lede">
            {members.length} {members.length === 1 ? 'number' : 'numbers'} can sign in. Login codes arrive on WhatsApp.
          </p>
        </div>
      </header>
      <div className="grid">
        <section className="panel span-7">
          <div className="panel-head">
            <h2>On the list</h2>
            <span className="count">{members.length}</span>
          </div>
          <ul className="rows">
            {members.map((m) => (
              <li key={m.id} className="row">
                <span className="avatar" style={{ background: personTint(m.name) }} aria-hidden="true">
                  {m.name.charAt(0).toUpperCase()}
                </span>
                <span className="body">
                  <span className="line1" style={{ display: 'block' }}>
                    {m.name}
                  </span>
                  <span className="line2 num" style={{ display: 'block' }}>
                    +{m.phone}
                  </span>
                </span>
                <span className="actions">
                  {m.isAdmin ? (
                    <span className="pill accent">Admin</span>
                  ) : m.id !== admin.id ? (
                    <form action={removeMemberAction.bind(null, m.id)}>
                      <ConfirmSubmit className="danger" message={`Remove ${m.name}? They won't be able to sign in.`}>
                        Remove
                      </ConfirmSubmit>
                    </form>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </section>
        <section className="panel span-5">
          <div className="panel-head">
            <h2>Add a member</h2>
          </div>
          <NoticeForm action={addMemberAction} submitLabel="Add member">
            <label className="field">
              Name
              <input name="name" required maxLength={60} placeholder="e.g. Priya" />
            </label>
            <label className="field">
              Mobile number
              <span className="hint">Indian numbers can skip the +91.</span>
              <input name="phone" type="tel" inputMode="tel" required placeholder="98765 43210" />
            </label>
          </NoticeForm>
        </section>
      </div>
    </>
  )
}
