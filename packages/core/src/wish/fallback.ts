import type { WishInput } from './prompt.ts'

// A digit in a name or title could carry an age ("Rohan 1st job"), so it is replaced.
function safe(value: string | null, fallback: string): string {
  return value && !/\d/.test(value) ? value : fallback
}

/** A built-in wish used when the AI is unavailable. Contains no digits. */
export function fallbackWish(input: WishInput): string {
  const who = safe(input.familyCallsThem ?? input.names, 'you')
  switch (input.occasion) {
    case 'birthday':
      return `Happy birthday, ${who}! 🎂 Wishing you a wonderful year ahead full of love, laughter and good health. Lots of love from all of us ❤️`
    case 'anniversary':
      return `Happy anniversary, ${who}! 💐 Wishing you both a lifetime of love and happiness together. With love from the whole family ❤️`
    case 'special':
      return `Congratulations on the ${safe(input.title, 'special day')}, ${who}! 🎉 Wishing you joy and happiness always. With love from the whole family ❤️`
    case 'festival':
      return `Happy ${safe(input.festivalName, 'festival')} to the whole family! ✨ Wishing everyone joy, peace and prosperity. With love from all of us ❤️`
  }
}
