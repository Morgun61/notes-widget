export interface Note {
  id: string
  text: string
  done: boolean
  pinned: boolean
  order: number
  createdAt: number
  updatedAt: number
}

export interface AuthUser {
  uid: string
  email: string | null
  displayName: string | null
}

export type AuthState = { status: 'signedOut' } | { status: 'signedIn'; user: AuthUser }
