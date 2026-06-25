# CLAUDE.md — PDFPro

Guía para Claude Code sobre este proyecto.

## Comandos esenciales

```bash
npm run dev              # Servidor :3000 + cliente Vite :5173 (concurrently)
npm run dev:server       # Solo Express (node --watch)
npm run dev:client       # Solo Vite
npm test                 # Vitest (unit)
npm run test:coverage    # Vitest con cobertura v8 (umbral 80%)
npm run test:e2e         # Playwright
npm run test:all         # Cobertura + E2E
npm run build            # Vite build → dist/
```

## Arquitectura

El proyecto es una SPA (Vite) + API REST (Express 5). Sin login. Las sesiones viven en memoria del servidor (Map) con TTL de 1 hora, identificadas por UUID v4 guardado en `localStorage` del cliente.

```
cliente (Vite :5173)  →  proxy /api  →  servidor (Express :3000)
```

En producción, el servidor sirve el `dist/` generado por Vite. En desarrollo, Vite tiene proxy configurado para `/api`.

### Flujo de datos principal

1. Usuario sube PDF → `POST /api/pdf/upload` → Multer guarda en `uploads/` → pdf-lib carga el archivo → se crea sesión con `sessionId`
2. `sessionId` se guarda en `localStorage` y se usa en todas las peticiones siguientes
3. El cliente renderiza el PDF con pdfjs-dist (canvas) usando el archivo original (no llega por la API, se carga desde el `<input>` local)
4. Las operaciones de edición (reordenar, eliminar, exportar) van vía API → el servidor modifica el PDF en `uploads/` y guarda el resultado

### Módulo compartido

`src/shared/pageRange.js` — única utilidad importada tanto por servidor como por cliente. El cliente la re-exporta desde `src/client/utils/pageRange.js`.

## Estructura de ficheros

```
src/
├── server/
│   ├── index.js                   # app Express, monta rutas, llama listen()
│   ├── routes/pdf.js              # upload, add, export
│   ├── routes/pages.js            # reorder, delete, preview, list
│   ├── routes/tools.js            # compress, search, text/*, form/fill
│   ├── services/sessionService.js # Map en memoria, purge TTL
│   ├── services/pdfService.js     # loadPdf, savePdf, reorderPages, deletePages, mergePdfs, extractPages
│   ├── services/compressService.js
│   ├── middleware/upload.js        # Multer (PDF only, límite configurable)
│   └── middleware/errorHandler.js  # res.status(err.status).json(...)
├── client/
│   ├── index.html                 # Shell HTML completo con todos los elementos del DOM
│   ├── main.js                    # Estado global (AppState), event listeners, PDF.js
│   ├── services/apiClient.js      # fetch wrapper para todos los endpoints
│   ├── utils/pageRange.js         # re-export de shared
│   ├── utils/thumbnailScale.js    # getSizeConfig, getScaleForWidth
│   └── styles/
│       ├── tokens.css             # Variables CSS (--color-*, --space-*, --radius-*, etc.)
│       └── global.css             # @import tailwindcss + @import tokens + clases BEM
└── shared/
    └── pageRange.js               # parseRange("1,3-5,8") → [1,3,4,5,8]
```

## Estado del cliente

Objeto `state` en `main.js` — sin librería de estado:

```js
{
  sessionId,       // string | null — persiste en localStorage
  pages,           // Page[] — lista del servidor
  currentPage,     // number (1-indexed)
  totalPages,      // number
  zoom,            // number (1.0 = 100%)
  viewMode,        // 'page' | 'continuous'
  thumbnailSize,   // 'sm' | 'md' | 'lg'
  darkMode,        // boolean — persiste en localStorage
  selection,       // number[] — índices de páginas seleccionadas
  pdfDoc,          // pdfjs PDFDocumentProxy | null
}
```

## Convenciones de código

