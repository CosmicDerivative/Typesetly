import { Download, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import './DesktopUpdateButton.css'

interface DesktopUpdateInfo {
  currentVersion: string
  currentHotpatchRevision?: number
  latestVersion?: string
  latestHotpatchRevision?: number
  hotpatchAvailable?: boolean
  updateAvailable?: boolean
}

function updateLabel(version?: string, hotpatchRevision?: number, hotpatch = false) {
  if (!version) return 'update'
  return hotpatch && hotpatchRevision
    ? `${version} hotpatch ${hotpatchRevision}`
    : version
}

interface DesktopUpdateButtonProps {
  placement: 'header' | 'home'
}

export function DesktopUpdateButton({ placement }: DesktopUpdateButtonProps) {
  const [updateInfo, setUpdateInfo] = useState<DesktopUpdateInfo>()
  const [checking, setChecking] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [downloadPercent, setDownloadPercent] = useState(0)
  const bridge = window.typesetly

  const announce = useCallback((detail: string) => {
    window.dispatchEvent(new CustomEvent('typesetly:notice', { detail }))
  }, [])

  const checkForUpdates = useCallback(async (reportResult = false) => {
    if (!bridge?.checkForUpdates) return
    setChecking(true)
    try {
      const result = await bridge.checkForUpdates({ force: reportResult })
      if (!result.ok) {
        if (reportResult) announce(result.error || 'Typesetly could not check for updates.')
        return
      }
      setUpdateInfo(result)
      if (reportResult) {
        announce(
          result.updateAvailable
            ? `Typesetly ${updateLabel(result.latestVersion, result.latestHotpatchRevision, result.hotpatchAvailable)} is ready to download.`
            : `Typesetly ${updateLabel(result.currentVersion, result.currentHotpatchRevision, Boolean(result.currentHotpatchRevision))} is up to date.`,
        )
      }
    } catch {
      if (reportResult) announce('Typesetly could not reach GitHub to check for updates.')
    } finally {
      setChecking(false)
    }
  }, [announce, bridge])

  const handleClick = useCallback(async () => {
    if (!bridge?.installLatestUpdate || downloading) return
    if (!updateInfo?.updateAvailable) {
      await checkForUpdates(true)
      return
    }
    setDownloading(true)
    setDownloadPercent(0)
    try {
      const result = await bridge.installLatestUpdate()
      if (result.ok) {
        announce(`Typesetly ${updateLabel(result.version, result.hotpatchRevision, Boolean(result.hotpatchRevision))} is verified and ready. Restarting to install…`)
      } else {
        announce(result.error || 'The installer could not be downloaded.')
      }
    } catch {
      announce('The automatic update could not be started.')
    } finally {
      setDownloading(false)
      setDownloadPercent(0)
    }
  }, [announce, bridge, checkForUpdates, downloading, updateInfo?.updateAvailable])

  useEffect(() => {
    if (!bridge?.checkForUpdates) return
    const timer = window.setTimeout(() => {
      void checkForUpdates()
    }, 1500)
    return () => window.clearTimeout(timer)
  }, [bridge, checkForUpdates])

  useEffect(() => {
    if (!bridge?.onUpdateDownloadProgress) return
    return bridge.onUpdateDownloadProgress((progress) => setDownloadPercent(progress.percent))
  }, [bridge])

  if (!bridge?.checkForUpdates) return null

  const available = Boolean(updateInfo?.updateAvailable)
  const availableLabel = updateLabel(
    updateInfo?.latestVersion,
    updateInfo?.latestHotpatchRevision,
    Boolean(updateInfo?.hotpatchAvailable),
  )
  const currentLabel = updateLabel(
    updateInfo?.currentVersion,
    updateInfo?.currentHotpatchRevision,
    Boolean(updateInfo?.currentHotpatchRevision),
  )
  const busy = checking || downloading
  const label = downloading
    ? `${downloadPercent}%`
    : available
      ? `Install ${availableLabel}`
      : checking
        ? 'Checking…'
        : updateInfo
          ? `Version ${currentLabel}`
          : 'Check updates'

  return (
    <button
      className={[
        placement === 'header' ? 'icon-btn update-button' : 'ghost home-update-button',
        available ? 'update-available' : '',
      ].filter(Boolean).join(' ')}
      title={
        downloading
          ? `Downloading Typesetly ${availableLabel} (${downloadPercent}%)`
          : available
            ? `Download, verify, and install Typesetly ${availableLabel}`
            : checking
              ? 'Checking for Typesetly updates'
              : `Check for updates${updateInfo ? ` — current version ${currentLabel}` : ''}`
      }
      aria-label={
        available
          ? `Install Typesetly ${availableLabel}`
          : 'Check for Typesetly updates'
      }
      type="button"
      disabled={busy}
      onClick={() => void handleClick()}
    >
      {busy
        ? <RefreshCw className="update-spinner" size={17} strokeWidth={1.75} />
        : available
          ? <Download size={17} strokeWidth={1.75} />
          : <RefreshCw size={17} strokeWidth={1.75} />}
      {(placement === 'home' || available) && (
        <span className="update-label" aria-live="polite">{label}</span>
      )}
    </button>
  )
}
