import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  initializeTheme,
  readThemePreference,
  setThemePreference,
} from './theme'

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
  delete document.documentElement.dataset.theme
})

describe('theme preference', () => {
  it('defaults to the system without persisting or resolving its current color', () => {
    initializeTheme()
    expect(readThemePreference()).toBe('system')
    expect(document.documentElement).toHaveAttribute('data-theme', 'system')
    expect(localStorage.length).toBe(0)
  })

  it('restores only valid preferences and persists a manual choice', () => {
    localStorage.setItem('my-poxket-theme', 'unknown')
    initializeTheme()
    expect(document.documentElement).toHaveAttribute('data-theme', 'system')
    setThemePreference('dark')
    expect(localStorage.getItem('my-poxket-theme')).toBe('dark')
    initializeTheme()
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
    setThemePreference('light')
    expect(document.documentElement).toHaveAttribute('data-theme', 'light')
    setThemePreference('system')
    expect(document.documentElement).toHaveAttribute('data-theme', 'system')
    expect(readThemePreference()).toBe('system')
  })

  it('keeps the page usable when reading or saving storage fails', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Storage unavailable', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Storage unavailable', 'SecurityError')
    })
    expect(() => initializeTheme()).not.toThrow()
    expect(document.documentElement).toHaveAttribute('data-theme', 'system')
    expect(() => setThemePreference('dark')).not.toThrow()
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
  })
})
