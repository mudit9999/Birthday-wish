import { afterEach, describe, expect, test, vi } from 'vitest'
import type { FamilyEvent, Festival } from '../src/occurrences.js'
import { buildWishPrompt, DEFAULT_AI_STYLE, toWishInput, type WishInput } from '../src/wish/prompt.js'
import { mentionsAge } from '../src/wish/guard.js'
import { fallbackWish } from '../src/wish/fallback.js'
import { generateWish, type WishModel } from '../src/wish/generate.js'

const generateContent = vi.hoisted(() => vi.fn())
vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn(function (this: { models: unknown }) {
    this.models = { generateContent }
  })
}))

const { createGeminiModel, DEFAULT_GEMINI_MODEL } = await import('../src/wish/gemini.js')

function ev(overrides: Partial<FamilyEvent> = {}): FamilyEvent {
  return {
    id: 'e1',
    type: 'birthday',
    names: 'Rahul',
    familyCallsThem: 'Chachu',
    title: null,
    day: 25,
    month: 10,
    year: 1965,
    repeatsYearly: true,
    note: 'Loves cricket',
    archived: false,
    addedBy: null,
    ...overrides
  }
}

const diwali: Festival = { id: 'f1', name: 'Diwali', date: '2026-11-08' }

const birthday: WishInput = {
  occasion: 'birthday',
  names: 'Rahul',
  familyCallsThem: 'Chachu',
  title: null,
  festivalName: null,
  note: 'Loves cricket'
}

const CLEAN = 'Happy birthday Chachu! 🎂 Wishing you a year full of sixes and smiles.'

function model(...replies: Array<string | Error>): WishModel & { calls: number } {
  const fake = {
    calls: 0,
    async generate() {
      // Repeats the last reply once the list runs out.
      const next = replies[Math.min(fake.calls, replies.length - 1)] ?? ''
      fake.calls += 1
      if (next instanceof Error) throw next
      return next
    }
  }
  return fake
}

afterEach(() => {
  vi.useRealTimers()
})

describe('toWishInput', () => {
  test('never carries the year', () => {
    const input = toWishInput({ kind: 'event', date: '2026-10-25', event: ev() })
    expect(JSON.stringify(input)).not.toContain('1965')
    expect(input).toEqual(birthday)
  })

  test('maps festivals', () => {
    expect(toWishInput({ kind: 'festival', date: diwali.date, festival: diwali })).toEqual({
      occasion: 'festival',
      names: null,
      familyCallsThem: null,
      title: null,
      festivalName: 'Diwali',
      note: null
    })
  })
})

describe('buildWishPrompt', () => {
  test('system carries the style and the rules', () => {
    const { system } = buildWishPrompt(birthday, 'Funny and in Hinglish')
    expect(system).toContain('Funny and in Hinglish')
    for (const rule of ['whole family', 'age', 'birth year', 'years married', '2–4 lines', 'hashtags', 'plain text']) {
      expect(system.toLowerCase()).toContain(rule.toLowerCase())
    }
  })

  test('prompt carries names, nickname and note', () => {
    const { prompt } = buildWishPrompt(birthday, DEFAULT_AI_STYLE)
    for (const part of ['birthday', 'Rahul', 'Chachu', 'Loves cricket']) expect(prompt).toContain(part)
  })

  test('prompt names the festival', () => {
    const input = toWishInput({ kind: 'festival', date: diwali.date, festival: diwali })
    expect(buildWishPrompt(input, DEFAULT_AI_STYLE).prompt).toContain('Diwali')
  })

  test('prompt carries the title of a special event and the couple for an anniversary', () => {
    const special = toWishInput({
      kind: 'event',
      date: '2026-11-02',
      event: ev({ type: 'special', title: 'Housewarming', names: 'Sharma family', familyCallsThem: null, note: null })
    })
    expect(buildWishPrompt(special, DEFAULT_AI_STYLE).prompt).toContain('Housewarming')
    const anniversary = toWishInput({ kind: 'event', date: '2026-10-25', event: ev({ type: 'anniversary', names: 'Amit & Priya' }) })
    expect(buildWishPrompt(anniversary, DEFAULT_AI_STYLE).prompt).toContain('Amit & Priya')
  })
})

