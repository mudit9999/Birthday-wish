import { afterEach, describe, expect, test, vi } from 'vitest'
import { buildCardPrompt, cardText, generateCard, type CardModel } from '../src/wish/card.ts'
import type { WishInput } from '../src/wish/prompt.ts'

const generateContent = vi.hoisted(() => vi.fn())
vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn(function (this: { models: unknown }) {
    this.models = { generateContent }
  })
}))

const { createCardModel, createGeminiCardModel, createPollinationsCardModel, DEFAULT_CARD_MODEL, DEFAULT_POLLINATIONS_MODEL } =
  await import('../src/wish/card.ts')

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
const JPEG_BASE64 = '/9j/4AAQSkZJRg=='

afterEach(() => {
  vi.useRealTimers()
  generateContent.mockReset()
})

describe('cardText', () => {
  test('puts the name the family calls them on its own line', () => {
    expect(cardText(birthday)).toEqual({ headline: 'Happy Birthday', name: 'Chachu' })
    expect(cardText({ ...birthday, familyCallsThem: null })).toEqual({ headline: 'Happy Birthday', name: 'Rahul' })
  })

  test('covers festivals, anniversaries and special days', () => {
    expect(cardText(diwali)).toEqual({ headline: 'Happy Diwali', name: null })
    expect(cardText({ ...birthday, occasion: 'anniversary', names: 'Amit & Priya', familyCallsThem: null })).toEqual({
      headline: 'Happy Anniversary',
      name: 'Amit & Priya'
    })
    expect(cardText({ ...birthday, occasion: 'special', title: 'Housewarming', familyCallsThem: null, names: 'Sharma family' })).toEqual({
      headline: 'Housewarming',
      name: 'Sharma family'
    })
  })
})

describe('buildCardPrompt', () => {
  test('quotes the headline and the name separately, and leaves the family note out', () => {
    const prompt = buildCardPrompt(birthday)
    expect(prompt).toContain('"Happy Birthday"')
    expect(prompt).toContain('"Chachu"')
    expect(prompt).not.toContain('cricket')
  })

  test('forbids people and any other words, and names the festival', () => {
    const prompt = buildCardPrompt(diwali)
    expect(prompt).toContain('"Happy Diwali"')
    expect(prompt).toContain('Diwali')
    expect(prompt).toContain('No people')
    expect(prompt).toContain('No other words')
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

describe('createPollinationsCardModel', () => {
  const ok = (body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }))

  test('posts the prompt with the key and returns the image, detecting JPEG from its bytes', async () => {
    const fetchImpl = ok({ data: [{ b64_json: JPEG_BASE64 }] })
    const card = createPollinationsCardModel({ apiKey: 'sk_test', model: DEFAULT_POLLINATIONS_MODEL, fetchImpl })
    expect(await card.generate('PROMPT')).toEqual({ base64: JPEG_BASE64, mimeType: 'image/jpeg' })
    expect(fetchImpl).toHaveBeenCalledWith('https://gen.pollinations.ai/v1/images/generations', {
      method: 'POST',
      headers: { Authorization: 'Bearer sk_test', 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'tongyi-mai/z-image-turbo', prompt: 'PROMPT', size: '768x1024', response_format: 'b64_json' })
    })
  })

  test('detects PNG and returns null for an unknown format or an empty answer', async () => {
    const png = createPollinationsCardModel({ apiKey: 'k', model: 'm', fetchImpl: ok({ data: [{ b64_json: PNG.base64 }] }) })
    expect(await png.generate('P')).toEqual(PNG)
    const svg = createPollinationsCardModel({ apiKey: 'k', model: 'm', fetchImpl: ok({ data: [{ b64_json: 'PHN2Zz4=' }] }) })
    expect(await svg.generate('P')).toBeNull()
    const empty = createPollinationsCardModel({ apiKey: 'k', model: 'm', fetchImpl: ok({ data: [] }) })
    expect(await empty.generate('P')).toBeNull()
  })

  test('throws on an HTTP error without including the key', async () => {
    const fetchImpl = vi.fn(async () => new Response('{"error":"budget exhausted"}', { status: 402 }))
    const card = createPollinationsCardModel({ apiKey: 'sk_secret', model: 'm', fetchImpl })
    await expect(card.generate('P')).rejects.toThrow(/402/)
    await expect(card.generate('P')).rejects.not.toThrow(/sk_secret/)
  })
})

describe('createCardModel', () => {
  test('uses Pollinations when its key is set, otherwise Gemini', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ data: [{ b64_json: JPEG_BASE64 }] }), { status: 200 }))
    const pollinations = createCardModel({
      pollinationsApiKey: 'sk_test',
      pollinationsModel: DEFAULT_POLLINATIONS_MODEL,
      geminiApiKey: 'g',
      geminiModel: DEFAULT_CARD_MODEL,
      fetchImpl
    })
    expect((await pollinations.generate('P'))?.mimeType).toBe('image/jpeg')
    expect(generateContent).not.toHaveBeenCalled()

    generateContent.mockResolvedValueOnce({ candidates: [{ content: { parts: [{ inlineData: { data: PNG.base64, mimeType: 'image/png' } }] } }] })
    const gemini = createCardModel({ pollinationsModel: DEFAULT_POLLINATIONS_MODEL, geminiApiKey: 'g', geminiModel: DEFAULT_CARD_MODEL })
    expect(await gemini.generate('P')).toEqual(PNG)
  })
})
