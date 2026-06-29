import Sortable from 'sortablejs'
import { uploadPdf, addPdf, reorderPages, deletePagesByIndex, exportPdf, compressPdf, getTextBlocks, addTextBlock, updateTextBlock, deleteTextBlock, getShapes, addShape, updateShape, deleteShape, getFormValues, fillFormFields, getImages, addImage, updateImage, deleteImage } from './services/apiClient.js'
import { parseRange } from './utils/pageRange.js'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

// ── App State ────────────────────────────────────────────────
const state = {
  sessionId: localStorage.getItem('pdfpro_session') ?? null,
  pages: [],
  currentPage: 1,
  totalPages: 0,
  zoom: 1.0,
  viewMode: 'continuous',
  thumbnailSize: 'md',
  darkMode: localStorage.getItem('pdfpro_dark') === 'true',
  selection: [],
  pdfDoc: null,
  // Edit mode
  editMode: false,
  activeTool: 'select',       // 'select' | 'addText' | 'addRect' | 'addCircle' | 'addImage'
  textBlocks: [],              // { id, pageIndex, x, y, text, fontSize, fontFamily, bold, italic, color }
  selectedBlockId: null,
  shapes: [],                  // { id, type, pageIndex, x, y, width, height, fillColor, fillTransparent, strokeColor, strokeWidth }
  selectedShapeId: null,
  images: [],                  // { id, pageIndex, x, y, width, height, imageData, mimeType }
  selectedImageId: null,
  // Forms mode
  formsMode: false,
  formFields: [],              // { name, fieldType, pageIndex, rect, pageHeight, checkBox, radioButton, options, multiSelect, defaultValue }
  formValues: {},              // { fieldName: value }
  pageWidthPt: 0,
  pageHeightPt: 0,
  typography: { fontFamily: 'Helvetica', fontSize: 14, bold: false, italic: false, color: '#000000' },
  shapeStyle: { fillColor: '#ffffff', fillTransparent: false, strokeColor: '#000000', strokeWidth: 2 },
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
const editToolbar = $('edit-toolbar')
const textLayer = $('text-layer')
const toolSelectBtn = $('tool-select')
const toolAddTextBtn = $('tool-add-text')
const toolRectBtn = $('tool-rect')
const toolCircleBtn = $('tool-circle')
const toolAddImageBtn = $('tool-add-image')
const imageFileInput = $('image-file-input')
const fontFamilySelect = $('font-family-select')
const fontSizeInput = $('font-size-input')
const btnBold = $('btn-bold')
const btnItalic = $('btn-italic')
const fontColorInput = $('font-color-input')
const typographyControls = $('typography-controls')
const shapeControls = $('shape-controls')
const shapeControlsSep = $('shape-controls-sep')
const shapeFillColorInput = $('shape-fill-color')
const shapeNoFillCheckbox = $('shape-no-fill')
const shapeStrokeColorInput = $('shape-stroke-color')
const shapeStrokeWidthInput = $('shape-stroke-width')
const btnDeleteBlock = $('btn-delete-block')
const btnEdit = $('btn-edit')
const btnForms = $('btn-forms')

// ── Utilities ────────────────────────────────────────────────
function slugify(str) {
  return str
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'export'
}

function showToast(message, type = 'info') {
  const container = $('toast-container')
  const toast = document.createElement('div')
  toast.className = `toast toast--${type}`
  const icon = type === 'error' ? '✕' : type === 'success' ? '✓' : 'ℹ'
  toast.innerHTML = `
    <span class="toast-icon">${icon}</span>
    <span class="toast-message">${message}</span>
    <button class="toast-close" aria-label="Cerrar">✕</button>
  `
  const dismiss = () => {
    toast.classList.add('toast--out')
    setTimeout(() => toast.remove(), 250)
  }
  toast.querySelector('.toast-close').addEventListener('click', dismiss)
  container.appendChild(toast)
  setTimeout(dismiss, 4500)
}

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
async function handleFiles(files, { forceNew = false } = {}) {
  if (!files.length) return
  try {
    setLoading(true)
    let data
    if (forceNew) {
      state.sessionId = null
      localStorage.removeItem('pdfpro_session')
    }
    if (state.sessionId) {
      try {
        data = await addPdf(state.sessionId, files)
      } catch (err) {
        if (err.message.includes('Session not found')) {
          state.sessionId = null
          localStorage.removeItem('pdfpro_session')
          data = await uploadPdf(files)
        } else {
          throw err
        }
      }
    } else {
      data = await uploadPdf(files)
    }

    if (data.sessionId) {
      state.sessionId = data.sessionId
      localStorage.setItem('pdfpro_session', data.sessionId)
    }

    state.pages = data.pages
    state.totalPages = data.pages.length
    state.currentPage = 1

    state.textBlocks = state.sessionId
      ? await getTextBlocks(state.sessionId).catch(() => [])
      : []

    state.shapes = state.sessionId
      ? await getShapes(state.sessionId).catch(() => [])
      : []

    state.images = state.sessionId
      ? await getImages(state.sessionId).catch(() => [])
      : []

    state.formValues = state.sessionId
      ? await getFormValues(state.sessionId).catch(() => ({}))
      : {}

    // Resetear campos detectados y el índice de búsqueda al cargar un nuevo PDF
    state.formFields = []
    textIndex = []
    if (state.formsMode) setFormsMode(false)

    showViewer()
    await loadAndRenderPdf(files[0])
    renderThumbnailsPlaceholder()
    updatePageControls()
  } catch (err) {
    showToast(`Error al cargar el PDF: ${err.message}`, 'error')
  } finally {
    setLoading(false)
  }
}

btnUpload.addEventListener('click', () => fileInput.click())
btnBrowse?.addEventListener('click', () => fileInput.click())
fileInput.addEventListener('change', e => handleFiles([...e.target.files], { forceNew: true }))

// ── Drag & Drop on viewer ────────────────────────────────────
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over') })
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'))
dropZone.addEventListener('drop', e => {
  e.preventDefault()
  dropZone.classList.remove('drag-over')
  const files = [...e.dataTransfer.files].filter(f => f.type === 'application/pdf')
  if (files.length) handleFiles(files, { forceNew: true })
})

// ── PDF Rendering (PDF.js) ───────────────────────────────────
async function loadAndRenderPdf(file) {
  const lib = await loadPdfJs()
  const arrayBuffer = await file.arrayBuffer()
  state.pdfDoc = await lib.getDocument({ data: arrayBuffer }).promise
  state.totalPages = state.pdfDoc.numPages

  // Extraer título desde metadatos del PDF o usar el nombre del fichero
  try {
    const meta = await state.pdfDoc.getMetadata()
    const pdfTitle = meta?.info?.Title?.trim()
    const fileTitle = file.name.replace(/\.pdf$/i, '').trim()
    $('filename').value = pdfTitle || fileTitle || 'Sin título'
  } catch {
    $('filename').value = file.name.replace(/\.pdf$/i, '').trim() || 'Sin título'
  }

  // Leer dimensiones de página 1 para cálculos de zoom
  const firstPage = await state.pdfDoc.getPage(1)
  const baseVp = firstPage.getViewport({ scale: 1 })
  state.pageWidthPt = baseVp.width
  state.pageHeightPt = baseVp.height

  if (state.viewMode === 'continuous') {
    canvasContainer.style.display = 'none'
    continuousView.style.display = 'flex'
    await renderContinuousView()
  } else {
    continuousView.style.display = 'none'
    canvasContainer.style.display = 'inline-block'
    await renderPage(state.currentPage)
  }
}

async function renderPage(pageNum) {
  if (!state.pdfDoc) return
  const page = await state.pdfDoc.getPage(pageNum)
  const baseVp = page.getViewport({ scale: 1 })
  state.pageWidthPt = baseVp.width
  state.pageHeightPt = baseVp.height

  const viewport = page.getViewport({ scale: state.zoom })
  pdfCanvas.width = viewport.width
  pdfCanvas.height = viewport.height

  const ctx = pdfCanvas.getContext('2d')
  await page.render({ canvasContext: ctx, viewport }).promise

  currentPageInput.value = pageNum
  state.currentPage = pageNum
  renderEditOverlay()
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
      <div class="page-thumb-checkbox-wrap">
        <input type="checkbox" class="page-thumb-checkbox" data-index="${i}" />
      </div>
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
  const thumbs = $$('canvas[data-page]')
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const fallbackW = { sm: 80, md: 110, lg: 200 }[state.thumbnailSize]

  for (const canvasEl of thumbs) {
    const pageNum = Number(canvasEl.dataset.page)
    const page = await state.pdfDoc.getPage(pageNum)
    const baseVp = page.getViewport({ scale: 1 })

    // Usar el tamaño real renderizado en pantalla para evitar blur por upscaling CSS
    const rect = canvasEl.getBoundingClientRect()
    const colW = rect.width > 0 ? rect.width : fallbackW
    const colH = rect.height > 0 ? rect.height : Math.round(colW * 297 / 210)

    // Escala HiDPI: buffer del canvas = píxeles físicos de pantalla
    const scale = Math.min((colW * dpr) / baseVp.width, (colH * dpr) / baseVp.height)
    const viewport = page.getViewport({ scale })

    const bufW = Math.round(colW * dpr)
    const bufH = Math.round(colH * dpr)

    // Renderizar a canvas temporal al tamaño físico
    const tmp = document.createElement('canvas')
    tmp.width = Math.round(viewport.width)
    tmp.height = Math.round(viewport.height)
    await page.render({ canvasContext: tmp.getContext('2d'), viewport }).promise

    // Canvas final con resolución HiDPI
    canvasEl.width = bufW
    canvasEl.height = bufH
    const ctx = canvasEl.getContext('2d')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, bufW, bufH)
    ctx.drawImage(tmp, Math.round((bufW - tmp.width) / 2), Math.round((bufH - tmp.height) / 2))
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
    showToast(`Error al eliminar páginas: ${err.message}`, 'error')
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
        showToast(`Error al reordenar: ${err.message}`, 'error')
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
  if (state.viewMode === 'continuous') {
    renderContinuousView()
  } else {
    renderPage(state.currentPage)
  }
}

$('btn-zoom-in').addEventListener('click', () => {
  const next = ZOOM_STEPS.find(z => z > state.zoom) ?? 4
  changeZoom(next)
})
$('btn-zoom-out').addEventListener('click', () => {
  const prev = [...ZOOM_STEPS].reverse().find(z => z < state.zoom) ?? 0.25
  changeZoom(prev)
})
$('btn-fit-width').addEventListener('click', () => {
  if (!state.pdfDoc) return
  const availW = pdfCanvasWrapper.clientWidth - 48  // padding
  const pdfW = state.pageWidthPt || pdfCanvas.width
  changeZoom(availW / pdfW)
})

$('btn-fit-height').addEventListener('click', () => {
  if (!state.pdfDoc) return
  const availH = pdfCanvasWrapper.clientHeight - 48
  const pdfH = state.pageHeightPt || pdfCanvas.height
  changeZoom(availH / pdfH)
})

// ── View modes ────────────────────────────────────────────────
const continuousView = $('continuous-view')
const canvasContainer = $('canvas-container')
const btnViewPage = $('btn-view-page')
const btnViewCont = $('btn-view-cont')

function setViewMode(mode) {
  state.viewMode = mode
  btnViewPage.classList.toggle('control-btn--active', mode === 'page')
  btnViewCont.classList.toggle('control-btn--active', mode === 'continuous')

  if (mode === 'continuous') {
    canvasContainer.style.display = 'none'
    continuousView.style.display = 'flex'
    renderContinuousView()
  } else {
    continuousView.style.display = 'none'
    canvasContainer.style.display = 'inline-block'
    if (state.pdfDoc) renderPage(state.currentPage)
  }
}

async function renderContinuousView() {
  if (!state.pdfDoc) return
  continuousView.innerHTML = ''
  for (let p = 1; p <= state.totalPages; p++) {
    const page = await state.pdfDoc.getPage(p)
    const viewport = page.getViewport({ scale: state.zoom })

    const pageWrapper = document.createElement('div')
    pageWrapper.className = 'continuous-page'
    pageWrapper.dataset.page = p

    const canvas = document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height
    canvas.style.display = 'block'

    pageWrapper.appendChild(canvas)
    continuousView.appendChild(pageWrapper)

    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise
  }

  // Intersección observer para actualizar la página actual al hacer scroll
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        state.currentPage = Number(entry.target.dataset.page)
        currentPageInput.value = state.currentPage
      }
    }
  }, { root: pdfCanvasWrapper, threshold: 0.5 })

  continuousView.querySelectorAll('.continuous-page').forEach(el => observer.observe(el))
}

