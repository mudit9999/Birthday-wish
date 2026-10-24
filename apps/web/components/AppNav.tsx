'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { Mark } from './Mark'

const FAMILY = [
  { href: '/', label: 'Upcoming' },
  { href: '/entries', label: 'My entries' },
  { href: '/entries/new', label: 'Add an entry' }
]

const ADMIN = [
  { href: '/admin', label: 'WhatsApp' },
  { href: '/admin/drafts', label: 'Drafts' },
  { href: '/admin/members', label: 'Members' },
  { href: '/admin/festivals', label: 'Festivals' },
  { href: '/admin/entries', label: 'All entries' },
  { href: '/admin/settings', label: 'Settings' }
]

function Links({ isAdmin, pathname, draftsWaiting }: { isAdmin: boolean; pathname: string; draftsWaiting: number }) {
  return (
    <>
      <div className="nav-group">
        <span className="nav-label">Family</span>
        {FAMILY.map((link) => (
          <Link key={link.href} className="nav-link" href={link.href} aria-current={pathname === link.href ? 'page' : undefined}>
            {link.label}
          </Link>
        ))}
      </div>
      {isAdmin && (
        <div className="nav-group">
          <span className="nav-label">Admin</span>
          {ADMIN.map((link) => (
            <Link key={link.href} className="nav-link" href={link.href} aria-current={pathname === link.href ? 'page' : undefined}>
              {link.label}
              {link.href === '/admin/drafts' && draftsWaiting > 0 && (
                <span className="count" style={{ marginLeft: 'auto' }} aria-label={`${draftsWaiting} waiting`}>
                  {draftsWaiting}
                </span>
              )}
            </Link>
          ))}
        </div>
      )}
    </>
  )
}

export function AppNav({
  isAdmin,
  name,
  avatarTint,
  draftsWaiting,
  signOut
}: {
  isAdmin: boolean
  name: string
  avatarTint: string
  draftsWaiting: number
  signOut: () => Promise<void>
}) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  const foot = (
    <div className="sidebar-foot">
      <span className="avatar" style={{ background: avatarTint }} aria-hidden="true">
        {name.charAt(0).toUpperCase()}
      </span>
      <span className="who">{name}</span>
      <form action={signOut}>
        <button type="submit" className="text">
          Sign out
        </button>
      </form>
    </div>
  )

  return (
    <>
      <aside className="sidebar" aria-label="Main">
        <Link href="/" className="brand">
          <Mark />
          Family Wishes
        </Link>
        <Links isAdmin={isAdmin} pathname={pathname} draftsWaiting={draftsWaiting} />
        {foot}
      </aside>
      <header className="phonebar">
        <Link href="/" className="brand">
          <Mark size={22} />
          Family Wishes
        </Link>
        <button type="button" className="secondary" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {open ? 'Close' : 'Menu'}
        </button>
      </header>
      <nav
        className="sheet"
        data-open={open}
        aria-label="Menu"
        onClick={(event) => {
          if ((event.target as HTMLElement).closest('a')) setOpen(false)
        }}
      >
        <Links isAdmin={isAdmin} pathname={pathname} draftsWaiting={draftsWaiting} />
        {foot}
      </nav>
    </>
  )
}
