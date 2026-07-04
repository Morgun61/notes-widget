import type { AuthState, Note } from '../../shared/types'

export {}

interface NotesWidgetApi {
  auth: {
    signIn: (email: string, password: string) => Promise<void>
    signUp: (email: string, password: string, username: string) => Promise<void>
    signInGoogle: () => Promise<void>
    signOut: () => Promise<void>
    onChanged: (callback: (state: AuthState) => void) => void
  }
  notes: {
    add: (text: string, order: number) => Promise<void>
    update: (
      id: string,
      fields: Partial<Pick<Note, 'text' | 'done' | 'pinned' | 'order' | 'color'>>
    ) => Promise<void>
    delete: (id: string) => Promise<void>
    onChanged: (callback: (notes: Note[]) => void) => void
  }
}

declare global {
  interface Window {
    notesWidget: NotesWidgetApi
  }
}

const loginView = document.getElementById('login-view') as HTMLElement
const notesView = document.getElementById('notes-view') as HTMLElement
const loginForm = document.getElementById('login-form') as HTMLFormElement
const emailInput = document.getElementById('email') as HTMLInputElement
const passwordInput = document.getElementById('password') as HTMLInputElement
const usernameInput = document.getElementById('username') as HTMLInputElement
const signupBtn = document.getElementById('signup-btn') as HTMLButtonElement
const googleBtn = document.getElementById('google-btn') as HTMLButtonElement
const authError = document.getElementById('auth-error') as HTMLElement
const userNameEl = document.getElementById('user-name') as HTMLElement
const userEmailEl = document.getElementById('user-email') as HTMLElement
const signoutBtn = document.getElementById('signout-btn') as HTMLButtonElement
const addNoteForm = document.getElementById('add-note-form') as HTMLFormElement
const noteTextInput = document.getElementById('note-text') as HTMLInputElement
const searchInput = document.getElementById('search-input') as HTMLInputElement
const notesList = document.getElementById('notes-list') as HTMLUListElement

let currentNotes: Note[] = []
let searchQuery = ''
let draggedNoteId: string | null = null

const COLOR_PALETTE = [
  '#ff6b6b',
  '#f5a442',
  '#f5c542',
  '#4caf82',
  '#4f6df5',
  '#9b6df5',
  '#f56dab'
]

let colorPopover: HTMLDivElement | null = null

function closeColorPopover(): void {
  colorPopover?.remove()
  colorPopover = null
}

function openColorPopover(anchor: HTMLElement, note: Note): void {
  closeColorPopover()

  const popover = document.createElement('div')
  popover.className = 'color-popover'

  const noneBtn = document.createElement('button')
  noneBtn.type = 'button'
  noneBtn.className = 'color-option none'
  noneBtn.title = 'Renksiz'
  noneBtn.addEventListener('click', () => {
    window.notesWidget.notes.update(note.id, { color: '' }).catch(showError)
    closeColorPopover()
  })
  popover.append(noneBtn)

  for (const color of COLOR_PALETTE) {
    const optBtn = document.createElement('button')
    optBtn.type = 'button'
    optBtn.className = 'color-option'
    optBtn.style.background = color
    optBtn.addEventListener('click', () => {
      window.notesWidget.notes.update(note.id, { color }).catch(showError)
      closeColorPopover()
    })
    popover.append(optBtn)
  }

  const rect = anchor.getBoundingClientRect()
  popover.style.top = `${rect.bottom + 4}px`
  popover.style.left = `${rect.left}px`

  document.body.append(popover)
  colorPopover = popover

  // The click that opened this popover is still bubbling up to
  // document when this handler is attached synchronously - deferring
  // by a tick keeps that same click from immediately closing it back.
  setTimeout(() => {
    document.addEventListener('click', closeColorPopover, { once: true })
  }, 0)
}

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  'auth/invalid-credential': 'E-posta veya sifre hatali.',
  'auth/invalid-email': 'Gecersiz e-posta adresi.',
  'auth/user-not-found': 'Bu e-posta ile kayitli bir hesap bulunamadi.',
  'auth/wrong-password': 'E-posta veya sifre hatali.',
  'auth/email-already-in-use': 'Bu e-posta adresi zaten kullaniliyor.',
  'auth/weak-password': 'Sifre cok zayif, en az 6 karakter olmali.',
  'auth/too-many-requests': 'Cok fazla deneme yapildi, lutfen daha sonra tekrar deneyin.',
  'auth/network-request-failed': 'Aginiza baglanilamadi, internet baglantinizi kontrol edin.',
  'auth/popup-closed-by-user': 'Google giris penceresi kapatildi.'
}

function showError(err: unknown): void {
  const raw = err instanceof Error ? err.message : String(err)
  const code = raw.match(/auth\/[a-z0-9-]+/)?.[0]
  authError.textContent = (code && AUTH_ERROR_MESSAGES[code]) ?? 'Bir hata olustu, lutfen tekrar deneyin.'
}

loginForm.addEventListener('submit', (event) => {
  event.preventDefault()
  authError.textContent = ''
  window.notesWidget.auth.signIn(emailInput.value, passwordInput.value).catch(showError)
})

signupBtn.addEventListener('click', () => {
  authError.textContent = ''
  const username = usernameInput.value.trim()
  if (!username) {
    authError.textContent = 'Kayit icin kullanici adi gerekli'
    return
  }
  window.notesWidget.auth.signUp(emailInput.value, passwordInput.value, username).catch(showError)
})

googleBtn.addEventListener('click', () => {
  authError.textContent = ''
  window.notesWidget.auth.signInGoogle().catch(showError)
})

