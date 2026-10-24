import { Nav } from '@/components/Nav'
import { signOutAction } from '@/lib/actions/auth'
import { requireMember } from '@/lib/guards'

export default async function MemberLayout({ children }: LayoutProps<'/'>) {
  const member = await requireMember()
  return (
    <>
      <Nav isAdmin={member.isAdmin} signOut={signOutAction} />
      <main>{children}</main>
    </>
  )
}
