import { initializeApp } from 'firebase/app'
import {
  createUserWithEmailAndPassword,
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut
} from 'firebase/auth'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  Firestore,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc
} from 'firebase/firestore'
import { CommandChannels, DataEventChannels } from '../../shared/ipc-channels'
import type { AuthState, Note } from '../../shared/types'

export {}

interface DataBridgeApi {
  emit: (channel: string, payload: unknown) => void
  onCommand: (handler: (channel: string, payload: unknown) => Promise<unknown>) => void
}

declare global {
  interface Window {
    dataBridge: DataBridgeApi
  }
}

const firebaseConfig = {
  apiKey: 'AIzaSyDCq3dLKtD3Mr_ZSvqMjRmuIs8QxW7nquk',
  authDomain: 'notlar-862ad.firebaseapp.com',
  projectId: 'notlar-862ad',
  storageBucket: 'notlar-862ad.firebasestorage.app',
  messagingSenderId: '947584139996',
  appId: '1:947584139996:web:65214fbe880262174caa19'
}

const app = initializeApp(firebaseConfig)
const auth = getAuth(app)
const db: Firestore = getFirestore(app)

let unsubscribeNotes: (() => void) | null = null

function toMillis(value: unknown): number {
  return value instanceof Timestamp ? value.toMillis() : 0
}

function toNote(id: string, data: Record<string, unknown>): Note {
  return {
    id,
    text: String(data.text ?? ''),
    done: Boolean(data.done),
    pinned: Boolean(data.pinned),
    order: Number(data.order ?? 0),
    createdAt: toMillis(data.createdAt),
    updatedAt: toMillis(data.updatedAt)
  }
}

onAuthStateChanged(auth, (user) => {
  unsubscribeNotes?.()
  unsubscribeNotes = null

  if (!user) {
    const state: AuthState = { status: 'signedOut' }
    window.dataBridge.emit(DataEventChannels.authChanged, state)
    window.dataBridge.emit(DataEventChannels.notesChanged, [] as Note[])
    return
  }

  const state: AuthState = {
    status: 'signedIn',
    user: { uid: user.uid, email: user.email, displayName: user.displayName }
  }
  window.dataBridge.emit(DataEventChannels.authChanged, state)

  const notesQuery = query(
    collection(db, 'users', user.uid, 'notes'),
    orderBy('pinned', 'desc'),
    orderBy('order', 'asc')
  )
  unsubscribeNotes = onSnapshot(
    notesQuery,
    (snapshot) => {
      const notes = snapshot.docs.map((docSnap) => toNote(docSnap.id, docSnap.data()))
      window.dataBridge.emit(DataEventChannels.notesChanged, notes)
    },
    (error) => {
      console.error('notes onSnapshot error:', error)
    }
  )
})

function requireUid(): string {
  const uid = auth.currentUser?.uid
  if (!uid) throw new Error('Not signed in')
  return uid
}

window.dataBridge.onCommand(async (channel, payload) => {
  switch (channel) {
    case CommandChannels.authSignIn: {
      const { email, password } = payload as { email: string; password: string }
      await signInWithEmailAndPassword(auth, email, password)
      return null
    }
    case CommandChannels.authSignUp: {
      const { email, password } = payload as { email: string; password: string }
      await createUserWithEmailAndPassword(auth, email, password)
      return null
    }
    case CommandChannels.authSignInGoogle: {
      await signInWithPopup(auth, new GoogleAuthProvider())
      return null
    }
    case CommandChannels.authSignOut: {
      await signOut(auth)
      return null
    }
    case CommandChannels.notesAdd: {
      const { text, order } = payload as { text: string; order: number }
      await addDoc(collection(db, 'users', requireUid(), 'notes'), {
        text,
        done: false,
        pinned: false,
        order,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      })
      return null
    }
    case CommandChannels.notesUpdate: {
      const { id, ...fields } = payload as { id: string } & Partial<
        Pick<Note, 'text' | 'done' | 'pinned' | 'order'>
      >
      await updateDoc(doc(db, 'users', requireUid(), 'notes', id), {
        ...fields,
        updatedAt: serverTimestamp()
      })
      return null
    }
    case CommandChannels.notesDelete: {
      const { id } = payload as { id: string }
      await deleteDoc(doc(db, 'users', requireUid(), 'notes', id))
      return null
    }
    default:
      throw new Error(`Unknown command channel: ${channel}`)
  }
})
