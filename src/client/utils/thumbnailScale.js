const SIZES = {
  sm: { width: 80, label: 'Pequeño' },
  md: { width: 120, label: 'Mediano' },
  lg: { width: 160, label: 'Grande' },
}

export function getSizeConfig(size) {
  return SIZES[size] ?? SIZES.md
}

export function getNextSize(current) {
  const keys = Object.keys(SIZES)
  const idx = keys.indexOf(current)
  return keys[(idx + 1) % keys.length]
}

export function getScaleForWidth(targetWidth, pdfWidth) {
  return targetWidth / pdfWidth
}
