// The loading screen (remake): while a map's assets load, and a generated map is built, the step
// under way and a progress bar with a percentage instead of a blank page. Its markup sits in
// index.html, so "Loading…" shows from the first paint, before this script has arrived.

export interface LoadingScreen {
  /** Shows the screen with the step under way and how far the whole load has got (0..1). */
  update(step: string, fraction: number): void
  hide(): void
}

export function loadingScreen(doc: Document): LoadingScreen {
  const root = doc.getElementById('loading')!
  const step = root.querySelector<HTMLElement>('.loading-step')!
  const fill = root.querySelector<HTMLElement>('.loading-fill')!
  const percent = root.querySelector<HTMLElement>('.loading-percent')!
  return {
    update: (text, fraction) => {
      const shown = Math.round(Math.min(1, Math.max(0, fraction)) * 100)
      root.hidden = false
      step.textContent = text
      fill.style.width = `${shown}%`
      percent.textContent = `${shown}%`
      root.setAttribute('aria-valuenow', String(shown))
    },
    hide: () => { root.hidden = true },
  }
}
