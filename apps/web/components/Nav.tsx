'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const LINKS = [
  { href: '/', label: 'Upcoming' },
  { href: '/entries', label: 'My entries' },
  { href: '/entries/new', label: 'Add' }
]

export function Nav({ isAdmin, signOut }: { isAdmin: boolean; signOut: () => Promise<void> }) {
  const pathname = usePathname()
  const links = isAdmin ? [...LINKS, { href: '/admin', label: 'Admin' }] : LINKS
  return (
    <nav className="nav" aria-label="Main">
      <span className="brand">Family Wishes</span>
      {links.map((link) => (
        <Link key={link.href} href={link.href} aria-current={pathname === link.href ? 'page' : undefined}>
          {link.label}
        </Link>
      ))}
      <form action={signOut}>
        <button type="submit">Sign out</button>
      </form>
    </nav>
  )
}
