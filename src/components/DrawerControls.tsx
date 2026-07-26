import { X } from 'lucide-react'
import { useApp, type RightPanel } from '../BookContext'
import './DrawerControls.css'

type DrawerTarget = Exclude<RightPanel, 'none'> | 'outline'

interface DrawerControlsProps {
  panel: DrawerTarget
  onClose?: () => void
}

export function DrawerControls({ panel, onClose }: DrawerControlsProps) {
  const {
    mode,
    setSidebarOpen,
    setRightPanel,
  } = useApp()

  const close = () => {
    if (panel === 'outline') {
      setSidebarOpen(false)
    } else {
      setRightPanel(mode === 'publish' ? 'preview' : 'none')
    }
    onClose?.()
  }

  return (
    <div className="drawer-controls">
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
