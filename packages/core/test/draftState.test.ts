import { expect, test } from 'vitest'
import { allowedFrom, nextStatus, type DraftAction, type DraftStatus } from '../src/draftState.js'

const STATUSES: DraftStatus[] = ['pending', 'approved', 'sending', 'sent', 'skipped', 'expired', 'failed']
const ACTIONS: DraftAction[] = ['approve', 'edit', 'skip', 'redo', 'claim', 'markSent', 'markFailed', 'expire']

const TABLE: Record<DraftAction, Partial<Record<DraftStatus, DraftStatus>>> = {
  approve: { pending: 'approved', skipped: 'approved', failed: 'approved' },
  edit: { pending: 'approved', approved: 'approved', skipped: 'approved', failed: 'approved' },
  skip: { pending: 'skipped', approved: 'skipped', failed: 'skipped' },
  redo: { pending: 'pending', approved: 'pending', skipped: 'pending', failed: 'pending' },
  claim: { approved: 'sending' },
  markSent: { sending: 'sent' },
  markFailed: { sending: 'failed' },
  expire: { pending: 'expired', approved: 'failed' }
}

const CASES = ACTIONS.flatMap((action) =>
  STATUSES.map((from) => [action, from, TABLE[action][from] ?? null] as const)
)

test.each(CASES)('%s from %s → %s', (action, from, expected) => {
  expect(nextStatus(from, action)).toBe(expected)
})

test('sent and expired are terminal', () => {
  for (const action of ACTIONS) {
    expect(nextStatus('sent', action)).toBeNull()
    expect(nextStatus('expired', action)).toBeNull()
  }
  expect(nextStatus('pending', 'claim')).toBeNull()
})

test('allowedFrom lists source statuses in table order', () => {
  expect(allowedFrom('approve')).toEqual(['pending', 'skipped', 'failed'])
  expect(allowedFrom('expire')).toEqual(['pending', 'approved'])
  expect(allowedFrom('claim')).toEqual(['approved'])
})
