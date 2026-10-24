import { Shell } from '@/components/Shell'
import { requireMember } from '@/lib/guards'

export default async function MemberLayout({ children }: LayoutProps<'/'>) {
  return <Shell member={await requireMember()}>{children}</Shell>
}
