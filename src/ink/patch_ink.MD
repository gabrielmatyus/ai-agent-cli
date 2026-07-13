/**
 * Ink Mouse Support Patch
 *
 * Patches Ink v7.1.0 to add SGR mouse protocol support.
 * Needed for scroll wheel events (mouse buttons 64/65) in the terminal.
 *
 * The patches are now managed automatically via `patch-package`:
 *   - File: patches/ink+7.1.0.patch
 *   - Applied after every `npm install` via the `postinstall` script
 *
 * Patched files in node_modules/ink/build/:
 *
 * 1. parse-keypress.js — adds SGR mouse sequence parsing
 *    - Matches \x1b[<button;x;y{M|m} sequences
 *    - Returns { name: 'mouse', mouse: { button, x, y, pressed } }
 *
 * 2. hooks/use-input.js — passes mouse data through to the key object
 *    - Adds `mouse: keypress.mouse` to the key object
 *    - Sets `input = ''` when keypress.name === 'mouse'
 *
 * To regenerate the patch after an Ink version upgrade:
 *   1. npm install ink@new-version
 *   2. npx patch-package ink
 *
 * Reference (SGR mouse protocol):
 *   https://invisible-island.net/xterm/ctlseqs/ctlseqs.html#h3-Extended-mouse-tracking
 */