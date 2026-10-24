export type ISODate = string // 'YYYY-MM-DD'

const PARTS_FORMAT_OPTIONS: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23'
}

function localParts(now: Date, timeZone: string): { date: ISODate; time: string } {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    ...PARTS_FORMAT_OPTIONS
  })
  const parts = formatter.formatToParts(now)
  const get = (type: Intl.DateTimeFormatPartTypes): string => {
    const part = parts.find((p) => p.type === type)
    if (!part) throw new Error(`missing date part: ${type}`)
    return part.value
  }
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${get('hour')}:${get('minute')}`
  }
}

/** The calendar date in `timeZone` for the instant `now`, as `'YYYY-MM-DD'`. */
export function localDate(now: Date, timeZone: string): ISODate {
  return localParts(now, timeZone).date
}

/** The wall-clock time in `timeZone` for the instant `now`, as `'HH:MM'` (24h). */
export function localTime(now: Date, timeZone: string): string {
  return localParts(now, timeZone).time
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function toUtcMidnight(date: ISODate): Date {
  if (!ISO_DATE_PATTERN.test(date)) {
    throw new Error(`invalid ISO date: ${date}`)
  }
  const [year, month, day] = date.split('-') as [string, string, string]
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
}

function fromUtcMidnight(date: Date): ISODate {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** `date` shifted by `days` (negative moves backward), handling month/year/leap-day rollover. */
export function addDays(date: ISODate, days: number): ISODate {
  const shifted = toUtcMidnight(date)
  shifted.setUTCDate(shifted.getUTCDate() + days)
  return fromUtcMidnight(shifted)
}

const LEAP_YEAR_DIVISOR_4 = 4
const LEAP_YEAR_DIVISOR_100 = 100
const LEAP_YEAR_DIVISOR_400 = 400

/** Whether `year` is a leap year in the Gregorian calendar. */
export function isLeapYear(year: number): boolean {
  if (year % LEAP_YEAR_DIVISOR_400 === 0) return true
  if (year % LEAP_YEAR_DIVISOR_100 === 0) return false
  return year % LEAP_YEAR_DIVISOR_4 === 0
}

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
]

/** Formats `date` as a short human label, e.g. `'Sun 25 Oct'`. */
export function formatDateLabel(date: ISODate): string {
  const utcDate = toUtcMidnight(date)
  const weekday = WEEKDAY_LABELS[utcDate.getUTCDay()]
  const day = utcDate.getUTCDate()
  const month = MONTH_LABELS[utcDate.getUTCMonth()]
  return `${weekday} ${day} ${month}`
}

/** Whether the clock time `now` ('HH:MM') has reached or passed `at` ('HH:MM'). */
export function isTimeReached(now: string, at: string): boolean {
  return now >= at
}
