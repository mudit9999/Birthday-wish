export type DraftStatus = 'pending' | 'approved' | 'sending' | 'sent' | 'skipped' | 'expired' | 'failed'
export type DraftSource = 'ai' | 'template' | 'admin'
export type DraftAction = 'approve' | 'edit' | 'skip' | 'redo' | 'claim' | 'markSent' | 'markFailed' | 'expire'

type Transitions = Readonly<Partial<Record<DraftStatus, DraftStatus>>>

// `sent` and `expired` are terminal: no action lists them as a source.
const TRANSITIONS: Readonly<Record<DraftAction, Transitions>> = {
  approve: { pending: 'approved', skipped: 'approved', failed: 'approved' },
  edit: { pending: 'approved', approved: 'approved', skipped: 'approved', failed: 'approved' },
  skip: { pending: 'skipped', approved: 'skipped', failed: 'skipped' },
  redo: { pending: 'pending', approved: 'pending', skipped: 'pending', failed: 'pending' },
  claim: { approved: 'sending' },
  markSent: { sending: 'sent' },
  markFailed: { sending: 'failed' },
  expire: { pending: 'expired', approved: 'failed' }
}

/** The status after applying `action` to a draft in `from`, or `null` if not allowed. */
export function nextStatus(from: DraftStatus, action: DraftAction): DraftStatus | null {
  return TRANSITIONS[action][from] ?? null
}

/** Statuses from which `action` is allowed, for conditional `WHERE status IN (…)` updates. */
export function allowedFrom(action: DraftAction): DraftStatus[] {
  return Object.keys(TRANSITIONS[action]) as DraftStatus[]
}
