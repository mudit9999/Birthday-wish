import { formatDateLabel, type Festival } from '@family-wishes/core'
import { listFestivals } from '@family-wishes/db'
import { ConfirmSubmit } from '@/components/ConfirmSubmit'
import { NoticeForm } from '@/components/NoticeForm'
import { deleteFestivalAction, saveFestivalAction } from '@/lib/actions/admin'
import { getDb } from '@/lib/db'

function byYear(festivals: Festival[]): [string, Festival[]][] {
  const years = [...new Set(festivals.map((f) => f.date.slice(0, 4)))]
  return years.map((year) => [year, festivals.filter((f) => f.date.startsWith(year))])
}

export default async function FestivalsPage() {
  const festivals = await listFestivals(await getDb())
  const years = byYear(festivals)

  return (
    <>
      <header className="title-row">
        <div>
          <h1 className="title">Festivals</h1>
          <p className="lede">
            {festivals.length} dates across {years.map(([y]) => y).join(' and ')}, from drikpanchang.com for New Delhi. You get a reminder each December to add next year.
          </p>
        </div>
      </header>
      <div className="grid">
        <div className="span-8 stack">
          {years.map(([year, rows]) => (
            <section key={year} className="panel">
              <div className="panel-head">
                <h2>{year}</h2>
                <span className="count">{rows.length}</span>
              </div>
              <ul className="rows">
                {rows.map((f) => (
                  <li key={f.id} className="row">
                    <span className="meta" style={{ width: 96, textAlign: 'left' }}>
                      <strong>{formatDateLabel(f.date)}</strong>
                    </span>
                    <details className="body disclosure">
                      <summary>{f.name}</summary>
                      <div className="stack" style={{ padding: '8px 0 6px' }}>
                        <NoticeForm action={saveFestivalAction.bind(null, f.id)} submitLabel="Save" className="secondary">
                          <div className="pair">
                            <label className="field">
                              Name
                              <input name="name" defaultValue={f.name} required maxLength={60} />
                            </label>
                            <label className="field">
                              Date
                              <input name="date" type="date" defaultValue={f.date} required />
                            </label>
                          </div>
                        </NoticeForm>
                        <form action={deleteFestivalAction.bind(null, f.id)}>
                          <ConfirmSubmit className="danger" message={`Delete ${f.name} on ${f.date}?`}>
                            Delete this date
                          </ConfirmSubmit>
                        </form>
                      </div>
                    </details>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <section className="panel span-4">
          <div className="panel-head">
            <h2>Add a festival</h2>
          </div>
          <NoticeForm action={saveFestivalAction.bind(null, null)} submitLabel="Add festival">
            <label className="field">
              Name
              <input name="name" required maxLength={60} placeholder="e.g. Diwali" />
            </label>
            <label className="field">
              Date
              <input name="date" type="date" required />
            </label>
          </NoticeForm>
        </section>
      </div>
    </>
  )
}