btnViewPage.addEventListener('click', () => { if (state.viewMode !== 'page') setViewMode('page') })
btnViewCont.addEventListener('click', () => { if (state.viewMode !== 'continuous') setViewMode('continuous') })

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
  const title = $('filename').value.trim()
  $('export-filename').value = title ? `${slugify(title)}.pdf` : 'export.pdf'
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
// textIndex: Array<{ pageIndex: number, items: Array<{ str, transform }> }>
let textIndex = []
let _searchDebounce = null

function openSearch() {
  searchPanel.style.display = 'flex'
  searchInput.focus()
  if (state.pdfDoc && !textIndex.length) buildTextIndex()
}

function closeSearch() {
  searchPanel.style.display = 'none'
  clearSearchHighlights()
}

async function buildTextIndex() {
  if (!state.pdfDoc) return
  textIndex = []
  for (let p = 1; p <= state.totalPages; p++) {
    const page = await state.pdfDoc.getPage(p)
    const content = await page.getTextContent()
    textIndex.push({ pageIndex: p - 1, items: content.items })
  }
}

function searchText(query) {
  clearSearchHighlights()
  const resultsEl = $('search-results')
  resultsEl.innerHTML = ''

  if (!query.trim() || !textIndex.length) return

  const q = query.toLowerCase()
  const results = []

  for (const { pageIndex, items } of textIndex) {
    const fullText = items.map(i => i.str).join(' ')
    if (fullText.toLowerCase().includes(q)) {
      const snippets = []
      let joined = ''
      for (const item of items) {
        const prev = joined
        joined += item.str
        const idx = joined.toLowerCase().indexOf(q)
        if (idx !== -1) {
          const start = Math.max(0, idx - 30)
          const end = Math.min(joined.length, idx + q.length + 30)
          snippets.push(joined.slice(start, end).trim())
          joined = joined.slice(idx + q.length)
        }
      }
      results.push({ pageIndex, snippets: snippets.slice(0, 3) })
    }
  }

  if (!results.length) {
    resultsEl.innerHTML = '<p class="search-no-results">Sin resultados</p>'
    return
  }

  for (const r of results) {
    const item = document.createElement('button')
    item.className = 'search-result-item'
    const pageNum = r.pageIndex + 1
    const snippet = r.snippets[0] ?? ''
    const highlighted = snippet.replace(new RegExp(`(${escapeRe(query)})`, 'gi'), '<mark>$1</mark>')
    item.innerHTML = `
      <span class="search-result-page">Pág. ${pageNum}</span>
      <span class="search-result-snippet">${highlighted}</span>
    `
    item.addEventListener('click', () => {
      navigateTo(pageNum)
      highlightSearchOnPage(pageNum, query)
    })
    resultsEl.appendChild(item)
  }
}

