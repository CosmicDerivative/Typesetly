import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const {
  compareVersions,
  describeRelease,
  isTrustedReleaseDownload,
  parseChecksumFile,
  selectInstallerAsset,
} = require('../electron/updater.cjs') as {
  compareVersions: (left: string, right: string) => number
  describeRelease: (
    release: unknown,
    currentVersion: string,
    platform: string,
    arch: string,
  ) => {
    updateAvailable: boolean
    latestVersion: string
    installer?: { name: string }
  }
  isTrustedReleaseDownload: (url: string) => boolean
  parseChecksumFile: (contents: string, fileName: string) => string | undefined
  selectInstallerAsset: (
    assets: unknown[],
    platform: string,
    arch: string,
  ) => { name: string } | undefined
}

const urlFor = (name: string) =>
  `https://github.com/CosmicDerivative/Typesetly/releases/download/v1.2.0/${name}`
const asset = (name: string) => ({ name, browser_download_url: urlFor(name), size: 42 })
const assets = [
  asset('Typesetly-Setup-1.2.0-x64.exe'),
  asset('Typesetly-Portable-1.2.0-x64.exe'),
  asset('Typesetly-1.2.0-x64.dmg'),
  asset('Typesetly-1.2.0-arm64.dmg'),
  asset('Typesetly-1.2.0-x86_64.AppImage'),
  asset('Typesetly_1.2.0_amd64.deb'),
  asset('SHA256SUMS.txt'),
]

test('version comparison detects newer stable GitHub releases', () => {
  assert.equal(compareVersions('1.2.0', '1.1.9'), 1)
  assert.equal(compareVersions('v1.1.1', '1.1.1'), 0)
  assert.equal(compareVersions('1.1.1-beta.2', '1.1.1'), -1)
})

test('installer selection matches the running operating system and architecture', () => {
  assert.equal(
    selectInstallerAsset(assets, 'win32', 'x64')?.name,
    'Typesetly-Setup-1.2.0-x64.exe',
  )
  assert.equal(
    selectInstallerAsset(assets, 'darwin', 'arm64')?.name,
    'Typesetly-1.2.0-arm64.dmg',
  )
  assert.equal(
    selectInstallerAsset(assets, 'linux', 'x64')?.name,
    'Typesetly-1.2.0-x86_64.AppImage',
  )
  assert.equal(selectInstallerAsset(assets, 'win32', 'arm64'), undefined)
})

test('release descriptions expose only newer compatible installers', () => {
  const release = {
    tag_name: 'v1.2.0',
    html_url: 'https://github.com/CosmicDerivative/Typesetly/releases/tag/v1.2.0',
    assets,
  }
  const update = describeRelease(release, '1.1.1', 'win32', 'x64')
  assert.equal(update.updateAvailable, true)
  assert.equal(update.latestVersion, '1.2.0')
  assert.equal(update.installer?.name, 'Typesetly-Setup-1.2.0-x64.exe')
  assert.equal(describeRelease(release, '1.2.0', 'win32', 'x64').updateAvailable, false)
})

test('checksum parsing and release URL validation reject untrusted downloads', () => {
  const hash = 'a'.repeat(64)
  assert.equal(
    parseChecksumFile(`${hash}  Typesetly-Setup-1.2.0-x64.exe\n`, 'Typesetly-Setup-1.2.0-x64.exe'),
    hash,
  )
  assert.equal(isTrustedReleaseDownload(urlFor('Typesetly-Setup-1.2.0-x64.exe')), true)
  assert.equal(
    isTrustedReleaseDownload('https://example.com/Typesetly-Setup-1.2.0-x64.exe'),
    false,
  )
})
