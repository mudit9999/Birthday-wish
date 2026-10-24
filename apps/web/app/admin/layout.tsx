import Link from 'next/link'
import { Nav } from '@/components/Nav'
import { signOutAction } from '@/lib/actions/auth'
import { requireAdmin } from '@/lib/guards'

const ADMIN_LINKS = [
  { href: '/admin', label: 'WhatsApp' },
  { href: '/admin/drafts', label: 'Drafts' },
  { href: '/admin/members', label: 'Members' },
  { href: '/admin/festivals', label: 'Festivals' },
  { href: '/admin/settings', label: 'Settings' },
  { href: '/admin/entries', label: 'All entries' }
]

export default async function AdminLayout({ children }: LayoutProps<'/admin'>) {
  await requireAdmin()
  return (
    <>
      <Nav isAdmin signOut={signOutAction} />
      <nav className="subnav" aria-label="Admin">
        {ADMIN_LINKS.map((link) => (
          <Link key={link.href} href={link.href}>
            {link.label}
          </Link>
        ))}
      </nav>
      <main>{children}</main>
    </>
  )
}
