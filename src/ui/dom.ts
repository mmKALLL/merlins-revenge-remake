// Small DOM builders shared by the menu panels (styled in index.html).

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  if (className) e.className = className
  if (text) e.textContent = text
  return e
}

export function button(text: string, onClick: () => void, className = ''): HTMLButtonElement {
  const b = el('button', className, text)
  b.type = 'button'
  b.addEventListener('click', onClick)
  return b
}

/** A menu's column of large buttons. */
export function menuList(...buttons: HTMLElement[]): HTMLElement {
  const nav = el('div', 'menu-list')
  nav.append(...buttons)
  return nav
}

/** A panel with a heading; `back` adds a Back button at the end (Esc does the same). */
export function panel(title: string, back?: () => void): { root: HTMLElement; body: HTMLElement } {
  const root = el('section', 'panel')
  const id = `panel-${title.toLowerCase().replace(/[^a-z]+/g, '-')}`
  const h = el('h2', '', title)
  h.id = id
  root.setAttribute('aria-labelledby', id)
  const body = el('div', 'panel-body')
  root.append(h, body)
  if (back) root.append(menuList(button('Back', back, 'back')))
  return { root, body }
}
