import { uploadPdf, addPdf, reorderPages, deletePagesByIndex, exportPdf, compressPdf } from './services/apiClient.js'
import { parseRange } from './utils/pageRange.js'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

// ── App State ────────────────────────────────────────────────
const state = {
  sessionId: localStorage.getItem('pdfpro_session') ?? null,
  pages: [],
  currentPage: 1,
  totalPages: 0,
  zoom: 1.0,
  viewMode: 'page',
  thumbnailSize: 'md',
  darkMode: localStorage.getItem('pdfpro_dark') === 'true',
  selection: [],
  pdfDoc: null,
}

// ── PDF.js ───────────────────────────────────────────────────
let pdfjsLib = null

async function loadPdfJs() {
  if (pdfjsLib) return pdfjsLib
  const mod = await import('pdfjs-dist')
  pdfjsLib = mod
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl
  return pdfjsLib
}

// ── DOM Refs ─────────────────────────────────────────────────
const $ = id => document.getElementById(id)
const $$ = sel => document.querySelectorAll(sel)

const dropZone = $('drop-zone')
const pdfCanvasWrapper = $('pdf-canvas-wrapper')
const pdfCanvas = $('pdf-canvas')
const viewerControls = $('viewer-controls')
const pageList = $('page-list')
const fileInput = $('file-input')
const btnDarkmode = $('btn-darkmode')
const iconMoon = $('icon-moon')
const iconSun = $('icon-sun')
const btnUpload = $('btn-upload')
const btnBrowse = $('btn-browse')
const btnAddPdf = $('btn-add-pdf')
const btnExport = $('btn-export')
const btnSearch = $('btn-search')
const btnCompress = $('btn-compress')
const currentPageInput = $('current-page')
const totalPagesSpan = $('total-pages')
const zoomLevel = $('zoom-level')
const exportPanel = $('export-panel')
const searchPanel = $('search-panel')
const searchInput = $('search-input')

// ── Dark Mode ────────────────────────────────────────────────
function applyDarkMode(dark) {
  document.documentElement.classList.toggle('dark', dark)
  iconMoon.style.display = dark ? 'none' : ''
  iconSun.style.display = dark ? '' : 'none'
  state.darkMode = dark
  localStorage.setItem('pdfpro_dark', dark)
}

btnDarkmode.addEventListener('click', () => applyDarkMode(!state.darkMode))
applyDarkMode(state.darkMode)

// ── File Upload ──────────────────────────────────────────────
async function handleFiles(files) {
  if (!files.length) return
  try {
    setLoading(true)
    const data = state.sessionId
      ? await addPdf(state.sessionId, files)
      : await uploadPdf(files)

    if (data.sessionId) {
      state.sessionId = data.sessionId
      localStorage.setItem('pdfpro_session', data.sessionId)
    }

    state.pages = data.pages
    state.totalPages = data.pages.length
    state.currentPage = 1

    showViewer()
    await loadAndRenderPdf(files[0])
    renderThumbnailsPlaceholder()
    updatePageControls()
  } catch (err) {
    alert(`Error al cargar el PDF: ${err.message}`)
  } finally {
    setLoading(false)
  }
}

btnUpload.addEventListener('click', () => fileInput.click())
btnBrowse?.addEventListener('click', () => fileInput.click())
fileInput.addEventListener('change', e => handleFiles([...e.target.files]))

// ── Drag & Drop on viewer ────────────────────────────────────
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over') })
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'))
dropZone.addEventListener('drop', e => {
  e.preventDefault()
  dropZone.classList.remove('drag-over')
  const files = [...e.dataTransfer.files].filter(f => f.type === 'application/pdf')
  if (files.length) handleFiles(files)
})

// ── PDF Rendering (PDF.js) ───────────────────────────────────
async function loadAndRenderPdf(file) {
  const lib = await loadPdfJs()
  const arrayBuffer = await file.arrayBuffer()
  state.pdfDoc = await lib.getDocument({ data: arrayBuffer }).promise
  state.totalPages = state.pdfDoc.numPages
  await renderPage(state.currentPage)
}

