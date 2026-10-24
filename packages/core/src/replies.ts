export type Reply =
  | { kind: 'approve' | 'skip' | 'redo'; number: number | 'all' }
  | { kind: 'edit'; number: number; text: string }
  | { kind: 'invalid'; reason: string }

/** Shorter replies ("k", "thanks", "nice one") are never taken as a replacement wish. */
export const MIN_EDIT_LENGTH = 15

const COMMAND_PATTERN = /^(ok|okay|yes|👍[\u{1F3FB}-\u{1F3FF}]?\u{FE0F}?|skip|redo)(?:\s+(\d+))?$/iu
const NUMBERED_EDIT_PATTERN = /^(\d+)[\s.):-]+([\s\S]+)$/

const HELP = 'Reply ok, skip or redo (add the number if there are several), or send the full new wish text.'

function invalid(reason: string): Reply {
  return { kind: 'invalid', reason }
}

function commandKind(word: string): 'approve' | 'skip' | 'redo' {
  const lower = word.toLowerCase()
  if (lower === 'skip' || lower === 'redo') return lower
  return 'approve'
}

function unknownNumber(n: number, openNumbers: number[]): Reply {
  return invalid(`There is no draft ${n} waiting. Open drafts: ${openNumbers.join(', ')}.`)
}

function parseCommand(word: string, numberText: string | undefined, openNumbers: number[]): Reply {
  const kind = commandKind(word)
  if (numberText !== undefined) {
    const n = Number(numberText)
    return openNumbers.includes(n) ? { kind, number: n } : unknownNumber(n, openNumbers)
  }
  const [only] = openNumbers
  if (openNumbers.length === 1 && only !== undefined) return { kind, number: only }
  if (kind === 'approve') return { kind, number: 'all' }
  return invalid(`Which one? Reply ${kind} with the draft number, e.g. "${kind} ${openNumbers[0]}".`)
}

function parseEdit(n: number, text: string, openNumbers: number[]): Reply {
  if (!openNumbers.includes(n)) return unknownNumber(n, openNumbers)
  if (text.length < MIN_EDIT_LENGTH) {
    return invalid(`That's too short to be a wish, so I didn't use it. ${HELP}`)
  }
  return { kind: 'edit', number: n, text }
}

/** Parses an admin reply in the self-chat against the draft numbers still open for a decision. */
export function parseReply(text: string, openNumbers: number[]): Reply {
  const trimmed = text.trim()
  if (openNumbers.length === 0) return invalid('Nothing is waiting for approval right now.')
  if (trimmed === '') return invalid(HELP)

  const command = COMMAND_PATTERN.exec(trimmed)
  if (command) return parseCommand(command[1] ?? '', command[2], openNumbers)

  const numbered = NUMBERED_EDIT_PATTERN.exec(trimmed)
  if (numbered) return parseEdit(Number(numbered[1]), (numbered[2] ?? '').trim(), openNumbers)

  const [only] = openNumbers
  if (openNumbers.length === 1 && only !== undefined) return parseEdit(only, trimmed, openNumbers)
  if (trimmed.length < MIN_EDIT_LENGTH) return invalid(`That's too short to be a wish, so I didn't use it. ${HELP}`)
  return invalid(`Several drafts are open. Start a new wish with its number, e.g. "${openNumbers[0]} <your text>".`)
}
