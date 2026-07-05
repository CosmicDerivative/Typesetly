import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DEVICE_PROFILES,
  profileDescription,
  renderedDeviceWidth,
} from '../src/preview/devices.ts'

test('every preview target has a positive, device-specific screen profile', () => {
  const profiles = Object.values(DEVICE_PROFILES)
  assert.equal(profiles.length, 10)
  for (const profile of profiles) {
    assert.ok(profile.logicalWidth > 0)
    assert.ok(profile.logicalHeight > 0)
    assert.ok(profile.nativeWidth > 0)
    assert.ok(profile.nativeHeight > 0)
  }
  assert.notEqual(
    DEVICE_PROFILES.iPhone.logicalWidth / DEVICE_PROFILES.iPhone.logicalHeight,
    DEVICE_PROFILES.Galaxy.logicalWidth / DEVICE_PROFILES.Galaxy.logicalHeight,
  )
})

test('e-ink profiles remain distinct from color tablet and phone previews', () => {
  for (const name of ['Paperwhite', 'Oasis', 'Kindle', 'Glowlight 3', 'Forma'] as const) {
    assert.equal(DEVICE_PROFILES[name].family, 'ereader')
    assert.equal(DEVICE_PROFILES[name].color, false)
    assert.match(profileDescription(DEVICE_PROFILES[name]), /ppi/)
  }
  assert.equal(DEVICE_PROFILES.iPad.color, true)
  assert.equal(DEVICE_PROFILES.iPhone.family, 'phone')
})

test('preview frames reflect physical device size and orientation', () => {
  const iPadWidth = renderedDeviceWidth(DEVICE_PROFILES.iPad, 6, false)
  const fireWidth = renderedDeviceWidth(DEVICE_PROFILES.Fire, 6, false)
  const kindleWidth = renderedDeviceWidth(DEVICE_PROFILES.Kindle, 6, false)
  const formaWidth = renderedDeviceWidth(DEVICE_PROFILES.Forma, 6, false)

  assert.ok(iPadWidth > fireWidth)
  assert.ok(formaWidth > kindleWidth)
  assert.ok(renderedDeviceWidth(DEVICE_PROFILES.iPad, 6, true) > iPadWidth)
  assert.notEqual(renderedDeviceWidth(DEVICE_PROFILES.Print, 5, false), renderedDeviceWidth(DEVICE_PROFILES.Print, 7, false))
})
