# PDFPro — Plan de Implementación

> Aplicación web de edición PDF estilo Adobe Acrobat · Node.js 22

---

## 1. Visión General

Aplicación SPA sin login, con backend Node.js que procesa PDFs en sesiones efímeras (en memoria / disco temporal). El frontend consume la API REST y renderiza los PDFs en el navegador con PDF.js.

Los diseños de Stitch definen dos vistas principales, el nombre del proyecto es "Advanced PDF Editor" y su id 217974861917299723, intenta seguir el diseño del mockup:
- **Workspace** — gestión de páginas, miniaturas, reordenar, exportar
- **Editor** — edición de texto y formularios dentro de una página concreta

---

## 2. Stack Técnico

| Capa | Tecnología | Motivo |
|---|---|---|
| Runtime | Node.js 22 | Requisito del proyecto |
| Backend | Express 5 | Minimalista, amplio ecosistema |
| Upload | Multer | Manejo de multipart/form-data |
| PDF (servidor) | pdf-lib | Merge, reorder, delete, compress, text, forms |
| PDF (cliente) | pdfjs-dist | Render canvas, text layer, búsqueda |
| Drag & drop | SortableJS | Reordenación de páginas con touch support |
| Build | Vite 6 | Dev server rápido + bundling |
| Estilos | Tailwind CSS v4 | Design tokens, dark mode nativo |
| Iconos | Lucide Icons | Cohesión visual, tree-shakeable |
| Font | Geist Sans + JetBrains Mono | Especificadas en el diseño |

---

## 3. Arquitectura

### 3.1 Estructura de Ficheros

```
pdf-editor/
├── src/
│   ├── server/
│   │   ├── index.js                    # Entry point Express
│   │   ├── routes/
│   │   │   ├── pdf.js                  # upload, merge, export
│   │   │   ├── pages.js                # reorder, delete, preview
│   │   │   └── tools.js                # text, forms, search, compress
│   │   ├── services/
│   │   │   ├── pdfService.js           # pdf-lib core operations
│   │   │   ├── sessionService.js       # estado en memoria por sessionId
│   │   │   └── compressService.js      # compresión de imágenes + pdf
│   │   └── middleware/
│   │       ├── upload.js               # Multer config (temp dir)
│   │       └── errorHandler.js
│   └── client/
│       ├── index.html
│       ├── main.js                     # Arranque + router SPA
│       ├── components/
│       │   ├── Toolbar.js              # Barra top (logo, acciones, CMD+K)
│       │   ├── PageList.js             # Panel lateral — miniaturas + drag
│       │   ├── PDFViewer.js            # Visor principal PDF.js canvas
│       │   ├── EditToolbar.js          # Panel izq. editor (texto/formulario)
│       │   ├── ExportPanel.js          # Panel exportación (rango, formato)
│       │   ├── SearchPanel.js          # Overlay búsqueda de texto
│       │   └── ContextMenu.js          # Menú clic derecho sobre página
│       ├── services/
│       │   ├── pdfRenderer.js          # Wrapper PDF.js
│       │   ├── apiClient.js            # Fetch wrapper para la API
│       │   └── dragDrop.js             # Setup SortableJS
│       ├── styles/
│       │   ├── tokens.css              # Variables CSS (colores, espaciado)
│       │   └── global.css
│       └── utils/
│           ├── pageRange.js            # Parser "1,3,5-8" → [1,3,5,6,7,8]
│           └── thumbnailScale.js       # Lógica slider de tamaño miniaturas
├── public/
│   └── pdf.worker.min.js               # Worker de PDF.js
├── uploads/                            # Directorio temporal (gitignored)
├── package.json
├── vite.config.js
└── .env.example
```

### 3.2 API REST

