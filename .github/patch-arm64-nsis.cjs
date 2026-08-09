const fs = require('node:fs')
const path = require('node:path')

const templatePath = path.resolve(
  'node_modules/app-builder-lib/templates/nsis/include/extractAppPackage.nsh',
)

const architectureProbe = `  !ifdef APP_ARM64
    \${if} \${IsNativeARM64}
      StrCpy $packageArch "ARM64"
    \${endif}
  !endif
`

const architectureFallback = `${architectureProbe}
  # An architecture-specific ARM64 artifact contains no alternative payload.
  # Do not let an unreliable host probe produce a successful empty install.
  !ifdef APP_ARM64
    !ifndef APP_64
      !ifndef APP_32
        StrCpy $packageArch "ARM64"
      !endif
    !endif
  !endif
`

const extractionStep = `  !insertmacro decompress
  !insertmacro custom_files_post_decompression
`

const verifiedExtractionStep = `  !insertmacro decompress
  !insertmacro custom_files_post_decompression

  # Never report success when the application payload was not extracted.
  IfFileExists "$INSTDIR\\\${APP_EXECUTABLE_FILENAME}" payload_present 0
    SetErrorLevel 2
    MessageBox MB_OK|MB_ICONSTOP "Typesetly could not extract its application files. Please download the installer again."
    Quit
  payload_present:
`

if (!fs.existsSync(templatePath)) {
  throw new Error(`electron-builder NSIS template was not found: ${templatePath}`)
}

let source = fs.readFileSync(templatePath, 'utf8')

if (!source.includes(architectureFallback)) {
  if (!source.includes(architectureProbe)) {
    throw new Error('The electron-builder ARM64 architecture probe changed; refusing an unsafe patch.')
  }
  source = source.replace(architectureProbe, architectureFallback)
}

if (!source.includes(verifiedExtractionStep)) {
  if (!source.includes(extractionStep)) {
    throw new Error('The electron-builder extraction step changed; refusing an unsafe patch.')
  }
  source = source.replace(extractionStep, verifiedExtractionStep)
}

fs.writeFileSync(templatePath, source)
console.log('Hardened electron-builder ARM64 NSIS payload selection and extraction checks.')
