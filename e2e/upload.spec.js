import { test, expect } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SIMPLE_PDF = path.join(__dirname, 'fixtures/simple.pdf')
const MULTIPAGE_PDF = path.join(__dirname, 'fixtures/multipage.pdf')

test.describe('Carga de PDF', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('muestra la drop zone antes de cargar un PDF', async ({ page }) => {
    await expect(page.locator('#drop-zone')).toBeVisible()
    await expect(page.locator('#pdf-canvas-wrapper')).not.toBeVisible()
  })

  test('carga un PDF simple mediante el input de archivo', async ({ page }) => {
    const fileInput = page.locator('#file-input')
    await fileInput.setInputFiles(SIMPLE_PDF)

    // El visor aparece después de la carga
    await expect(page.locator('#pdf-canvas-wrapper')).toBeVisible({ timeout: 15000 })
    await expect(page.locator('#drop-zone')).not.toBeVisible()

    // Se renderiza el canvas del PDF
    const canvas = page.locator('#pdf-canvas')
    await expect(canvas).toBeVisible()
    expect(await canvas.evaluate(element => element.width)).toBeGreaterThan(0)
  })

  test('loads all local Noto Sans styles for text preview without an external fallback', async ({ page }) => {
    const fonts = await page.evaluate(async () => {
      const requestedFonts = [
        ['400', 'normal'],
        ['700', 'normal'],
        ['400', 'italic'],
        ['700', 'italic'],
      ]
      await Promise.all(requestedFonts.map(([weight, style]) =>
        document.fonts.load(`${style} ${weight} 14px "PDFPro Noto Sans"`),
      ))
      return requestedFonts.map(([weight, style]) => ({
        weight,
        style,
        loaded: document.fonts.check(`${style} ${weight} 14px "PDFPro Noto Sans"`),
      }))
    })

    expect(fonts).toEqual([
      { weight: '400', style: 'normal', loaded: true },
      { weight: '700', style: 'normal', loaded: true },
      { weight: '400', style: 'italic', loaded: true },
      { weight: '700', style: 'italic', loaded: true },
    ])
  })

  test('muestra el total de páginas correcto al cargar PDF simple', async ({ page }) => {
    await page.locator('#file-input').setInputFiles(SIMPLE_PDF)
    await expect(page.locator('#pdf-canvas-wrapper')).toBeVisible({ timeout: 15000 })

    const totalPages = page.locator('#total-pages')
    await expect(totalPages).toHaveText('1')
  })

  test('muestra 3 páginas al cargar PDF multipágina', async ({ page }) => {
    await page.locator('#file-input').setInputFiles(MULTIPAGE_PDF)
    await expect(page.locator('#pdf-canvas-wrapper')).toBeVisible({ timeout: 15000 })

    const totalPages = page.locator('#total-pages')
    await expect(totalPages).toHaveText('3')
  })

  test('genera miniaturas para cada página', async ({ page }) => {
    await page.locator('#file-input').setInputFiles(MULTIPAGE_PDF)
    await expect(page.locator('#pdf-canvas-wrapper')).toBeVisible({ timeout: 15000 })

    // Espera a que las miniaturas estén en el DOM
    const thumbs = page.locator('#page-list .page-thumb')
    await expect(thumbs).toHaveCount(3, { timeout: 10000 })
  })

  test('no muestra alerta de error al cargar un PDF válido', async ({ page }) => {
    const dialogs = []
    page.on('dialog', dialog => {
      dialogs.push(dialog.message())
      dialog.dismiss()
    })

    await page.locator('#file-input').setInputFiles(SIMPLE_PDF)
    await expect(page.locator('#pdf-canvas-wrapper')).toBeVisible({ timeout: 15000 })

    expect(dialogs.filter(m => m.startsWith('Error'))).toHaveLength(0)
  })

  test('el worker de PDF.js no falla al cargar la librería', async ({ page }) => {
    const errors = []
    page.on('pageerror', err => errors.push(err.message))

    await page.locator('#file-input').setInputFiles(SIMPLE_PDF)
    await expect(page.locator('#pdf-canvas-wrapper')).toBeVisible({ timeout: 15000 })

    const workerErrors = errors.filter(e =>
      e.includes('fake worker') || e.includes('pdf.worker') || e.includes('Failed to fetch')
    )
    expect(workerErrors).toHaveLength(0)
  })

  test('persists baseline PDF coordinates for equivalent text placement at 100% and 200%', async ({ page }) => {
    const baselinePoint = {
      x: 240,
      y: 300.5,
      fontSize: 14,
      notoSansAscentRatio: 1.069,
    }
    const capturedPayloads = []
    const geometries = []

    page.on('request', request => {
      if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/pdf/text/add') {
        capturedPayloads.push(request.postDataJSON())
      }
    })

    const createTextAtLogicalPoint = async (zoom, text) => {
      await page.goto('/')
      await page.locator('#file-input').setInputFiles(SIMPLE_PDF)
      await expect(page.locator('#pdf-canvas-wrapper')).toBeVisible({ timeout: 15000 })
      await page.locator('#btn-view-page').click()
      await expect(page.locator('#canvas-container')).toBeVisible()
      const canvas = page.locator('#pdf-canvas')
      const textLayer = page.locator('#text-layer')
      await expect.poll(() => canvas.evaluate(element => element.height)).toBeGreaterThan(300)
      await page.locator('#btn-edit').click()
      await expect(page.locator('#btn-edit')).toHaveClass(/toolbar-btn--active/)
      await expect(textLayer).toHaveClass(/edit-active/)
      await page.locator('#tool-add-text').click()
      await expect(page.locator('#tool-add-text')).toHaveClass(/tool-btn--active/)

      while (await page.locator('#zoom-level').textContent() !== `${zoom}%`) {
        await page.locator('#btn-zoom-in').click()
      }

      await expect.poll(async () => {
        const [canvasBox, layerBox] = await Promise.all([
          canvas.boundingBox(),
          textLayer.boundingBox(),
        ])
        return canvasBox && layerBox &&
          canvasBox.width > 0 && canvasBox.height > 0 &&
          layerBox.width === canvasBox.width && layerBox.height === canvasBox.height
      }).toBe(true)

      const target = await textLayer.evaluate((layer, point) => {
        const wrapper = document.querySelector('#pdf-canvas-wrapper')
        const pageHeight = layer.getBoundingClientRect().height
        const zoom = pageHeight / 842
        const x = point.x * zoom
        const y = pageHeight - (
          point.y + point.fontSize * point.notoSansAscentRatio
        ) * zoom

        wrapper.scrollTo({
          left: Math.max(0, x - wrapper.clientWidth / 2),
          top: Math.max(0, y - wrapper.clientHeight / 2),
        })

        return new Promise(resolve => requestAnimationFrame(() => {
          const rect = layer.getBoundingClientRect()
          resolve({ x: rect.left + x, y: rect.top + y })
        }))
      }, baselinePoint)

      await expect.poll(() => page.evaluate(({ x, y }) =>
        document.elementFromPoint(x, y) === document.querySelector('#text-layer'),
      target)).toBe(true)
      await page.mouse.click(target.x, target.y)

      const textBlock = page.locator('.text-block').last()
      await expect(textBlock).toBeVisible()
      const content = textBlock.locator('.text-block-content')
      await expect(content).toBeVisible()
      await content.fill(text)
      const request = page.waitForRequest(candidate =>
        candidate.method() === 'POST' && new URL(candidate.url()).pathname === '/api/pdf/text/add'
      )
      await content.press('Tab')
      await request

      geometries.push(await page.locator('#text-layer').evaluate(layer => {
        const wrapper = document.querySelector('#pdf-canvas-wrapper')
        const rect = layer.getBoundingClientRect()
        return {
          layerClientWidth: rect.width,
          layerClientHeight: rect.height,
          layerViewportLeft: rect.left,
          layerViewportTop: rect.top,
          scrollLeft: wrapper.scrollLeft,
          scrollTop: wrapper.scrollTop,
        }
      }))
    }

    await createTextAtLogicalPoint(100, 'Zoom 100')
    await createTextAtLogicalPoint(200, 'Zoom 200')

    const coordinates = capturedPayloads.map(({ x, y }) => ({ x, y }))
    console.log('zoom coordinate reproducer', JSON.stringify({ capturedPayloads, geometries }))

    expect(coordinates).toHaveLength(2)
    for (const coordinate of coordinates) {
      expect(Math.abs(coordinate.x - baselinePoint.x)).toBeLessThanOrEqual(0.5)
      expect(Math.abs(coordinate.y - baselinePoint.y)).toBeLessThanOrEqual(1)
    }
    // Browser mouse events are quantized to CSS pixels; the PDF-point values
    // must still agree within one half point across the two zoom levels.
    expect(Math.abs(coordinates[0].y - coordinates[1].y)).toBeLessThanOrEqual(
      0.51,
    )
    for (const coordinate of coordinates) {
      expect(coordinate.y).not.toBeCloseTo(
        baselinePoint.y +
          baselinePoint.fontSize * baselinePoint.notoSansAscentRatio,
        0,
      )
    }
  })

  test('anchors created text glyphs at the persisted block coordinate without layout selection inset', async ({ page }) => {
    await page.locator('#file-input').setInputFiles(SIMPLE_PDF)
    await expect(page.locator('#pdf-canvas-wrapper')).toBeVisible({ timeout: 15000 })

    await page.locator('#btn-view-page').click()
    await expect(page.locator('#canvas-container')).toBeVisible()
    const canvas = page.locator('#pdf-canvas')
    const textLayer = page.locator('#text-layer')
    await expect.poll(() => canvas.evaluate(element => element.height)).toBeGreaterThan(300)
    await page.locator('#btn-edit').click()
    await expect(page.locator('#btn-edit')).toHaveClass(/toolbar-btn--active/)
    await expect(textLayer).toHaveClass(/edit-active/)
    await page.locator('#tool-add-text').click()
    await expect(page.locator('#tool-add-text')).toHaveClass(/tool-btn--active/)

    await expect.poll(async () => {
      const [canvasBox, layerBox] = await Promise.all([
        canvas.boundingBox(),
        textLayer.boundingBox(),
      ])
      return canvasBox && layerBox &&
        canvasBox.width > 0 && canvasBox.height > 0 &&
        layerBox.width === canvasBox.width && layerBox.height === canvasBox.height
    }).toBe(true)

    const layerBox = await textLayer.boundingBox()
    const target = { x: layerBox.x + 240, y: layerBox.y + 360 }
    await expect.poll(() => page.evaluate(({ x, y }) =>
      document.elementFromPoint(x, y) === document.querySelector('#text-layer'),
    target)).toBe(true)
    await page.mouse.click(target.x, target.y)

    const textBlock = page.locator('.text-block').last()
    await expect(textBlock).toBeVisible()
    const content = textBlock.locator('.text-block-content')
    await expect(content).toBeVisible()
    await content.fill('Anchor invariant')
    await content.press('Tab')

    const geometry = await page.locator('.text-block').evaluate(block => {
      const content = block.querySelector('.text-block-content')
      const blockRect = block.getBoundingClientRect()
      const contentRect = content.getBoundingClientRect()
      const style = getComputedStyle(block)

      return {
        contentInsetX: contentRect.left - blockRect.left,
        contentInsetY: contentRect.top - blockRect.top,
        paddingLeft: style.paddingLeft,
        paddingTop: style.paddingTop,
        borderLeftWidth: style.borderLeftWidth,
        borderTopWidth: style.borderTopWidth,
        outlineWidth: style.outlineWidth,
      }
    })

    expect(geometry.contentInsetX).toBe(0)
    expect(geometry.contentInsetY).toBe(0)
    expect(geometry.paddingLeft).toBe('0px')
    expect(geometry.paddingTop).toBe('0px')
    expect(geometry.borderLeftWidth).toBe('0px')
    expect(geometry.borderTopWidth).toBe('0px')
    expect(geometry.outlineWidth).toBe('2px')
  })

  test('mantiene el canvas y texto alineados al ampliar la vista de página', async ({ page }) => {
    await page.locator('#file-input').setInputFiles(SIMPLE_PDF)
    await expect(page.locator('#pdf-canvas-wrapper')).toBeVisible({ timeout: 15000 })

    await page.locator('#btn-view-page').click()
    await expect(page.locator('#canvas-container')).toBeVisible()
    await page.locator('#btn-edit').click()
    await page.locator('#tool-add-text').click()

    await page.locator('#text-layer').click({ position: { x: 240, y: 360 } })
    const textContent = page.locator('.text-block-content')
    await textContent.fill('Zoom invariant')
    await textContent.press('Tab')
    await expect(page.locator('.text-block')).toHaveCount(1)

    for (let i = 0; i < 4; i += 1) {
      await page.locator('#btn-zoom-in').click()
    }
    await expect(page.locator('#zoom-level')).toHaveText('300%')

    const geometry = await page.locator('#canvas-container').evaluate(container => {
      const canvas = container.querySelector('#pdf-canvas')
      const textLayer = container.querySelector('#text-layer')
      const textBlock = container.querySelector('.text-block')
      const canvasRect = canvas.getBoundingClientRect()
      const textLayerRect = textLayer.getBoundingClientRect()
      const textBlockStyle = getComputedStyle(textBlock)

      return {
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
        canvasRectWidth: canvasRect.width,
        canvasRectHeight: canvasRect.height,
        textLayerWidth: textLayerRect.width,
        textLayerHeight: textLayerRect.height,
        textBlockLeft: textBlockStyle.left,
        textBlockTop: textBlockStyle.top,
      }
    })

    expect(geometry.canvasRectWidth).toBe(geometry.canvasWidth)
    expect(geometry.canvasRectHeight).toBe(geometry.canvasHeight)
    expect(geometry.textLayerWidth).toBe(geometry.canvasWidth)
    expect(geometry.textLayerHeight).toBe(geometry.canvasHeight)
    expect(Number.parseFloat(geometry.textBlockLeft)).toBeGreaterThan(718)
    expect(Number.parseFloat(geometry.textBlockLeft)).toBeLessThan(722)
    expect(Number.parseFloat(geometry.textBlockTop)).toBeGreaterThan(1082)
    expect(Number.parseFloat(geometry.textBlockTop)).toBeLessThan(1086)
  })
})
