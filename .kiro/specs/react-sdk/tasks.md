# Implementation Plan: `@hearloop/react`

## Overview

Build the `@hearloop/react` npm package inside `packages/react/` as six single-responsibility source files, compiled by `tsup` to CJS + ESM + `.d.ts`. The hook owns a strict state machine (idle → recording → recorded → sending → success | error). Eight correctness properties are verified with `fast-check` at 100 iterations each. Tests run from the monorepo root with `node_modules/.bin/jest --runInBand --rootDir packages/react`.

---

## Tasks

- [x] 1. Scaffold `packages/react/` — package manifest, tsconfig, tsup config, jest config, turbo pipeline

  - Create `packages/react/package.json` with:
    - `"name": "@hearloop/react"`, `"version": "0.1.0"`, `"private": false`
    - `peerDependencies`: `react >=17.0.0`, `react-dom >=17.0.0`
    - `devDependencies`: `react`, `react-dom`, `@types/react`, `@types/react-dom`, `tsup`, `typescript`, `jest`, `babel-jest`, `@babel/core`, `@babel/preset-env`, `@babel/preset-typescript`, `@babel/preset-react`, `@types/jest`, `fast-check`, `@testing-library/react`, `@testing-library/jest-dom`
    - `"main": "./dist/index.js"`, `"module": "./dist/index.mjs"`, `"types": "./dist/index.d.ts"`
    - `exports` map with `import` / `require` / `types` keys pointing to `dist/`
    - Scripts: `"build": "tsup"`, `"test": "node_modules/.bin/jest --runInBand"`, `"test:run": "node_modules/.bin/jest --runInBand --passWithNoTests"`
  - Create `packages/react/tsconfig.json` extending root tsconfig with `"jsx": "react-jsx"`, `"strict": true`, `"moduleResolution": "bundler"`
  - Create `packages/react/tsup.config.ts`:
    - `entry: ["src/index.ts"]`, `format: ["cjs", "esm"]`, `dts: true`, `sourcemap: true`, `clean: true`, `external: ["react", "react-dom"]`
  - Create `packages/react/jest.config.js`:
    - `testEnvironment: "jsdom"`, `roots: ["<rootDir>/src"]`, `transform: { "^.+\\.[tj]sx?$": "babel-jest" }`, `setupFilesAfterFramework: ["@testing-library/jest-dom"]`
  - Create `packages/react/babel.config.js` with `@babel/preset-env`, `@babel/preset-typescript`, `@babel/preset-react`
  - Add `"test"` task to root `turbo.json` pipeline: `{ "dependsOn": ["^build"], "outputs": [] }`
  - Verify `packages/react` is picked up by root `package.json` workspaces glob (`"packages/*"`)
  - _Requirements: 1.1, 1.3, 8.1, 8.2, 8.3_

