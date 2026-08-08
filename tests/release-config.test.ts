import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const packageValue = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
)

test('Windows releases build native x64 and ARM64 installers', () => {
  const command = String(packageValue.scripts?.['package:win'] || '')

  assert.match(command, /electron-builder\s+--win\b/)
  assert.match(command, /\bnsis\b/)
  assert.match(command, /\bportable\b/)
  assert.match(command, /--x64\b/)
  assert.match(command, /--arm64\b/)
  assert.match(packageValue.build?.nsis?.artifactName || '', /\$\{arch\}/)
  assert.match(packageValue.build?.portable?.artifactName || '', /\$\{arch\}/)
})
