import { test, expect } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const MULTIPAGE_PDF = path.join(__dirname, 'fixtures/multipage.pdf')

async function loadPdf(page) {
  await page.goto('/')
  await page.locator('#file-input').setInputFiles(MULTIPAGE_PDF)
  await expect(page.locator('#pdf-canvas-wrapper')).toBeVisible({ timeout: 15000 })
  await expect(page.locator('#page-list .page-thumb')).toHaveCount(3, { timeout: 10000 })
}

test.describe('Gestión de páginas', () => {
  test('la barra de selección está oculta al cargar', async ({ page }) => {
    await loadPdf(page)
    await expect(page.locator('#selection-bar')).not.toBeVisible()
  })

  test('marcar un checkbox muestra la barra de selección', async ({ page }) => {
    await loadPdf(page)
    const firstCheckbox = page.locator('.page-thumb-checkbox').first()
    await page.locator('.page-thumb').first().hover()
    await firstCheckbox.check()
    await expect(page.locator('#selection-bar')).toBeVisible()
    await expect(page.locator('#selection-count')).toContainText('1')
  })

  test('seleccionar todo marca todas las miniaturas', async ({ page }) => {
    await loadPdf(page)
    const firstCheckbox = page.locator('.page-thumb-checkbox').first()
    await page.locator('.page-thumb').first().hover()
    await firstCheckbox.check()
    await expect(page.locator('#selection-bar')).toBeVisible()

    await page.locator('#btn-select-all').click()
    await expect(page.locator('#selection-count')).toContainText('3')
  })

  test('deseleccionar oculta la barra de selección', async ({ page }) => {
    await loadPdf(page)
    const firstCheckbox = page.locator('.page-thumb-checkbox').first()
    await page.locator('.page-thumb').first().hover()
    await firstCheckbox.check()
    await expect(page.locator('#selection-bar')).toBeVisible()

    await page.locator('#btn-deselect').click()
    await expect(page.locator('#selection-bar')).not.toBeVisible()
  })

  test('eliminar una página reduce el total de páginas', async ({ page }) => {
    await loadPdf(page)

    // Seleccionar primera página
    await page.locator('.page-thumb').first().hover()
    await page.locator('.page-thumb-checkbox').first().check()
    await expect(page.locator('#selection-bar')).toBeVisible()

    // Confirmar diálogo de eliminación y ejecutar
    page.on('dialog', dialog => dialog.accept())
    await page.locator('#btn-delete-selection').click()

    // Ahora debe haber 2 páginas
    await expect(page.locator('#total-pages')).toHaveText('2', { timeout: 10000 })
    await expect(page.locator('#page-list .page-thumb')).toHaveCount(2, { timeout: 10000 })
    await expect(page.locator('#selection-bar')).not.toBeVisible()
  })

  test('la barra de selección muestra el conteo correcto con múltiples páginas', async ({ page }) => {
    await loadPdf(page)

    // Seleccionar una para mostrar la barra, luego "Todo"
    await page.locator('.page-thumb').first().hover()
    await page.locator('.page-thumb-checkbox').first().check()
    await expect(page.locator('#selection-bar')).toBeVisible()

    await page.locator('#btn-select-all').click()
    await expect(page.locator('#selection-count')).toContainText('3 páginas seleccionadas')
  })
})
