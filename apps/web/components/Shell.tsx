import { localDate } from '@family-wishes/core'
import { getSettings, openDraftNumbers, type Member } from '@family-wishes/db'
import type { ReactNode } from 'react'
import { signOutAction } from '@/lib/actions/auth'
import { getDb } from '@/lib/db'
import { personTint } from '@/lib/present'
import { AppNav } from './AppNav'

async function draftsWaiting(): Promise<number> {
  const db = await getDb()
  const { activeBatchDate, timeZone } = await getSettings(db)
  return (await openDraftNumbers(db, activeBatchDate ?? localDate(new Date(), timeZone))).length
}

/** The open-plane shell: a sidebar on the page ground, the canvas with one centred column. */
export async function Shell({ member, children }: { member: Member; children: ReactNode }) {
  const waiting = member.isAdmin ? await draftsWaiting() : 0
  return (
    <div className="shell">
      <AppNav
        isAdmin={member.isAdmin}
        name={member.name}
        avatarTint={personTint(member.name)}
        draftsWaiting={waiting}
        signOut={signOutAction}
      />
      <main className="canvas">
        <div className="column">{children}</div>
      </main>
    </div>
  )
}
