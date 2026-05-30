import type { PreviewDevice } from '../types'

export interface DeviceProfile {
  id: PreviewDevice
  label: string
  family: 'tablet' | 'phone' | 'ereader' | 'print'
  logicalWidth: number
  logicalHeight: number
  nativeWidth: number
  nativeHeight: number
  diagonal?: number
  ppi?: number
  color: boolean
  bezel: number
  cornerRadius: number
}

// Logical dimensions drive CSS layout; native dimensions and PPI are shown to
// users so previews communicate the real class of device being approximated.
export const DEVICE_PROFILES: Record<PreviewDevice, DeviceProfile> = {
  iPad: {
    id: 'iPad',
    label: 'iPad 11-inch',
    family: 'tablet',
    logicalWidth: 820,
    logicalHeight: 1180,
    nativeWidth: 1640,
    nativeHeight: 2360,
    diagonal: 10.86,
    ppi: 264,
    color: true,
    bezel: 10,
    cornerRadius: 14,
  },
  iPhone: {
    id: 'iPhone',
    label: 'iPhone 6.1-inch',
    family: 'phone',
    logicalWidth: 393,
    logicalHeight: 852,
    nativeWidth: 1179,
    nativeHeight: 2556,
    diagonal: 6.1,
    ppi: 460,
    color: true,
    bezel: 7,
    cornerRadius: 28,
  },
  Galaxy: {
    id: 'Galaxy',
    label: 'Galaxy 6.2-inch',
    family: 'phone',
    logicalWidth: 360,
    logicalHeight: 800,
    nativeWidth: 1440,
    nativeHeight: 3200,
    diagonal: 6.2,
    ppi: 563,
    color: true,
    bezel: 6,
    cornerRadius: 22,
  },
  Paperwhite: {
    id: 'Paperwhite',
    label: 'Kindle Paperwhite',
    family: 'ereader',
    logicalWidth: 618,
    logicalHeight: 824,
    nativeWidth: 1236,
    nativeHeight: 1648,
    diagonal: 7,
    ppi: 300,
    color: false,
    bezel: 12,
    cornerRadius: 7,
  },
  Oasis: {
    id: 'Oasis',
    label: 'Kindle Oasis',
    family: 'ereader',
    logicalWidth: 632,
    logicalHeight: 840,
    nativeWidth: 1264,
    nativeHeight: 1680,
    diagonal: 7,
    ppi: 300,
    color: false,
    bezel: 14,
    cornerRadius: 6,
  },
  Kindle: {
    id: 'Kindle',
    label: 'Kindle 6-inch',
    family: 'ereader',
    logicalWidth: 536,
    logicalHeight: 724,
    nativeWidth: 1072,
    nativeHeight: 1448,
    diagonal: 6,
    ppi: 300,
    color: false,
    bezel: 13,
    cornerRadius: 7,
  },
  Fire: {
    id: 'Fire',
    label: 'Fire HD 8',
    family: 'tablet',
    logicalWidth: 800,
    logicalHeight: 1280,
    nativeWidth: 800,
    nativeHeight: 1280,
    diagonal: 8,
    ppi: 189,
    color: true,
    bezel: 11,
    cornerRadius: 9,
  },
  'Glowlight 3': {
    id: 'Glowlight 3',
    label: 'NOOK GlowLight 3',
    family: 'ereader',
    logicalWidth: 702,
    logicalHeight: 936,
    nativeWidth: 1404,
    nativeHeight: 1872,
    diagonal: 6,
    ppi: 300,
    color: false,
    bezel: 15,
    cornerRadius: 8,
  },
  Forma: {
    id: 'Forma',
    label: 'Kobo Forma',
    family: 'ereader',
    logicalWidth: 720,
    logicalHeight: 960,
    nativeWidth: 1440,
    nativeHeight: 1920,
    diagonal: 8,
    ppi: 300,
    color: false,
    bezel: 14,
    cornerRadius: 7,
  },
  Print: {
    id: 'Print',
    label: 'Print trim',
    family: 'print',
    logicalWidth: 432,
    logicalHeight: 648,
    nativeWidth: 1800,
    nativeHeight: 2700,
    color: true,
    bezel: 0,
    cornerRadius: 0,
  },
}

export function profileDescription(profile: DeviceProfile) {
  if (profile.family === 'print') return 'Uses the selected trim size and margins'
  const size = profile.diagonal ? `${profile.diagonal}"` : ''
  const density = profile.ppi ? `${profile.ppi} ppi` : ''
  return [size, `${profile.nativeWidth} × ${profile.nativeHeight}`, density].filter(Boolean).join(' · ')
}

/**
 * Converts physical display measurements into a useful on-screen proof size.
 * Each device family uses a different presentation scale, but devices within a
 * family retain their real relative widths instead of sharing a fixed mockup.
 */
export function renderedDeviceWidth(
  profile: DeviceProfile,
  printTrimWidthIn: number,
  landscape = false,
) {
  const physicalScreenWidth = profile.ppi ? profile.nativeWidth / profile.ppi : 0
  const portraitWidth =
    profile.family === 'phone' ? Math.min(230, Math.max(190, physicalScreenWidth * 78))
      : profile.family === 'tablet' ? Math.min(320, Math.max(220, physicalScreenWidth * 45))
        : profile.family === 'print' ? Math.min(360, Math.max(240, printTrimWidthIn * 48))
          : Math.min(300, Math.max(220, physicalScreenWidth * 58))
  const orientationScale = landscape
    ? Math.min(1.45, profile.logicalHeight / profile.logicalWidth)
    : 1
  return Math.round(portraitWidth * orientationScale)
}
