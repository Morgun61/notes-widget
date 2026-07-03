import type { AuthState, Note } from '../../shared/types'

export {}

interface OverlayBridgeApi {
  onAuthChanged: (callback: (state: AuthState) => void) => void
  onNotesChanged: (callback: (notes: Note[]) => void) => void
  setInteractive: (interactive: boolean) => void
}

declare global {
  interface Window {
    overlayBridge: OverlayBridgeApi
  }
}

const panelEl = document.getElementById('panel') as HTMLElement
const listEl = document.getElementById('notes-list') as HTMLUListElement

// The panel spans the whole screen (see style.css) so notes can be
// scattered across the desktop, but most of that area is empty space
// that should stay click-through for the icons underneath. Only turn on
// interactivity while the mouse is actually over a rendered note line -
// checked per mousemove rather than via CSS pointer-events, since the
// container's own scrollbar (needed once interactive) would otherwise
// be blocked too.
let isOverlayInteractive = false

document.addEventListener('mousemove', (event) => {
  const overNote = Boolean((event.target as HTMLElement | null)?.closest('li'))
  if (overNote !== isOverlayInteractive) {
    isOverlayInteractive = overNote
    window.overlayBridge.setInteractive(isOverlayInteractive)
  }
})

const BASE_FONT_SIZE = 13
const MIN_FONT_SIZE = 8
const BASE_COLUMNS = 4
const MAX_COLUMNS = 12

// The panel's width/height are fixed to the screen (see style.css), so
// there's no scrolling past what it shows - instead, once the columns
// overflow past the visible width, add more (narrower) columns and, once
// that's maxed out, shrink the text, until everything fits on screen.
//
// Overflow has to be measured on #panel, not #notes-list itself: the
// list has no overflow value of its own (defaults to visible), so its
// scrollWidth never grows past its own clientWidth no matter how far the
// generated multi-column overflow columns extend - only the ancestor
// that actually clips/scrolls (#panel, overflow: auto) reports it.
function fitNotesToScreen(): void {
  let fontSize = BASE_FONT_SIZE
  let columns = BASE_COLUMNS
  listEl.style.fontSize = `${fontSize}px`
  listEl.style.columnCount = `${columns}`

  while (panelEl.scrollWidth > panelEl.clientWidth) {
    if (columns < MAX_COLUMNS) {
      columns += 1
    } else if (fontSize > MIN_FONT_SIZE) {
      fontSize -= 1
    } else {
      break
    }
    listEl.style.fontSize = `${fontSize}px`
    listEl.style.columnCount = `${columns}`
  }
}

function render(notes: Note[]): void {
  listEl.innerHTML = ''

  if (notes.length === 0) {
    const li = document.createElement('li')
    li.className = 'empty'
    li.textContent = 'Henuz not yok'
    listEl.append(li)
    return
  }

  for (const note of notes) {
    const li = document.createElement('li')
    if (note.done) li.classList.add('done')
    if (note.pinned) {
      const pin = document.createElement('span')
      pin.className = 'pin'
      pin.textContent = '★'
      li.append(pin)
    }
    li.append(document.createTextNode(note.text))
    listEl.append(li)
  }

  fitNotesToScreen()
}

window.overlayBridge.onNotesChanged(render)
window.addEventListener('resize', fitNotesToScreen)
