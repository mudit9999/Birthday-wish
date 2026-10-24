import { addDays, formatDateLabel, type ISODate, type Occurrence } from '@family-wishes/core'
import { occasionParts, personTint } from '@/lib/present'

const DAY_LABEL = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
const STRIP_ROW = 30
const AXIS_STEP = 10

function isWeekend(date: ISODate): boolean {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay()
  return day === 0 || day === 6
}

/** The next N days as a strip of day cells: family occasions in ink, festivals in the accent, today ringed. */
export function DayStrip({ from, days, items }: { from: ISODate; days: number; items: Occurrence[] }) {
  const dates = Array.from({ length: days }, (_, i) => addDays(from, i))
  const rows = Array.from({ length: Math.ceil(days / STRIP_ROW) }, (_, r) => dates.slice(r * STRIP_ROW, (r + 1) * STRIP_ROW))
  const byDate = new Map<ISODate, Occurrence[]>()
  for (const item of items) byDate.set(item.date, [...(byDate.get(item.date) ?? []), item])
  const summary = `${items.length} occasions in the next ${days} days`

  return (
    <div role="img" aria-label={summary}>
      {rows.map((row) => (
        <div key={row[0]}>
          <div className="strip">
            {row.map((date) => {
              const here = byDate.get(date) ?? []
              const family = here.some((o) => o.kind === 'event')
              const classes = [
                'day',
                isWeekend(date) ? 'weekend' : '',
                here.length > 0 ? 'has' : '',
                here.length > 0 && !family ? 'fest' : '',
                date === from ? 'today' : ''
              ]
              const title = [DAY_LABEL.format(new Date(`${date}T00:00:00Z`)), ...here.map((o) => occasionParts(o).who)].join(' · ')
              return <span key={date} className={classes.filter(Boolean).join(' ')} title={title} />
            })}
          </div>
          <div className="strip-axis" aria-hidden="true">
            {row.filter((_, i) => i % AXIS_STEP === 0).map((date) => (
              <span key={date}>{formatDateLabel(date)}</span>
            ))}
          </div>
        </div>
      ))}
      <div className="key" aria-hidden="true">
        <span>
          <i style={{ background: 'var(--text)' }} />
          Family occasion
        </span>
        <span>
          <i style={{ background: 'var(--accent)' }} />
          Festival
        </span>
        <span>
          <i style={{ boxShadow: 'inset 0 0 0 2px var(--accent)' }} />
          Today
        </span>
      </div>
    </div>
  )
}

/** One occasion as a two-line row card: who, what, and the date on the right. */
export function OccasionRow({ item, today }: { item: Occurrence; today: ISODate }) {
  const { who, what, initial } = occasionParts(item)
  const isFestival = item.kind === 'festival'
  return (
    <li className="row">
      <span
        className={`avatar${isFestival ? ' festival' : ''}`}
        style={isFestival ? undefined : { background: personTint(item.kind === 'event' ? item.event.names : who) }}
        aria-hidden="true"
      >
        {initial}
      </span>
      <span className="body">
        <span className="line1">{who}</span>
        <span className="line2" style={{ display: 'block' }}>
          {what}
        </span>
      </span>
      <span className="meta">
        <strong>{formatDateLabel(item.date)}</strong>
        {item.date === today ? 'Today' : item.date === addDays(today, 1) ? 'Tomorrow' : ''}
      </span>
    </li>
  )
}
