const UNITS = 'one|two|three|four|five|six|seven|eight|nine'
const TENS = 'ten|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred'
const TEEN_ORDINALS = 'tenth|eleventh|twelfth|thirteenth|fourteenth|fifteenth|sixteenth|seventeenth|eighteenth|nineteenth'
const TENS_ORDINALS = 'twentieth|thirtieth|fortieth|fiftieth|sixtieth|seventieth|eightieth|ninetieth|hundredth'
const UNIT_ORDINALS = 'first|second|third|fourth|fifth|sixth|seventh|eighth|ninth'
const YEAR_WORDS = 'years?|yrs?|saal|varsh|baras'

const AGE_PATTERNS: RegExp[] = [
  /\b\d+\s*(st|nd|rd|th)\b/i,
  new RegExp(`\\b\\d+\\s*(${YEAR_WORDS})\\b`, 'i'),
  /\b(turning|turns|turned|aged?)\s+\d+/i,
  /\bjubilee\b/i,
  /\b(silver|golden|ruby|pearl|diamond|platinum)\s+(anniversary|wedding)\b/i,
  new RegExp(`\\b(${TEEN_ORDINALS}|${TENS_ORDINALS})\\b`, 'i'),
  new RegExp(`\\b(${TENS})[\\s-]+(${UNIT_ORDINALS})\\b`, 'i'),
  new RegExp(`\\b(${UNITS}|${TENS})([\\s-]+(${UNITS}))?\\s+(${YEAR_WORDS})\\b`, 'i')
]

/** Whether `text` hints at someone's age or years married. Errs on the side of flagging. */
export function mentionsAge(text: string): boolean {
  return AGE_PATTERNS.some((pattern) => pattern.test(text))
}
