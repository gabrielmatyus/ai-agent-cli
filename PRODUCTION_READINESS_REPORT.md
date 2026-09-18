# Production Readiness Report — `ai-agent-cli`

**Date:** 2026-08-29
**Scope:** Full source tree, build/lint/test pipeline, packaging, runtime safety
**Verdict:** 🟢 **PRODUCTION READY** — the entire remediation list is resolved and verified. The suite is green (123/123, 9 suites), the pipeline gate is enforced, the destructive-tool safety blocker (H1) is closed by an in-UI confirmation dialog with task-scoped trust, and the last two follow-ups (H4 pin/verify `ink`, M5 highlight state localization) are now fixed. No open items remain.

## 1. Verified Pipeline Status (commands actually run today)

| Check            | Command                              | Result                                     |
| ---------------- | ------------------------------------ | ------------------------------------------ |
| Type check       | `npm run typecheck` (`tsc --noEmit`) | ✅ PASS                                    |
| Lint             | `npm run lint` (`eslint --cache .`)  | ✅ PASS                                    |
| Unit tests       | `npm test` (jest, ESM)               | ✅ **123/123, 9 suites**                   |
| Build            | `npm run build`                      | ✅ PASS — cleans `dist/` first, then `tsc` |
| Coverage gate    | `jest coverageThreshold`             | ✅ PASS (70/50/65/70)                      |
| Dependency audit | `npm audit`                          | ✅ **0 vulnerabilities**                   |

Coverage is healthy and enforced: App.tsx ~95% statements, Dialog.tsx 100%, overall ~78% statements / 65% branches / 79% functions / 79% lines, and a `coverageThreshold` (statements 70, branches 50, functions 65, lines 70) now fails the suite if coverage drops.

---

## 2. Resolved (verified against the working tree)

### B1. Failing unit tests → pipeline red ✅

The suite is green: **123/123 tests across 9 suites**, including the previously-skipped error-path tests. Runs are stable across repeated executions.

### B2. Streaming advertised but not implemented ✅

`agent()` defaults to `FetchMethod.STREAM`; the SSE path (`stream_response` → `process_stream`) is the production path and is tested (content, reasoning_content, tool_calls, usage). The non-streaming `POST` path remains implemented and tested.

### B3. Git-ignored test fixtures break fresh checkouts ✅

Static fixtures `src/ink/mocks/chunks.ts` and `src/ink/mocks/mock.ts` are tracked in git. Only captured runtime outputs (`chunks_response.txt`, `messages_response.json`) are ignored. A fresh clone has everything tests need.

### B4. Debug `setError()` leftovers in shipped UI ✅

Both debug calls were removed (`setupSelected()` `terminalOffset=…` dump; `setupDimensions()` `Columns=…` dump). The App resize test asserts no debug text appears in the rendered frame.

### B5. Capture writes pollute the source tree on every run ✅

Capture writes (`chunks_response.txt`, `messages_response.json`) are guarded by `process.env.AI_AGENT_CAPTURE === '1'`; off by default. Covered by dedicated tests (off/on).

### H1. Unsandboxed arbitrary command & filesystem mutation ✅

`execute_bash`, `delete_file`, `write_file`, and `rename_file` are now gated by a confirmation step (new module `src/ink/confirmation.ts`):