```
POST   /api/pdf/upload              # Sube PDF(s) → { sessionId, pages[] }
POST   /api/pdf/add                 # Añade más PDFs a sesión existente
GET    /api/pdf/pages/:sid          # Lista páginas con metadatos
GET    /api/pdf/preview/:sid/:page  # Imagen PNG de página (para miniaturas)
POST   /api/pdf/reorder             # { sessionId, order: [2,1,3,...] }
DELETE /api/pdf/pages               # { sessionId, pages: [2,4] }
POST   /api/pdf/compress            # { sessionId } → comprime in-place
POST   /api/pdf/search              # { sessionId, query } → [{ page, matches }]
POST   /api/pdf/text/add            # Añade texto anotación
PUT    /api/pdf/text/:id            # Edita bloque de texto
DELETE /api/pdf/text/:id            # Elimina bloque de texto
POST   /api/pdf/form/fill           # Rellena campos de formulario
POST   /api/pdf/export              # { sessionId, range?: "1,3-5" } → PDF
```

### 3.3 Gestión de Estado (cliente)

Estado global mínimo en un objeto `AppState` (no se necesita librería):
```js
{
  sessionId: string,
  pages: Page[],           // { id, index, title, interactive }
  currentPage: number,
  viewMode: 'page' | 'continuous' | 'fitWidth',
  zoom: number,
  activeTool: 'select' | 'text' | 'form' | 'hand',
  thumbnailSize: 'sm' | 'md' | 'lg',
  darkMode: boolean,
  selection: number[],     // páginas seleccionadas
}
```

---

## 4. Diseño UI (basado en mockups Stitch)

### 4.1 Layout Principal (3 zonas)

```
┌─────────────────────────────────────────────────────────────┐
│  TOOLBAR  Logo | Nombre archivo | Compress Edit Forms | ⚙ ↑ │
├─────────────┬───────────────────────────────────────────────┤
│             │                                               │
│  PANEL IZQ  │              VISOR PDF                        │
│  Miniaturas │         (PDF.js canvas)                       │
│  + arrastre │                                               │
│             │                                               │
│  [+ Añadir] │                                               │
│  [━━━━━●──] │  ◄ ► | Pág 1 de 12 | 100% | □ ≡ ↔           │
└─────────────┴───────────────────────────────────────────────┘
```

### 4.2 Paleta de Colores (Tailwind tokens)

```css
/* Light */
--color-bg:        #FFFFFF
--color-surface:   #F8F9FA
--color-border:    #E5E7EB
--color-text:      #111827
--color-muted:     #6B7280
--color-accent:    #2563EB   /* azul acción primaria */
--color-success:   #16A34A   /* indicador válido (verde del mockup) */

/* Dark (class="dark") */
--color-bg:        #0F172A
--color-surface:   #1E293B
--color-border:    #334155
--color-text:      #F1F5F9
--color-muted:     #94A3B8
```

### 4.3 Componentes Clave del Diseño

**Toolbar top:**
- Logo "PDFPro" + nombre de archivo editable inline
- Acciones rápidas: `[Compress]` `[Edit]` `[Fill Forms]` con iconos
- Botón toggle dark mode
- CMD+K abre SearchPanel overlay
- Botón importar PDF

**Panel lateral — Miniaturas:**
- Scroll vertical, thumbnails con índice de página
- Badge "Interactive Page" en páginas con formularios
- Handle de arrastre (⠿) visible en hover
- Checkbox multi-selección en hover
- Slider de tamaño (3 niveles: sm/md/lg)
- Botón "Añadir más PDFs" al final

**Panel lateral — Herramientas (modo editor):**
- Sección Tools: Añadir Texto, Editar Texto, Eliminar Bloque, Rellenar Formulario
- Controles: Undo/Redo, Zoom %, Hand/Select/Shape tool
- Selector fuente: Geist Sans / JetBrains Mono
- Tamaño, bold, italic

**Visor principal:**
- Canvas PDF.js con overlay para edición de texto
- Barra inferior: ◄◄ ◄ | pág actual / total | ► ►► | zoom | vista

**Panel exportación (overlay deslizante):**
- Nombre de archivo (editable)
- Campo rango de páginas: `1,3,5-8` o "todas"
- Formato PDF
- Total páginas, botón "Exportar Ahora"

---

## 5. Fases de Implementación

