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
    await expect(canvas).toHaveJSProperty('width', expect.any(Number))
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
})