signoutBtn.addEventListener('click', () => {
  window.notesWidget.auth.signOut().catch(showError)
})

addNoteForm.addEventListener('submit', (event) => {
  event.preventDefault()
  const text = noteTextInput.value.trim()
  if (!text) return
  const maxOrder = currentNotes.reduce((max, n) => Math.max(max, n.order), 0)
  window.notesWidget.notes
    .add(text, maxOrder + 1)
    .then(() => {
      noteTextInput.value = ''
    })
    .catch(showError)
})

// Drag-and-drop reordering writes back `order` values computed from the
// displayed array's index. That's only safe to do against the full,
// unfiltered note list - if a search filter hid some notes, the visible
// index would clobber their relative order too. So dragging is only wired
// up (draggable="true" + a droppable notesList) when the search box is
// empty and `notes` here is exactly `currentNotes`.
function renderList(notes: Note[], reorderable: boolean): void {
  notesList.innerHTML = ''

  if (notes.length === 0 && searchQuery.trim()) {
    const empty = document.createElement('li')
    empty.className = 'empty'
    empty.textContent = 'Sonuc bulunamadi'
    notesList.append(empty)
    return
  }

  for (const note of notes) {
    const li = document.createElement('li')
    if (note.done) li.classList.add('done')
    li.draggable = reorderable
    li.style.borderLeftColor = note.color || 'transparent'

    li.addEventListener('dragstart', () => {
      draggedNoteId = note.id
      li.classList.add('dragging')
    })
    li.addEventListener('dragend', () => {
      draggedNoteId = null
      li.classList.remove('dragging')
    })
    li.addEventListener('dragover', (e) => {
      e.preventDefault()
    })
    li.addEventListener('dragenter', () => {
      if (draggedNoteId && draggedNoteId !== note.id) li.classList.add('drag-over')
    })
    li.addEventListener('dragleave', () => {
      li.classList.remove('drag-over')
    })
    li.addEventListener('drop', (e) => {
      e.preventDefault()
      li.classList.remove('drag-over')
      reorderNotes(draggedNoteId, note.id)
    })

    const checkbox = document.createElement('input')
    checkbox.type = 'checkbox'
    checkbox.checked = note.done
    checkbox.addEventListener('change', () => {
      window.notesWidget.notes.update(note.id, { done: checkbox.checked }).catch(showError)
    })

    const textSpan = document.createElement('span')
    textSpan.className = 'text'
    textSpan.textContent = note.text
    textSpan.addEventListener('click', () => {
      const input = document.createElement('input')
      input.type = 'text'
      input.value = note.text
      textSpan.replaceWith(input)
      input.focus()
      const save = (): void => {
        const value = input.value.trim()
        if (value && value !== note.text) {
          window.notesWidget.notes.update(note.id, { text: value }).catch(showError)
        }
      }
      input.addEventListener('blur', save)
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') input.blur()
      })
    })

    const colorBtn = document.createElement('button')
    colorBtn.type = 'button'
    colorBtn.className = 'color-swatch'
    colorBtn.title = 'Renk sec'
    colorBtn.style.background = note.color || 'transparent'
    colorBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      openColorPopover(colorBtn, note)
    })

    const pinBtn = document.createElement('button')
    pinBtn.textContent = note.pinned ? '★ PIN' : 'PIN'
    pinBtn.type = 'button'
    if (note.pinned) pinBtn.classList.add('pin-active')
    pinBtn.addEventListener('click', () => {
      window.notesWidget.notes.update(note.id, { pinned: !note.pinned }).catch(showError)
    })

    const deleteBtn = document.createElement('button')
    deleteBtn.textContent = 'Sil'
    deleteBtn.type = 'button'
    deleteBtn.addEventListener('click', () => {
      window.notesWidget.notes.delete(note.id).catch(showError)
    })

    li.append(checkbox, colorBtn, textSpan, pinBtn, deleteBtn)
    notesList.append(li)
  }
}

function reorderNotes(draggedId: string | null, targetId: string): void {
  if (!draggedId || draggedId === targetId) return

  const reordered = [...currentNotes]
  const fromIndex = reordered.findIndex((n) => n.id === draggedId)
  const toIndex = reordered.findIndex((n) => n.id === targetId)
  if (fromIndex === -1 || toIndex === -1) return

  const [moved] = reordered.splice(fromIndex, 1)
  reordered.splice(toIndex, 0, moved)

  reordered.forEach((note, index) => {
    if (note.order !== index) {
      window.notesWidget.notes.update(note.id, { order: index }).catch(showError)
    }
  })
}

function applyFilterAndRender(): void {
  const q = searchQuery.trim().toLowerCase()
  const filtered = q ? currentNotes.filter((n) => n.text.toLowerCase().includes(q)) : currentNotes
  renderList(filtered, q === '')
}

function renderNotes(notes: Note[]): void {
  currentNotes = notes
  applyFilterAndRender()
}

searchInput.addEventListener('input', () => {
  searchQuery = searchInput.value
  applyFilterAndRender()
})

window.notesWidget.auth.onChanged((state) => {
  authError.textContent = ''
  if (state.status === 'signedIn') {
    loginView.hidden = true
    notesView.hidden = false
    userNameEl.textContent = state.user.displayName ?? state.user.email ?? state.user.uid
    userEmailEl.textContent = state.user.email ?? ''
  } else {
    loginView.hidden = false
    notesView.hidden = true
    searchQuery = ''
    searchInput.value = ''
    renderNotes([])
  }
})

window.notesWidget.notes.onChanged((notes) => {
  renderNotes(notes)
})
