# PDFPro — Advanced PDF Editor

Aplicación web de edición PDF estilo Adobe Acrobat, sin login, construida con Node.js 22 y una SPA vanilla.

## Stack

| Capa | Tecnología |
|---|---|
| Runtime | Node.js 22 |
| Backend | Express 5 |
| Upload | Multer |
| PDF (servidor) | pdf-lib |
| PDF (cliente) | pdfjs-dist |
| Drag & drop | SortableJS |
| Build | Vite 6 |
| Estilos | Tailwind CSS v4 |
| Tests unitarios | Vitest |
| Tests E2E | Playwright |

## Requisitos

- Node.js >= 22
- npm >= 10

## Instalación

```bash
cp .env.example .env
npm install
```

## Desarrollo

```bash
npm run dev
```

Arranca el servidor Express en `http://localhost:3000` y el cliente Vite en `http://localhost:5173`.

## Build de producción

```bash
npm run build
npm run preview
```

## Tests

```bash
# Tests unitarios
npm test

# Tests unitarios con cobertura (≥80% requerido)
npm run test:coverage

# Tests E2E (requiere que el servidor esté arrancado)
npm run test:e2e

# Suite completa
npm run test:all
```

## Estructura

```
pdfpro/
├── src/
│   ├── server/
│   │   ├── index.js                # Entry point Express
│   │   ├── routes/
│   │   │   ├── pdf.js              # upload, export, merge
│   │   │   ├── pages.js            # reorder, delete, preview
│   │   │   └── tools.js            # compress, search, text, forms
│   │   ├── services/
│   │   │   ├── pdfService.js       # operaciones pdf-lib
│   │   │   ├── sessionService.js   # estado en memoria (TTL 1h)
│   │   │   └── compressService.js
│   │   └── middleware/
│   │       ├── upload.js           # Multer config
│   │       └── errorHandler.js
│   ├── client/
│   │   ├── index.html
│   │   ├── main.js                 # Arranque + lógica SPA
│   │   ├── services/
│   │   │   └── apiClient.js        # Fetch wrapper
│   │   ├── utils/
│   │   │   ├── pageRange.js        # Re-export de shared
│   │   │   └── thumbnailScale.js
│   │   └── styles/
│   │       ├── tokens.css          # Variables CSS (light + dark)
│   │       └── global.css
│   └── shared/
│       └── pageRange.js            # Parser "1,3,5-8" compartido servidor/cliente
├── e2e/                            # Tests Playwright
│   └── fixtures/                   # PDFs de prueba
├── public/
│   └── pdf.worker.min.js           # Worker pdfjs-dist
├── uploads/                        # Directorio temporal (gitignored)
├── .env.example
├── vite.config.js
├── vitest.config.js
└── playwright.config.js
```

## API REST

```
POST   /api/pdf/upload              # Sube PDF(s) → { sessionId, pages[] }
POST   /api/pdf/add                 # Añade PDFs a sesión existente
GET    /api/pdf/pages/:sid          # Lista páginas con metadatos
GET    /api/pdf/preview/:sid/:page  # Metadata de página
POST   /api/pdf/reorder             # { sessionId, order: [2,1,3] }
DELETE /api/pdf/pages               # { sessionId, pages: [1,3] }
POST   /api/pdf/compress            # { sessionId }
POST   /api/pdf/search              # { sessionId, query }
POST   /api/pdf/text/add            # Añade texto anotación
PUT    /api/pdf/text/:id            # Edita bloque de texto
DELETE /api/pdf/text/:id
POST   /api/pdf/form/fill           # Rellena campos de formulario
POST   /api/pdf/export              # { sessionId, range?: "1,3-5" } → PDF
```

## Variables de entorno

| Variable | Default | Descripción |
|---|---|---|
| `PORT` | `3000` | Puerto del servidor Express |
| `SESSION_TTL_MS` | `3600000` | TTL de sesiones en ms (1 hora) |
| `UPLOAD_DIR` | `uploads` | Directorio para archivos temporales |
| `MAX_FILE_SIZE_MB` | `100` | Tamaño máximo de PDF en MB |

## Funcionalidades

- **Importar PDF** — drag & drop o selector de archivo
- **Visor** — renderizado canvas con PDF.js, zoom 25–400%, modo página y continuo
- **Miniaturas** — sidebar con previews en 3 tamaños, drag & drop para reordenar
- **Gestión de páginas** — reordenar, eliminar, añadir más PDFs (merge)
- **Exportar** — rango de páginas configurable (`1,3,5-8`)
- **Comprimir** — reduce el tamaño del PDF
- **Búsqueda** — CMD+K abre panel de búsqueda de texto
- **Dark mode** — toggle con persistencia en localStorage