- [x] 2. Implement `src/types.ts` — all exported TypeScript types

  - Add `"use client"` directive as the first line
  - Define and export `HearloopState` as `"idle" | "recording" | "recorded" | "sending" | "success" | "error"`
  - Define and export `UseHearloopOptions` interface with JSDoc on every field:
    - `sessionCreateToken?: string` — preferred auth, pre-fetched server-side
    - `apiKey?: string` — raw key, server-side contexts only
    - `promptText?: string` — default `"How was your experience today?"`
    - `maxDurationSec?: number` — default `5`
    - `apiBaseUrl?: string` — default `"https://18-223-189-193.nip.io/v1"`
  - Define and export `UseHearloopReturn` interface with all 8 fields typed
  - Define and export `HearloopWidgetProps` extending `UseHearloopOptions` with `position?`, `accentColor?`, `className?`
  - No runtime code — types only
  - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [x] 3. Implement `src/api-client.ts` — fetch wrappers for the 5-step API flow

  - Add `"use client"` directive as the first line
  - Implement internal (non-exported) `SessionCreateOpts` interface: `{ promptText: string; maxDurationSec: number }`
  - Implement each step as a separate named async function (not exported from package entry):
    - `getSessionCreateToken(apiBaseUrl, apiKey)` → `Promise<string>` — `POST /public/sessions/create-token`
    - `createSession(apiBaseUrl, token, opts)` → `Promise<{ sessionId: string; sessionToken: string }>` — `POST /public/sessions` with `Authorization: Bearer <token>`
    - `openSession(apiBaseUrl, sessionToken)` → `Promise<void>` — `POST /public/session/:token/open`
    - `getUploadUrl(apiBaseUrl, sessionToken, mimeType)` → `Promise<{ uploadUrl: string; storageKey: string }>` — `POST /public/session/:token/upload-url`
    - `uploadAudio(uploadUrl, blob, mimeType)` → `Promise<void>` — `PUT` to S3 signed URL
    - `finalizeSession(apiBaseUrl, sessionToken, storageKey, mimeType, sizeBytes)` → `Promise<void>` — `POST /public/session/:token/finalize`
  - Implement exported `runApiFlow(apiBaseUrl, auth, blob, mimeType, opts)` that calls steps in sequence; throws with a descriptive message on any non-OK response
  - Auth routing: if `auth.sessionCreateToken` is present use it directly; if only `auth.apiKey` is present call `getSessionCreateToken` first
  - Each step throws a specific error string matching the error table in the design doc
  - _Requirements: 2.2, 2.3, 3.5_

- [x] 4. Implement `src/audio-capture.ts` — MediaRecorder lifecycle helpers

  - Add `"use client"` directive as the first line
  - Implement `selectMimeType(): string`:
    - Returns `"audio/webm"` if `MediaRecorder.isTypeSupported("audio/webm")` is `true`
    - Returns `"audio/mp4"` otherwise
  - Implement `createMediaRecorder(stream: MediaStream, mimeType: string): MediaRecorder`:
    - Constructs `new MediaRecorder(stream, { mimeType })`
    - If construction throws (runtime failure despite `isTypeSupported`), retries with `"audio/mp4"`
  - These functions are internal — not re-exported from `index.ts`
  - _Requirements: 4.4_

- [x] 5. Implement `src/use-hearloop.ts` — state machine hook

  - Add `"use client"` directive as the first line
  - Import `UseHearloopOptions`, `UseHearloopReturn`, `HearloopState` from `./types`
  - Import `runApiFlow` from `./api-client`
  - Import `selectMimeType`, `createMediaRecorder` from `./audio-capture`
  - State machine: use a single `useState<HearloopState>` — all transitions go through `setState`; no ad-hoc state mutations outside the machine
  - Implement `startRecording()`:
    - Guard: if `MediaRecorder` is not available → `setState("error")` with `"MediaRecorder is not supported in this browser."`
    - Call `navigator.mediaDevices.getUserMedia({ audio: true })`; on denial → `setState("error")` with `"Microphone access denied. Please allow mic access and try again."`
    - Call `selectMimeType()` and `createMediaRecorder(stream, mimeType)`
    - Attach `ondataavailable` to accumulate chunks; attach `onstop` to assemble `audioBlob` and transition to `"recorded"`
    - Call `mediaRecorder.start(100)` and `setState("recording")`
    - Start `setInterval` countdown: decrement `secondsLeft` each second; when it reaches `0` call `stopRecording()`
  - Implement `stopRecording()`:
    - `clearInterval` on countdown timer
    - Call `mediaRecorder.stop()` if not inactive
    - Call `stream.getTracks().forEach(t => t.stop())`
  - Implement `send()`:
    - Guard: if neither `sessionCreateToken` nor `apiKey` is present → `setState("error")` with `"No authentication provided. Pass sessionCreateToken or apiKey."` and return without any `fetch` call
    - `setState("sending")`
    - Call `runApiFlow`; on success → `setState("success")`; on any error → `setState("error")` with the error message; **do not clear `audioBlob`** on failure
  - Implement `reset()`: `setState("idle")`, clear `audioBlob`, clear `error`, reset `secondsLeft` to `maxDurationSec ?? 5`
  - `useEffect` cleanup on unmount: stop `MediaRecorder` if recording, release mic stream tracks, clear countdown interval
  - Wrap all action functions in `useCallback` with stable dependency arrays
  - Return all 8 fields of `UseHearloopReturn`
  - _Requirements: 2.5, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 4.1, 4.2, 4.3, 7.4_

