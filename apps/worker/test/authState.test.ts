import { getWaStatus, setWaStatus, type DbHandle } from '@family-wishes/db'
import { createTestDb } from '@family-wishes/db/testing'
import { initAuthCreds, proto } from 'baileys'
import { randomBytes } from 'node:crypto'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { useDbAuthState } from '../src/wa/authState.js'

let h: DbHandle

const keyPair = () => ({ private: randomBytes(32), public: randomBytes(32) })

beforeAll(async () => {
  h = await createTestDb()
})

afterAll(async () => {
  await h.close()
})

test('fresh state starts from new creds and saved creds survive a reload with Buffers intact', async () => {
  const first = await useDbAuthState(h.db)
  expect(Object.keys(first.state.creds).sort()).toEqual(Object.keys(initAuthCreds()).sort())
  await first.saveCreds()

  const second = await useDbAuthState(h.db)
  expect(second.state.creds).toEqual(first.state.creds)
  expect(Buffer.isBuffer(second.state.creds.noiseKey.private)).toBe(true)
  expect(Buffer.isBuffer(second.state.creds.signedIdentityKey.public)).toBe(true)
})

test('keys round-trip, missing ids are omitted and null deletes', async () => {
  const { state } = await useDbAuthState(h.db)
  const pair = keyPair()
  await state.keys.set({ 'pre-key': { '1': pair } })
  const got = await state.keys.get('pre-key', ['1', '2'])
  expect(got).toEqual({ '1': pair })
  expect(Buffer.isBuffer(got['1']?.private)).toBe(true)

  await state.keys.set({ 'pre-key': { '1': null } })
  expect(await state.keys.get('pre-key', ['1'])).toEqual({})
})

test('app-state-sync-key values are revived as protobuf objects', async () => {
  const { state } = await useDbAuthState(h.db)
  await state.keys.set({ 'app-state-sync-key': { AAA: proto.Message.AppStateSyncKeyData.fromObject({ keyData: randomBytes(16) }) } })
  const got = await state.keys.get('app-state-sync-key', ['AAA'])
  expect(got.AAA).toBeInstanceOf(proto.Message.AppStateSyncKeyData)
})

test('a batch set writes several keys at once', async () => {
  const { state } = await useDbAuthState(h.db)
  await state.keys.set({ 'pre-key': { '10': keyPair(), '11': keyPair() }, session: { 'abc.0': Buffer.from('s') } })
  expect(Object.keys(await state.keys.get('pre-key', ['10', '11']))).toEqual(['10', '11'])
  expect(await state.keys.get('session', ['abc.0'])).toEqual({ 'abc.0': Buffer.from('s') })
})

test('clear empties the auth store', async () => {
  const auth = await useDbAuthState(h.db)
  await auth.saveCreds()
  await auth.clear()
  expect(await auth.state.keys.get('pre-key', ['10'])).toEqual({})
  const fresh = await useDbAuthState(h.db)
  expect(fresh.state.creds.noiseKey).not.toEqual(auth.state.creds.noiseKey)
})

test('wa status round-trips', async () => {
  expect(await getWaStatus(h.db)).toMatchObject({ state: 'starting', qr: null, groups: [], linkedPhone: null })
  await setWaStatus(h.db, { state: 'qr', qr: 'abc' })
  expect(await getWaStatus(h.db)).toMatchObject({ state: 'qr', qr: 'abc' })
  await setWaStatus(h.db, { state: 'connected', qr: null, linkedPhone: '919800000000', groups: [{ id: 'g@g.us', name: 'Family' }] })
  const status = await getWaStatus(h.db)
  expect(status).toMatchObject({ state: 'connected', qr: null, linkedPhone: '919800000000', groups: [{ id: 'g@g.us', name: 'Family' }] })
  expect(status.updatedAt).toBeInstanceOf(Date)
})
