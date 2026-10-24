import { GoogleGenAI } from '@google/genai'
import type { WishInput } from './prompt.ts'

export const DEFAULT_CARD_MODEL = 'gemini-3.1-flash-image'
export const DEFAULT_POLLINATIONS_MODEL = 'tongyi-mai/z-image-turbo'

/** A generated greeting card, as base64 so this package stays free of Node's Buffer. */
export interface CardImage {
  base64: string
  mimeType: string
}

export interface CardModel {
  generate(prompt: string): Promise<CardImage | null>
}

export const CARD_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const

const CARD_TIMEOUT_MS = 90_000
// WhatsApp rejects images over 16 MB; base64 is a third larger than the bytes.
const MAX_CARD_BASE64_LENGTH = 16_000_000
const GEMINI_ASPECT_RATIO = '3:4'
const GEMINI_IMAGE_SIZE = '1K'
const POLLINATIONS_URL = 'https://gen.pollinations.ai/v1/images/generations'
const POLLINATIONS_SIZE = '768x1024'
const ERROR_BODY_PREVIEW = 200

/** The words on the card: a headline, and the person's name on its own line when there is one. */
export function cardText(input: WishInput): { headline: string; name: string | null } {
  const who = input.familyCallsThem ?? input.names
  switch (input.occasion) {
    case 'festival':
      return { headline: `Happy ${input.festivalName ?? 'Festival'}`, name: null }
    case 'anniversary':
      return { headline: 'Happy Anniversary', name: who }
    case 'special':
      return { headline: input.title ?? 'Congratulations', name: who }
    case 'birthday':
      return { headline: 'Happy Birthday', name: who }
  }
}

function scene(input: WishInput): { kind: string; motifs: string } {
  switch (input.occasion) {
    case 'festival':
      return { kind: `${input.festivalName ?? ''} festival`, motifs: `traditional ${input.festivalName ?? ''} decorations, marigold garlands and glowing diyas` }
    case 'anniversary':
      return { kind: 'wedding anniversary', motifs: 'marigold and rose garlands, glowing diyas and two entwined gold rings' }
    case 'special':
      return { kind: 'celebration', motifs: 'marigold garlands, glowing diyas and festive bunting' }
    case 'birthday':
      return { kind: 'birthday', motifs: 'marigold garlands, glowing diyas and a few balloons' }
  }
}

/** A short visual description; image models follow this better than instructions. */
// The family's note is left out: image models write quoted phrases onto the card as (misspelled) text.
export function buildCardPrompt(input: WishInput): string {
  const { headline, name } = cardText(input)
  const { kind, motifs } = scene(input)
  return [
    `A premium Indian ${kind} greeting card, portrait.`,
    `Elegant gold calligraphy at the top reads "${headline}".`,
    name ? `Below it, larger, the name "${name}".` : null,
    `Around the text: ${motifs}.`,
    'Rich maroon, saffron and gold colours, soft warm light, textured paper.',
    'No people. No other words, numbers or dates.'
  ]
    .filter((line) => line !== null)
    .join(' ')
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`card model timed out after ${ms} ms`)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

function isUsable(card: CardImage | null): card is CardImage {
  return (
    card !== null &&
    (CARD_MIME_TYPES as readonly string[]).includes(card.mimeType) &&
    card.base64.length > 0 &&
    card.base64.length <= MAX_CARD_BASE64_LENGTH
  )
}

/** Asks the model for a card; any failure gives null so the wish still posts as text. */
export async function generateCard(input: WishInput, model: CardModel): Promise<CardImage | null> {
  try {
    const card = await withTimeout(model.generate(buildCardPrompt(input)), CARD_TIMEOUT_MS)
    return isUsable(card) ? card : null
  } catch {
    return null
  }
}

export function createGeminiCardModel(opts: { apiKey: string; model: string }): CardModel {
  const ai = new GoogleGenAI({ apiKey: opts.apiKey })
  return {
    async generate(prompt) {
      const response = await ai.models.generateContent({
        model: opts.model,
        contents: prompt,
        config: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: GEMINI_ASPECT_RATIO, imageSize: GEMINI_IMAGE_SIZE } }
      })
      const parts = response.candidates?.[0]?.content?.parts ?? []
      // Thinking can emit interim images; the last non-thought image is the final card.
      const image = parts.findLast((part) => !part.thought && part.inlineData?.data && part.inlineData.mimeType?.startsWith('image/'))
      const data = image?.inlineData
      return data?.data && data.mimeType ? { base64: data.data, mimeType: data.mimeType } : null
    }
  }
}

interface FetchResponse {
  ok: boolean
  status: number
  json(): Promise<unknown>
  text(): Promise<string>
}
export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string }
) => Promise<FetchResponse>

// Pollinations doesn't always say which format it returned, so read it from the first bytes.
function sniffMimeType(base64: string): string | null {
  if (base64.startsWith('/9j/')) return 'image/jpeg'
  if (base64.startsWith('iVBOR')) return 'image/png'
  if (base64.startsWith('UklGR')) return 'image/webp'
  return null
}

function firstImage(body: unknown): string | null {
  const data = (body as { data?: { b64_json?: unknown }[] } | null)?.data
  const b64 = data?.[0]?.b64_json
  return typeof b64 === 'string' && b64.length > 0 ? b64 : null
}

export function createPollinationsCardModel(opts: { apiKey: string; model: string; fetchImpl?: FetchLike }): CardModel {
  const fetchImpl = opts.fetchImpl ?? fetch
  return {
    async generate(prompt) {
      const response = await fetchImpl(POLLINATIONS_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${opts.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: opts.model, prompt, size: POLLINATIONS_SIZE, response_format: 'b64_json' })
      })
      if (!response.ok) {
        const detail = (await response.text()).slice(0, ERROR_BODY_PREVIEW)
        throw new Error(`Pollinations returned HTTP ${response.status}: ${detail}`)
      }
      const base64 = firstImage(await response.json())
      const mimeType = base64 ? sniffMimeType(base64) : null
      return base64 && mimeType ? { base64, mimeType } : null
    }
  }
}

/** Pollinations when its key is set, otherwise Gemini. */
export function createCardModel(opts: {
  pollinationsApiKey?: string
  pollinationsModel: string
  geminiApiKey: string
  geminiModel: string
  fetchImpl?: FetchLike
}): CardModel {
  return opts.pollinationsApiKey
    ? createPollinationsCardModel({ apiKey: opts.pollinationsApiKey, model: opts.pollinationsModel, fetchImpl: opts.fetchImpl })
    : createGeminiCardModel({ apiKey: opts.geminiApiKey, model: opts.geminiModel })
}
