import { fallbackWish } from './fallback.js'
import { mentionsAge } from './guard.js'
import { buildWishPrompt, type WishInput } from './prompt.js'

export interface WishModel {
  generate(req: { system: string; prompt: string }): Promise<string>
}

export interface GeneratedWish {
  text: string
  source: 'ai' | 'template'
}

const MODEL_TIMEOUT_MS = 20_000
const MAX_ATTEMPTS = 2
const SURROUNDING_QUOTES = /^["'“”‘’]+|["'“”‘’]+$/g

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`wish model timed out after ${ms} ms`)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

function cleanWish(raw: string): string {
  return raw.trim().replace(SURROUNDING_QUOTES, '').trim()
}

// A failed attempt returns null; the caller's template tag ("AI unavailable") surfaces it to the admin.
async function attempt(model: WishModel, req: { system: string; prompt: string }): Promise<string | null> {
  try {
    const text = cleanWish(await withTimeout(model.generate(req), MODEL_TIMEOUT_MS))
    return text === '' || mentionsAge(text) ? null : text
  } catch {
    return null
  }
}

/** Asks the model for a wish, retrying once on a bad answer, else falls back to the template. */
export async function generateWish(input: WishInput, style: string, model: WishModel | null): Promise<GeneratedWish> {
  if (model) {
    const req = buildWishPrompt(input, style)
    for (let i = 0; i < MAX_ATTEMPTS; i += 1) {
      const text = await attempt(model, req)
      if (text !== null) return { text, source: 'ai' }
    }
  }
  return { text: fallbackWish(input), source: 'template' }
}
