function normalizeVersion(value) {
  const match = String(value || '')
    .trim()
    .replace(/^v/i, '')
    .match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/)
  if (!match) return undefined
  return {
    text: `${match[1]}.${match[2]}.${match[3]}${match[4] ? `-${match[4]}` : ''}`,
    parts: [Number(match[1]), Number(match[2]), Number(match[3])],
    prerelease: match[4] || '',
  }
}

function compareVersions(left, right) {
  const a = normalizeVersion(left)
  const b = normalizeVersion(right)
  if (!a || !b) return 0
  for (let index = 0; index < 3; index += 1) {
    if (a.parts[index] !== b.parts[index]) return a.parts[index] > b.parts[index] ? 1 : -1
  }
  if (a.prerelease === b.prerelease) return 0
  if (!a.prerelease) return 1
  if (!b.prerelease) return -1
  return a.prerelease.localeCompare(b.prerelease, undefined, {
    numeric: true,
    sensitivity: 'base',
  })
}

function normalizeHotpatchRevision(value) {
  const revision = Number(value)
  return Number.isSafeInteger(revision) && revision >= 0 ? revision : 0
}

function isHotpatchAvailable(updateInfo, currentVersion, currentHotpatchRevision = 0) {
  const latest = normalizeVersion(updateInfo?.version)
  const current = normalizeVersion(currentVersion)
  if (!latest || !current || compareVersions(latest.text, current.text) !== 0) return false
  return normalizeHotpatchRevision(updateInfo?.hotpatchRevision) >
    normalizeHotpatchRevision(currentHotpatchRevision)
}

function describeUpdateCheck(result, currentVersion, currentHotpatchRevision = 0) {
  const latest = normalizeVersion(result?.updateInfo?.version)
  if (!result || !latest) {
    throw new Error('The update service did not return valid release metadata.')
  }
  const currentRevision = normalizeHotpatchRevision(currentHotpatchRevision)
  const latestRevision = normalizeHotpatchRevision(result.updateInfo.hotpatchRevision)
  const hotpatchAvailable = isHotpatchAvailable(
    result.updateInfo,
    currentVersion,
    currentRevision,
  )
  return {
    ok: true,
    currentVersion,
    currentHotpatchRevision: currentRevision,
    latestVersion: latest.text,
    latestHotpatchRevision: latestRevision,
    hotpatchAvailable,
    updateAvailable: Boolean(result.isUpdateAvailable) || hotpatchAvailable,
  }
}

module.exports = {
  compareVersions,
  describeUpdateCheck,
  isHotpatchAvailable,
  normalizeHotpatchRevision,
  normalizeVersion,
}
