export type Theme = 'light' | 'dark'

const themeStorageKey = 'fightfolio.theme.v1'
const sidebarStorageKey = 'fightfolio.sidebar-collapsed.v1'
const narrowViewStorageKey = 'fightfolio.narrow-view.v1'

function readPreference(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    // Storage can be unavailable in hardened or private browser contexts.
    return null
  }
}

function writePreference(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // The preference still applies for the current page when storage is blocked.
  }
}

export function getInitialTheme(): Theme {
  const storedTheme = readPreference(themeStorageKey)
  if (storedTheme === 'light' || storedTheme === 'dark') return storedTheme

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
  writePreference(themeStorageKey, theme)
}

export function getInitialSidebarCollapsed() {
  return readPreference(sidebarStorageKey) === 'true'
}

export function saveSidebarCollapsed(collapsed: boolean) {
  writePreference(sidebarStorageKey, String(collapsed))
}

export function getInitialNarrowView() {
  return readPreference(narrowViewStorageKey) === 'true'
}

export function saveNarrowView(narrow: boolean) {
  writePreference(narrowViewStorageKey, String(narrow))
}
