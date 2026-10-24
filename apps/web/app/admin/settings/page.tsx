import { fallbackWish } from '@family-wishes/core'
import { getSettings } from '@family-wishes/db'
import { saveSettingsAction } from '@/lib/actions/admin'
import { getDb } from '@/lib/db'
import { SettingsForm } from './SettingsForm'

const SAMPLE = fallbackWish({ occasion: 'birthday', names: 'Rahul', familyCallsThem: 'Chachu', title: null, festivalName: null, note: null })

export default async function SettingsPage() {
  const s = await getSettings(await getDb())
  return (
    <>
      <header className="title-row">
        <div>
          <h1 className="title">Settings</h1>
          <p className="lede">When wishes are drafted and posted, and how they sound.</p>
        </div>
      </header>
      <SettingsForm
        action={saveSettingsAction}
        sample={SAMPLE}
        values={{
          draft_time: s.draftTime,
          nudge_time: s.nudgeTime,
          send_time: s.sendTime,
          time_zone: s.timeZone,
          country_code: s.countryCode,
          ai_style: s.aiStyle
        }}
        cardImages={s.cardImages}
      />
    </>
  )
}