function escapeRe(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function highlightSearchOnPage(pageNum, query) {
  clearSearchHighlights()
  if (!query.trim()) return
  const highlights = document.createElement('div')
  highlights.id = 'search-highlight-layer'
  highlights.className = 'search-highlight-layer'
  highlights.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:visible;'

  const entry = textIndex[pageNum - 1]
  if (!entry) return

  const q = query.toLowerCase()
  const canvas = pdfCanvas
  const scaleX = canvas.width / (state.pageWidthPt || canvas.width)
  const scaleY = canvas.height / (state.pageHeightPt || canvas.height)

  for (const item of entry.items) {
    if (!item.str.toLowerCase().includes(q)) continue
    const [a, b, c, d, e, f] = item.transform
    const x = e * scaleX * state.zoom
    const y = canvas.height - (f * scaleY * state.zoom) - (Math.abs(d) * scaleY * state.zoom)
    const w = (item.width ?? item.str.length * Math.abs(a)) * scaleX * state.zoom
    const h = Math.abs(d) * scaleY * state.zoom || 14

    const mark = document.createElement('div')
    mark.className = 'search-text-highlight'
    mark.style.cssText = `left:${x}px;top:${y}px;width:${Math.max(w, 8)}px;height:${Math.max(h, 10)}px;`
    highlights.appendChild(mark)
  }

  document.getElementById('canvas-container')?.appendChild(highlights)
}

function clearSearchHighlights() {
  document.getElementById('search-highlight-layer')?.remove()
}

btnSearch.addEventListener('click', openSearch)
searchPanel.addEventListener('click', e => { if (e.target === searchPanel) closeSearch() })
searchInput.addEventListener('keydown', e => { if (e.key === 'Escape') closeSearch() })
searchInput.addEventListener('input', () => {
  clearTimeout(_searchDebounce)
  _searchDebounce = setTimeout(() => searchText(searchInput.value), 300)
})

// ── Compress ─────────────────────────────────────────────────
const compressPanel = $('compress-panel')
const compressResult = $('compress-result')
let _compressLevel = 'low'

function openCompressPanel() {
  compressResult.style.display = 'none'
  compressResult.textContent = ''
  compressPanel.style.display = 'flex'
}

function closeCompressPanel() {
  compressPanel.style.display = 'none'
}

btnCompress.addEventListener('click', () => {
  if (!state.sessionId) return
  openCompressPanel()
})

$('btn-close-compress').addEventListener('click', closeCompressPanel)
$('btn-cancel-compress').addEventListener('click', closeCompressPanel)
compressPanel.addEventListener('click', e => { if (e.target === compressPanel) closeCompressPanel() })

$$('.compress-level-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    $$('.compress-level-btn').forEach(b => b.classList.remove('compress-level-btn--active'))
    btn.classList.add('compress-level-btn--active')
    _compressLevel = btn.dataset.level
  })
})

$('btn-confirm-compress').addEventListener('click', async () => {
  const confirmBtn = $('btn-confirm-compress')
  confirmBtn.disabled = true
  confirmBtn.textContent = 'Comprimiendo…'
  compressResult.style.display = 'none'

  try {
    const result = await compressPdf(state.sessionId, _compressLevel)
    compressResult.textContent = `✓ Comprimido. Nuevo tamaño: ${(result.sizeBytes / 1024).toFixed(1)} KB`
    compressResult.style.display = 'block'
    compressResult.style.color = 'var(--color-success)'
  } catch (err) {
    compressResult.textContent = `Error: ${err.message}`
    compressResult.style.display = 'block'
    compressResult.style.color = 'var(--color-danger)'
  } finally {
    confirmBtn.disabled = false
    confirmBtn.textContent = 'Comprimir ahora'
  }
})

// ── Keyboard shortcuts ────────────────────────────────────────
document.addEventListener('keydown', e => {
  const tag = document.activeElement?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA') return
  if (document.activeElement?.contentEditable === 'true') return

  if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); openSearch() }

  if ((e.metaKey || e.ctrlKey) && e.key === 's') {
    e.preventDefault()
    if (state.sessionId) {
      const title = $('filename').value.trim()
      $('export-filename').value = title ? `${slugify(title)}.pdf` : 'export.pdf'
      $('export-page-count').textContent = `Total: ${state.totalPages} páginas`
      exportPanel.style.display = 'flex'
    }
    return
  }

  if ((e.key === 'Delete' || e.key === 'Backspace') && !state.editMode && state.selection.length) {
    e.preventDefault()
    deleteSelection()
    return
  }

  if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') navigateTo(state.currentPage - 1)
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') navigateTo(state.currentPage + 1)

  if (state.editMode) {
    if (e.key === 'v' || e.key === 'V') setActiveTool('select')
    if (e.key === 't' || e.key === 'T') setActiveTool('addText')
    if (e.key === 'r' || e.key === 'R') setActiveTool('addRect')
    if (e.key === 'c' || e.key === 'C') setActiveTool('addCircle')
    if ((e.key === 'i' || e.key === 'I') && state.sessionId) imageFileInput?.click()
  }
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
  const maxW = Math.floor(window.innerWidth * 0.8)
  const w = Math.max(160, Math.min(maxW, _resizeStartW + e.clientX - _resizeStartX))
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
  $('loading-bar').classList.toggle('loading-bar--visible', on)
}

// ── Forms mode ────────────────────────────────────────────────
async function setFormsMode(on) {
  state.formsMode = on
  btnForms.classList.toggle('toolbar-btn--active', on)

  if (on) {
    if (state.editMode) setEditMode(false)
    if (!state.formFields.length) await detectFormFields()
    renderEditOverlay()
  } else {
    renderEditOverlay()
  }
}

