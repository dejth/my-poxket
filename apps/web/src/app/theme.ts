export type ThemePreference = 'system' | 'light' | 'dark'

const THEME_STORAGE_KEY = 'my-poxket-theme'

export function readThemePreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    if (stored === 'light' || stored === 'dark') return stored
  } catch {
    // The system theme still works when browser storage is unavailable.
  }
  return 'system'
}

export function initializeTheme() {
  document.documentElement.dataset.theme = readThemePreference()
}

export function setThemePreference(preference: ThemePreference) {
  document.documentElement.dataset.theme = preference
  try {
    localStorage.setItem(THEME_STORAGE_KEY, preference)
  } catch {
    // Keep the selected theme for this page when storage is unavailable.
  }
}
