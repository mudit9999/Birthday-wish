import { GoogleGenAI } from '@google/genai'
import type { WishInput } from './prompt.ts'

export const DEFAULT_CARD_MODEL = 'gemini-3.1-flash-image'

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
const ASPECT_RATIO = '3:4'
const IMAGE_SIZE = '1K'

/** The one line of text the card shows. */
export function cardGreeting(input: WishInput): string {
  const who = input.familyCallsThem ?? input.names
  switch (input.occasion) {
    case 'festival':
      return `Happy ${input.festivalName ?? 'Festival'}`
    case 'anniversary':
      return who ? `Happy Anniversary, ${who}` : 'Happy Anniversary'
    case 'special':
      return input.title ?? 'Congratulations'
    case 'birthday':
      return who ? `Happy Birthday, ${who}` : 'Happy Birthday'
  }
}

function occasionText(input: WishInput): string {
  switch (input.occasion) {
    case 'festival':
      return `the festival ${input.festivalName ?? ''}, with motifs from its traditions`
    case 'anniversary':
      return 'a wedding anniversary'
    case 'special':
      return input.title ?? 'a special family day'
    case 'birthday':
      return 'a birthday'
  }
}

export function buildCardPrompt(input: WishInput): string {
  return [
    'Design a beautiful greeting card image to post in an Indian family WhatsApp group.',
    `Occasion: ${occasionText(input)}.`,
    input.note ? `A detail the family mentioned, which you may show as a small motif: ${input.note}.` : null,
    `Show this greeting as the only text, spelled exactly: "${cardGreeting(input)}".`,
    'Style: elegant and warm, a refined Indian festive aesthetic with rich but tasteful colours and decorative details that fit the occasion.',
    'Draw no people or faces. Add no other words, numbers, dates, logos or watermarks.',
    'Portrait layout with generous margins so nothing is cropped.'
  ]
    .filter((line) => line !== null)
    .join('\n')
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
        config: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: ASPECT_RATIO, imageSize: IMAGE_SIZE } }
      })
      const parts = response.candidates?.[0]?.content?.parts ?? []
      // Thinking can emit interim images; the last non-thought image is the final card.
      const image = parts.findLast((part) => !part.thought && part.inlineData?.data && part.inlineData.mimeType?.startsWith('image/'))
      const data = image?.inlineData
      return data?.data && data.mimeType ? { base64: data.data, mimeType: data.mimeType } : null
    }
  }
}