async function detectFormFields() {
  if (!state.pdfDoc) return
  state.formFields = []

  for (let pageNum = 1; pageNum <= state.totalPages; pageNum++) {
    const page = await state.pdfDoc.getPage(pageNum)
    const baseVp = page.getViewport({ scale: 1 })
    const pageHeight = baseVp.height

    const annotations = await page.getAnnotations()
    const widgets = annotations.filter(a => a.subtype === 'Widget' && !a.hidden)

    for (const ann of widgets) {
      if (!ann.fieldName || !ann.rect) continue
      state.formFields.push({
        name: ann.fieldName,
        fieldType: ann.fieldType,   // 'Tx' | 'Btn' | 'Ch' | 'Sig'
        pageIndex: pageNum - 1,
        rect: ann.rect,             // [x1, y1, x2, y2] PDF user space
        pageHeight,
        checkBox: ann.checkBox ?? false,
        radioButton: ann.radioButton ?? false,
        buttonValue: ann.buttonValue ?? null, // valor de ESTE radio button específico
        options: ann.options ?? [],
        multiSelect: ann.multiSelect ?? false,
        defaultValue: ann.fieldValue ?? '',
      })
    }
  }
}

function createFormFieldElement(field) {
  const [x1, y1, x2, y2] = field.rect
  const left = x1 * state.zoom
  const top = (field.pageHeight - y2) * state.zoom
  const width = Math.max((x2 - x1) * state.zoom, 10)
  const height = Math.max((y2 - y1) * state.zoom, 10)

  const wrapper = document.createElement('div')
  wrapper.className = 'form-field-overlay'
  wrapper.dataset.fieldName = field.name
  wrapper.style.cssText = `left:${left}px;top:${top}px;width:${width}px;height:${height}px;`

  const savedValue = state.formValues[field.name]

  let input = null

  if (field.fieldType === 'Tx') {
    input = document.createElement('input')
    input.type = 'text'
    input.className = 'form-field-input'
    input.value = savedValue ?? field.defaultValue ?? ''
    input.addEventListener('input', () => onFormValueChange(field.name, input.value))
  } else if (field.fieldType === 'Btn' && field.checkBox) {
    const cb = document.createElement('input')
    cb.type = 'checkbox'
    cb.className = 'form-field-checkbox'
    const isChecked = savedValue != null
      ? (savedValue === 'Yes' || savedValue === true || savedValue === 'On')
      : (field.defaultValue === 'Yes' || field.defaultValue === 'On')
    cb.checked = isChecked
    cb.addEventListener('change', () => onFormValueChange(field.name, cb.checked ? 'Yes' : 'Off'))
    input = cb
  } else if (field.fieldType === 'Btn' && field.radioButton) {
    const radio = document.createElement('input')
    radio.type = 'radio'
    radio.className = 'form-field-radio'
    // Agrupar todos los radios del mismo campo con el mismo name HTML
    radio.name = `pdf-radio-${field.name}`
    radio.value = field.buttonValue ?? ''
    const currentVal = savedValue ?? field.defaultValue ?? ''
    radio.checked = radio.value !== '' && radio.value !== 'Off' && currentVal === radio.value
    radio.addEventListener('change', () => {
      if (radio.checked) onFormValueChange(field.name, radio.value)
    })
    input = radio
  } else if (field.fieldType === 'Ch' && !field.multiSelect) {
    const sel = document.createElement('select')
    sel.className = 'form-field-select'
    sel.size = 1  // Forzar dropdown (evita renderizado como listbox por height)
    const currentVal = savedValue ?? field.defaultValue ?? ''
    for (const opt of field.options) {
      const o = document.createElement('option')
      o.value = opt.exportValue ?? String(opt)
      o.textContent = opt.displayValue ?? String(opt)
      if (o.value === currentVal) o.selected = true
      sel.appendChild(o)
    }
    sel.value = currentVal
    sel.addEventListener('change', () => onFormValueChange(field.name, sel.value))
    input = sel
  }

  if (input) {
    wrapper.appendChild(input)
    textLayer.appendChild(wrapper)
  }
}

let _saveFormTimeout = null

function onFormValueChange(name, value) {
  state.formValues[name] = value
  clearTimeout(_saveFormTimeout)
  _saveFormTimeout = setTimeout(async () => {
    if (!state.sessionId) return
    try {
      await fillFormFields(state.sessionId, state.formValues)
    } catch { /* valores en memoria, sin bloquear */ }
  }, 600)
}

btnForms.addEventListener('click', () => {
  if (!state.sessionId) return
  setFormsMode(!state.formsMode)
})

// ── Edit mode ─────────────────────────────────────────────────
function setEditMode(on) {
  state.editMode = on
  editToolbar.style.display = on ? 'flex' : 'none'
  btnEdit.classList.toggle('toolbar-btn--active', on)
  textLayer.classList.toggle('edit-active', on)
  if (on && state.formsMode) setFormsMode(false)
  if (on && state.viewMode !== 'page') setViewMode('page')
  if (!on) {
    deselectTextBlock()
    deselectShape()
    deselectImage()
    setActiveTool('select')
  }
}

function setActiveTool(tool) {
  state.activeTool = tool
  toolSelectBtn.classList.toggle('tool-btn--active', tool === 'select')
  toolAddTextBtn.classList.toggle('tool-btn--active', tool === 'addText')
  toolRectBtn.classList.toggle('tool-btn--active', tool === 'addRect')
  toolCircleBtn.classList.toggle('tool-btn--active', tool === 'addCircle')
  toolAddImageBtn?.classList.toggle('tool-btn--active', tool === 'addImage')
  textLayer.classList.toggle('add-text-cursor', tool === 'addText' || tool === 'addRect' || tool === 'addCircle')

  const isShapeTool = tool === 'addRect' || tool === 'addCircle'
  showShapeControls(isShapeTool)
}

function showShapeControls(on) {
  shapeControls.style.display = on ? 'flex' : 'none'
  shapeControlsSep.style.display = on ? 'block' : 'none'
}

btnEdit.addEventListener('click', () => setEditMode(!state.editMode))
toolSelectBtn.addEventListener('click', () => setActiveTool('select'))
toolAddTextBtn.addEventListener('click', () => setActiveTool('addText'))
toolRectBtn.addEventListener('click', () => setActiveTool('addRect'))
toolCircleBtn.addEventListener('click', () => setActiveTool('addCircle'))
toolAddImageBtn?.addEventListener('click', () => {
  if (!state.sessionId) return showToast('Primero importa un PDF', 'error')
  imageFileInput?.click()
})

function compressImageIfNeeded(imgElement, originalSizeBytes) {
  const MAX_BYTES = 1 * 1024 * 1024
  if (originalSizeBytes <= MAX_BYTES) return Promise.resolve(null)

  const canvas = document.createElement('canvas')
  canvas.width = imgElement.naturalWidth
  canvas.height = imgElement.naturalHeight
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(imgElement, 0, 0)

  const initialQuality = Math.min(0.92, (MAX_BYTES / originalSizeBytes) * 0.9)

  return new Promise(resolve => {
    const tryCompress = quality => {
      canvas.toBlob(blob => {
        if (!blob) { resolve(null); return }
        if (blob.size <= MAX_BYTES || quality <= 0.15) {
          const r = new FileReader()
          r.onload = e => resolve(e.target.result)
          r.readAsDataURL(blob)
        } else {
          tryCompress(quality - 0.15)
        }
      }, 'image/jpeg', quality)
    }
    tryCompress(initialQuality)
  })
}