async function renderPage(pageNum) {
  if (!state.pdfDoc) return
  const page = await state.pdfDoc.getPage(pageNum)
  const viewport = page.getViewport({ scale: state.zoom })

  pdfCanvas.width = viewport.width
  pdfCanvas.height = viewport.height

  const ctx = pdfCanvas.getContext('2d')
  await page.render({ canvasContext: ctx, viewport }).promise

  currentPageInput.value = pageNum
  state.currentPage = pageNum
}

// ── Show/hide viewer ─────────────────────────────────────────
function showViewer() {
  dropZone.style.display = 'none'
  pdfCanvasWrapper.style.display = 'flex'
  viewerControls.style.display = 'flex'
  btnAddPdf.style.display = 'flex'
}

// ── Thumbnails (placeholders until PDF.js renders them) ──────
function renderThumbnailsPlaceholder() {
  pageList.innerHTML = ''
  pageList.dataset.size = state.thumbnailSize

  for (let i = 0; i < state.totalPages; i++) {
    const thumb = document.createElement('div')
    thumb.className = 'page-thumb'
    thumb.dataset.index = i
    thumb.innerHTML = `
      <span class="page-thumb-handle" title="Arrastrar">⠿</span>
      <div style="height:${state.thumbnailSize === 'lg' ? 200 : state.thumbnailSize === 'md' ? 140 : 100}px; background:var(--color-surface-2); display:flex; align-items:center; justify-content:center;">
        <canvas data-page="${i + 1}"></canvas>
      </div>
      <input type="checkbox" class="page-thumb-checkbox" data-index="${i}" />
      <div class="page-thumb-index">${i + 1}</div>
    `
    thumb.addEventListener('click', e => {
      if (e.target.type === 'checkbox') return
      navigateTo(i + 1)
      $$('.page-thumb.active').forEach(el => el.classList.remove('active'))
      thumb.classList.add('active')
    })

    const cb = thumb.querySelector('.page-thumb-checkbox')
    cb.addEventListener('change', () => {
      thumb.classList.toggle('selected', cb.checked)
      state.selection = [...$$('.page-thumb-checkbox:checked')].map(el => Number(el.dataset.index))
    })

    pageList.appendChild(thumb)
  }

  renderThumbnailCanvases()
}

async function renderThumbnailCanvases() {
  if (!state.pdfDoc) return
  const thumbs = $$('[data-page]')
  const thumbWidth = { sm: 80, md: 120, lg: 160 }[state.thumbnailSize]

  for (const canvasEl of thumbs) {
    const pageNum = Number(canvasEl.dataset.page)
    const page = await state.pdfDoc.getPage(pageNum)
    const viewport = page.getViewport({ scale: thumbWidth / page.getViewport({ scale: 1 }).width })
    canvasEl.width = viewport.width
    canvasEl.height = viewport.height
    const ctx = canvasEl.getContext('2d')
    await page.render({ canvasContext: ctx, viewport }).promise
  }
}

// ── Navigation ───────────────────────────────────────────────
async function navigateTo(page) {
  if (!state.pdfDoc) return
  const clamped = Math.max(1, Math.min(page, state.totalPages))
  await renderPage(clamped)
  updatePageControls()
}

function updatePageControls() {
  currentPageInput.value = state.currentPage
  totalPagesSpan.textContent = state.totalPages
  zoomLevel.textContent = `${Math.round(state.zoom * 100)}%`
}

$('btn-prev').addEventListener('click', () => navigateTo(state.currentPage - 1))
$('btn-next').addEventListener('click', () => navigateTo(state.currentPage + 1))
$('btn-first').addEventListener('click', () => navigateTo(1))
$('btn-last').addEventListener('click', () => navigateTo(state.totalPages))

currentPageInput.addEventListener('change', () => navigateTo(Number(currentPageInput.value)))

