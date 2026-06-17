export interface ProcessedImage {
  dataUrl: string
  width: number
  height: number
  bytes: number
}

export async function processImageFile(file: File, maxDimension = 2400): Promise<ProcessedImage> {
  const source = await fileToDataUrl(file)
  const image = await loadImage(source)
  const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight))
  const width = Math.max(1, Math.round(image.naturalWidth * scale))
  const height = Math.max(1, Math.round(image.naturalHeight * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) return { dataUrl: source, width, height, bytes: file.size }
  context.drawImage(image, 0, 0, width, height)
  const preserveTransparency = file.type === 'image/png' || file.type === 'image/webp'
  const dataUrl = canvas.toDataURL(preserveTransparency ? 'image/png' : 'image/jpeg', 0.86)
  return { dataUrl, width, height, bytes: dataUrlBytes(dataUrl) }
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error || new Error('The image could not be read.'))
    reader.onload = () => resolve(String(reader.result))
    reader.readAsDataURL(file)
  })
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onerror = () => reject(new Error('The selected image is not supported.'))
    image.onload = () => resolve(image)
    image.src = src
  })
}

function dataUrlBytes(dataUrl: string) {
  const base64 = dataUrl.split(',')[1] || ''
  return Math.ceil(base64.length * 0.75)
}