imageFileInput?.addEventListener('change', e => {
  const file = e.target.files?.[0]
  if (!file || !state.sessionId) return
  imageFileInput.value = ''

  const reader = new FileReader()
  reader.onload = async ev => {
    const dataUrl = ev.target.result
    const mimeType = file.type || 'image/png'

    const naturalImg = new Image()
    naturalImg.onload = async () => {
      const compressed = await compressImageIfNeeded(naturalImg, file.size)
      const finalDataUrl = compressed ?? dataUrl
      const finalMime = compressed ? 'image/jpeg' : mimeType

      const aspect = naturalImg.naturalWidth / naturalImg.naturalHeight
      const maxW = Math.min(300, (state.pageWidthPt || 595) * 0.5)
      const w = maxW
      const h = w / aspect

      const x = ((state.pageWidthPt || 595) - w) / 2
      const y = ((state.pageHeightPt || 842) - h) / 2

      const tempId = `tmp-img-${Date.now()}`
      const imgData = {
        id: tempId,
        pageIndex: state.currentPage - 1,
        x, y, width: w, height: h,
        imageData: finalDataUrl,
        mimeType: finalMime,
      }

      state.images.push(imgData)
      createImageElement(imgData)
      selectImage(tempId)
      setActiveTool('select')

      try {
        const { image: saved } = await addImage(state.sessionId, {
          pageIndex: imgData.pageIndex,
          x, y, width: w, height: h,
          imageData: finalDataUrl,
          mimeType: finalMime,
        })
        const el = textLayer.querySelector(`[data-id="${tempId}"]`)
        Object.assign(imgData, saved)
        if (el) el.dataset.id = imgData.id
        if (state.selectedImageId === tempId) state.selectedImageId = imgData.id
      } catch {
        state.images = state.images.filter(i => i.id !== tempId)
        const el = textLayer.querySelector(`[data-id="${tempId}"]`)
        if (el) el.remove()
        showToast('Error al añadir imagen', 'error')
      }
    }
    naturalImg.src = dataUrl
  }
  reader.readAsDataURL(file)
})

// ── Typography controls ───────────────────────────────────────
function syncTypographyUI() {
  fontFamilySelect.value = state.typography.fontFamily
  fontSizeInput.value = state.typography.fontSize
  btnBold.classList.toggle('tool-btn--active', state.typography.bold)
  btnItalic.classList.toggle('tool-btn--active', state.typography.italic)
  fontColorInput.value = state.typography.color ?? '#000000'
}

fontFamilySelect.addEventListener('change', () => {
  state.typography.fontFamily = fontFamilySelect.value
  applyTypographyToSelected()
})
fontSizeInput.addEventListener('change', () => {
  state.typography.fontSize = Number(fontSizeInput.value) || 14
  applyTypographyToSelected()
})
btnBold.addEventListener('click', () => {
  state.typography.bold = !state.typography.bold
  btnBold.classList.toggle('tool-btn--active', state.typography.bold)
  applyTypographyToSelected()
})
btnItalic.addEventListener('click', () => {
  state.typography.italic = !state.typography.italic
  btnItalic.classList.toggle('tool-btn--active', state.typography.italic)
  applyTypographyToSelected()
})
fontColorInput.addEventListener('input', () => {
  state.typography.color = fontColorInput.value
  applyTypographyToSelected()
})

function applyTypographyToSelected() {
  if (!state.selectedBlockId) return
  const block = state.textBlocks.find(b => b.id === state.selectedBlockId)
  if (!block) return
  Object.assign(block, {
    fontFamily: state.typography.fontFamily,
    fontSize: state.typography.fontSize,
    bold: state.typography.bold,
    italic: state.typography.italic,
    color: state.typography.color,
  })
  rerenderTextBlock(block)
  if (state.sessionId) {
    updateTextBlock(state.sessionId, block.id, {
      fontFamily: block.fontFamily,
      fontSize: block.fontSize,
      bold: block.bold,
      italic: block.italic,
      color: block.color,
    }).catch(() => { })
  }
}

// ── Shape style controls ──────────────────────────────────────
function syncShapeStyleUI() {
  shapeFillColorInput.value = state.shapeStyle.fillColor
  shapeNoFillCheckbox.checked = state.shapeStyle.fillTransparent
  shapeFillColorInput.disabled = state.shapeStyle.fillTransparent
  shapeStrokeColorInput.value = state.shapeStyle.strokeColor
  shapeStrokeWidthInput.value = state.shapeStyle.strokeWidth
}

function applyShapeStyleToSelected() {
  if (!state.selectedShapeId) return
  const shape = state.shapes.find(s => s.id === state.selectedShapeId)
  if (!shape) return
  Object.assign(shape, {
    fillColor: state.shapeStyle.fillColor,
    fillTransparent: state.shapeStyle.fillTransparent,
    strokeColor: state.shapeStyle.strokeColor,
    strokeWidth: state.shapeStyle.strokeWidth,
  })
  rerenderShape(shape)
  if (state.sessionId) {
    updateShape(state.sessionId, shape.id, {
      fillColor: shape.fillColor,
      fillTransparent: shape.fillTransparent,
      strokeColor: shape.strokeColor,
      strokeWidth: shape.strokeWidth,
    }).catch(() => { })
  }
}

shapeFillColorInput.addEventListener('input', () => {
  state.shapeStyle.fillColor = shapeFillColorInput.value
  applyShapeStyleToSelected()
})

shapeNoFillCheckbox.addEventListener('change', () => {
  state.shapeStyle.fillTransparent = shapeNoFillCheckbox.checked
  shapeFillColorInput.disabled = shapeNoFillCheckbox.checked
  applyShapeStyleToSelected()
})

shapeStrokeColorInput.addEventListener('input', () => {
  state.shapeStyle.strokeColor = shapeStrokeColorInput.value
  applyShapeStyleToSelected()
})

shapeStrokeWidthInput.addEventListener('change', () => {
  state.shapeStyle.strokeWidth = Number(shapeStrokeWidthInput.value) || 0
  applyShapeStyleToSelected()
})

// ── Text overlay ──────────────────────────────────────────────
const CSS_FONTS = {
  Helvetica: "'Geist Sans', Helvetica, Arial, sans-serif",
  Courier: "'JetBrains Mono', 'Courier New', monospace",
}

function pdfCoordsToOverlay(x, y) {
  return {
    left: x * state.zoom,
    top: (state.pageHeightPt - y) * state.zoom,
  }
}

function overlayCoordsToPdf(left, top) {
  return {
    x: left / state.zoom,
    y: state.pageHeightPt - top / state.zoom,
  }
}

