// "MERLIN'S REVENGE" in the original title screen's letters (gfx/title/output, one image per
// letter; converted to public/generated/title/). The heading is plain text until every letter has
// loaded, so a missing image leaves readable text instead of a gap.
import { el } from './dom'

const TITLE = "Merlin's Revenge"
const LETTERS_URL = `${import.meta.env.BASE_URL}generated/title/`

const letterFile = (ch: string): string => (ch === "'" ? 'apostrophe' : ch.toUpperCase())

function loadLetter(ch: string): Promise<HTMLImageElement> {
  const img = new Image()
  img.alt = ''
  img.className = ch === "'" ? 'letter apostrophe' : 'letter'
  img.src = `${LETTERS_URL}${letterFile(ch)}.png`
  return img.decode().then(() => img)
}

export function titleHeading(): HTMLElement {
  const h = el('h1', 'title-art', TITLE)
  h.setAttribute('aria-label', TITLE)
  const words = TITLE.split(' ')
  void Promise.all(words.map((w) => Promise.all([...w].map(loadLetter))))
    .then((letters) => {
      h.replaceChildren(...letters.map((imgs) => {
        const word = el('span', 'word')
        word.setAttribute('aria-hidden', 'true')
        word.append(...imgs)
        return word
      }))
      h.classList.add('drawn')
    })
    .catch(() => { /* keep the text title */ })
  return h
}