- Interactive terminals get a compact dialog **overlay** with **Allow**/**Deny** buttons (`ConfirmDialog` in `src/ink/Dialog.tsx`); `→`/`Tab` flips the choice, `Enter` confirms the selected button (default **Deny**), `Esc` denies. No more raw `[y/N]` prompt on stderr, so the streaming layout is never disturbed.
- **Task-scoped trust:** the first explicit approval auto-allows all follow-up destructive calls while the agent finishes the same prompt (trust resets on each new prompt), and resolving a dialog via `Enter` never re-submits the input box (so no duplicate/parallel agent runs can re-prompt).
- The gating is env-driven via `autoDecision()`: `AI_AGENT_CONFIRM=always` auto-allows, `never` auto-denies; otherwise an interactive decision is required and `agent()` injects the UI resolver through `options.confirm` (headless callers without a resolver are denied).
- Non-interactive environments (CI, tests, piped stdin) **deny by default**.
- A denial is returned to the model as a tool result (`User denied: <tool>: <target>`) so the agent can react.
- Internal capture writes bypass the gate via `options.skipConfirmation`.

### H2. `splitLines()` stray `push()` branch ✅

**Finding corrected during the fix:** the line was `if (i === 0 && line.length > leading) result.push()` — `Array.prototype.push()` called with **zero arguments appends nothing** in JavaScript, so the branch was a **no-op**, not an undefined-push. The dead branch has been removed entirely with zero behavior change (rendered output, streaming token continuity, and all 100 tests are byte-identical to before).

### H3. No request timeout / abort ✅

Both `stream_response` and `fetch_response` pass `signal: AbortSignal.timeout(30_000)`. A test verifies the signal is an `AbortSignal` and not pre-aborted.

### H4. Fragile `patch-package` runtime patch for mouse support ✅

`package.json` now pins `"ink": "7.1.0"` exactly (caret removed), so the mouse-support patch can no longer be silently invalidated by a caret-range bump mid-install. Applied automatically via the existing `patch-package` `postinstall` (CI runs it through `npm_config_ignore_scripts: 'false'`). A new `verify:ink-patch` script (`scripts/verify-ink-patch.mjs`) asserts in `node_modules` that ink is exactly `7.1.0` and that both patched markers are present (`mouse: keypress.mouse` in `use-input.js`, the SGR mouse parser `name: 'mouse'` in `parse-keypress.js`); it fails the pipeline otherwise. Wired into CI as a `verify:ink-patch` job in the `lint` stage (MR + default branch).

### M1. Stale build artifacts in `dist/` ✅

`"build": "node -e \"fs.rmSync('dist',{recursive:true,force:true})\" && tsc"` — cleans `dist/` before compiling (cross-platform, works in cmd and POSIX shells).

### M5. Module-level mutable state in `decodeLanguage` ✅

The module globals (`language`/`setLanguage`/`languageSet` in `utils.ts`) and the stream-toggled `decodeLanguage()` are removed. Highlight language is now derived **purely per line** from the message content: `highlightLineLanguages()` splits content into lines, tracks fence open/close on lines containing ` ``` `, and resolves the language from the fence marker (`bash`/`sh`/`shell`, `typescript`/`ts`/`tsx`, `javascript`/`js`/`jsx`, `diff`, unknown markers passed through, unmarked fences default to `plaintext`). `setupBoxAppendToken` computes the active line's highlight incrementally from the box's running fence state (a WeakMap-keyed cache kept in sync by both the streamed-append and rebuild paths) instead of re-scanning all of `box.content` on every chunk, so the mental state can no longer bleed across messages, reasoning vs. content boxes, or rebuilds. The reasoning box and content box highlighting are independent (the old `??`-merged union was a cross-box leak).

### M2. POSIX launcher script bug ✅

`ai-agent-cli.sh` now uses the forward-slash path (`"$SCRIPT_DIR/dist/index.js"`) and the spurious `echo $SCRIPT_DIR` is removed; verified with `bash -n`. (The `.bat` launcher was already correct.)

### M3. Low test coverage of UI/runtime code ✅ (raised **and** threshold enforced)

Added Ink-based tests via `src/__tests__/helpers/ink-render.ts`: `app.test.tsx` (7 tests), `dialog.test.tsx` (4 tests). Coverage: App.tsx ~95%, Dialog.tsx 100%, overall ~79%. `jest.config.ts` now enforces `coverageThreshold` (70/50/65/70).

### M4. Error-handling paths untested ✅

Network-failure and non-OK-response tests are un-skipped and passing.

### M6. No `engines` field ✅

`package.json` now declares `"engines": { "node": ">=20" }`, matching the README requirement.

### M7. `jest-runtime` declared as a runtime dependency ✅

Moved to `devDependencies`; `package-lock.json` re-synced via `npm install`. It is test-tooling only.

### M9. Dependency advisories ✅

`npm audit fix` applied; `npm audit` now reports **0 vulnerabilities** (was 2 high: `brace-expansion`, `js-yaml` in the dev/test toolchain).

### Regression tests added

- `utils.test.ts` — `rebuildTree` reflow: cumulative `from`/order invariants, row-height re-wrapping on width shrink, and `user` items now reflow.
- `agent.test.ts` — capture gate (off/on) and abort-timeout signal assertions.
- `app.test.tsx` — resize test strengthened to assert no debug panel text.
- `confirmation.test.ts` + `tools.test.ts` — destructive-tool gate: default deny (non-interactive), `always`/`never`, `skipConfirmation` bypass, non-gated tools unaffected.
- `app.test.tsx` — timed-stream regression: scrolling up mid-stream then down re-engages auto-scroll (stale-closure scroll-sync fix).
- `utils.test.ts` — per-message code-block highlighting: fenced lines highlighted with the marker language only, fence markers unhighlighted, correct highlight across streamed appends (incl. an unmarked fence defaulting to `plaintext` and `sh` → `bash` synonym), no language leak between messages separated by a user turn, and highlight preserved across `rebuildTree`.
- `package.json` / `scripts/verify-ink-patch.mjs` / `.gitlab-ci.yml` — ink pinned to exact `7.1.0` with a CI patch-presence check (H4).
- `app.test.tsx` — F5 toggles SGR mouse tracking (`\x1b[?1002h`/`l`) between interactive and selection modes so the terminal's native drag-select works; default selection-first via `AI_AGENT_CLI_DISABLE_MOUSE=1`.

---

## 3. Open Items — none

All items from the original audit (B1–B5, H1–H4, M1–M5, M6–M7, M9) are resolved and verified against the working tree.

---

## 4. Remediation Roadmap (all resolved)

| #   | Priority | Action                                                 | Status  |
| --- | -------- | ------------------------------------------------------ | ------- |
| H1  | P0       | Confirmation gate for destructive tools                | ✅ Done |
| H2  | P1       | Remove dead `splitLines()` push branch                 | ✅ Done |
| H3  | P1       | Request timeout / abort                                | ✅ Done |
| H4  | P1       | Pin `ink` to exact `7.1.0`; verify patch applies in CI | ✅ Done |
| M1  | P2       | Clean `dist/` before build                             | ✅ Done |
| M2  | P2       | Fix POSIX launcher script                              | ✅ Done |
| M3  | P2       | Raise UI/runtime test coverage + enforce threshold     | ✅ Done |
| M4  | P2       | Test error-handling paths                              | ✅ Done |
| M5  | P2       | Make highlight language local to the node/message      | ✅ Done |
| M6  | P2       | Declare `engines.node`                                 | ✅ Done |
| M7  | P2       | Move `jest-runtime` to devDependencies                 | ✅ Done |
| M9  | P2       | Audit/dependency advisories                            | ✅ Done |

_S = small (<½ day), M = medium (½–2 days), L = large (>2 days)_

---

## 5. Recommendation

**Ship it.** Every item on the remediation list (B1–B5, H1–H4, M1–M5, M6–M7, M9) is resolved and verified. The pipeline — typecheck, lint, **123/123 tests** across 9 suites with an enforced coverage gate, clean build, `npm audit` clean, and an `ink` patch-presence CI check — is fully green, and the destructive-tool confirmation dialog (H1) closes the last safety blocker.

Non-blocking follow-ups (do not block release): add a self-contained bundle (esbuild/pkg) so consumers don't need a Node toolchain + `patch-package` postinstall, and either finish or remove the experimental Electron packaging.