// ── Zoom ─────────────────────────────────────────────────────
const ZOOM_STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.9, 1, 1.25, 1.5, 2, 3, 4]

function changeZoom(newZoom) {
  state.zoom = Math.max(0.25, Math.min(4, newZoom))
  zoomLevel.textContent = `${Math.round(state.zoom * 100)}%`
  renderPage(state.currentPage)
}

$('btn-zoom-in').addEventListener('click', () => {
  const next = ZOOM_STEPS.find(z => z > state.zoom) ?? 4
  changeZoom(next)
})
$('btn-zoom-out').addEventListener('click', () => {
  const prev = [...ZOOM_STEPS].reverse().find(z => z < state.zoom) ?? 0.25
  changeZoom(prev)
})
$('btn-fit').addEventListener('click', () => {
  if (!state.pdfDoc) return
  const wrapper = pdfCanvasWrapper
  changeZoom(wrapper.clientWidth / pdfCanvas.width * state.zoom)
})

// ── Thumbnail size ───────────────────────────────────────────
$$('.size-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    $$('.size-btn').forEach(b => b.classList.remove('size-btn--active'))
    btn.classList.add('size-btn--active')
    state.thumbnailSize = btn.dataset.size
    pageList.dataset.size = state.thumbnailSize
    renderThumbnailCanvases()
  })
})

// ── Add more PDFs ─────────────────────────────────────────────
btnAddPdf.addEventListener('click', () => {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.pdf,application/pdf'
  input.multiple = true
  input.onchange = e => handleFiles([...e.target.files])
  input.click()
})

// ── Export ───────────────────────────────────────────────────
btnExport.addEventListener('click', () => {
  if (!state.sessionId) return
  $('export-page-count').textContent = `Total: ${state.totalPages} páginas`
  exportPanel.style.display = 'flex'
})

$('btn-close-export').addEventListener('click', () => { exportPanel.style.display = 'none' })
$('btn-cancel-export').addEventListener('click', () => { exportPanel.style.display = 'none' })

$('btn-confirm-export').addEventListener('click', async () => {
  const rangeInput = $('export-range').value.trim()
  const errorEl = $('export-range-error')
  errorEl.style.display = 'none'

  try {
    if (rangeInput) parseRange(rangeInput)
  } catch (err) {
    errorEl.textContent = err.message
    errorEl.style.display = 'block'
    return
  }

  try {
    const blob = await exportPdf(state.sessionId, rangeInput || null)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = $('export-filename').value || 'export.pdf'
    a.click()
    URL.revokeObjectURL(url)
    exportPanel.style.display = 'none'
  } catch (err) {
    errorEl.textContent = `Error al exportar: ${err.message}`
    errorEl.style.display = 'block'
  }
})

// ── Search ───────────────────────────────────────────────────
function openSearch() { searchPanel.style.display = 'flex'; searchInput.focus() }
function closeSearch() { searchPanel.style.display = 'none' }

btnSearch.addEventListener('click', openSearch)
searchPanel.addEventListener('click', e => { if (e.target === searchPanel) closeSearch() })
searchInput.addEventListener('keydown', e => { if (e.key === 'Escape') closeSearch() })

// ── Compress ─────────────────────────────────────────────────
btnCompress.addEventListener('click', async () => {
  if (!state.sessionId) return
  try {
    const result = await compressPdf(state.sessionId)
    alert(`PDF comprimido. Nuevo tamaño: ${(result.sizeBytes / 1024).toFixed(1)} KB`)
  } catch (err) {
    alert(`Error al comprimir: ${err.message}`)
  }
})

// ── Keyboard shortcuts ────────────────────────────────────────
document.addEventListener('keydown', e => {
  const tag = document.activeElement?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA') return

  if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); openSearch() }
  if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') navigateTo(state.currentPage - 1)
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') navigateTo(state.currentPage + 1)
})

// ── Loading ───────────────────────────────────────────────────
function setLoading(on) {
  document.body.style.cursor = on ? 'wait' : ''
}
