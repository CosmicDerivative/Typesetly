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

test('automatic workflows build only pushes to main, not branches, PRs or tags', () => {
  const ciWorkflow = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8')
  for (const workflow of [ciWorkflow, releaseWorkflow]) {
    const triggers = workflow.split('permissions:')[0]
    assert.match(triggers, /on:\r?\n  push:\r?\n    branches:\r?\n      - main\r?\n/)
    assert.doesNotMatch(triggers, /pull_request|\n    tags:/)
  }
  assert.match(releaseWorkflow, /if: \(inputs\.nightly && github\.ref == 'refs\/heads\/nightly'\) \|\| \(!inputs\.nightly && github\.ref == 'refs\/heads\/main'\)/)
  assert.match(releaseWorkflow, /name: Publish GitHub release\r?\n    if: \(inputs\.nightly && github\.ref == 'refs\/heads\/nightly'\) \|\| \(github\.event_name == 'workflow_dispatch' && !inputs\.nightly && github\.ref == 'refs\/heads\/main'\)/)
  assert.match(releaseWorkflow, /tag="v\$version"/)
  assert.doesNotMatch(releaseWorkflow, /REF_NAME|BASH_REMATCH/)
})

test('nightly builds on nightly pushes or manual dispatch and publishes separately from stable', () => {
  const nightly = readFileSync(new URL('../.github/workflows/nightly.yml', import.meta.url), 'utf8')
  const main = readFileSync(new URL('../electron/main.cjs', import.meta.url), 'utf8')
  assert.match(nightly, /workflow_dispatch:/)
  assert.match(nightly, /push:\r?\n    branches:\r?\n      - nightly/)
  assert.doesNotMatch(nightly, /\n  (pull_request|schedule):/)
  assert.match(nightly, /github\.ref == 'refs\/heads\/nightly'/)
  assert.match(nightly, /uses: \.\/\.github\/workflows\/release.yml/)
  assert.match(nightly, /nightly: true/)
  assert.match(releaseWorkflow, /gh release create nightly .*--prerelease --latest=false/)
  assert.match(releaseWorkflow, /gh release edit nightly .*--prerelease --latest=false/)
  assert.match(releaseWorkflow, /if: \$\{\{ !inputs.nightly \}\}/)
  assert.match(main, /app\.setPath\('userData', path\.join\(app\.getPath\('appData'\), 'Typesetly Nightly'\)\)/)
  assert.match(main, /if \(isNightly\) return \{ ok: false/)
})

test('nightly stamping creates distinct package, installer and profile identities', () => {
  const { nightlyPackage } = require('../.github/stamp-nightly.cjs')
  const original = structuredClone(packageValue)
  const stamped = nightlyPackage(packageValue, '12345', '2')
  assert.deepEqual(packageValue, original)
  assert.equal(stamped.version, `${packageValue.version}-nightly.12345.2`)
  assert.equal(stamped.name, 'typesetly-nightly')
  assert.equal(stamped.productName, 'Typesetly Nightly')
  assert.equal(stamped.build.win.executableName, 'Typesetly Nightly')
  assert.notEqual(stamped.build.appId, packageValue.build.appId)
  assert.equal(stamped.releaseChannel, 'nightly')
  assert.equal(stamped.build.extraMetadata.releaseChannel, 'nightly')
  assert.equal(stamped.build.detectUpdateChannel, false)
  assert.match(stamped.build.buildVersion, /^\d+\.\d+\.\d+\.0$/)
  assert.match(stamped.build.nsis.artifactName, /^Typesetly-Setup-/)
  assert.throws(() => nightlyPackage(packageValue, '../bad', '1'))
  assert.throws(() => nightlyPackage(packageValue, '1', '0'))
})

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
  assert.match(
    String(packageValue.scripts?.['prepackage:win:arm64'] || ''),
    /patch-arm64-nsis\.cjs/,
  )
})

test('Linux releases include a native Arch package for CachyOS variants', () => {
  const linux = String(packageValue.scripts?.['package:linux'] || '')
  assert.match(linux, /--linux\s+AppImage\s+deb\s+pacman\b/)
  assert.deepEqual(packageValue.build?.linux?.target, ['AppImage', 'deb', 'pacman'])
  assert.match(releaseWorkflow, /release\/\*\.pacman/)
  assert.match(releaseWorkflow, /apt-get install --yes libarchive-tools/)
  assert.match(releaseWorkflow, /Verify Linux distribution packages/)
  assert.match(releaseWorkflow, /tar -tf release\/\*\.pacman > /)
  assert.match(releaseWorkflow, /Arch\/CachyOS package/)
})

test('Windows release jobs publish isolated updater channels and validate payloads', () => {
  assert.match(releaseWorkflow, /platform: windows-x64/)
  assert.match(releaseWorkflow, /platform: windows-arm64/)
  assert.match(releaseWorkflow, /release\/latest-x64\.yml/)
  assert.match(releaseWorkflow, /release\/latest-arm64\.yml/)
  assert.match(releaseWorkflow, /Verify Windows package payload/)
  assert.match(releaseWorkflow, /7z l -slt -t7z/)
  assert.match(releaseWorkflow, /\$applicationExe = "\$env:PACKAGE_PRODUCT\.exe"/)
  assert.match(releaseWorkflow, /NSIS-incompatible payload method/)
  assert.match(releaseWorkflow, /\\bBCJ2\\b\|\\bARM64\\b/)
  assert.match(releaseWorkflow, /Installed payload is missing/)
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
