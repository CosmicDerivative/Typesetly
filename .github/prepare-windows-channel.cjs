const fs = require('node:fs')
const path = require('node:path')

function prepareWindowsChannel(arch, releaseDir = path.resolve('release')) {
  if (arch !== 'x64' && arch !== 'arm64') {
    throw new Error('Expected a Windows architecture: x64 or arm64.')
  }

  const generatedManifest = path.join(releaseDir, 'latest.yml')
  const architectureManifest = path.join(releaseDir, `latest-${arch}.yml`)

  if (!fs.existsSync(generatedManifest)) {
    throw new Error(`electron-builder did not generate ${generatedManifest}.`)
  }

  fs.copyFileSync(generatedManifest, architectureManifest)

  if (arch === 'arm64') {
    const x64Manifest = path.join(releaseDir, 'latest-x64.yml')
    if (fs.existsSync(x64Manifest)) {
      // Keep the historical channel pointed at x64 for clients released before
      // architecture-specific updater channels were introduced.
      fs.copyFileSync(x64Manifest, generatedManifest)
    } else {
      fs.rmSync(generatedManifest)
    }
  }

  return architectureManifest
}

if (require.main === module) {
  const arch = process.argv[2]
  prepareWindowsChannel(arch)
  console.log(`Prepared latest-${arch}.yml${arch === 'x64' ? ' and legacy latest.yml' : ''}.`)
}

module.exports = { prepareWindowsChannel }
