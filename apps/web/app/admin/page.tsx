import { getSettings, getWaStatus, type WaState } from '@family-wishes/db'
import QRCode from 'qrcode'
import { NoticeForm } from '@/components/NoticeForm'
import { chooseGroupAction, runNowAction } from '@/lib/actions/admin'
import { getDb } from '@/lib/db'
import { getWebEnv } from '@/lib/env'
import { RefreshWhileWaiting } from './RefreshWhileWaiting'

const STATE: Record<WaState, { label: string; dot: string }> = {
  starting: { label: 'Starting', dot: 'wait' },
  qr: { label: 'Waiting for the QR scan', dot: 'wait' },
  connected: { label: 'Connected', dot: 'ok' },
  reconnecting: { label: 'Reconnecting', dot: 'bad' },
  logged_out: { label: 'Logged out', dot: 'bad' },
  wrong_number: { label: 'Wrong number linked', dot: 'bad' }
}

function finding(state: WaState, groupName: string | null, sendTime: string, linkedPhone: string | null): string {
  if (state === 'connected' && groupName) return `Linked to +${linkedPhone}. Approved wishes post to “${groupName}” at ${sendTime}.`
  if (state === 'connected') return 'Linked. Choose the group the wishes should go to.'
  if (state === 'qr') return 'Scan the code below with the admin’s WhatsApp to link it.'
  if (state === 'wrong_number') return 'A different WhatsApp number is linked. Nothing will be sent until it is fixed.'
  if (state === 'starting') return 'The worker hasn’t reported in yet. Check it is running on the server.'
  return 'WhatsApp is not connected. Nothing will be sent until it reconnects.'
}

export default async function AdminWhatsAppPage() {
  const db = await getDb()
  const [status, settings] = await Promise.all([getWaStatus(db), getSettings(db)])
  const group = status.groups.find((g) => g.id === settings.groupId) ?? null
  const qrImage = status.state === 'qr' && status.qr ? await QRCode.toDataURL(status.qr, { margin: 1, width: 560 }) : null
  const updated = status.updatedAt.toLocaleString('en-IN', { timeZone: settings.timeZone, dateStyle: 'medium', timeStyle: 'short' })

  return (
    <>
      <RefreshWhileWaiting active={status.state !== 'connected'} />
      <header className="title-row">
        <div>
          <h1 className="title">WhatsApp</h1>
          <p className="lede">{finding(status.state, group?.name ?? null, settings.sendTime, status.linkedPhone)}</p>
        </div>
      </header>

      <div className="grid">
        <section className="panel span-7 stretch">
          <div className="panel-head">
            <h2>Link</h2>
            <span className="end">Updated {updated}</span>
          </div>
          <div className="stack">
            <p className="status-line">
              <span className={`dot ${STATE[status.state].dot}`} aria-hidden="true" />
              <strong style={{ fontWeight: 500 }}>{STATE[status.state].label}</strong>
              {status.linkedPhone && <span className="muted num">+{status.linkedPhone}</span>}
            </p>
            {qrImage && (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element -- data URL, nothing to optimise */}
                <img src={qrImage} alt="WhatsApp link QR code" width={280} height={280} className="qr" />
                <p className="notice">On the admin’s phone: WhatsApp → Linked devices → Link a device. Anyone who scans this controls the link.</p>
              </>
            )}
            {status.state === 'wrong_number' && (
              <p className="notice">
                Unlink this device in WhatsApp → Linked devices, then scan again with the admin’s phone (+{getWebEnv().ADMIN_PHONE}).
              </p>
            )}
            {status.state === 'connected' && <p className="muted">The worker is online and listening for your replies in “Message yourself”.</p>}
            {status.state === 'starting' && (
              <p className="muted">When the worker starts it shows a QR code here. Scan it from the admin’s phone to link WhatsApp.</p>
            )}
            {(status.state === 'reconnecting' || status.state === 'logged_out') && (
              <p className="muted">The worker retries on its own. A new QR code appears here if WhatsApp needs linking again.</p>
            )}
          </div>
        </section>

        <section className="panel span-5 stretch">
          <div className="panel-head">
            <h2>Family group</h2>
            {group && <span className="pill positive">Chosen</span>}
          </div>
          {status.groups.length === 0 ? (
            <p className="empty">Groups appear here once WhatsApp is connected.</p>
          ) : (
            <NoticeForm action={chooseGroupAction} submitLabel="Save group">
              <label className="field">
                Post wishes to
                <span className="hint">Try a test group first. Switch to the real family group when you’re happy.</span>
                <select name="groupId" defaultValue={settings.groupId ?? ''} required>
                  <option value="" disabled>
                    Choose a group
                  </option>
                  {status.groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </label>
            </NoticeForm>
          )}
        </section>

        <section className="panel span-12">
          <div className="panel-head">
            <h2>Run now</h2>
            <span className="end">Normally automatic: drafts at {settings.draftTime}, posting at {settings.sendTime}</span>
          </div>
          <div className="grid">
            <div className="span-6">
              <NoticeForm action={runNowAction.bind(null, 'draft')} submitLabel="Draft tomorrow’s wishes" className="secondary">
                <p className="muted">Writes tomorrow’s drafts now and sends them to your “Message yourself” chat for approval.</p>
              </NoticeForm>
            </div>
            <div className="span-6">
              <NoticeForm action={runNowAction.bind(null, 'send')} submitLabel="Post approved wishes" className="secondary">
                <p className="muted">Posts today’s approved wishes to the group straight away instead of waiting for {settings.sendTime}.</p>
              </NoticeForm>
            </div>
          </div>
        </section>
      </div>
    </>
  )
}