function blockCssStyle(block) {
  const { left, top } = pdfCoordsToOverlay(block.x, block.y)
  const fontFamily = CSS_FONTS[block.fontFamily] ?? CSS_FONTS.Helvetica
  const color = block.color ?? '#000000'
  return `left:${left}px;top:${top}px;font-size:${block.fontSize * state.zoom}px;font-family:${fontFamily};font-weight:${block.bold ? 700 : 400};font-style:${block.italic ? 'italic' : 'normal'};color:${color};`
}

function renderEditOverlay() {
  textLayer.innerHTML = ''
  const pageIdx = state.currentPage - 1

  state.images.filter(img => img.pageIndex === pageIdx).forEach(img => createImageElement(img))
  state.shapes.filter(s => s.pageIndex === pageIdx).forEach(shape => createShapeElement(shape))
  state.textBlocks.filter(b => b.pageIndex === pageIdx).forEach(block => createBlockElement(block))

  if (state.formsMode) {
    state.formFields.filter(f => f.pageIndex === pageIdx).forEach(field => createFormFieldElement(field))
  }
}

function createBlockElement(block) {
  const el = document.createElement('div')
  el.className = 'text-block'
  el.dataset.id = block.id
  el.setAttribute('style', blockCssStyle(block))

  const content = document.createElement('div')
  content.className = 'text-block-content'
  content.textContent = block.text

  const delBtn = document.createElement('button')
  delBtn.className = 'text-block-del'
  delBtn.textContent = '✕'
  delBtn.title = 'Eliminar bloque'
  delBtn.addEventListener('mousedown', e => {
    e.stopPropagation()
    removeTextBlock(block.id)
  })

  el.appendChild(content)
  el.appendChild(delBtn)

  el.addEventListener('mousedown', e => {
    if (!state.editMode) return
    e.stopPropagation()

    const wasAlreadySelected = state.selectedBlockId === block.id
    selectTextBlock(block.id)

    // Si ya está en modo edición (contentEditable activo), no hacer nada más
    if (content.contentEditable === 'true') return

    const startX = e.clientX
    const startY = e.clientY
    const startLeft = parseFloat(el.style.left) || 0
    const startTop = parseFloat(el.style.top) || 0
    let dragging = false

    const onMove = me => {
      const dx = me.clientX - startX
      const dy = me.clientY - startY
      if (!dragging && Math.abs(dx) + Math.abs(dy) < 4) return
      dragging = true
      el.classList.add('text-block--dragging')
      el.style.left = (startLeft + dx) + 'px'
      el.style.top = (startTop + dy) + 'px'
    }

    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      el.classList.remove('text-block--dragging')

      if (dragging) {
        const { x, y } = overlayCoordsToPdf(parseFloat(el.style.left), parseFloat(el.style.top))
        block.x = x
        block.y = y
        if (state.sessionId && !block.id.startsWith('tmp-')) {
          updateTextBlock(state.sessionId, block.id, { x, y }).catch(() => {
            el.setAttribute('style', blockCssStyle(block))
          })
        }
        return
      }

      // Clic limpio en bloque ya seleccionado → entrar en modo edición
      if (wasAlreadySelected) enterBlockEditMode(block, el, content)
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  })

  textLayer.appendChild(el)
  return el
}

// ── Shape overlay ─────────────────────────────────────────────
function shapeOverlayStyle(shape) {
  const left = shape.x * state.zoom
  const height = shape.height * state.zoom
  const top = (state.pageHeightPt - shape.y - shape.height) * state.zoom
  const width = shape.width * state.zoom
  const bg = shape.fillTransparent ? 'transparent' : shape.fillColor
  const border = `${shape.strokeWidth * state.zoom}px solid ${shape.strokeColor}`
  return `left:${left}px;top:${top}px;width:${width}px;height:${height}px;background:${bg};border:${border};`
}

function createShapeElement(shape) {
  const el = document.createElement('div')
  el.className = `shape-block shape-block--${shape.type}`
  el.dataset.id = shape.id
  el.dataset.kind = 'shape'
  el.setAttribute('style', shapeOverlayStyle(shape))

  const HANDLES = ['tl', 'tc', 'tr', 'ml', 'mr', 'bl', 'bc', 'br']
  for (const h of HANDLES) {
    const handle = document.createElement('div')
    handle.className = 'shape-handle'
    handle.dataset.handle = h
    handle.addEventListener('mousedown', e => {
      e.stopPropagation()
      startShapeResize(e, shape, el, h)
    })
    el.appendChild(handle)
  }

  el.addEventListener('mousedown', e => {
    if (!state.editMode) return
    e.stopPropagation()
    if (e.target.classList.contains('shape-handle')) return

    deselectTextBlock()
    selectShape(shape.id)

    const startX = e.clientX
    const startY = e.clientY
    const startLeft = parseFloat(el.style.left) || 0
    const startTop = parseFloat(el.style.top) || 0
    let dragging = false

    const onMove = me => {
      const dx = me.clientX - startX
      const dy = me.clientY - startY
      if (!dragging && Math.abs(dx) + Math.abs(dy) < 4) return
      dragging = true
      el.classList.add('shape-block--dragging')
      el.style.left = (startLeft + dx) + 'px'
      el.style.top = (startTop + dy) + 'px'
    }

    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      el.classList.remove('shape-block--dragging')
      if (!dragging) return

      const left = parseFloat(el.style.left)
      const top = parseFloat(el.style.top)
      shape.x = left / state.zoom
      shape.y = state.pageHeightPt - top / state.zoom - shape.height
      if (state.sessionId) {
        updateShape(state.sessionId, shape.id, { x: shape.x, y: shape.y }).catch(() => {
          el.setAttribute('style', shapeOverlayStyle(shape))
        })
      }
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  })

  textLayer.appendChild(el)
  return el
}

function startShapeResize(e, shape, el, handle) {
  e.preventDefault()
  const startX = e.clientX
  const startY = e.clientY
  const startLeft = parseFloat(el.style.left) || 0
  const startTop = parseFloat(el.style.top) || 0
  const startWidth = parseFloat(el.style.width) || 0
  const startHeight = parseFloat(el.style.height) || 0
  const MIN = 20

  const onMove = me => {
    const dx = me.clientX - startX
    const dy = me.clientY - startY
    let left = startLeft, top = startTop, width = startWidth, height = startHeight

    if (handle.includes('l')) {
      const nw = startWidth - dx
      if (nw >= MIN) { left = startLeft + dx; width = nw }
    }
    if (handle.includes('r')) { width = Math.max(MIN, startWidth + dx) }
    if (handle.includes('t')) {
      const nh = startHeight - dy
      if (nh >= MIN) { top = startTop + dy; height = nh }
    }
    if (handle.includes('b')) { height = Math.max(MIN, startHeight + dy) }

    el.style.left = left + 'px'
    el.style.top = top + 'px'
    el.style.width = width + 'px'
    el.style.height = height + 'px'
  }

  const onUp = () => {
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)

    const left = parseFloat(el.style.left)
    const top = parseFloat(el.style.top)
    const width = parseFloat(el.style.width)
    const height = parseFloat(el.style.height)

    shape.width = width / state.zoom
    shape.height = height / state.zoom
    shape.x = left / state.zoom
    shape.y = state.pageHeightPt - top / state.zoom - shape.height

    if (state.sessionId) {
      updateShape(state.sessionId, shape.id, {
        x: shape.x, y: shape.y, width: shape.width, height: shape.height,
      }).catch(() => { el.setAttribute('style', shapeOverlayStyle(shape)) })
    }
  }

  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
}

