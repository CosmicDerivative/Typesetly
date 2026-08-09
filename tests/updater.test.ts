import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const {
  compareVersions,
  describeUpdateCheck,
  isHotpatchAvailable,
  normalizeHotpatchRevision,
  normalizeVersion,
  windowsUpdaterChannel,
} = require('../electron/updater.cjs') as {
  compareVersions: (left: string, right: string) => number
  describeUpdateCheck: (
    result: unknown,
    currentVersion: string,
    currentHotpatchRevision?: number,
  ) => {
    ok: boolean
    currentVersion: string
    currentHotpatchRevision: number
    latestVersion: string
    latestHotpatchRevision: number
    hotpatchAvailable: boolean
    updateAvailable: boolean
  }
  isHotpatchAvailable: (updateInfo: unknown, currentVersion: string, currentRevision?: number) => boolean
  normalizeHotpatchRevision: (revision: unknown) => number
  normalizeVersion: (version: string) => { text: string } | undefined
  windowsUpdaterChannel: (architecture: string) => string
}

test('version comparison detects newer stable updater releases', () => {
  assert.equal(compareVersions('1.2.0', '1.1.9'), 1)
  assert.equal(compareVersions('v1.1.1', '1.1.1'), 0)
  assert.equal(compareVersions('1.1.1-beta.2', '1.1.1'), -1)
  assert.equal(normalizeVersion('v2.0.1')?.text, '2.0.1')
})

test('official updater results become renderer-safe status objects', () => {
  assert.deepEqual(
    describeUpdateCheck({
      isUpdateAvailable: true,
      updateInfo: { version: '1.2.0', files: [] },
    }, '1.1.8'),
    {
      ok: true,
      currentVersion: '1.1.8',
      currentHotpatchRevision: 0,
      latestVersion: '1.2.0',
      latestHotpatchRevision: 0,
      hotpatchAvailable: false,
      updateAvailable: true,
    },
  )
  assert.throws(
    () => describeUpdateCheck({ isUpdateAvailable: true, updateInfo: {} }, '1.1.8'),
    /valid release metadata/,
  )
})

test('same-version hotpatch revisions are offered monotonically', () => {
  const updateInfo = { version: '1.2.3', hotpatchRevision: 3 }
  assert.equal(isHotpatchAvailable(updateInfo, '1.2.3', 2), true)
  assert.equal(isHotpatchAvailable(updateInfo, '1.2.3', 3), false)
  assert.equal(isHotpatchAvailable(updateInfo, '1.2.4', 0), false)
  assert.equal(normalizeHotpatchRevision('4'), 4)
  assert.equal(normalizeHotpatchRevision(-1), 0)

  assert.deepEqual(
    describeUpdateCheck({ isUpdateAvailable: false, updateInfo }, '1.2.3', 2),
    {
      ok: true,
      currentVersion: '1.2.3',
      currentHotpatchRevision: 2,
      latestVersion: '1.2.3',
      latestHotpatchRevision: 3,
      hotpatchAvailable: true,
      updateAvailable: true,
    },
  )
})

test('Windows updates select architecture-specific release metadata', () => {
  assert.equal(windowsUpdaterChannel('arm64'), 'latest-arm64')
  assert.equal(windowsUpdaterChannel('x64'), 'latest-x64')
  assert.equal(windowsUpdaterChannel('ia32'), 'latest-x64')
})
