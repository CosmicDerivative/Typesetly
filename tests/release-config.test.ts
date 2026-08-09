import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const { prepareWindowsChannel } = require('../.github/prepare-windows-channel.cjs') as {
  prepareWindowsChannel: (architecture: string, releaseDirectory: string) => string
}

const packageValue = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
)
const releaseWorkflow = readFileSync(
  new URL('../.github/workflows/release.yml', import.meta.url),
  'utf8',
)

test('Windows releases build native x64 and ARM64 installers', () => {
  const aggregate = String(packageValue.scripts?.['package:win'] || '')
  const x64 = String(packageValue.scripts?.['package:win:x64'] || '')
  const arm64 = String(packageValue.scripts?.['package:win:arm64'] || '')

  assert.match(aggregate, /package:win:x64/)
  assert.match(aggregate, /package:win:arm64/)
  for (const [architecture, command] of [['x64', x64], ['arm64', arm64]]) {
    assert.match(command, /electron-builder\s+--win\b/)
    assert.match(command, /\bnsis\b/)
    assert.match(command, /\bportable\b/)
    assert.match(command, new RegExp(`--${architecture}\\b`))
    assert.doesNotMatch(command, new RegExp(`--${architecture === 'x64' ? 'arm64' : 'x64'}\\b`))
    assert.match(command, new RegExp(`prepare-windows-channel\\.cjs ${architecture}`))
  }
  assert.match(packageValue.build?.nsis?.artifactName || '', /\$\{arch\}/)
  assert.match(packageValue.build?.portable?.artifactName || '', /\$\{arch\}/)
  for (const script of ['package:win:x64', 'package:win:arm64', 'package:mac', 'package:linux']) {
    assert.match(String(packageValue.scripts?.[script] || ''), /--publish never/, script)
  }
})

test('Windows packages use the electron-builder release with the ARM64 NSIS payload fix', () => {
  assert.equal(packageValue.devDependencies?.['electron-builder'], '26.15.6')
})

test('Windows release jobs publish isolated updater channels and validate payloads', () => {
  assert.match(releaseWorkflow, /platform: windows-x64/)
  assert.match(releaseWorkflow, /platform: windows-arm64/)
  assert.match(releaseWorkflow, /release\/latest-x64\.yml/)
  assert.match(releaseWorkflow, /release\/latest-arm64\.yml/)
  assert.match(releaseWorkflow, /Verify Windows package payload/)
  assert.match(releaseWorkflow, /7z l -slt -t7z/)
  assert.match(releaseWorkflow, /Typesetly\.exe/)
  assert.match(releaseWorkflow, /NSIS-incompatible payload method/)
  assert.match(releaseWorkflow, /\\bBCJ2\\b\|\\bARM64\\b/)
  assert.match(releaseWorkflow, /0xAA64/)
  assert.match(releaseWorkflow, /0x8664/)
  assert.match(releaseWorkflow, /obsolete_windows_assets/)
  assert.match(releaseWorkflow, /Typesetly-Setup-\$RELEASE_VERSION\.exe/)
})

test('Windows updater manifests preserve an x64 fallback without crossing architectures', () => {
  const releaseDirectory = mkdtempSync(join(tmpdir(), 'typesetly-windows-channels-'))
  try {
    const latest = join(releaseDirectory, 'latest.yml')
    writeFileSync(latest, 'path: Typesetly-Setup-1.2.4-x64.exe\n')
    prepareWindowsChannel('x64', releaseDirectory)

    writeFileSync(latest, 'path: Typesetly-Setup-1.2.4-arm64.exe\n')
    prepareWindowsChannel('arm64', releaseDirectory)

    assert.match(readFileSync(join(releaseDirectory, 'latest-x64.yml'), 'utf8'), /-x64\.exe/)
    assert.match(readFileSync(join(releaseDirectory, 'latest-arm64.yml'), 'utf8'), /-arm64\.exe/)
    assert.match(readFileSync(latest, 'utf8'), /-x64\.exe/)
  } finally {
    rmSync(releaseDirectory, { recursive: true, force: true })
  }
})