### Fase 1 — Infraestructura (Sprint 1)
- [x] Inicializar proyecto Node.js 22 + package.json
- [x] Configurar Express 5 con rutas base
- [x] Configurar Vite 6 + Tailwind v4
- [x] Layout shell HTML/CSS (Toolbar + sidebar + main)
- [x] Tokens CSS + dark mode toggle funcional
- [x] Variables de entorno (.env)

### Fase 2 — Upload & Visor (Sprint 2)
- [x] Endpoint POST /api/pdf/upload con Multer
- [x] Integración PDF.js en cliente (render página a canvas)
- [x] Generación de miniaturas por página en sidebar
- [x] Navegación básica (prev/next, número de página)
- [x] Controles de zoom (25%–400%) + fit-width

### Fase 3 — Gestión de Páginas (Sprint 3)
- [x] Drag & drop de miniaturas con SortableJS → POST /api/pdf/reorder
- [x] Input numérico para mover página a destino concreto
- [x] Multi-selección de páginas (checkbox + shift+click)
- [x] Eliminar página(s) seleccionadas
- [x] Botón "Añadir más PDFs" → merge con pdf-lib
- [x] Slider tamaño miniaturas (3 tamaños)

### Fase 4 — Edición de Texto (Sprint 4)
- [x] Canvas overlay sobre el visor para texto
- [x] Herramienta "Añadir Texto": click en PDF → textarea flotante
- [x] Guardar texto como anotación en pdf-lib
- [x] Herramienta "Editar Texto": click sobre bloque existente
- [x] Herramienta "Eliminar Bloque"
- [x] Controles tipografía (fuente, tamaño, bold, italic)

### Fase 5 — Formularios (Sprint 5)
- [x] Detectar campos de formulario con pdf-lib
- [x] Overlay de inputs HTML sobre campos del PDF
- [x] Rellenar y persistir valores en sesión
- [x] Guardar relleno en el PDF exportable

### Fase 6 — Herramientas (Sprint 6)
- [x] Búsqueda de texto (PDF.js text layer) → SearchPanel con highlights, si esta seleccionado paginas continuas, la busqueda es en todo el pdf si no esta seleccionada, solo en la pagina seleccionada
- [x] Compresión PDF (reducción de imágenes embebidas + recompresión), mostrar un desplegable con un slider para seleccionar las opciones de compresion (low/medium/high)
- [x] Modos de vista: página / continuo / ajustar ancho / ajustar alto

### Fase 7 — Exportación & Pulido (Sprint 7)
- [x] Parser de rango de páginas: `1,3,5-8`
- [x] Endpoint POST /api/pdf/export con rango opcional
- [x] Dark mode completo y consistente
- [x] CMD+K global → SearchPanel
- [x] Atajos de teclado (Delete pages, Ctrl+S export)
- [x] Estados de carga (progress bar animada)
- [x] Manejo de errores con toasts
- [x] Al importar el pdf (inicio del proceso) que la aplicacion cree automaticamente el campo titulo desde el title del pdf importado, si no tuviera queda con "Sín título"
- [x] Al exportar el pdf, el nombre del fichero por defecto sea el del titulo pero haciendo un slugfy, si no queda con export
- [x] Añadir a los botones de seleccionar y arrastrar un fondo para resaltarlos en las miniaturas de las paginas

### Fase 8 - Añadir Imagen
- [x] En la página de Edición añadir al lado del boton del circulo un boton con icono de imagen para añadir una imagen
- [x] Añadir imagen, abre el explorador de archivos para seleccionar una imagen y la coloca en la pagina actual, y con el boton de Seleccionar podremos moverla con drag and drop y hacer un resize

### Fase 9 — Firma
- [ ] Añadir botón en el menú superior con icono de firma que desplegará un submenú con: Importar imagen, conectar con Autofirma, Dibujar
- [ ] Importar imagen, aprovechar el componente de añadir imagen
- [ ] Conectar con Autofirma, exportará el documento actual y lo enviará a Autofirma y esta aplicacion se abrirá automaticamente con el pdf exportado seleccionado
- [ ] Dibujar, se colocará un rectangulo en la pagina actual que se podrá seleccionar, recolocar y redimensionar y en su interior por medio de un periférico (ratón, pencil, etc) dibujar a mano alzada una firma

