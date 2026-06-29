/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest'
import { createHighlightedSnippet, createToastElement } from './domUtils.js'

// ── createHighlightedSnippet ──────────────────────────────────

describe('createHighlightedSnippet', () => {
  it('wraps matched query in a <mark> element', () => {
    // Arrange
    const snippet = 'hello world'
    const query = 'world'

    // Act
    const el = createHighlightedSnippet(snippet, query)

    // Assert
    const marks = el.querySelectorAll('mark')
    expect(marks).toHaveLength(1)
    expect(marks[0].textContent).toBe('world')
  })

  it('returns the correct class name on the container element', () => {
    const el = createHighlightedSnippet('foo bar', 'bar')
    expect(el.className).toBe('search-result-snippet')
  })

  it('does NOT execute script tags from PDF text content (XSS guard)', () => {
    // Arrange — simulates attacker-controlled PDF text
    const malicious = '<img src=x onerror="window.__xss=true">'
    const query = 'img'

    // Act
    const el = createHighlightedSnippet(malicious, query)
    // Append to a real DOM to trigger any event handler that might fire
    document.body.appendChild(el)

    // Assert — the raw string must appear as text, not as a parsed element
    expect(document.querySelector('img[src="x"]')).toBeNull()
    expect(window.__xss).toBeUndefined()
    expect(el.textContent).toContain('<img src=x onerror=')

    document.body.removeChild(el)
  })

  it('handles multiple matches in the snippet', () => {
    const el = createHighlightedSnippet('cat and cat and cat', 'cat')
    const marks = el.querySelectorAll('mark')
    expect(marks).toHaveLength(3)
  })

  it('is case-insensitive in matching', () => {
    const el = createHighlightedSnippet('Hello World', 'hello')
    const marks = el.querySelectorAll('mark')
    expect(marks).toHaveLength(1)
    expect(marks[0].textContent).toBe('Hello')
  })

  it('returns an empty span when snippet is empty', () => {
    const el = createHighlightedSnippet('', 'foo')
    expect(el.textContent).toBe('')
    expect(el.querySelectorAll('mark')).toHaveLength(0)
  })

  it('returns the snippet as plain text when query is empty', () => {
    const el = createHighlightedSnippet('some text', '')
    expect(el.textContent).toBe('some text')
    expect(el.querySelectorAll('mark')).toHaveLength(0)
  })

  it('escapes regex special characters in the query', () => {
    // A dot in query must not be treated as a wildcard
    const el = createHighlightedSnippet('a.b and axb', 'a.b')
    const marks = el.querySelectorAll('mark')
    expect(marks).toHaveLength(1)
    expect(marks[0].textContent).toBe('a.b')
  })
})

// ── createToastElement ────────────────────────────────────────

describe('createToastElement', () => {
  it('sets the correct class on the toast container', () => {
    const { toast } = createToastElement('hello', 'info')
    expect(toast.className).toBe('toast toast--info')
  })

  it('uses textContent for the message, not innerHTML (XSS guard)', () => {
    // Arrange — simulates a server error message that contains HTML
    const malicious = '<script>window.__toastXss=true</script>'

    // Act
    const { toast } = createToastElement(malicious, 'error')
    document.body.appendChild(toast)

    // Assert — script must not execute and no <script> element should exist inside
    expect(document.querySelector('script')).toBeNull()
    expect(window.__toastXss).toBeUndefined()
    // The raw string should be visible as text, not parsed
    const msgEl = toast.querySelector('.toast-message')
    expect(msgEl.textContent).toBe(malicious)

    document.body.removeChild(toast)
  })

  it('shows the success icon for type=success', () => {
    const { toast } = createToastElement('ok', 'success')
    const icon = toast.querySelector('.toast-icon')
    expect(icon.textContent).toBe('✓')
  })

  it('shows the error icon for type=error', () => {
    const { toast } = createToastElement('fail', 'error')
    const icon = toast.querySelector('.toast-icon')
    expect(icon.textContent).toBe('✕')
  })

  it('shows the info icon for type=info (default)', () => {
    const { toast } = createToastElement('note')
    const icon = toast.querySelector('.toast-icon')
    expect(icon.textContent).toBe('ℹ')
  })

  it('returns a closeBtn element with aria-label', () => {
    const { closeBtn } = createToastElement('msg', 'info')
    expect(closeBtn.getAttribute('aria-label')).toBe('Cerrar')
    expect(closeBtn.className).toBe('toast-close')
  })

  it('includes message span, icon span and close button as children', () => {
    const { toast } = createToastElement('test', 'info')
    expect(toast.querySelector('.toast-message')).not.toBeNull()
    expect(toast.querySelector('.toast-icon')).not.toBeNull()
    expect(toast.querySelector('.toast-close')).not.toBeNull()
  })
})
