import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')

function fail(message) {
  console.error(`[verify:ink-patch] FAIL: ${message}`)
  process.exit(1)
}

const inkUiPackage = join(root, 'node_modules', 'ink', 'package.json')
if (!existsSync(inkUiPackage)) {
  fail('ink is not installed')
}
const inkVersion = JSON.parse(readFileSync(inkUiPackage, 'utf8')).version
if (inkVersion !== '7.1.0') {
  fail(`expected ink 7.1.0 but node_modules has ${inkVersion}`)
}

const useInput = join(root, 'node_modules', 'ink', 'build', 'hooks', 'use-input.js')
if (!existsSync(useInput)) {
  fail('ink use-input.js not found')
}
const useInputSrc = readFileSync(useInput, 'utf8')
if (!useInputSrc.includes('mouse: keypress.mouse')) {
  fail('ink mouse support is not patched into use-input.js')
}

const parseKeypress = join(root, 'node_modules', 'ink', 'build', 'parse-keypress.js')
if (!existsSync(parseKeypress)) {
  fail('ink parse-keypress.js not found')
}
const parseKeypressSrc = readFileSync(parseKeypress, 'utf8')
if (!parseKeypressSrc.includes("name: 'mouse'")) {
  fail('ink SGR mouse parser is not patched into parse-keypress.js')
}

console.log('[verify:ink-patch] ink 7.1.0 with mouse patch confirmed')
