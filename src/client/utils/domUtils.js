/**
 * Safe DOM construction utilities.
 *
 * These helpers replace innerHTML-based patterns that could execute attacker-
 * controlled content from PDF text or server error messages (FINDING-01, FINDING-05).
 * All text values are set via textContent so they are never parsed as HTML.
 */

/**
 * Build a search result snippet element with the query term highlighted using
 * <mark> nodes. The snippet text is never placed into innerHTML.
 *
 * @param {string} snippet   — plain text extracted from the PDF
 * @param {string} query     — search term entered by the user
 * @returns {HTMLSpanElement}
 */
export function createHighlightedSnippet(snippet, query) {
  const el = document.createElement('span')
  el.className = 'search-result-snippet'

  if (!query || !snippet) {
    el.textContent = snippet ?? ''
    return el
  }

  // Escape regex metacharacters before building the split pattern
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const parts = snippet.split(new RegExp(`(${escaped})`, 'gi'))

  for (const part of parts) {
    if (part.toLowerCase() === query.toLowerCase()) {
      const mark = document.createElement('mark')
      mark.textContent = part   // safe: textContent never interprets HTML
      el.appendChild(mark)
    } else {
      el.appendChild(document.createTextNode(part))
    }
  }

  return el
}

/**
 * Build a toast notification element without using innerHTML.
 * The message and icon are set via textContent to prevent XSS.
 *
 * @param {string} message — user-visible message (may come from server errors)
 * @param {'info'|'success'|'error'} type
 * @returns {{ toast: HTMLDivElement, closeBtn: HTMLButtonElement }}
 */
export function createToastElement(message, type = 'info') {
  const toast = document.createElement('div')
  toast.className = `toast toast--${type}`

  const icon = type === 'error' ? '✕' : type === 'success' ? '✓' : 'ℹ'

  const iconEl = document.createElement('span')
  iconEl.className = 'toast-icon'
  iconEl.textContent = icon   // safe: emoji string, no HTML

  const msgEl = document.createElement('span')
  msgEl.className = 'toast-message'
  msgEl.textContent = message  // safe: textContent does not interpret HTML

  const closeBtn = document.createElement('button')
  closeBtn.className = 'toast-close'
  closeBtn.setAttribute('aria-label', 'Cerrar')
  closeBtn.textContent = '✕'

  toast.appendChild(iconEl)
  toast.appendChild(msgEl)
  toast.appendChild(closeBtn)

  return { toast, closeBtn }
}
