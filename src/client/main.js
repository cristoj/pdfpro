import Sortable from 'sortablejs'
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
const selectionBar = $('selection-bar')
const selectionCount = $('selection-count')
const btnSelectAll = $('btn-select-all')
const btnDeselect = $('btn-deselect')
const btnDeleteSelection = $('btn-delete-selection')

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
      <div class="page-thumb-canvas-wrapper">
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
      updateSelectionBar()
    })

    pageList.appendChild(thumb)
  }

  initSortable()
  renderThumbnailCanvases()
}

async function renderThumbnailCanvases() {
  if (!state.pdfDoc) return
  const thumbs = $$('[data-page]')
  const colW = { sm: 80, md: 110, lg: 148 }[state.thumbnailSize]
  const colH = Math.round(colW * 297 / 210) // ratio A4 exacto

  for (const canvasEl of thumbs) {
    const pageNum = Number(canvasEl.dataset.page)
    const page = await state.pdfDoc.getPage(pageNum)
    const baseVp = page.getViewport({ scale: 1 })
    // Scale para que la página quepa dentro del box A4 sin distorsionarse
    const scale = Math.min(colW / baseVp.width, colH / baseVp.height)
    const viewport = page.getViewport({ scale })

    // Renderizar a canvas temporal al tamaño real de la página
    const tmp = document.createElement('canvas')
    tmp.width = Math.round(viewport.width)
    tmp.height = Math.round(viewport.height)
    await page.render({ canvasContext: tmp.getContext('2d'), viewport }).promise

    // Copiar centrado sobre canvas A4 (letterbox/pillarbox para páginas no A4)
    canvasEl.width = colW
    canvasEl.height = colH
    const ctx = canvasEl.getContext('2d')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, colW, colH)
    ctx.drawImage(tmp, Math.round((colW - tmp.width) / 2), Math.round((colH - tmp.height) / 2))
  }
}

// ── Selection bar ─────────────────────────────────────────────
function updateSelectionBar() {
  const n = state.selection.length
  if (n === 0) {
    selectionBar.style.display = 'none'
    return
  }
  selectionBar.style.display = 'flex'
  selectionCount.textContent = `${n} página${n !== 1 ? 's' : ''} seleccionada${n !== 1 ? 's' : ''}`
}

function selectAll() {
  state.selection = Array.from({ length: state.totalPages }, (_, i) => i)
  $$('.page-thumb-checkbox').forEach(cb => {
    cb.checked = true
    cb.closest('.page-thumb').classList.add('selected')
  })
  updateSelectionBar()
}

function deselectAll() {
  state.selection = []
  $$('.page-thumb-checkbox').forEach(cb => {
    cb.checked = false
    cb.closest('.page-thumb').classList.remove('selected')
  })
  updateSelectionBar()
}

async function deleteSelection() {
  if (!state.sessionId || !state.selection.length) return
  if (!confirm(`¿Eliminar ${state.selection.length} página${state.selection.length !== 1 ? 's' : ''}?`)) return

  try {
    setLoading(true)
    const data = await deletePagesByIndex(state.sessionId, [...state.selection])
    state.pages = data.pages
    state.selection = []
    state.currentPage = Math.min(state.currentPage, data.pages.length)

    await reloadPdfDoc()
    renderThumbnailsPlaceholder()
    await renderPage(state.currentPage)
    updatePageControls()
    updateSelectionBar()
  } catch (err) {
    alert(`Error al eliminar páginas: ${err.message}`)
  } finally {
    setLoading(false)
  }
}

btnSelectAll.addEventListener('click', selectAll)
btnDeselect.addEventListener('click', deselectAll)
btnDeleteSelection.addEventListener('click', deleteSelection)

// ── Reload PDF from server after mutations ─────────────────────
async function reloadPdfDoc() {
  const blob = await exportPdf(state.sessionId, null)
  const arrayBuffer = await blob.arrayBuffer()
  const lib = await loadPdfJs()
  state.pdfDoc = await lib.getDocument({ data: arrayBuffer }).promise
  state.totalPages = state.pdfDoc.numPages
}

// ── SortableJS ─────────────────────────────────────────────────
let sortable = null

function initSortable() {
  if (sortable) sortable.destroy()
  sortable = new Sortable(pageList, {
    animation: 150,
    handle: '.page-thumb-handle',
    ghostClass: 'page-thumb--ghost',
    chosenClass: 'page-thumb--chosen',
    onEnd: async ({ oldIndex, newIndex }) => {
      if (oldIndex === newIndex || !state.sessionId) return

      const order = Array.from({ length: state.totalPages }, (_, i) => i)
      order.splice(newIndex, 0, order.splice(oldIndex, 1)[0])

      try {
        setLoading(true)
        const data = await reorderPages(state.sessionId, order)
        state.pages = data.pages

        await reloadPdfDoc()
        renderThumbnailsPlaceholder()
        await renderPage(state.currentPage)
        updatePageControls()
      } catch (err) {
        alert(`Error al reordenar: ${err.message}`)
        renderThumbnailsPlaceholder()
      } finally {
        setLoading(false)
      }
    },
  })
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

// ── Sidebar resize ────────────────────────────────────────────
const sidebarEl = $('sidebar')
const sidebarResizeHandle = $('sidebar-resize')

let _resizing = false
let _resizeStartX = 0
let _resizeStartW = 0

sidebarResizeHandle.addEventListener('mousedown', e => {
  _resizing = true
  _resizeStartX = e.clientX
  _resizeStartW = sidebarEl.offsetWidth
  sidebarResizeHandle.classList.add('sidebar-resize--active')
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
})

document.addEventListener('mousemove', e => {
  if (!_resizing) return
  const w = Math.max(160, Math.min(600, _resizeStartW + e.clientX - _resizeStartX))
  sidebarEl.style.width = `${w}px`
})

document.addEventListener('mouseup', () => {
  if (!_resizing) return
  _resizing = false
  sidebarResizeHandle.classList.remove('sidebar-resize--active')
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
})

// ── Loading ───────────────────────────────────────────────────
function setLoading(on) {
  document.body.style.cursor = on ? 'wait' : _resizing ? 'col-resize' : ''
}
