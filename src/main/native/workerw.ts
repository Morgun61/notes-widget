import koffi from 'koffi'

const user32 = koffi.load('user32.dll')

const FindWindowW = user32.func('__stdcall', 'FindWindowW', 'void *', ['str16', 'str16'])
const SendMessageTimeoutW = user32.func('__stdcall', 'SendMessageTimeoutW', 'uintptr_t', [
  'void *',
  'uint32',
  'void *',
  'void *',
  'uint32',
  'uint32',
  'void *'
])
const FindWindowExW = user32.func('__stdcall', 'FindWindowExW', 'void *', [
  'void *',
  'void *',
  'str16',
  'str16'
])
const GetClassNameW = user32.func(
  'int __stdcall GetClassNameW(void *hWnd, _Out_ char16_t *lpClassName, int nMaxCount)'
)
const SetParent = user32.func('__stdcall', 'SetParent', 'void *', ['void *', 'void *'])
const IsWindow = user32.func('__stdcall', 'IsWindow', 'bool', ['void *'])
// GetParent only reports a parent for WS_CHILD windows; Electron's
// top-level windows aren't WS_CHILD even after SetParent, so GetParent
// stays NULL despite a successful reparent. GetAncestor(GA_PARENT) reads
// the real parent link regardless of window style.
const GetAncestor = user32.func('__stdcall', 'GetAncestor', 'void *', ['void *', 'uint32'])
const GA_PARENT = 1

// SetParent alone updates the raw window-tree link (enough for
// GetAncestor to see it) but DWM/the window manager still treats a
// non-WS_CHILD window as its own top-level composited surface, so it
// keeps rendering above everything else. Promoting it to a real
// WS_CHILD after reparenting is what actually nests it visually behind
// the desktop icons.
// GWL_STYLE is always a 32-bit DWORD, even on 64-bit Windows, so the
// plain (non -Ptr) 32-bit variants are enough here and avoid BigInt
// return-value handling entirely.
const GetWindowLongW = user32.func('__stdcall', 'GetWindowLongW', 'int32', ['void *', 'int'])
const SetWindowLongW = user32.func('__stdcall', 'SetWindowLongW', 'int32', [
  'void *',
  'int',
  'int32'
])
const SetWindowPos = user32.func('__stdcall', 'SetWindowPos', 'bool', [
  'void *',
  'void *',
  'int',
  'int',
  'int',
  'int',
  'uint32'
])
const GWL_STYLE = -16
const GWL_EXSTYLE = -20
const WS_CHILD = 0x40000000
const WS_EX_TOPMOST = 0x00000008
const SWP_NOSIZE = 0x0001
const SWP_NOMOVE = 0x0002
const SWP_NOZORDER = 0x0004
const SWP_FRAMECHANGED = 0x0020
// No z-order change needed: SetParent already inserts the window at the
// TOP of the new parent's children, which puts notes text in front of
// the desktop icons (and still behind normal app windows, since the
// parent itself - Progman/WorkerW - sits low in the global z-order).
const SWP_REFRESH_ONLY = SWP_NOSIZE | SWP_NOMOVE | SWP_NOZORDER | SWP_FRAMECHANGED

const EnumWindowsProc = koffi.proto('bool __stdcall EnumWindowsProc(void *hwnd, void *lparam)')
const EnumWindows = user32.func('__stdcall', 'EnumWindows', 'bool', [
  koffi.pointer(EnumWindowsProc),
  'void *'
])

const WM_SPAWN_WORKER = 0x052c

function getClassName(hwnd: unknown): string {
  const buf = Buffer.alloc(512)
  const len = GetClassNameW(hwnd, buf, 128)
  return koffi.decode(buf, 'char16', len) as string
}

/**
 * Finds the WorkerW window that should host our overlay, following the
 * approach used by Rainmeter/Wallpaper-Engine-style tools:
 * ask Progman to spawn a WorkerW, then locate the top-level window that
 * hosts the desktop icons (SHELLDLL_DefView) and take its next WorkerW
 * sibling. On Windows builds where Progman hosts the icon view directly
 * (no separate sibling WorkerW is created), fall back to reparenting onto
 * Progman itself - this is a documented quirk, not a bug in the search.
 */
function findWorkerW(): unknown | null {
  const progman = FindWindowW('Progman', null)
  if (!progman) return null

  SendMessageTimeoutW(progman, WM_SPAWN_WORKER, null, null, 0, 1000, null)

  let defViewHost: unknown | null = null

  EnumWindows((hwnd: unknown) => {
    const sv = FindWindowExW(hwnd, null, 'SHELLDLL_DefView', null)
    if (sv) {
      defViewHost = hwnd
      return false
    }
    return true
  }, null)

  if (!defViewHost) return null

  const sibling = FindWindowExW(null, defViewHost, 'WorkerW', null)
  if (sibling) return sibling

  // Fallback: this Windows build hosts SHELLDLL_DefView directly under
  // Progman with no separate blank WorkerW sibling.
  return defViewHost
}

/**
 * Reparents an Electron BrowserWindow (given its native HWND buffer, from
 * `win.getNativeWindowHandle()`) behind the desktop icons. Returns the
 * WorkerW handle it attached to (to be re-validated later by a watchdog),
 * or null if no suitable target window could be found.
 */
export function attachToDesktop(hwndBuffer: Buffer): unknown | null {
  const hwnd = hwndBuffer.readBigUInt64LE(0)
  const workerW = findWorkerW()
  if (!workerW) return null

  // SetParent returns the handle of the previous parent on success, or
  // NULL if the reparent actually failed - must check this, not just
  // assume success because a WorkerW candidate was found.
  const previousParent = SetParent(hwnd, workerW)
  if (!previousParent) return null

  const style = GetWindowLongW(hwnd, GWL_STYLE)
  SetWindowLongW(hwnd, GWL_STYLE, style | WS_CHILD)

  // Explicitly strip WS_EX_TOPMOST in case it's still set from
  // creation-time alwaysOnTop - a topmost child window can still get
  // pulled into its own z-band by DWM regardless of parentage.
  const exStyle = GetWindowLongW(hwnd, GWL_EXSTYLE)
  SetWindowLongW(hwnd, GWL_EXSTYLE, exStyle & ~WS_EX_TOPMOST)

  SetWindowPos(hwnd, null, 0, 0, 0, 0, SWP_REFRESH_ONLY)

  return workerW
}

export function isWindowHandleValid(handle: unknown): boolean {
  return Boolean(IsWindow(handle))
}

export function getActualParent(hwndBuffer: Buffer): { handle: unknown; className: string } | null {
  const hwnd = hwndBuffer.readBigUInt64LE(0)
  const parent = GetAncestor(hwnd, GA_PARENT)
  if (!parent) return null
  return { handle: parent, className: getClassName(parent) }
}

export { findWorkerW, getClassName }
