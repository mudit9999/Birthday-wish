import type { ReactNode } from 'react'

/** An entry form beside a short note on what happens with what they type. */
export function EntryLayout({ title, lede, children }: { title: string; lede: string; children: ReactNode }) {
  return (
    <>
      <header className="title-row">
        <div>
          <h1 className="title">{title}</h1>
          <p className="lede">{lede}</p>
        </div>
      </header>
      <div className="grid">
        <section className="panel span-7">{children}</section>
        <aside className="panel span-5">
          <div className="panel-head">
            <h2>How your entry is used</h2>
          </div>
          <div className="stack muted">
            <p>The evening before, the family’s wish writer drafts a short message for the WhatsApp group using the name the family calls them and your note.</p>
            <p>The admin reads every draft before it goes out. Nothing is posted without their approval.</p>
            <p>The year is kept only for you and the admin. Wishes never mention age or years married.</p>
          </div>
        </aside>
      </div>
    </>
  )
}