- **ES Modules** en todo el proyecto (`"type": "module"` en package.json)
- **Sin TypeScript** — JS vanilla con JSDoc donde sea útil
- **Sin framework frontend** — DOM vanilla, sin React/Vue
- **Errores de API** siempre con `{ success: false, error: string }` y status HTTP apropiado
- **Errores con status** se crean así: `Object.assign(new Error('msg'), { status: 422 })`
- Las rutas Express delegan en servicios; no hacen lógica de negocio directamente
- Los servicios no conocen `req`/`res`

## Tests

### Unitarios (Vitest)

- Ficheros `*.test.js` junto al módulo que testean
- Cobertura mínima: **80%** en líneas, funciones y ramas
- Solo cubre `src/server/**` (excluye `src/server/index.js`)
- Patrón AAA (Arrange / Act / Assert)

```bash
npx vitest run --reporter=verbose   # ver cada test
```

Tests existentes:
- `src/shared/pageRange.test.js` — 12 casos (normales + errores)
- `src/server/services/sessionService.test.js` — 7 casos
- `src/client/utils/thumbnailScale.test.js` — 9 casos

### E2E (Playwright)

- Ficheros en `e2e/*.spec.js`
- Fixtures PDF en `e2e/fixtures/` (simple.pdf, multipage.pdf, form.pdf — por crear)
- `baseURL: http://localhost:5173`
- El `webServer` de Playwright arranca `npm run dev` automáticamente

### Integración API (Supertest)

- Importar `app` desde `src/server/index.js`
- `index.js` exporta `app` además de llamar `listen()`
- Usar `_clearAll()` de sessionService en `beforeEach`

## Git Flow

1. `gh issue create` con descripción de la tarea
2. `git checkout -b feature_<slug>` (o `fix_`, `chore_`, etc.)
3. Desarrollar con TDD: test primero → implementación → refactor
4. `git push -u origin <rama>`
5. `gh pr create --base main --assignee cristoj`
6. Pedir merge al usuario

## Fases de implementación

| Fase | Estado | Descripción |
|---|---|---|
| 1 — Infraestructura | ✅ Completa | Express 5, Vite 6, Tailwind v4, layout shell, tests base |
| 2 — Upload & Visor | ⏳ Pendiente | PDF.js integrado, miniaturas reales, navegación |
| 3 — Gestión páginas | ⏳ Pendiente | Drag & drop SortableJS, multi-selección, merge |
| 4 — Edición texto | ⏳ Pendiente | Canvas overlay, pdf-lib drawText, tipografía |
| 5 — Formularios | ⏳ Pendiente | AcroForm detect, inputs HTML overlay |
| 6 — Herramientas | ⏳ Pendiente | Búsqueda texto, compresión, vistas |
| 7 — Exportación | ⏳ Pendiente | Parser rango, atajos teclado, toasts |

## Decisiones técnicas

- **Sesiones en memoria** (no Redis) — sin infraestructura extra, TTL 1h
- **Previews de miniaturas en cliente** — PDF.js canvas, no endpoint de imagen PNG
- **Búsqueda en cliente** — PDF.js `getTextContent()`, no indexado en servidor
- **Compresión con pdf-lib** — `useObjectStreams: true`, sin ghostscript
- **PDF.js worker** — servido desde `public/pdf.worker.min.js`

## Troubleshooting frecuente

**Vite no encuentra `pdfjs-dist` worker:**
Copiar `node_modules/pdfjs-dist/build/pdf.worker.min.mjs` a `public/pdf.worker.min.js`.

**`sharp` falla en install:**
Es una dependencia nativa. Si falla: `npm install --ignore-scripts sharp` o elimínala si no se usa compresión de imágenes.

**Tests con `import.meta.url` fallan en Vitest:**
Añadir `environment: 'node'` en `vitest.config.js` (ya configurado).

**Express 5 `router.delete` con body:**
Express 5 lee el body en DELETE si se usa `express.json()` (ya configurado en `index.js`).
