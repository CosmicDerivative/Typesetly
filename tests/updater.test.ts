import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const {
  compareVersions,
  describeUpdateCheck,
  normalizeVersion,
} = require('../electron/updater.cjs') as {
  compareVersions: (left: string, right: string) => number
  describeUpdateCheck: (
    result: unknown,
    currentVersion: string,
  ) => {
    ok: boolean
    currentVersion: string
    latestVersion: string
    updateAvailable: boolean
  }
  normalizeVersion: (version: string) => { text: string } | undefined
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
      latestVersion: '1.2.0',
      updateAvailable: true,
    },
  )
  assert.throws(
    () => describeUpdateCheck({ isUpdateAvailable: true, updateInfo: {} }, '1.1.8'),
    /valid release metadata/,
  )
})