- [x] 6. Checkpoint — verify hook compiles and types are correct

  - Run `node_modules/.bin/tsc --noEmit --project packages/react/tsconfig.json` from monorepo root
  - Fix any type errors before proceeding
  - _Requirements: 1.3, 6.1–6.4_

- [x] 7. Implement `src/widget.tsx` — `HearloopWidget` default UI component

  - Add `"use client"` directive as the first line
  - Import `useHearloop` from `./use-hearloop` and types from `./types`
  - Inject a `<style>` tag via `useEffect` (matching the `widget.js` and `Recorder.tsx` inline-style pattern) — no CSS-in-JS library
  - Render a fixed-position FAB button and a collapsible panel `<div role="dialog">`
  - FAB: `aria-label="Open feedback widget"`, positioned via `position` prop (`bottom-right` default, `bottom-left`)
  - Panel open/close: toggle with CSS `opacity` + `translateY` transition (matching `widget.js` animation)
  - State-driven rendering:
    - `idle`: mic button with mic SVG, "Tap to record feedback" label, send button disabled
    - `recording`: animated waveform (7 `<span>` bars with staggered CSS `animation-delay`), countdown `{secondsLeft}s remaining`, send button disabled
    - `recorded`: play SVG on mic button, "Recorded — tap to re-record" label, send button enabled
    - `sending`: send button disabled, text "Sending…"
    - `success`: hide main panel, show success screen with checkmark SVG, "Feedback sent successfully" title, "Give more feedback" reset button
    - `error`: show error banner `<div>` above send button with `error` message text
  - `aria-label` on FAB, panel, and mic button
  - Accept `accentColor` prop (default `"#1D9E75"`) applied to FAB background, mic icon background, send button background via inline `style`
  - Accept `className` prop applied to root wrapper `<div>`
  - Forward all `UseHearloopOptions` fields to `useHearloop` unchanged — no defaulting or mutation in the widget layer
  - SVG icons inlined as JSX (mic, play, check, logo) — no external icon library
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 5.10, 5.11_

- [x] 8. Implement `src/index.ts` — package entry point (re-exports only)

  - Add `"use client"` directive as the first line
  - Re-export types: `export type { HearloopState, UseHearloopOptions, UseHearloopReturn, HearloopWidgetProps } from "./types"`
  - Re-export hook: `export { useHearloop } from "./use-hearloop"`
  - Re-export component: `export { HearloopWidget } from "./widget"`
  - No logic — this file is a barrel only
  - _Requirements: 1.4, 1.5_

- [x] 9. Write tests for `src/audio-capture.ts`

  - Create `src/__tests__/audio-capture.test.ts`
  - Mock paths relative to `__tests__/` (one extra `../` vs the module under test, per `jest-test-patterns.md`)
  - Unit tests:
    - `selectMimeType()` returns `"audio/webm"` when `MediaRecorder.isTypeSupported` returns `true`
    - `selectMimeType()` returns `"audio/mp4"` when `MediaRecorder.isTypeSupported` returns `false`
    - `createMediaRecorder()` retries with `"audio/mp4"` when `new MediaRecorder(stream, { mimeType: "audio/webm" })` throws

  - [x]* 9.1 Write property test for MIME type selection (Property 5)
    - `// Feature: react-sdk, Property 5: MIME type selection is deterministic and exhaustive`
    - Use `fc.boolean()` to simulate `MediaRecorder.isTypeSupported("audio/webm")`
    - Assert result is always a member of `["audio/webm", "audio/mp4"]`
    - Assert `"audio/webm"` iff `isTypeSupported` returned `true`
    - `numRuns: 100`
    - **Property 5: MIME type selection is deterministic and exhaustive**
    - **Validates: Requirements 4.4**

  - _Requirements: 4.4_

