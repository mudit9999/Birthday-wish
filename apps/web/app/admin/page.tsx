import { getSettings, getWaStatus, type WaState } from '@family-wishes/db'
import QRCode from 'qrcode'
import { NoticeForm } from '@/components/NoticeForm'
import { chooseGroupAction, runNowAction } from '@/lib/actions/admin'
import { getDb } from '@/lib/db'
import { getWebEnv } from '@/lib/env'
import { RefreshWhileWaiting } from './RefreshWhileWaiting'

const STATE_LABELS: Record<WaState, string> = {
  starting: 'Starting',
  qr: 'Waiting for QR scan',
  connected: 'Connected',
  reconnecting: 'Reconnecting',
  logged_out: 'Logged out',
  wrong_number: 'Wrong number linked'
}
const PROBLEM_STATES: WaState[] = ['logged_out', 'wrong_number', 'reconnecting']

export default async function AdminWhatsAppPage() {
  const db = await getDb()
  const [status, settings] = await Promise.all([getWaStatus(db), getSettings(db)])
  const qrImage = status.state === 'qr' && status.qr ? await QRCode.toDataURL(status.qr, { margin: 1, width: 280 }) : null
  const badgeClass = status.state === 'connected' ? 'badge ok' : PROBLEM_STATES.includes(status.state) ? 'badge bad' : 'badge'

  return (
    <>
      <RefreshWhileWaiting active={status.state !== 'connected'} />
      <h1>WhatsApp</h1>
      <p>
        <span className={badgeClass}>{STATE_LABELS[status.state]}</span>
        {status.linkedPhone && <span className="muted"> · linked to +{status.linkedPhone}</span>}
      </p>

      {qrImage && (
        <section className="stack">
          {/* eslint-disable-next-line @next/next/no-img-element -- data URL, nothing to optimise */}
          <img src={qrImage} alt="WhatsApp link QR code" width={280} height={280} className="qr" />
          <p className="notice">
            Scan with the admin&apos;s WhatsApp → Linked devices. Anyone who scans this controls the link.
          </p>
        </section>
      )}

      {status.state === 'wrong_number' && (
        <p className="notice error">
          The linked WhatsApp is not the admin number (+{getWebEnv().ADMIN_PHONE}). Unlink it in WhatsApp → Linked devices, then
          scan again with the admin&apos;s phone. Nothing will be sent until this is fixed.
        </p>
      )}

      <h2>Family group</h2>
      {status.groups.length === 0 ? (
        <p className="muted">Groups appear here once WhatsApp is connected.</p>
      ) : (
        <NoticeForm action={chooseGroupAction} submitLabel="Save group">
          <label>
            Post wishes to
            <select name="groupId" defaultValue={settings.groupId ?? ''} required>
              <option value="" disabled>
                Choose a group…
              </option>
              {status.groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </label>
        </NoticeForm>
      )}

      <h2>Run now</h2>
      <div className="stack">
        <NoticeForm action={runNowAction.bind(null, 'draft')} submitLabel="Draft tomorrow's wishes now" className="secondary" />
        <NoticeForm action={runNowAction.bind(null, 'send')} submitLabel="Post approved wishes now" className="secondary" />
      </div>

      <p className="muted" style={{ marginTop: '2rem' }}>
        Status last updated {status.updatedAt.toLocaleString('en-IN', { timeZone: settings.timeZone })}
      </p>
    </>
  )
}
