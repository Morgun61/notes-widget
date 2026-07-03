export const CommandChannels = {
  authSignIn: 'cmd:auth:signIn',
  authSignUp: 'cmd:auth:signUp',
  authSignInGoogle: 'cmd:auth:signInGoogle',
  authSignOut: 'cmd:auth:signOut',
  notesAdd: 'cmd:notes:add',
  notesUpdate: 'cmd:notes:update',
  notesDelete: 'cmd:notes:delete'
} as const

export const DataEventChannels = {
  authChanged: 'data:authChanged',
  notesChanged: 'data:notesChanged'
} as const

export const InternalChannels = {
  dataEvent: 'data:event',
  dataCommand: 'data:command',
  dataCommandReply: 'data:commandReply'
} as const

export const OverlayChannels = {
  setInteractive: 'overlay:setInteractive'
} as const