- [x] 10. Write tests for `src/api-client.ts`

  - Create `src/__tests__/api-client.test.ts`
  - Mock `global.fetch` with `jest.fn()` — self-contained factory, no outer variable references (per `jest-test-patterns.md` rule 3)
  - Unit tests for each of the 6 step functions:
    - Correct URL construction (verify `fetch` called with expected URL string)
    - Correct `Authorization` header on `createSession` (`Bearer <token>`)
    - Correct `Content-Type: application/json` on JSON body requests
    - `PUT` with raw `Blob` body and `Content-Type: <mimeType>` on `uploadAudio`
    - Each step throws the exact error string from the design doc error table when `response.ok` is `false`
  - Unit test for `runApiFlow` auth routing:
    - When `sessionCreateToken` provided: `create-token` endpoint is never called
    - When only `apiKey` provided: `create-token` endpoint called exactly once
  - Use `mockResolvedValueOnce` to sequence multi-step `fetch` calls (per `jest-test-patterns.md` rule 5)
  - _Requirements: 2.2, 2.3, 3.5_

- [x] 11. Write tests for `src/use-hearloop.ts`

  - Create `src/__tests__/use-hearloop.test.ts`
  - Use `@testing-library/react` `renderHook` and `act`
  - Mock `../api-client` and `../audio-capture` (paths relative to `__tests__/`, per `jest-test-patterns.md` rule 2)
  - Mock `navigator.mediaDevices.getUserMedia` and `MediaRecorder` on `global`
  - Unit tests:
    - Initial state is `"idle"`, `secondsLeft` is `5` (default), `audioBlob` is `null`, `error` is `null`
    - `startRecording()` transitions to `"recording"` on mic grant
    - `startRecording()` transitions to `"error"` on mic denial with correct message
    - `startRecording()` transitions to `"error"` when `MediaRecorder` is not available
    - `stopRecording()` transitions to `"recorded"` and releases mic stream tracks
    - `send()` transitions to `"error"` with correct message when no auth provided, without calling `fetch`
    - `send()` transitions to `"success"` when `runApiFlow` resolves
    - `send()` transitions to `"error"` and preserves `audioBlob` when `runApiFlow` rejects
    - `reset()` from `"error"` returns to `"idle"` with `audioBlob: null`, `error: null`
    - `reset()` from `"success"` returns to `"idle"`
    - Countdown decrements `secondsLeft` and auto-stops at `0` (use `jest.useFakeTimers()`)
    - Unmount during `"recording"` calls `mediaRecorder.stop()` and releases stream tracks

  - [x]* 11.1 Write property test for initial state invariant (Property 1)
    - `// Feature: react-sdk, Property 1: Initial state reflects options defaults`
    - Generate `fc.record({ maxDurationSec: fc.option(fc.integer({ min: 1, max: 60 })), promptText: fc.option(fc.string()) })`
    - Assert `state === "idle"`, `secondsLeft === opts.maxDurationSec ?? 5`, `audioBlob === null`, `error === null`
    - `numRuns: 100`
    - **Property 1: Initial state reflects options defaults**
    - **Validates: Requirements 3.1, 4.1**

  - [x]* 11.2 Write property test for reset invariant (Property 2)
    - `// Feature: react-sdk, Property 2: Reset always restores idle invariant`
    - Generate `fc.constantFrom("idle", "recorded", "error", "success")` and `fc.record({ maxDurationSec: fc.integer({ min: 1, max: 60 }) })`
    - Drive hook to each start state, call `reset()`, assert `state === "idle"`, `audioBlob === null`, `error === null`, `secondsLeft === opts.maxDurationSec`
    - `numRuns: 100`
    - **Property 2: Reset always restores idle invariant**
    - **Validates: Requirements 3.6**

  - [x]* 11.3 Write property test for missing auth error (Property 3)
    - `// Feature: react-sdk, Property 3: Missing auth always produces error without network calls`
    - Generate `fc.record({ promptText: fc.option(fc.string()), maxDurationSec: fc.option(fc.integer({ min: 1, max: 60 })) })` (no auth fields)
    - Spy on `global.fetch`; call `send()`; assert `state === "error"`, `error` is truthy, `fetch` not called
    - `numRuns: 100`
    - **Property 3: Missing auth always produces error without network calls**
    - **Validates: Requirements 2.5**

  - [x]* 11.4 Write property test for auth routing (Property 4)
    - `// Feature: react-sdk, Property 4: Auth routing determined by credential presence`
    - Generate `fc.string({ minLength: 1 })` for `sessionCreateToken`; mock `runApiFlow` to resolve; drive to `recorded` state; call `send()`
    - Assert no call to `create-token` URL when `sessionCreateToken` is present
    - Separate sub-case: generate `fc.string({ minLength: 1 })` for `apiKey` only; assert `create-token` called exactly once
    - `numRuns: 100`
    - **Property 4: Auth routing determined by credential presence**
    - **Validates: Requirements 2.2, 2.3**

  - [x]* 11.5 Write property test for audioBlob preservation on failure (Property 7)
    - `// Feature: react-sdk, Property 7: audioBlob preserved intact through any API failure`
    - Generate `fc.uint8Array({ minLength: 1, maxLength: 1000 })` and `fc.integer({ min: 0, max: 4 })` for which step fails
    - Inject blob into `recorded` state; mock `runApiFlow` to reject; call `send()`
    - Assert `state === "error"` and `audioBlob` is reference-equal to the original blob
    - `numRuns: 100`
    - **Property 7: audioBlob preserved intact through any API failure**
    - **Validates: Requirements 3.8**

  - [x]* 11.6 Write property test for countdown bounds (Property 6)
    - `// Feature: react-sdk, Property 6: Countdown is bounded and triggers auto-stop`
    - Generate `fc.integer({ min: 1, max: 30 })` for `maxDurationSec`; use `jest.useFakeTimers()`; advance timers tick by tick
    - Assert `secondsLeft` never goes below `0`; assert hook transitions to `"recorded"` when `secondsLeft` reaches `0`
    - `numRuns: 100`
    - **Property 6: Countdown is bounded and triggers auto-stop**
    - **Validates: Requirements 3.4, 4.2**

  - _Requirements: 2.5, 3.1–3.10, 4.1, 4.2, 7.4_

