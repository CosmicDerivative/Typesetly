const fs = require('fs')
const path = require('path')

function revisionFrom(value) {
  const revision = Number(value)
  if (!Number.isSafeInteger(revision) || revision < 0) {
    throw new Error(`Hotpatch revision must be a non-negative integer; received "${value}".`)
  }
  return revision
}

const [, , action, rawRevision, ...files] = process.argv
const revision = revisionFrom(rawRevision)

if (action === 'package') {
  const packagePath = path.resolve('package.json')
  const packageValue = JSON.parse(fs.readFileSync(packagePath, 'utf8'))
  packageValue.hotpatchRevision = revision
  packageValue.build = packageValue.build || {}
  packageValue.build.buildVersion = `${packageValue.version}.${revision}`
  packageValue.build.extraMetadata = {
    ...(packageValue.build.extraMetadata || {}),
    hotpatchRevision: revision,
  }
  fs.writeFileSync(packagePath, `${JSON.stringify(packageValue, null, 2)}\n`)
} else if (action === 'metadata') {
  if (!files.length) throw new Error('At least one updater metadata file is required.')
  for (const file of files) {
    const metadataPath = path.resolve(file)
    if (!fs.existsSync(metadataPath)) continue
    const source = fs.readFileSync(metadataPath, 'utf8')
    const stamped = /^hotpatchRevision:/m.test(source)
      ? source.replace(/^hotpatchRevision:.*$/m, `hotpatchRevision: ${revision}`)
      : `${source.trimEnd()}\nhotpatchRevision: ${revision}\n`
    fs.writeFileSync(metadataPath, stamped)
  }
} else {
  throw new Error('Usage: stamp-hotpatch.cjs <package|metadata> <revision> [metadata files...]')
}
