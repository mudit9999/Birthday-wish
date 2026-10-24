import type { EventType, Occurrence } from '../occurrences.ts'

/** Everything the generator may see. Deliberately has no year, so age can't leak in. */
export interface WishInput {
  occasion: EventType | 'festival'
  names: string | null
  familyCallsThem: string | null
  title: string | null
  festivalName: string | null
  note: string | null
}

export const DEFAULT_AI_STYLE =
  'Warm and short (2–4 lines), mostly English with a natural Hindi touch, a couple of fitting emojis, no hashtags.'

export function toWishInput(o: Occurrence): WishInput {
  if (o.kind === 'festival') {
    return { occasion: 'festival', names: null, familyCallsThem: null, title: null, festivalName: o.festival.name, note: null }
  }
  const { type, names, familyCallsThem, title, note } = o.event
  return { occasion: type, names, familyCallsThem, title, festivalName: null, note }
}

const RULES = [
  "Write in the whole family's voice (we / all of us), as a message posted in the family WhatsApp group.",
  'Never mention age, birth year, years married or any milestone number, even if the notes hint at one.',
  'Keep it to 2–4 lines.',
  'No hashtags.',
  'Plain text only: no quotes, no markdown, no preamble. Reply with the wish alone.'
]

function occasionLine(input: WishInput): string {
  switch (input.occasion) {
    case 'festival':
      return `Occasion: the festival ${input.festivalName ?? ''}. Wish the whole family.`
    case 'anniversary':
      return 'Occasion: wedding anniversary.'
    case 'special':
      return `Occasion: ${input.title ?? 'a special day'}.`
    case 'birthday':
      return 'Occasion: birthday.'
  }
}

/** The system instruction and user prompt for one wish. */
export function buildWishPrompt(input: WishInput, style: string): { system: string; prompt: string } {
  const system = [
    'You write short family wishes for an Indian family WhatsApp group.',
    `Style: ${style}`,
    'Rules:',
    ...RULES.map((rule) => `- ${rule}`)
  ].join('\n')
  const lines = [
    occasionLine(input),
    input.names ? `${input.occasion === 'anniversary' ? 'Couple' : 'For'}: ${input.names}` : null,
    input.familyCallsThem ? `The family calls them: ${input.familyCallsThem}` : null,
    input.note ? `Note from the family: ${input.note}` : null
  ]
  return { system, prompt: lines.filter((line) => line !== null).join('\n') }
}