- [x] 12. Write tests for `src/widget.tsx`

  - Create `src/__tests__/widget.test.tsx`
  - Mock `../use-hearloop` (path relative to `__tests__/`) — factory returns a controllable stub; no outer variable references (per `jest-test-patterns.md` rule 3)
  - Unit tests for each rendered state:
    - `idle`: FAB renders, send button is disabled, mic label is "Tap to record feedback"
    - `recording`: waveform bars render (7 elements), countdown text visible, send button disabled
    - `recorded`: send button enabled, re-record affordance visible
    - `sending`: send button disabled, text "Sending…"
    - `success`: success screen visible, main panel hidden, "Give more feedback" button present
    - `error`: error banner visible with `error` message text
  - Accessibility: FAB has `aria-label`, panel has `role="dialog"` and `aria-label`, mic button has `aria-label`
  - Unknown prop produces TypeScript error (verified via `tsd` or `@ts-expect-error` annotation in test)

  - [x]* 12.1 Write property test for options forwarding (Property 8)
    - `// Feature: react-sdk, Property 8: Widget forwards all UseHearloopOptions fields unchanged`
    - Generate `fc.record({ promptText: fc.string(), maxDurationSec: fc.integer({ min: 1, max: 60 }), sessionCreateToken: fc.string({ minLength: 1 }) })`
    - Spy on `useHearloop` import; render `<HearloopWidget {...opts} />`; assert spy called with `expect.objectContaining(opts)`
    - `numRuns: 100`
    - **Property 8: Widget forwards all UseHearloopOptions fields unchanged**
    - **Validates: Requirements 5.4**

  - _Requirements: 5.1–5.11_

