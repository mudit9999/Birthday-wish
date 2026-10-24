import { getSettings } from '@family-wishes/db'
import { saveSettingsAction } from '@/lib/actions/admin'
import { getDb } from '@/lib/db'
import { SettingsForm } from './SettingsForm'

export default async function SettingsPage() {
  const s = await getSettings(await getDb())
  return (
    <>
      <h1>Settings</h1>
      <SettingsForm
        action={saveSettingsAction}
        values={{
          draft_time: s.draftTime,
          nudge_time: s.nudgeTime,
          send_time: s.sendTime,
          time_zone: s.timeZone,
          country_code: s.countryCode,
          ai_style: s.aiStyle
        }}
      />
    </>
  )
}
