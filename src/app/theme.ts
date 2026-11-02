// The theme (spec 12): dark unless this device stored "light". The store keeps the choice here only
// while the connection is remembered, so "Remember on this device" off still stores nothing.
const KEY = 'gitcrm.theme';

export type Theme = 'dark' | 'light';

export function storedTheme(): Theme {
  try {
    return localStorage.getItem(KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark'; // blocked storage
  }
}

export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

export function storeTheme(theme: Theme): void {
  try {
    if (theme === 'dark') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, theme);
  } catch {
    // Blocked storage: the choice lasts until the page reloads.
  }
}

export function forgetTheme(): void {
  storeTheme('dark');
}
