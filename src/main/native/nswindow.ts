import koffi from 'koffi'

// Objective-C message sending is one C symbol (objc_msgSend) reused for
// every method call - the compiler normally picks the right argument/
// return marshaling at the call site from the method's real signature,
// but there's no such context in raw FFI. Each concrete shape actually
// needed here is declared separately against that same symbol instead.
const objc = koffi.load('/usr/lib/libobjc.A.dylib')
const coreGraphics = koffi.load('/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics')

const sel_registerName = objc.func('sel_registerName', 'void *', ['str'])
// id objc_msgSend(id self, SEL op) - e.g. `nsView.window`
const msgSendGet = objc.func('objc_msgSend', 'void *', ['void *', 'void *'])
// void objc_msgSend(id self, SEL op, NSInteger arg) - e.g. `nsWindow.setLevel(_:)`
const msgSendSetLevel = objc.func('objc_msgSend', 'void', ['void *', 'void *', 'long long'])

const CGWindowLevelForKey = coreGraphics.func('CGWindowLevelForKey', 'int32', ['int32'])

// Index into Apple's window-level lookup table, not an actual level
// value - Apple's own headers only ever expose this constant as a macro
// around CGWindowLevelForKey(kCGDesktopIconWindowLevelKey), specifically
// because the real numbers are undocumented and allowed to change
// between OS releases. Always resolve it at runtime instead of
// hardcoding a level number.
const kCGDesktopIconWindowLevelKey = 18

const selWindow = sel_registerName('window')
const selSetLevel = sel_registerName('setLevel:')

/**
 * Pins an Electron BrowserWindow's underlying NSWindow one level above
 * the Finder desktop icons/wallpaper - the macOS equivalent of the
 * Windows WorkerW reparenting trick (native/workerw.ts). Cocoa has no
 * "attach behind normal windows" API; ordinary Electron options
 * (alwaysOnTop, window level names like 'floating'/'normal') only pick
 * from a handful of standard tiers and otherwise order same-level
 * windows by activation history, which doesn't hold this panel reliably
 * below regular app windows. Setting the raw NSWindow level directly is
 * the only way to place it structurally between the desktop and every
 * normal window regardless of activation order.
 *
 * `nsViewHandle` is the Buffer from BrowserWindow.getNativeWindowHandle()
 * - an NSView*, not an NSWindow*, on macOS.
 */
export function pinAboveDesktopIcons(nsViewHandle: Buffer): void {
  const nsView = nsViewHandle.readBigUInt64LE(0)
  const nsWindow = msgSendGet(nsView, selWindow)
  if (!nsWindow) return

  const desktopIconLevel = CGWindowLevelForKey(kCGDesktopIconWindowLevelKey)
  msgSendSetLevel(nsWindow, selSetLevel, BigInt(desktopIconLevel) + 1n)
}
