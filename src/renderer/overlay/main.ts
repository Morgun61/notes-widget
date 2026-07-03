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

// The panel is sized to fit its content (see style.css), not the full
// screen, so "mouse is over the panel" only covers the area where notes
// are actually rendered - everywhere else on the desktop stays
// click-through (see main/windows/overlayWindow.ts).
panelEl.addEventListener('mouseenter', () => window.overlayBridge.setInteractive(true))
panelEl.addEventListener('mouseleave', () => window.overlayBridge.setInteractive(false))

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
}

window.overlayBridge.onNotesChanged(render)
