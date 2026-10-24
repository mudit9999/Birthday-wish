import { clearWaAuth, deleteWaAuth, readWaAuth, writeWaAuth, type Db } from '@family-wishes/db'
import {
  BufferJSON,
  initAuthCreds,
  proto,
  type AuthenticationCreds,
  type AuthenticationState,
  type SignalDataSet,
  type SignalDataTypeMap,
  type SignalKeyStore
} from 'baileys'

const CREDS_KEY = 'creds'

// Round-trip through BufferJSON so Buffers survive jsonb storage, as useMultiFileAuthState does on disk.
function toJson(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value, BufferJSON.replacer))
}

function fromJson<T>(value: unknown): T {
  return JSON.parse(JSON.stringify(value), BufferJSON.reviver) as T
}

function keyFor(type: string, id: string): string {
  return `${type}:${id}`
}

function createKeyStore(db: Db): SignalKeyStore {
  return {
    async get<T extends keyof SignalDataTypeMap>(type: T, ids: string[]) {
      const rows = await readWaAuth(db, ids.map((id) => keyFor(type, id)))
      const found = ids.flatMap((id) => {
        const raw = rows.get(keyFor(type, id))
        if (raw === undefined) return []
        const value = fromJson<SignalDataTypeMap[T]>(raw)
        const revived =
          type === 'app-state-sync-key' ? proto.Message.AppStateSyncKeyData.fromObject(value as object) : value
        return [[id, revived as SignalDataTypeMap[T]] as const]
      })
      return Object.fromEntries(found) as { [id: string]: SignalDataTypeMap[T] }
    },
    async set(data: SignalDataSet) {
      const entries = Object.entries(data).flatMap(([type, values]) =>
        Object.entries(values ?? {}).map(([id, value]) => ({ key: keyFor(type, id), value }))
      )
      await writeWaAuth(
        db,
        entries.filter((e) => e.value).map((e) => ({ key: e.key, value: toJson(e.value) }))
      )
      await deleteWaAuth(
        db,
        entries.filter((e) => !e.value).map((e) => e.key)
      )
    }
  }
}

/** Baileys auth state kept in the `wa_auth` table instead of files, so the VM disk holds no session. */
export async function useDbAuthState(
  db: Db
): Promise<{ state: AuthenticationState; saveCreds: () => Promise<void>; clear: () => Promise<void> }> {
  const stored = (await readWaAuth(db, [CREDS_KEY])).get(CREDS_KEY)
  // Baileys mutates this object in place as the session evolves; saveCreds persists the latest version.
  const creds: AuthenticationCreds = stored === undefined ? initAuthCreds() : fromJson<AuthenticationCreds>(stored)
  return {
    state: { creds, keys: createKeyStore(db) },
    saveCreds: () => writeWaAuth(db, [{ key: CREDS_KEY, value: toJson(creds) }]),
    clear: () => clearWaAuth(db)
  }
}
