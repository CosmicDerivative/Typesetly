const fs = require('node:fs')

function nightlyPackage(source, runId, attempt) {
  if (!/^[1-9]\d*$/.test(String(runId)) || !/^[1-9]\d*$/.test(String(attempt))) {
    throw new Error('Nightly run ID and attempt must be positive integers.')
  }
  const result = structuredClone(source)
  const base = String(source.version).split('-')[0]
  if (!/^\d+\.\d+\.\d+$/.test(base)) throw new Error('Invalid base version.')
  result.version = `${base}-nightly.${runId}.${attempt}`
  result.name = 'typesetly-nightly'
  result.productName = 'Typesetly Nightly'
  result.hotpatchRevision = 0
  result.releaseChannel = 'nightly'
  result.build = {
    ...result.build,
    appId: 'io.github.jorda.typesetly.nightly',
    productName: 'Typesetly Nightly',
    buildVersion: `${base}.0`,
    detectUpdateChannel: false,
    extraMetadata: { ...result.build.extraMetadata, hotpatchRevision: 0, releaseChannel: 'nightly' },
    win: { ...result.build.win, executableName: 'Typesetly Nightly' },
    nsis: { ...result.build.nsis, artifactName: 'Typesetly-Setup-${version}-${arch}.${ext}' },
    portable: { ...result.build.portable, artifactName: 'Typesetly-Portable-${version}-${arch}.${ext}' },
  }
  return result
}

if (require.main === module) {
  const source = JSON.parse(fs.readFileSync('package.json', 'utf8'))
  fs.writeFileSync('package.json', `${JSON.stringify(nightlyPackage(source, process.env.GITHUB_RUN_ID, process.env.GITHUB_RUN_ATTEMPT), null, 2)}\n`)
}
module.exports = { nightlyPackage }