---

## 6. Dependencias (package.json)

### Producción
```json
{
  "express": "^5.0.0",
  "multer": "^2.0.0",
  "pdf-lib": "^1.17.0",
  "uuid": "^10.0.0",
  "sharp": "^0.33.0"
}
```

### Desarrollo / Frontend (via Vite)
```json
{
  "vite": "^6.0.0",
  "tailwindcss": "^4.0.0",
  "pdfjs-dist": "^4.0.0",
  "sortablejs": "^1.15.0",
  "lucide": "^0.400.0"
}
```

> **Nota sobre `sharp`**: se usa en el servidor para generar previews PNG de páginas
> de forma más eficiente que renderizar con PDF.js en servidor.
> Alternativa: usar pdfjs-dist con canvas (node-canvas) si sharp da problemas.

---

## 7. Consideraciones Técnicas Importantes

### Sesiones sin login
- Cada upload genera un `sessionId` (UUID v4)
- El estado del PDF se guarda en disco temporal (`uploads/sessions/<id>/`)
- Limpieza automática por TTL (1h) con un job periódico
- El `sessionId` vive en `localStorage` del cliente

### Edición de texto en PDF
- pdf-lib permite añadir texto como `PDFPage.drawText()`
- Para edición interactiva: overlay HTML canvas/div sobre el viewer canvas
- Las coordenadas se convierten entre espacio PDF (pt) y espacio pantalla (px)

### Reordenación múltiple
- SortableJS envía el nuevo array de índices
- El servidor reordena con pdf-lib: copia páginas en nuevo orden
- Opción alternativa: input "Mover a página X" por teclado

### Compresión
- pdf-lib no comprime imágenes directamente
- Estrategia: extraer imágenes embebidas → recomprimir con sharp → reinsertar
- O usar `ghostscript` via child_process si está disponible en el sistema

### Búsqueda de texto
- PDF.js expone `getTextContent()` por página
- Se indexa en cliente al cargar el PDF
- Highlights mediante CSS sobre el text layer de PDF.js

---

## 8. Decisiones Abiertas

| Tema | Opción A | Opción B | Recomendación |
|---|---|---|---|
| Compresión | sharp (Node) | ghostscript (CLI) | sharp (sin dep. externa) |
| Preview miniaturas | PDF.js canvas (cliente) | Endpoint imagen (servidor) | Cliente (menos carga al servidor) |
| Estado sesión | Memoria (Map) | Redis | Memoria (sin infra extra) |
| Modo vista continua | Scroll de canvases | iframes | Scroll de canvases |
| Bundler assets | Vite dev + build | esbuild standalone | Vite (DX superior) |

---

## 9. Plan de Tests

> Cobertura mínima obligatoria: **80%** · Metodología: **TDD** (Red → Green → Refactor)

### 9.1 Stack de Testing

| Capa | Herramienta | Propósito |
|---|---|---|
| Unit / Integration | Vitest | Tests de servidor y utilidades cliente |
| API (Integration) | Supertest | Tests de endpoints REST end-to-end en proceso |
| Componentes UI | Vitest + jsdom | Tests de componentes JS vanilla |
| E2E | Playwright | Flujos críticos de usuario en navegador real |
| Cobertura | Vitest coverage (c8/v8) | Informe % cobertura |
| Visual regression | Playwright screenshots | Breakpoints clave + dark mode |

### 9.2 Estructura de Ficheros de Test

