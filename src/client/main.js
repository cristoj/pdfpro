import Sortable from 'sortablejs'
import { uploadPdf, addPdf, reorderPages, deletePagesByIndex, exportPdf, compressPdf, getTextBlocks, addTextBlock, updateTextBlock, deleteTextBlock } from './services/apiClient.js'
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
  // Edit mode
  editMode: false,
  activeTool: 'select',       // 'select' | 'addText'
  textBlocks: [],              // { id, pageIndex, x, y, text, fontSize, fontFamily, bold, italic, color }
  selectedBlockId: null,
  pageWidthPt: 0,
  pageHeightPt: 0,
  typography: { fontFamily: 'Helvetica', fontSize: 14, bold: false, italic: false, color: '#000000' },
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
const fontFamilySelect = $('font-family-select')
const fontSizeInput = $('font-size-input')
const btnBold = $('btn-bold')
const btnItalic = $('btn-italic')
const fontColorInput = $('font-color-input')
const btnDeleteBlock = $('btn-delete-block')
const btnEdit = $('btn-edit')

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
    let data
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
  renderTextOverlay()
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
  const colW = { sm: 80, md: 110, lg: 200 }[state.thumbnailSize]
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
  if (document.activeElement?.contentEditable === 'true') return

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
}

// ── Edit mode ─────────────────────────────────────────────────
function setEditMode(on) {
  state.editMode = on
  editToolbar.style.display = on ? 'flex' : 'none'
  btnEdit.classList.toggle('toolbar-btn--active', on)
  textLayer.classList.toggle('edit-active', on)
  if (!on) {
    deselectTextBlock()
    setActiveTool('select')
  }
}

function setActiveTool(tool) {
  state.activeTool = tool
  toolSelectBtn.classList.toggle('tool-btn--active', tool === 'select')
  toolAddTextBtn.classList.toggle('tool-btn--active', tool === 'addText')
  textLayer.classList.toggle('add-text-cursor', tool === 'addText')
}

btnEdit.addEventListener('click', () => setEditMode(!state.editMode))
toolSelectBtn.addEventListener('click', () => setActiveTool('select'))
toolAddTextBtn.addEventListener('click', () => setActiveTool('addText'))

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
    }).catch(() => {})
  }
}

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

function renderTextOverlay() {
  textLayer.innerHTML = ''
  const pageIdx = state.currentPage - 1
  state.textBlocks.filter(b => b.pageIndex === pageIdx).forEach(block => {
    createBlockElement(block)
  })
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
    selectTextBlock(block.id)

    // No drag si el bloque está en modo edición de texto (contentEditable)
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
      el.style.top  = (startTop  + dy) + 'px'
    }

    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      el.classList.remove('text-block--dragging')
      if (!dragging) return

      const { x, y } = overlayCoordsToPdf(parseFloat(el.style.left), parseFloat(el.style.top))
      block.x = x
      block.y = y

      if (state.sessionId && !block.id.startsWith('tmp-')) {
        updateTextBlock(state.sessionId, block.id, { x, y }).catch(() => {
          // Revertir visualmente si falla el guardado
          el.setAttribute('style', blockCssStyle(block))
        })
      }
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  })

  textLayer.appendChild(el)
  return el
}

function rerenderTextBlock(block) {
  const el = textLayer.querySelector(`[data-id="${block.id}"]`)
  if (!el) return
  el.setAttribute('style', blockCssStyle(block))
}

function selectTextBlock(id) {
  deselectTextBlock()
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
  btnDeleteBlock.style.display = 'flex'
}

function deselectTextBlock() {
  if (state.selectedBlockId) {
    const el = textLayer.querySelector(`[data-id="${state.selectedBlockId}"]`)
    if (el) el.classList.remove('text-block--selected')
  }
  state.selectedBlockId = null
  btnDeleteBlock.style.display = 'none'
}

async function removeTextBlock(id) {
  state.textBlocks = state.textBlocks.filter(b => b.id !== id)
  if (state.selectedBlockId === id) deselectTextBlock()
  renderTextOverlay()
  if (state.sessionId) {
    await deleteTextBlock(state.sessionId, id).catch(() => {})
  }
}

btnDeleteBlock.addEventListener('click', () => {
  if (state.selectedBlockId) removeTextBlock(state.selectedBlockId)
})

// ── Text layer mousedown — deselect al pulsar fondo vacío ─────
textLayer.addEventListener('mousedown', e => {
  if (!state.editMode) return
  if (e.target === textLayer) deselectTextBlock()
})

// ── Text layer click — crear bloque de texto ──────────────────
// 'click' dispara tras mouseup → focus() funciona sin conflictos
// cross-browser (no necesita preventDefault ni setTimeout).
textLayer.addEventListener('click', async e => {
  if (!state.editMode || state.activeTool !== 'addText') return
  if (e.target !== textLayer) return

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
        const idx = state.textBlocks.findIndex(b => b.id === tempId)
        if (idx !== -1) {
          state.textBlocks[idx] = saved
          el.dataset.id = saved.id
          if (state.selectedBlockId === tempId) state.selectedBlockId = saved.id
        }
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

// ── Existing block edit on dblclick ──────────────────────────
textLayer.addEventListener('dblclick', e => {
  if (!state.editMode) return
  const blockEl = e.target.closest('.text-block')
  if (!blockEl) return
  const id = blockEl.dataset.id
  const block = state.textBlocks.find(b => b.id === id)
  if (!block) return

  const content = blockEl.querySelector('.text-block-content')
  content.contentEditable = 'true'
  content.focus()

  const commit = async () => {
    content.contentEditable = 'false'
    const text = content.textContent
    if (text === block.text) return
    block.text = text
    if (state.sessionId) {
      await updateTextBlock(state.sessionId, id, { text }).catch(() => {})
    }
  }
  content.addEventListener('blur', commit, { once: true })
})
