import { Pin, PinOff, X } from 'lucide-react'
import { useApp, type RightPanel } from '../BookContext'
import './DrawerControls.css'

type DrawerTarget = Exclude<RightPanel, 'none'> | 'outline'

interface DrawerControlsProps {
  panel: DrawerTarget
  hidePin?: boolean
  onClose?: () => void
}

export function DrawerControls({ panel, hidePin = false, onClose }: DrawerControlsProps) {
  const {
    mode,
    sidebarPinned,
    setSidebarOpen,
    setSidebarPinned,
    pinnedRightPanel,
    setPinnedRightPanel,
    setRightPanel,
  } = useApp()
  const pinned = panel === 'outline'
    ? sidebarPinned
    : pinnedRightPanel === panel

  const togglePin = () => {
    if (panel === 'outline') {
      setSidebarPinned(!sidebarPinned)
      setSidebarOpen(true)
      return
    }

    setPinnedRightPanel(pinned ? 'none' : panel)
    setRightPanel(panel)
  }

  const close = () => {
    if (panel === 'outline') {
      setSidebarPinned(false)
      setSidebarOpen(false)
    } else {
      if (pinnedRightPanel === panel) setPinnedRightPanel('none')
      setRightPanel(mode === 'publish' ? 'preview' : 'none')
    }
    onClose?.()
  }

  return (
    <div className="drawer-controls">
      {!hidePin && (
        <button
          type="button"
          className={pinned ? 'drawer-control pin-control pinned' : 'drawer-control pin-control'}
          aria-label={pinned ? 'Unpin window' : 'Pin window'}
          title={pinned ? 'Unpin window' : 'Pin window'}
          onClick={togglePin}
        >
          {pinned ? <PinOff size={14} /> : <Pin size={14} />}
        </button>
      )}
      <button
        type="button"
        className="drawer-control"
        aria-label="Close window"
        title="Close window"
        onClick={close}
      >
        <X size={15} />
      </button>
    </div>
  )
}