describe('mentionsAge', () => {
  test.each([
    'Happy 60th birthday!',
    '25 years of togetherness',
    'turning 40 today',
    'aged 70',
    'Silver jubilee wishes',
    'Happy sixtieth birthday',
    'Happy twenty-fifth anniversary',
    '50 saal',
    'Fifty years together'
  ])('flags %s', (text) => expect(mentionsAge(text)).toBe(true))

  test.each(['Happy birthday Nani 🎂', 'Happy Diwali 2026! 🪔', 'Wishing you 100 reasons to smile', 'Many more happy years'])(
    'allows %s',
    (text) => expect(mentionsAge(text)).toBe(false)
  )
})

describe('fallbackWish', () => {
  test('uses familyCallsThem when set, otherwise names', () => {
    expect(fallbackWish(birthday)).toContain('Chachu')
    expect(fallbackWish({ ...birthday, familyCallsThem: null })).toContain('Rahul')
  })

  test.each<WishInput>([
    birthday,
    { ...birthday, occasion: 'anniversary', names: 'Amit & Priya', familyCallsThem: null },
    { ...birthday, occasion: 'special', title: 'Housewarming', names: 'Sharma family' },
    { ...birthday, occasion: 'special', title: 'Rohan 1st job', names: 'Rohan' },
    { occasion: 'festival', names: null, familyCallsThem: null, title: null, festivalName: 'Diwali', note: null }
  ])('never contains a digit (%#)', (input) => {
    const text = fallbackWish(input)
    expect(text).not.toMatch(/\d/)
    expect(mentionsAge(text)).toBe(false)
  })
})

describe('generateWish', () => {
  test('returns trimmed AI text without surrounding quotes', async () => {
    const result = await generateWish(birthday, DEFAULT_AI_STYLE, model(`  "${CLEAN}"  \n`))
    expect(result).toEqual({ text: CLEAN, source: 'ai' })
  })

  test('falls back to the template when the model throws', async () => {
    const result = await generateWish(birthday, DEFAULT_AI_STYLE, model(new Error('quota')))
    expect(result).toEqual({ text: fallbackWish(birthday), source: 'template' })
  })

  test('falls back to the template with no model', async () => {
    expect(await generateWish(birthday, DEFAULT_AI_STYLE, null)).toEqual({
      text: fallbackWish(birthday),
      source: 'template'
    })
  })

  test('regenerates once when the first wish mentions age', async () => {
    const fake = model('Happy 60th birthday', CLEAN)
    expect(await generateWish(birthday, DEFAULT_AI_STYLE, fake)).toEqual({ text: CLEAN, source: 'ai' })
    expect(fake.calls).toBe(2)
  })

  test('falls back when the model keeps mentioning age', async () => {
    const fake = model('Happy 60th birthday')
    expect((await generateWish(birthday, DEFAULT_AI_STYLE, fake)).source).toBe('template')
    expect(fake.calls).toBe(2)
  })

  test('falls back on empty text', async () => {
    expect((await generateWish(birthday, DEFAULT_AI_STYLE, model('  '))).source).toBe('template')
  })

  test('falls back when the model hangs past the timeout', async () => {
    vi.useFakeTimers()
    const hanging: WishModel = { generate: () => new Promise<string>(() => {}) }
    const pending = generateWish(birthday, DEFAULT_AI_STYLE, hanging)
    await vi.advanceTimersByTimeAsync(40_000)
    expect(await pending).toEqual({ text: fallbackWish(birthday), source: 'template' })
  })
})

describe('createGeminiModel', () => {
  test('calls generateContent with the system instruction and returns the text', async () => {
    generateContent.mockResolvedValueOnce({ text: CLEAN })
    const gemini = createGeminiModel({ apiKey: 'test-key', model: DEFAULT_GEMINI_MODEL })
    expect(await gemini.generate({ system: 'SYS', prompt: 'PROMPT' })).toBe(CLEAN)
    expect(generateContent).toHaveBeenCalledWith({
      model: 'gemini-3.5-flash-lite',
      contents: 'PROMPT',
      config: { systemInstruction: 'SYS', temperature: 0.9 }
    })
  })

  test('returns an empty string when the response has no text', async () => {
    generateContent.mockResolvedValueOnce({ text: undefined })
    const gemini = createGeminiModel({ apiKey: 'test-key', model: DEFAULT_GEMINI_MODEL })
    expect(await gemini.generate({ system: 'SYS', prompt: 'PROMPT' })).toBe('')
  })
})
