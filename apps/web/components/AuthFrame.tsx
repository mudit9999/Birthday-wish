import { fallbackWish } from '@family-wishes/core'
import type { ReactNode } from 'react'
import { Mark } from './Mark'

const SAMPLE = fallbackWish({ occasion: 'festival', names: null, familyCallsThem: null, title: null, festivalName: 'Diwali', note: null })

/** The sign-in frame: the family's mark, one wish as the group receives it, and the form beside it. */
export function AuthFrame({ children }: { children: ReactNode }) {
  return (
    <div className="auth">
      <aside className="auth-side">
        <span className="brand">
          <Mark color="#ffffff" />
          Family Wishes
        </span>
        <figure className="auth-sample">
          <figcaption>Family group · 08:00</figcaption>
          <p className="message">
            {SAMPLE}
            <span className="stamp">08:00</span>
          </p>
        </figure>
        <div className="stack">
          <p className="greeting">Every birthday, wished on time.</p>
          <p>Add the dates once. Each morning the family group gets a warm wish, checked by the admin before it goes out.</p>
        </div>
      </aside>
      <main className="auth-main">
        <div className="auth-card">{children}</div>
      </main>
    </div>
  )
}
