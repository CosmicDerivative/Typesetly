const GITHUB_RELEASES_API =
  'https://api.github.com/repos/CosmicDerivative/Typesetly/releases/latest'
const GITHUB_RELEASE_PATH =
  /^\/CosmicDerivative\/Typesetly\/releases\/download\//i

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

function isTrustedReleaseDownload(url) {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' &&
      parsed.hostname.toLowerCase() === 'github.com' &&
      GITHUB_RELEASE_PATH.test(parsed.pathname)
  } catch {
    return false
  }
}

function usableAssets(assets) {
  return (Array.isArray(assets) ? assets : []).filter((asset) =>
    asset &&
    typeof asset.name === 'string' &&
    typeof asset.browser_download_url === 'string' &&
    isTrustedReleaseDownload(asset.browser_download_url),
  )
}

function selectInstallerAsset(assets, platform, arch) {
  const candidates = usableAssets(assets)
  const find = (pattern) => candidates.find((asset) => pattern.test(asset.name))

  if (platform === 'win32') {
    const archPattern = arch === 'arm64' ? 'arm64' : arch === 'x64' ? 'x64' : undefined
    if (!archPattern) return undefined
    return find(new RegExp(`^Typesetly-Setup-.+-${archPattern}\\.exe$`, 'i'))
  }

  if (platform === 'darwin') {
    const archPattern = arch === 'arm64' ? 'arm64' : arch === 'x64' ? 'x64' : undefined
    if (!archPattern) return undefined
    return find(new RegExp(`^Typesetly-.+-${archPattern}\\.dmg$`, 'i')) ||
      find(new RegExp(`^Typesetly-.+-${archPattern}\\.zip$`, 'i'))
  }

  if (platform === 'linux') {
    if (arch === 'arm64') {
      return find(/^Typesetly-.+-arm64\.AppImage$/i) ||
        find(/^Typesetly_.+_arm64\.deb$/i)
    }
    if (arch !== 'x64') return undefined
    return find(/^Typesetly-.+-(?:x86_64|x64)\.AppImage$/i) ||
      find(/^Typesetly_.+_amd64\.deb$/i) ||
      find(/^Typesetly-.+-x64\.deb$/i)
  }

  return undefined
}

function selectChecksumAsset(assets) {
  return usableAssets(assets).find((asset) => /^SHA256SUMS\.txt$/i.test(asset.name))
}

function parseChecksumFile(contents, fileName) {
  const escapedName = String(fileName).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const linePattern = new RegExp(
    `^([a-f\\d]{64})\\s+[*]?${escapedName.replaceAll(' ', '\\s')}\\s*$`,
    'im',
  )
  return String(contents || '').match(linePattern)?.[1]?.toLowerCase()
}

function describeRelease(release, currentVersion, platform, arch) {
  const latest = normalizeVersion(release?.tag_name || release?.name)
  if (!latest) throw new Error('GitHub returned a release without a valid version.')
  const updateAvailable = compareVersions(latest.text, currentVersion) > 0
  const installer = selectInstallerAsset(release?.assets, platform, arch)

  return {
    ok: true,
    currentVersion,
    latestVersion: latest.text,
    updateAvailable,
    releaseUrl: typeof release?.html_url === 'string' ? release.html_url : undefined,
    installer: installer
      ? {
          name: installer.name,
          url: installer.browser_download_url,
          size: Number(installer.size) || 0,
        }
      : undefined,
  }
}

module.exports = {
  GITHUB_RELEASES_API,
  compareVersions,
  describeRelease,
  isTrustedReleaseDownload,
  normalizeVersion,
  parseChecksumFile,
  selectChecksumAsset,
  selectInstallerAsset,
}