- [x] 13. Checkpoint — all tests pass

  - Run from monorepo root: `node_modules/.bin/jest --runInBand --rootDir packages/react`
  - All unit tests and property tests must pass with zero failures
  - Fix any failures before proceeding — do not skip or comment out tests
  - _Requirements: all_

- [x] 14. Build the package and verify outputs

  - Run `turbo run build --filter=@hearloop/react` from monorepo root
  - Verify `packages/react/dist/` contains: `index.js` (CJS), `index.mjs` (ESM), `index.d.ts` (declarations), `index.js.map`, `index.mjs.map`
  - Verify the five required exports are present in `index.d.ts`: `useHearloop`, `HearloopWidget`, `HearloopState`, `UseHearloopOptions`, `HearloopWidgetProps`
  - Verify `react` and `react-dom` do not appear in the bundle (they are `external`)
  - _Requirements: 1.3, 1.4, 1.5, 8.2, 8.5_

- [x] 15. Capture bundle size metrics in `context/METRICS.md`

  - Measure and record the following from the monorepo root after a clean build:
    - ESM bundle size (gzipped): `gzip -c packages/react/dist/index.mjs | wc -c`
    - CJS bundle size (gzipped): `gzip -c packages/react/dist/index.js | wc -c`
    - TypeScript declaration size: `wc -c packages/react/dist/index.d.ts`
  - Add an entry to `context/METRICS.md` in the standard format:
    ```
    ## @hearloop/react bundle — [Date]
    - Metric: ESM bundle size (gzipped)
    - Before: N/A (new package)
    - After: X bytes
    - How measured: gzip -c packages/react/dist/index.mjs | wc -c

    - Metric: CJS bundle size (gzipped)
    - After: X bytes
    - How measured: gzip -c packages/react/dist/index.js | wc -c

    - Metric: TypeScript declaration size
    - After: X bytes
    - How measured: wc -c packages/react/dist/index.d.ts
    ```
  - _Requirements: 8.4 (zero runtime deps confirmed by bundle inspection)_

- [x] 16. Final checkpoint — full monorepo build passes

  - Run `turbo run build` from monorepo root
  - Confirm `packages/react` builds without errors alongside `apps/api` and `apps/web`
  - Run `node_modules/.bin/jest --runInBand --rootDir packages/react` one final time to confirm all tests still pass after the full build
  - _Requirements: 8.3, 8.5_

---

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP — the 8 property tests are the `*` sub-tasks
- Mock paths in all test files must use one extra `../` relative to the module under test (e.g., `../../api-client` from `__tests__/`) — see `jest-test-patterns.md`
- `jest.mock` factories must be self-contained with no outer `const`/`let` references — see `jest-test-patterns.md` rule 3
- `jest.clearAllMocks()` in `beforeEach` must be followed by re-applying any `mockReturnThis()` chains — see `jest-test-patterns.md` rule 4
- All 6 source files carry `"use client"` as their first line — required for Next.js App Router compatibility
- `audioBlob` must never be cleared on API failure — the user can retry `send()` without re-recording
- `selectMimeType` in `audio-capture.ts` takes the `isTypeSupported` result as a parameter (not calling `MediaRecorder.isTypeSupported` directly) to make Property 5 testable without DOM mocking
- Property tests use `fast-check` (`fc`) at `numRuns: 100` minimum — same version already in `apps/api/package.json` devDependencies
- Run tests from monorepo root: `node_modules/.bin/jest --runInBand --rootDir packages/react`

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1"] },
    { "wave": 2, "tasks": ["2"] },
    { "wave": 3, "tasks": ["3", "4"] },
    { "wave": 4, "tasks": ["5"] },
    { "wave": 5, "tasks": ["6"] },
    { "wave": 6, "tasks": ["7"] },
    { "wave": 7, "tasks": ["8"] },
    { "wave": 8, "tasks": ["9", "10", "11", "12"] },
    { "wave": 9, "tasks": ["13"] },
    { "wave": 10, "tasks": ["14"] },
    { "wave": 11, "tasks": ["15"] },
    { "wave": 12, "tasks": ["16"] }
  ]
}
```
