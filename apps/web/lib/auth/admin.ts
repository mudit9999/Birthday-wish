import { createHash, timingSafeEqual } from 'node:crypto'

const digest = (value: string) => createHash('sha256').update(value).digest()

/** Constant-time password check; hashing first makes unequal lengths safe to compare. */
export function checkAdminPassword(input: string, expected: string): boolean {
  return timingSafeEqual(digest(input), digest(expected))
}
