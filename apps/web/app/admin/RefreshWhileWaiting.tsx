'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

const REFRESH_MS = 5000

/** Re-renders the page every few seconds so a new QR or a fresh connection shows up without a manual reload. */
export function RefreshWhileWaiting({ active }: { active: boolean }) {
  const router = useRouter()
  useEffect(() => {
    if (!active) return
    const timer = setInterval(() => router.refresh(), REFRESH_MS)
    return () => clearInterval(timer)
  }, [active, router])
  return null
}
