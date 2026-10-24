import { afterEach, describe, expect, test, vi } from 'vitest'
import { buildCardPrompt, cardGreeting, generateCard, type CardModel } from '../src/wish/card.ts'
import type { WishInput } from '../src/wish/prompt.ts'

const generateContent = vi.hoisted(() => vi.fn())
vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn(function (this: { models: unknown }) {
    this.models = { generateContent }
  })
}))

const { createGeminiCardModel, DEFAULT_CARD_MODEL } = await import('../src/wish/card.ts')

const birthday: WishInput = {
  occasion: 'birthday',
  names: 'Rahul',
  familyCallsThem: 'Chachu',
  title: null,
  festivalName: null,
  note: 'Loves cricket'
}
const diwali: WishInput = { occasion: 'festival', names: null, familyCallsThem: null, title: null, festivalName: 'Diwali', note: null }
const PNG = { base64: 'iVBORw0KGgo=', mimeType: 'image/png' }

afterEach(() => {
  vi.useRealTimers()
  generateContent.mockReset()
})

describe('cardGreeting', () => {
  test('uses the name the family calls them, else the names', () => {
    expect(cardGreeting(birthday)).toBe('Happy Birthday, Chachu')
    expect(cardGreeting({ ...birthday, familyCallsThem: null })).toBe('Happy Birthday, Rahul')
  })

  test('covers festivals, anniversaries and special days', () => {
    expect(cardGreeting(diwali)).toBe('Happy Diwali')
    expect(cardGreeting({ ...birthday, occasion: 'anniversary', names: 'Amit & Priya', familyCallsThem: null })).toBe(
      'Happy Anniversary, Amit & Priya'
    )
    expect(cardGreeting({ ...birthday, occasion: 'special', title: 'Housewarming' })).toBe('Housewarming')
  })
})

describe('buildCardPrompt', () => {
  test('asks for the exact greeting, the occasion and the family note', () => {
    const prompt = buildCardPrompt(birthday)
    expect(prompt).toContain('"Happy Birthday, Chachu"')
    expect(prompt).toContain('birthday')
    expect(prompt).toContain('Loves cricket')
  })

  test('forbids people, extra text and numbers', () => {
    const prompt = buildCardPrompt(diwali).toLowerCase()
    for (const rule of ['no people', 'no other words', 'numbers']) expect(prompt).toContain(rule)
    expect(prompt).toContain('diwali')
  })
})

describe('generateCard', () => {
  const model = (result: Awaited<ReturnType<CardModel['generate']>> | Error): CardModel => ({
    generate: async () => {
      if (result instanceof Error) throw result
      return result
    }
  })

  test('returns the image from the model', async () => {
    expect(await generateCard(birthday, model(PNG))).toEqual(PNG)
  })

  test('returns null when the model fails, returns nothing or returns a non-image', async () => {
    expect(await generateCard(birthday, model(new Error('quota')))).toBeNull()
    expect(await generateCard(birthday, model(null))).toBeNull()
    expect(await generateCard(birthday, model({ base64: 'abc', mimeType: 'text/html' }))).toBeNull()
    expect(await generateCard(birthday, model({ base64: '', mimeType: 'image/png' }))).toBeNull()
  })

  test('returns null when the model hangs past the timeout', async () => {
    vi.useFakeTimers()
    const pending = generateCard(birthday, { generate: () => new Promise(() => {}) })
    await vi.advanceTimersByTimeAsync(120_000)
    expect(await pending).toBeNull()
  })
})

describe('createGeminiCardModel', () => {
  test('asks for an image only and returns the final, non-thought image', async () => {
    generateContent.mockResolvedValueOnce({
      candidates: [
        {
          content: {
            parts: [
              { thought: true, inlineData: { data: 'DRAFT', mimeType: 'image/png' } },
              { text: 'Here is your card' },
              { inlineData: { data: PNG.base64, mimeType: PNG.mimeType } }
            ]
          }
        }
      ]
    })
    const gemini = createGeminiCardModel({ apiKey: 'test-key', model: DEFAULT_CARD_MODEL })
    expect(await gemini.generate('PROMPT')).toEqual(PNG)
    expect(generateContent).toHaveBeenCalledWith({
      model: 'gemini-3.1-flash-image',
      contents: 'PROMPT',
      config: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '3:4', imageSize: '1K' } }
    })
  })

  test('returns null when the response carries no image', async () => {
    generateContent.mockResolvedValueOnce({ candidates: [{ content: { parts: [{ text: 'Sorry' }] } }] })
    const gemini = createGeminiCardModel({ apiKey: 'test-key', model: DEFAULT_CARD_MODEL })
    expect(await gemini.generate('PROMPT')).toBeNull()
  })
})
