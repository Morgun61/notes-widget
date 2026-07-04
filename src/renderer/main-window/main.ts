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
    update: (id: string, fields: Partial<Pick<Note, 'text' | 'done' | 'pinned' | 'order'>>) => Promise<void>
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
const notesList = document.getElementById('notes-list') as HTMLUListElement

let currentNotes: Note[] = []

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

function renderNotes(notes: Note[]): void {
  currentNotes = notes
  notesList.innerHTML = ''

  for (const note of notes) {
    const li = document.createElement('li')
    if (note.done) li.classList.add('done')

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

    li.append(checkbox, textSpan, pinBtn, deleteBtn)
    notesList.append(li)
  }
}

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
    renderNotes([])
  }
})

window.notesWidget.notes.onChanged((notes) => {
  renderNotes(notes)
})
