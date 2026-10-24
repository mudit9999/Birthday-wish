import { getWaStatus, requestJob, setSetting, type Db, type Member, type RequestedJob } from '@family-wishes/db'

/** Saves the family group; only a group the linked WhatsApp account is actually in can be chosen. */
export async function chooseGroup(db: Db, actor: Member, groupId: string): Promise<'ok' | 'forbidden' | 'unknown_group'> {
  if (!actor.isAdmin) return 'forbidden'
  const { groups } = await getWaStatus(db)
  if (!groups.some((group) => group.id === groupId)) return 'unknown_group'
  await setSetting(db, 'group_id', groupId)
  return 'ok'
}

/** Asks the worker to draft tomorrow's wishes or post approved ones now. */
export async function runNow(db: Db, actor: Member, job: RequestedJob): Promise<'ok' | 'forbidden'> {
  if (!actor.isAdmin) return 'forbidden'
  await requestJob(db, job)
  return 'ok'
}