```
pdf-editor/
├── src/
│   ├── server/
│   │   ├── services/
│   │   │   ├── pdfService.test.js        # Unit: operaciones pdf-lib
│   │   │   ├── sessionService.test.js    # Unit: TTL, CRUD sesiones
│   │   │   └── compressService.test.js   # Unit: compresión
│   │   └── routes/
│   │       ├── pdf.test.js               # Integration: upload, export
│   │       ├── pages.test.js             # Integration: reorder, delete
│   │       └── tools.test.js             # Integration: text, forms, search
│   └── client/
│       ├── utils/
│       │   ├── pageRange.test.js         # Unit: parser "1,3,5-8"
│       │   └── thumbnailScale.test.js    # Unit: lógica de escala
│       └── components/
│           ├── ExportPanel.test.js       # Unit: validación rango
│           └── SearchPanel.test.js       # Unit: highlight results
├── e2e/
│   ├── upload-and-view.spec.js           # Flujo: subir PDF y ver páginas
│   ├── page-management.spec.js           # Flujo: reordenar, eliminar, añadir
│   ├── text-editing.spec.js              # Flujo: añadir/editar/eliminar texto
│   ├── form-filling.spec.js              # Flujo: rellenar formulario
│   ├── search.spec.js                    # Flujo: búsqueda y highlights
│   ├── export.spec.js                    # Flujo: exportar rango de páginas
│   ├── dark-mode.spec.js                 # Visual: toggle dark/light
│   └── fixtures/
│       ├── simple.pdf                    # PDF 3 páginas, solo texto
│       ├── multipage.pdf                 # PDF 12 páginas con imágenes
│       └── form.pdf                      # PDF con campos de formulario
├── vitest.config.js
└── playwright.config.js
```

### 9.3 Tests Unitarios

#### Utilidades (`pageRange.test.js`)
```js
// Arrange - Act - Assert
test('parsea rango simple', () => {
  expect(parseRange('1,3,5')).toEqual([1, 3, 5])
})
test('parsea rango con guión', () => {
  expect(parseRange('1-4')).toEqual([1, 2, 3, 4])
})
test('parsea rango mixto', () => {
  expect(parseRange('1,3-5,8')).toEqual([1, 3, 4, 5, 8])
})
test('lanza error con página 0', () => {
  expect(() => parseRange('0,2')).toThrow()
})
test('lanza error con rango invertido', () => {
  expect(() => parseRange('5-2')).toThrow()
})
test('devuelve array vacío para string vacío', () => {
  expect(parseRange('')).toEqual([])
})
```

#### Servicio de Sesiones (`sessionService.test.js`)
```js
test('crea sesión con UUID v4')
test('recupera sesión por id')
test('devuelve null para sesión inexistente')
test('elimina sesión expirada por TTL')
test('actualiza páginas de sesión existente')
```

#### Servicio PDF (`pdfService.test.js`)
```js
test('reordena páginas correctamente', async () => {
  // Arrange
  const pdf = await loadFixture('multipage.pdf')
  // Act
  const result = await reorderPages(pdf, [2, 0, 1])
  // Assert
  expect(getPageCount(result)).toBe(3)
  // verificar orden por contenido de texto de cada página
})
test('elimina páginas y reduce el total')
test('merge de dos PDFs suma el total de páginas')
test('añade texto en coordenadas correctas')
test('detecta campos de formulario en form.pdf')
test('rellena campo de formulario y persiste el valor')
```

### 9.4 Tests de Integración (API)

#### Upload & Export (`pdf.test.js`)
```js
test('POST /api/pdf/upload con PDF válido devuelve 200 y sessionId')
test('POST /api/pdf/upload sin fichero devuelve 400')
test('POST /api/pdf/upload con fichero no-PDF devuelve 415')
test('POST /api/pdf/add añade páginas a sesión existente')
test('POST /api/pdf/export devuelve Content-Type application/pdf')
test('POST /api/pdf/export con rango "1,3" devuelve PDF de 2 páginas')
test('POST /api/pdf/export con sessionId inválido devuelve 404')
```

#### Gestión de Páginas (`pages.test.js`)
```js
test('POST /api/pdf/reorder reordena y devuelve nuevo orden')
test('POST /api/pdf/reorder con índices inválidos devuelve 422')
test('DELETE /api/pdf/pages elimina páginas indicadas')
test('DELETE /api/pdf/pages rechaza eliminar todas las páginas')
test('GET /api/pdf/preview/:sid/:page devuelve imagen PNG')
test('GET /api/pdf/preview con página fuera de rango devuelve 404')
```

