import { Shell } from '@/components/Shell'
import { requireAdmin } from '@/lib/guards'

export default async function AdminLayout({ children }: LayoutProps<'/admin'>) {
  return <Shell member={await requireAdmin()}>{children}</Shell>
}
