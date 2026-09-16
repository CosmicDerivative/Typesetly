import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { readVault, writeVault, safeTarget } = require('../electron/obsidian.cjs')

function fixture(t: { after: (fn: () => void) => void }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'typesetly-vault-test-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  fs.writeFileSync(path.join(root, 'note.md'), 'Original')
  return root
}

test('vault traversal includes nested notes and skips private configuration', t => {
  const root = fixture(t)
  fs.mkdirSync(path.join(root, '.obsidian'))
  fs.writeFileSync(path.join(root, '.obsidian', 'secret.md'), 'ignore')
  fs.mkdirSync(path.join(root, 'Draft'))
  fs.writeFileSync(path.join(root, 'Draft', 'two.md'), 'Second')
  assert.equal(readVault(root).files.length, 2)
})

test('vault writes preserve originals and reject stale or missing versions', t => {
  const root = fixture(t)
  writeVault(root, [{ relativePath: 'note.md', text: 'Edited', expected: 'Original' }])
  assert.equal(fs.readFileSync(path.join(root, 'note.md'), 'utf8'), 'Edited')
  const backups = fs.readdirSync(path.join(root, '.typesetly-backups'))
  assert.equal(fs.readFileSync(path.join(root, '.typesetly-backups', backups[0]), 'utf8'), 'Original')
  assert.throws(() => writeVault(root, [{ relativePath: 'note.md', text: 'Lost update', expected: 'Original' }]), /changed/)
  assert.throws(() => writeVault(root, [{ relativePath: 'note.md', text: 'Collision', expected: null }]), /changed/)
})

test('batch preflight prevents earlier writes when a later note changed', t => {
  const root = fixture(t)
  assert.throws(() => writeVault(root, [{ relativePath: 'note.md', text: 'Edited', expected: 'Original' }, { relativePath: 'other.md', text: 'Missing', expected: 'Old' }]), /changed/)
  assert.equal(fs.readFileSync(path.join(root, 'note.md'), 'utf8'), 'Original')
})

test('vault rejects traversal, hidden files, absolute paths, non-Markdown and duplicate targets', t => {
  const root = fixture(t)
  for (const target of ['../escape.md', '.obsidian/config.md', '/absolute.md', 'C:/escape.md', 'a/../../escape.md', 'a\\b.md']) assert.throws(() => safeTarget(root, target))
  assert.throws(() => writeVault(root, [{ relativePath: 'app.js', text: 'no', expected: null }]), /Only Markdown/)
  assert.throws(() => writeVault(root, [{ relativePath: 'note.md', text: 'one', expected: 'Original' }, { relativePath: 'note.md', text: 'two', expected: 'Original' }]), /Duplicate/)
})

test('new Markdown files are written only to unused paths', t => {
  const root = fixture(t)
  writeVault(root, [{ relativePath: 'Typesetly/new.md', text: 'New', expected: null }])
  assert.equal(fs.readFileSync(path.join(root, 'Typesetly', 'new.md'), 'utf8'), 'New')
  assert.equal(readVault(root).files.length, 2)
})