#### Herramientas (`tools.test.js`)
```js
test('POST /api/pdf/compress reduce el tamaño del fichero')
test('POST /api/pdf/search devuelve matches con número de página')
test('POST /api/pdf/search sin resultados devuelve array vacío')
test('POST /api/pdf/text/add inserta texto en la página')
test('PUT /api/pdf/text/:id actualiza contenido del bloque')
test('DELETE /api/pdf/text/:id elimina el bloque')
test('POST /api/pdf/form/fill persiste valores en campos')
```

### 9.5 Tests E2E (Playwright)

#### Flujo principal (`upload-and-view.spec.js`)
```js
test('usuario sube un PDF y ve las miniaturas en el sidebar')
test('usuario navega entre páginas con los botones prev/next')
test('usuario cambia el zoom y el visor se actualiza')
test('usuario activa el modo continuo y hace scroll')
test('CMD+K abre el panel de búsqueda')
```

#### Gestión de páginas (`page-management.spec.js`)
```js
test('usuario arrastra miniatura y la página cambia de posición')
test('usuario introduce número de destino en input y la página se mueve')
test('usuario selecciona múltiples páginas con shift+click y las elimina')
test('usuario sube un segundo PDF y se añaden páginas al final')
test('usuario ajusta el slider y las miniaturas cambian de tamaño')
```

#### Exportación (`export.spec.js`)
```js
test('usuario exporta el PDF completo y se descarga')
test('usuario introduce rango "1,3-5" y el PDF exportado tiene 4 páginas')
test('campo de rango inválido muestra mensaje de error')
```

#### Dark mode (`dark-mode.spec.js`)
```js
test('toggle dark mode cambia la clase en <html>')
test('screenshot light mode 1440px coincide con baseline')
test('screenshot dark mode 1440px coincide con baseline')
test('screenshot light mode 768px (sidebar colapsado)')
```

### 9.6 Configuración

#### `vitest.config.js`
```js
export default {
  test: {
    environment: 'node',         // tests de servidor
    coverage: {
      provider: 'v8',
      threshold: { lines: 80, functions: 80, branches: 80 },
      include: ['src/server/**'],
      exclude: ['src/server/index.js'],
    },
  },
}
```

#### `playwright.config.js`
```js
export default {
  testDir: './e2e',
  use: {
    baseURL: 'http://localhost:3000',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox',  use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit',   use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    command: 'npm run dev',
    port: 3000,
    reuseExistingServer: true,
  },
}
```

### 9.7 Scripts npm

```json
{
  "scripts": {
    "test":          "vitest run",
    "test:watch":    "vitest",
    "test:coverage": "vitest run --coverage",
    "test:e2e":      "playwright test",
    "test:e2e:ui":   "playwright test --ui",
    "test:all":      "npm run test:coverage && npm run test:e2e"
  }
}
```

### 9.8 Flujo TDD por Fase

| Fase | Qué escribir primero |
|---|---|
| 1 | Tests de tokens CSS (existencia de variables) |
| 2 | Tests API upload + test E2E "subir y ver miniatura" |
| 3 | Tests unitarios reorder/delete + E2E drag & drop |
| 4 | Tests unitarios drawText + E2E añadir texto en página |
| 5 | Tests unitarios detectar campos + E2E rellenar formulario |
| 6 | Tests búsqueda (matches) + E2E highlight en visor |
| 7 | Tests parseRange exhaustivos + E2E exportar rango |

### 9.9 Fixtures de Test

- `simple.pdf` — 3 páginas, texto plano, sin imágenes, sin formularios
- `multipage.pdf` — 12 páginas, imágenes embebidas, texto variado
- `form.pdf` — campos `AcroForm`: texto, checkbox, select, firma

---

## 10. Orden de Desarrollo Recomendado

1. `Fase 1` → shell funcional desplegable localmente
2. `Fase 2` → upload + viewer = MVP visible
3. `Fase 3` → página management = funcionalidad core
4. `Fase 6` → search + compress (alta demanda)
5. `Fase 4` → text editing (complejidad técnica alta)
6. `Fase 5` → form filling (depende de Fase 4)
7. `Fase 7` → export + pulido final

---

*Generado el 2026-06-25 | Node.js 22 | PDFPro v1.0*
