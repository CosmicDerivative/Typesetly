import assert from 'node:assert/strict'
import test from 'node:test'
import {
  isDarkWorkspaceTheme,
  isWorkspaceTheme,
  resolveWorkspaceTheme,
  WORKSPACE_THEMES,
} from '../src/themes/workspaceThemes.ts'

test('workspace theme catalog has a broad, unique light and dark selection', () => {
  assert.equal(WORKSPACE_THEMES.length, 16)
  assert.equal(new Set(WORKSPACE_THEMES.map((theme) => theme.id)).size, WORKSPACE_THEMES.length)
  assert.ok(WORKSPACE_THEMES.filter((theme) => theme.tone === 'light').length >= 8)
  assert.ok(WORKSPACE_THEMES.filter((theme) => theme.tone === 'dark').length >= 8)

  for (const theme of WORKSPACE_THEMES) {
    assert.ok(theme.name.length > 0)
    assert.ok(theme.description.length > 0)
    assert.equal(theme.swatches.length, 3)
    assert.equal(isDarkWorkspaceTheme(theme.id), theme.tone === 'dark')
  }
})

test('workspace theme validation rejects unknown saved values', () => {
  assert.equal(isWorkspaceTheme('solarized-light'), true)
  assert.equal(isWorkspaceTheme('solarized-dark'), true)
  assert.equal(isWorkspaceTheme('neon-rainbow'), false)
  assert.equal(isWorkspaceTheme(null), false)
})

test('legacy dark mode projects migrate without changing their intent', () => {
  assert.equal(resolveWorkspaceTheme(undefined, false), 'parchment')
  assert.equal(resolveWorkspaceTheme(undefined, true), 'midnight')
  assert.equal(resolveWorkspaceTheme('forest', false), 'forest')
  assert.equal(resolveWorkspaceTheme('missing-theme', true), 'midnight')
})
