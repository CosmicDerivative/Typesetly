// Vite uses a relative base for packaged Electron builds. Building the public
// asset URL from BASE_URL keeps it valid both on localhost and under file://.
export const TYPESETLY_LOGO_URL = `${import.meta.env.BASE_URL}typesetly-logo.png`
