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

  return (
    <>
      <h1>Festivals</h1>
      <p className="muted">
        Dates come from drikpanchang.com (New Delhi). Check next year&apos;s dates each December; you&apos;ll get a reminder on WhatsApp.
      </p>

      <h2>Add a festival</h2>
      <NoticeForm action={saveFestivalAction.bind(null, null)} submitLabel="Add festival">
        <div className="row">
          <label>
            Name
            <input name="name" required maxLength={60} />
          </label>
          <label>
            Date
            <input name="date" type="date" required />
          </label>
        </div>
      </NoticeForm>

      {byYear(festivals).map(([year, rows]) => (
        <section key={year}>
          <h2>{year}</h2>
          <ul className="list">
            {rows.map((f) => (
              <li key={f.id}>
                <span className="when">{formatDateLabel(f.date)}</span>
                <details className="what">
                  <summary>{f.name}</summary>
                  <NoticeForm action={saveFestivalAction.bind(null, f.id)} submitLabel="Save" className="secondary">
                    <div className="row">
                      <label>
                        Name
                        <input name="name" defaultValue={f.name} required maxLength={60} />
                      </label>
                      <label>
                        Date
                        <input name="date" type="date" defaultValue={f.date} required />
                      </label>
                    </div>
                  </NoticeForm>
                  <form action={deleteFestivalAction.bind(null, f.id)}>
                    <ConfirmSubmit className="danger" message={`Delete ${f.name} on ${f.date}?`}>
                      Delete
                    </ConfirmSubmit>
                  </form>
                </details>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  )
}
