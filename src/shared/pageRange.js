export function parseRange(input) {
  if (!input?.trim()) return []

  const parts = input.split(',')
  const result = []

  for (const part of parts) {
    const trimmed = part.trim()
    if (trimmed.includes('-')) {
      const [startStr, endStr] = trimmed.split('-')
      const start = Number(startStr)
      const end = Number(endStr)
      if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < 1) {
        throw new Error(`Invalid page range: "${trimmed}"`)
      }
      if (start > end) {
        throw new Error(`Inverted range: "${trimmed}"`)
      }
      for (let i = start; i <= end; i++) result.push(i)
    } else {
      const n = Number(trimmed)
      if (!Number.isInteger(n) || n < 1) {
        throw new Error(`Invalid page number: "${trimmed}"`)
      }
      result.push(n)
    }
  }

  return [...new Set(result)].sort((a, b) => a - b)
}