function rerenderShape(shape) {
  const el = textLayer.querySelector(`[data-id="${shape.id}"]`)
  if (!el) return
  const selected = el.classList.contains('shape-block--selected')
  el.setAttribute('style', shapeOverlayStyle(shape))
  if (selected) el.classList.add('shape-block--selected')
}

function selectShape(id) {
  deselectShape()
  deselectTextBlock()
  deselectImage()
  state.selectedShapeId = id
  const el = textLayer.querySelector(`[data-id="${id}"]`)
  if (el) el.classList.add('shape-block--selected')

  const shape = state.shapes.find(s => s.id === id)
  if (shape) {
    state.shapeStyle = {
      fillColor: shape.fillColor ?? '#ffffff',
      fillTransparent: shape.fillTransparent ?? false,
      strokeColor: shape.strokeColor ?? '#000000',
      strokeWidth: shape.strokeWidth ?? 2,
    }
    syncShapeStyleUI()
  }
  showShapeControls(true)
  btnDeleteBlock.style.display = 'flex'
}

function deselectShape() {
  if (state.selectedShapeId) {
    const el = textLayer.querySelector(`[data-id="${state.selectedShapeId}"]`)
    if (el) el.classList.remove('shape-block--selected')
  }
  state.selectedShapeId = null
  if (!state.selectedBlockId && !state.selectedImageId) {
    btnDeleteBlock.style.display = 'none'
    if (!['addRect', 'addCircle'].includes(state.activeTool)) showShapeControls(false)
  }
}

async function removeShape(id) {
  state.shapes = state.shapes.filter(s => s.id !== id)
  if (state.selectedShapeId === id) deselectShape()
  const el = textLayer.querySelector(`[data-id="${id}"]`)
  if (el) el.remove()
  if (state.sessionId) {
    await deleteShape(state.sessionId, id).catch(() => { })
  }
}

// ── Image blocks ──────────────────────────────────────────────

function imageOverlayStyle(img) {
  const left = img.x * state.zoom
  const top = (state.pageHeightPt - img.y - img.height) * state.zoom
  const width = img.width * state.zoom
  const height = img.height * state.zoom
  return `left:${left}px;top:${top}px;width:${width}px;height:${height}px;`
}

function createImageElement(img) {
  const el = document.createElement('div')
  el.className = 'image-block'
  el.dataset.id = img.id
  el.dataset.kind = 'image'
  el.setAttribute('style', imageOverlayStyle(img))

  const imgEl = document.createElement('img')
  imgEl.src = img.imageData
  imgEl.className = 'image-block-img'
  imgEl.draggable = false
  el.appendChild(imgEl)

  const HANDLES = ['tl', 'tc', 'tr', 'ml', 'mr', 'bl', 'bc', 'br']
  for (const h of HANDLES) {
    const handle = document.createElement('div')
    handle.className = 'shape-handle'
    handle.dataset.handle = h
    handle.addEventListener('mousedown', e => {
      e.stopPropagation()
      startImageResize(e, img, el, h)
    })
    el.appendChild(handle)
  }

  el.addEventListener('mousedown', e => {
    if (!state.editMode) return
    e.stopPropagation()
    if (e.target.classList.contains('shape-handle')) return

    selectImage(img.id)

    const startX = e.clientX
    const startY = e.clientY
    const startLeft = parseFloat(el.style.left) || 0
    const startTop = parseFloat(el.style.top) || 0
    let dragging = false

    const onMove = me => {
      const dx = me.clientX - startX
      const dy = me.clientY - startY
      if (!dragging && Math.abs(dx) + Math.abs(dy) < 4) return
      dragging = true
      el.classList.add('image-block--dragging')
      el.style.left = (startLeft + dx) + 'px'
      el.style.top = (startTop + dy) + 'px'
    }

    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      el.classList.remove('image-block--dragging')
      if (!dragging) return

      const left = parseFloat(el.style.left)
      const top = parseFloat(el.style.top)
      img.x = left / state.zoom
      img.y = state.pageHeightPt - top / state.zoom - img.height
      if (state.sessionId) {
        updateImage(state.sessionId, img.id, { x: img.x, y: img.y }).catch(() => {
          el.setAttribute('style', imageOverlayStyle(img))
        })
      }
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  })

  textLayer.appendChild(el)
  return el
}

function startImageResize(e, img, el, handle) {
  e.preventDefault()
  selectImage(img.id)
  const startX = e.clientX
  const startY = e.clientY
  const startLeft = parseFloat(el.style.left) || 0
  const startTop = parseFloat(el.style.top) || 0
  const startWidth = parseFloat(el.style.width) || 0
  const startHeight = parseFloat(el.style.height) || 0
  const MIN = 20

  const onMove = me => {
    const dx = me.clientX - startX
    const dy = me.clientY - startY
    let left = startLeft, top = startTop, width = startWidth, height = startHeight

    if (handle.includes('l')) {
      const nw = startWidth - dx
      if (nw >= MIN) { left = startLeft + dx; width = nw }
    }
    if (handle.includes('r')) { width = Math.max(MIN, startWidth + dx) }
    if (handle.includes('t')) {
      const nh = startHeight - dy
      if (nh >= MIN) { top = startTop + dy; height = nh }
    }
    if (handle.includes('b')) { height = Math.max(MIN, startHeight + dy) }

    el.style.left = left + 'px'
    el.style.top = top + 'px'
    el.style.width = width + 'px'
    el.style.height = height + 'px'
  }

  const onUp = () => {
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)

    const left = parseFloat(el.style.left)
    const top = parseFloat(el.style.top)
    const width = parseFloat(el.style.width)
    const height = parseFloat(el.style.height)

    img.width = width / state.zoom
    img.height = height / state.zoom
    img.x = left / state.zoom
    img.y = state.pageHeightPt - top / state.zoom - img.height

    if (state.sessionId) {
      updateImage(state.sessionId, img.id, {
        x: img.x, y: img.y, width: img.width, height: img.height,
      }).catch(() => { el.setAttribute('style', imageOverlayStyle(img)) })
    }
  }

  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
}

function selectImage(id) {
  deselectTextBlock()
  deselectShape()
  state.selectedImageId = id
  textLayer.querySelectorAll('.image-block').forEach(el => {
    el.classList.toggle('image-block--selected', el.dataset.id === id)
  })
  btnDeleteBlock.style.display = 'flex'
}

