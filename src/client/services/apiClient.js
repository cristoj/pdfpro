const BASE = '/api/pdf'

async function request(method, path, body, isFormData = false) {
  const opts = { method, headers: {} }

  if (body) {
    if (isFormData) {
      opts.body = body
    } else {
      opts.headers['Content-Type'] = 'application/json'
      opts.body = JSON.stringify(body)
    }
  }

  const res = await fetch(`${BASE}${path}`, opts)
  const data = await res.json().catch(() => ({ success: false, error: res.statusText }))

  if (!data.success) throw new Error(data.error ?? 'Request failed')
  return data
}

export async function uploadPdf(files) {
  const form = new FormData()
  for (const file of files) form.append('files', file)
  return request('POST', '/upload', form, true)
}

export async function addPdf(sessionId, files) {
  const form = new FormData()
  form.append('sessionId', sessionId)
  for (const file of files) form.append('files', file)
  return request('POST', '/add', form, true)
}

export async function getPages(sessionId) {
  const res = await fetch(`${BASE}/pages/${sessionId}`)
  const data = await res.json()
  if (!data.success) throw new Error(data.error)
  return data.pages
}

export async function reorderPages(sessionId, order) {
  return request('POST', '/reorder', { sessionId, order })
}

export async function deletePagesByIndex(sessionId, pages) {
  return request('DELETE', '/pages', { sessionId, pages })
}

export async function exportPdf(sessionId, range) {
  const res = await fetch(`${BASE}/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, range: range || undefined }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error ?? 'Export failed')
  }
  return res.blob()
}

export async function compressPdf(sessionId) {
  return request('POST', '/compress', { sessionId })
}

export async function getTextBlocks(sessionId) {
  const res = await fetch(`${BASE}/text/${sessionId}`)
  const data = await res.json().catch(() => ({ success: false }))
  if (!data.success) throw new Error(data.error ?? 'Failed to get text blocks')
  return data.textBlocks
}

export async function addTextBlock(sessionId, block) {
  return request('POST', '/text/add', { sessionId, ...block })
}

export async function updateTextBlock(sessionId, id, changes) {
  return request('PUT', `/text/${id}`, { sessionId, ...changes })
}

export async function deleteTextBlock(sessionId, id) {
  return request('DELETE', `/text/${id}`, { sessionId })
}

export async function getShapes(sessionId) {
  const res = await fetch(`${BASE}/shapes/${sessionId}`)
  const data = await res.json().catch(() => ({ success: false }))
  if (!data.success) throw new Error(data.error ?? 'Failed to get shapes')
  return data.shapes
}

export async function addShape(sessionId, shape) {
  return request('POST', '/shapes/add', { sessionId, ...shape })
}

export async function updateShape(sessionId, id, patch) {
  return request('PUT', `/shapes/${id}`, { sessionId, ...patch })
}

export async function deleteShape(sessionId, id) {
  return request('DELETE', `/shapes/${id}`, { sessionId })
}
