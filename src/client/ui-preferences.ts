export type Theme = 'light' | 'dark'

const themeStorageKey = 'fightfolio.theme.v1'
const sidebarStorageKey = 'fightfolio.sidebar-collapsed.v1'
const narrowViewStorageKey = 'fightfolio.narrow-view.v1'

export function getInitialTheme(): Theme {
  try {
    const storedTheme = window.localStorage.getItem(themeStorageKey)
    if (storedTheme === 'light' || storedTheme === 'dark') return storedTheme
  } catch {
    // Storage can be unavailable in hardened or private browser contexts.
  }

  return window.matchMedia?.('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme
  document.documentElement.style.colorScheme = theme
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', theme === 'dark' ? '#151713' : '#f8f7f2')
}

export function saveTheme(theme: Theme) {
  try {
    window.localStorage.setItem(themeStorageKey, theme)
  } catch {
    // The preference still applies for the current page when storage is blocked.
  }
}

export function getInitialSidebarCollapsed() {
  try {
    return window.localStorage.getItem(sidebarStorageKey) === 'true'
  } catch {
    return false
  }
}

export function saveSidebarCollapsed(collapsed: boolean) {
  try {
    window.localStorage.setItem(sidebarStorageKey, String(collapsed))
  } catch {
    // The preference still applies for the current page when storage is blocked.
  }
}

export function getInitialNarrowView() {
  try {
    return window.localStorage.getItem(narrowViewStorageKey) === 'true'
  } catch {
    return false
  }
}

export function saveNarrowView(narrow: boolean) {
  try {
    window.localStorage.setItem(narrowViewStorageKey, String(narrow))
  } catch {
    // The preference still applies for the current page when storage is blocked.
  }
}