function deselectImage() {
  if (state.selectedImageId) {
    const el = textLayer.querySelector(`[data-id="${state.selectedImageId}"]`)
    if (el) el.classList.remove('image-block--selected')
  }
  state.selectedImageId = null
  if (!state.selectedBlockId && !state.selectedShapeId) {
    btnDeleteBlock.style.display = 'none'
  }
}

async function removeImage(id) {
  state.images = state.images.filter(i => i.id !== id)
  if (state.selectedImageId === id) deselectImage()
  const el = textLayer.querySelector(`[data-id="${id}"]`)
  if (el) el.remove()
  if (state.sessionId) {
    await deleteImage(state.sessionId, id).catch(() => { })
  }
}

function rerenderTextBlock(block) {
  const el = textLayer.querySelector(`[data-id="${block.id}"]`)
  if (!el) return
  el.setAttribute('style', blockCssStyle(block))
}

function selectTextBlock(id) {
  deselectTextBlock()
  deselectShape()
  deselectImage()
  state.selectedBlockId = id
  const el = textLayer.querySelector(`[data-id="${id}"]`)
  if (el) el.classList.add('text-block--selected')

  const block = state.textBlocks.find(b => b.id === id)
  if (block) {
    state.typography = {
      fontFamily: block.fontFamily,
      fontSize: block.fontSize,
      bold: block.bold,
      italic: block.italic,
      color: block.color ?? '#000000',
    }
    syncTypographyUI()
  }
  showShapeControls(false)
  btnDeleteBlock.style.display = 'flex'
}

function deselectTextBlock() {
  if (state.selectedBlockId) {
    const el = textLayer.querySelector(`[data-id="${state.selectedBlockId}"]`)
    if (el) el.classList.remove('text-block--selected')
  }
  state.selectedBlockId = null
  if (!state.selectedShapeId && !state.selectedImageId) {
    btnDeleteBlock.style.display = 'none'
  }
}

async function removeTextBlock(id) {
  state.textBlocks = state.textBlocks.filter(b => b.id !== id)
  if (state.selectedBlockId === id) deselectTextBlock()
  renderEditOverlay()
  if (state.sessionId) {
    await deleteTextBlock(state.sessionId, id).catch(() => { })
  }
}

btnDeleteBlock.addEventListener('click', () => {
  if (state.selectedBlockId) removeTextBlock(state.selectedBlockId)
  else if (state.selectedShapeId) removeShape(state.selectedShapeId)
  else if (state.selectedImageId) removeImage(state.selectedImageId)
})

// ── Text layer mousedown — deselect al pulsar fondo vacío ─────
textLayer.addEventListener('mousedown', e => {
  if (!state.editMode) return
  if (e.target === textLayer) {
    deselectTextBlock()
    deselectShape()
    deselectImage()
  }
})

// ── Text layer click — crear bloque de texto o forma ─────────
textLayer.addEventListener('click', async e => {
  if (!state.editMode) return
  if (e.target !== textLayer) return

  if (state.activeTool === 'addRect' || state.activeTool === 'addCircle') {
    const rect = textLayer.getBoundingClientRect()
    const overlayX = e.clientX - rect.left
    const overlayY = e.clientY - rect.top

    const defaultW = 150 / state.zoom
    const defaultH = 100 / state.zoom
    const x = overlayX / state.zoom
    const y = state.pageHeightPt - overlayY / state.zoom - defaultH

    const tempId = `tmp-shape-${Date.now()}`
    const shape = {
      id: tempId,
      type: state.activeTool === 'addRect' ? 'rect' : 'circle',
      pageIndex: state.currentPage - 1,
      x, y,
      width: defaultW,
      height: defaultH,
      ...state.shapeStyle,
    }
    state.shapes.push(shape)
    createShapeElement(shape)
    selectShape(tempId)

    if (state.sessionId) {
      try {
        const { shape: saved } = await addShape(state.sessionId, shape)
        const el = textLayer.querySelector(`[data-id="${tempId}"]`)
        Object.assign(shape, saved)
        if (el) el.dataset.id = shape.id
        if (state.selectedShapeId === tempId) state.selectedShapeId = shape.id
      } catch {
        state.shapes = state.shapes.filter(s => s.id !== tempId)
        const el = textLayer.querySelector(`[data-id="${tempId}"]`)
        if (el) el.remove()
      }
    }
    return
  }

  if (state.activeTool !== 'addText') return

  const rect = textLayer.getBoundingClientRect()
  const overlayX = e.clientX - rect.left
  const overlayY = e.clientY - rect.top
  const { x, y } = overlayCoordsToPdf(overlayX, overlayY)

  const tempId = `tmp-${Date.now()}`
  const block = {
    id: tempId,
    pageIndex: state.currentPage - 1,
    x, y,
    text: '',
    ...state.typography,
  }
  state.textBlocks.push(block)
  const el = createBlockElement(block)
  selectTextBlock(tempId)

  const content = el.querySelector('.text-block-content')
  content.contentEditable = 'true'

  const commit = async () => {
    content.contentEditable = 'false'
    const text = content.textContent.trim()

    if (!text) {
      state.textBlocks = state.textBlocks.filter(b => b.id !== tempId)
      el.remove()
      deselectTextBlock()
      return
    }

    block.text = text
    if (state.sessionId) {
      try {
        const { block: saved } = await addTextBlock(state.sessionId, {
          pageIndex: block.pageIndex,
          x: block.x,
          y: block.y,
          text: block.text,
          fontSize: block.fontSize,
          fontFamily: block.fontFamily,
          bold: block.bold,
          italic: block.italic,
          color: block.color,
        })
        Object.assign(block, saved)
        el.dataset.id = block.id
        if (state.selectedBlockId === tempId) state.selectedBlockId = block.id
      } catch {
        state.textBlocks = state.textBlocks.filter(b => b.id !== tempId)
        el.remove()
      }
    }
  }

  content.addEventListener('blur', commit, { once: true })
  content.addEventListener('keydown', ke => {
    if (ke.key === 'Escape') {
      content.textContent = ''
      content.blur()
    }
  })

  content.focus()
})

// ── Editar contenido de un bloque existente ───────────────────
function enterBlockEditMode(block, blockEl, content) {
  if (content.contentEditable === 'true') return
  content.contentEditable = 'true'
  content.focus()

  // Mover cursor al final del texto
  const range = document.createRange()
  range.selectNodeContents(content)
  range.collapse(false)
  const sel = window.getSelection()
  sel.removeAllRanges()
  sel.addRange(range)

  const commit = async () => {
    content.contentEditable = 'false'
    const text = content.textContent
    if (text === block.text) return
    block.text = text
    if (state.sessionId) {
      await updateTextBlock(state.sessionId, block.id, { text }).catch(() => { })
    }
  }
  content.addEventListener('blur', commit, { once: true })
}

// Mantener dblclick como atajo alternativo
textLayer.addEventListener('dblclick', e => {
  if (!state.editMode) return
  const blockEl = e.target.closest('.text-block')
  if (!blockEl) return
  const id = blockEl.dataset.id
  const block = state.textBlocks.find(b => b.id === id)
  if (!block) return
  enterBlockEditMode(block, blockEl, blockEl.querySelector('.text-block-content'))
})
