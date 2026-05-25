# Requirements Document

## Introduction

`@hearloop/react` is a React SDK package that wraps the Hearloop voice feedback widget into a headless hook and a default UI component. Partners who use React can import `{ HearloopWidget, useHearloop }` instead of embedding a `<script>` tag. The package lives at `packages/react/` inside the existing npm workspaces monorepo, ships CJS + ESM + TypeScript declarations via `tsup`, and treats React as a peer dependency.

The SDK replicates the full 5-step API flow from `widget.js` (get session-create token → create session → open session → upload audio to S3 → finalize) while exposing a clean React surface and keeping the raw API key out of the browser.

## Glossary

- **Hook** (`useHearloop`): A React custom hook that owns all recording and submission state, returning a stable API surface to the caller.
- **Widget** (`HearloopWidget`): A default React component that uses `useHearloop` internally and renders a floating button + panel UI matching the visual style of `widget.js`.
- **HearloopState**: The union type describing the current phase of the recording lifecycle: `idle | recording | recorded | sending | success | error`.
- **UseHearloopOptions**: The configuration object accepted by `useHearloop`.
- **HearloopWidgetProps**: The props accepted by `HearloopWidget`, extending `UseHearloopOptions` with visual overrides.
- **SessionCreateToken**: A short-lived (10-minute TTL), single-use token returned by `POST /v1/public/sessions/create-token`. It is used in place of the raw API key for all subsequent session calls.
- **SessionToken**: A per-session token returned by `POST /v1/public/sessions`, used to open, upload, and finalize that specific session.
- **API**: The Hearloop REST API at `https://18-223-189-193.nip.io/v1`.
- **MediaRecorder**: The browser Web API used to capture microphone audio.
- **AudioBlob**: The `Blob` produced by `MediaRecorder` containing the recorded audio.
- **Partner**: A business that has registered with Hearloop and holds an API key.
- **SDK**: The `@hearloop/react` npm package described in this document.

---

## Requirements

### Requirement 1: Package Structure and Build

**User Story:** As a partner developer, I want to install `@hearloop/react` from npm and import named exports, so that I can integrate Hearloop into my React app without managing a `<script>` tag.

#### Acceptance Criteria

1. THE SDK SHALL be located at `packages/react/` within the existing npm workspaces monorepo.
2. THE SDK SHALL declare `react` and `react-dom` as peer dependencies with a version range of `>=17.0.0`.
3. THE SDK SHALL use `tsup` as its build tool to produce CommonJS, ESM, and TypeScript declaration outputs from a single source.
4. THE SDK SHALL export `useHearloop`, `HearloopWidget`, `HearloopState`, `UseHearloopOptions`, and `HearloopWidgetProps` from its package entry point, and THE build SHALL fail if any of these five exports are missing.
5. WHEN a consumer imports from `@hearloop/react`, THE SDK SHALL resolve to the ESM build in bundler environments and the CJS build in Node.js environments.
6. THE SDK SHALL include a `"use client"` directive at the top of all source files that use React hooks or browser APIs, so that Next.js App Router consumers do not encounter server-component errors.

---

### Requirement 2: Security — API Key Handling

**User Story:** As a partner developer, I want the SDK to never expose my raw API key in the browser, so that my key cannot be scraped from React DevTools or page source.

#### Acceptance Criteria

1. THE SDK SHALL accept either a `sessionCreateToken` (pre-fetched server-side) or an `apiKey` string via `UseHearloopOptions`.
2. WHEN `sessionCreateToken` is provided, THE SDK SHALL use it directly to create a session without making a `create-token` API call.
3. WHEN `apiKey` is provided and `sessionCreateToken` is not, THE SDK SHALL call `POST /v1/public/sessions/create-token` with the `apiKey` to obtain a `SessionCreateToken` before creating a session.
4. THE SDK SHALL document in its README that passing `apiKey` directly is only appropriate for server-side-rendered contexts and that `sessionCreateToken` is the recommended approach for client-rendered apps.
5. IF neither `sessionCreateToken` nor `apiKey` is provided, THEN THE Hook SHALL transition to the `error` state with a descriptive error message without making any network requests.

---

### Requirement 3: `useHearloop` Hook — State Machine

**User Story:** As a partner developer, I want a headless hook that manages the full recording and submission lifecycle, so that I can build a custom UI without reimplementing the API flow.

#### Acceptance Criteria

1. THE Hook SHALL expose a `state` value of type `HearloopState` that begins as `idle` when the hook mounts.
2. WHEN `startRecording` is called in the `idle` or `recorded` state, THE Hook SHALL request microphone access via `navigator.mediaDevices.getUserMedia` and transition to `recording`.
3. WHEN `stopRecording` is called in the `recording` state, THE Hook SHALL stop the `MediaRecorder`, release the microphone stream, and transition to `recorded`.
4. WHILE in the `recording` state, THE Hook SHALL decrement `secondsLeft` by 1 every second and automatically call `stopRecording` when `secondsLeft` reaches 0, transitioning to `recorded`.
5. WHEN `send` is called in the `recorded` state, THE Hook SHALL execute the 5-step API flow (get token if needed → create session → open session → upload audio → finalize) and transition through `sending` to `success` on completion.
6. WHEN `reset` is called in any state, THE Hook SHALL return to `idle`, clear `audioBlob`, clear `error`, and reset `secondsLeft` to `maxDurationSec`.
7. IF microphone access is denied, THEN THE Hook SHALL transition to `error` with the message `"Microphone access denied. Please allow mic access and try again."`.
8. IF any step of the API flow fails, THEN THE Hook SHALL transition to `error` with a descriptive error message and leave `audioBlob` intact so the user can retry.
9. THE Hook SHALL expose `audioBlob` (the recorded `Blob` or `null`), `secondsLeft` (number), and `error` (string or `null`) as part of its return value.
10. WHEN the component using THE Hook unmounts during `recording`, THE Hook SHALL stop the `MediaRecorder` and release the microphone stream to prevent resource leaks.

---

### Requirement 4: `useHearloop` Hook — Configuration

**User Story:** As a partner developer, I want to configure the hook with the same options as `widget.js`, so that I can control prompt text, duration, and API endpoint without forking the logic.

#### Acceptance Criteria

1. THE Hook SHALL accept a `UseHearloopOptions` object with the following fields: `sessionCreateToken` (string, optional), `apiKey` (string, optional), `promptText` (string, optional, default `"How was your experience today?"`), `maxDurationSec` (number, optional, default `5`), and `apiBaseUrl` (string, optional, default `"https://18-223-189-193.nip.io/v1"`).
2. WHEN `maxDurationSec` is provided, THE Hook SHALL use that value as the initial `secondsLeft` and as the auto-stop threshold.
3. WHEN `apiBaseUrl` is provided, THE Hook SHALL use it as the base for all API calls instead of the default.
4. THE Hook SHALL select the audio MIME type as `audio/webm` when supported by the browser, falling back to `audio/mp4`. IF `audio/webm` recording fails at runtime despite browser support, THE Hook SHALL retry using `audio/mp4`.

---

### Requirement 5: `HearloopWidget` Component — Default UI

**User Story:** As a partner developer, I want a drop-in React component that renders the same floating widget UI as `widget.js`, so that I can integrate Hearloop with a single JSX line.

#### Acceptance Criteria

1. THE Widget SHALL render a fixed-position floating action button (FAB) and a collapsible panel, matching the visual design of `widget.js`.
2. THE Widget SHALL accept a `position` prop of `"bottom-right"` (default) or `"bottom-left"` to control FAB placement.
3. THE Widget SHALL accept an `accentColor` prop (string, default `"#1D9E75"`) applied to the FAB background, mic icon background, and send button background.
4. THE Widget SHALL accept all `UseHearloopOptions` fields as props and pass them to `useHearloop` internally.
5. WHEN the FAB is clicked, THE Widget SHALL toggle the panel open or closed with a CSS opacity + translate transition.
6. WHEN `state` is `recording`, THE Widget SHALL display an animated waveform (7 bars with staggered CSS pulse animation) and a countdown timer showing `secondsLeft`.
7. WHEN `state` is `recorded`, THE Widget SHALL enable the "Send feedback" button and display a re-record affordance.
8. WHEN `state` is `sending`, THE Widget SHALL disable the send button and display "Sending…" text.
9. WHEN `state` is `success`, THE Widget SHALL hide the main panel content and display a success screen with a checkmark, title, and "Give more feedback" reset button.
10. WHEN `state` is `error`, THE Widget SHALL display the error message in a styled error banner above the send button.
11. THE Widget SHALL include `aria-label` attributes on the FAB, panel, and mic button for basic accessibility.

---

### Requirement 6: TypeScript Types

**User Story:** As a partner developer using TypeScript, I want fully typed exports, so that my IDE provides autocomplete and type errors catch misconfigurations at compile time.

#### Acceptance Criteria

1. THE SDK SHALL export `HearloopState` as a TypeScript string union type: `"idle" | "recording" | "recorded" | "sending" | "success" | "error"`.
2. THE SDK SHALL export `UseHearloopOptions` as a TypeScript interface with all fields typed and documented via JSDoc.
3. THE SDK SHALL export `HearloopWidgetProps` as a TypeScript interface that extends `UseHearloopOptions` with `position`, `accentColor`, and `className` (optional string) fields.
4. THE SDK SHALL export the return type of `useHearloop` as a named interface `UseHearloopReturn` containing `state`, `startRecording`, `stopRecording`, `send`, `reset`, `audioBlob`, `secondsLeft`, and `error` with their respective types.
5. WHEN a consumer passes an unknown prop to `HearloopWidget`, THE SDK SHALL produce a TypeScript compile error.

---

### Requirement 7: Browser Compatibility and Constraints

**User Story:** As a partner developer, I want clear documentation of browser requirements, so that I can set correct expectations for my users.

#### Acceptance Criteria

1. THE SDK SHALL document that `useHearloop` and `HearloopWidget` require a browser environment with `MediaRecorder` and `navigator.mediaDevices` support.
2. THE SDK SHALL document that server-side rendering (SSR) is not supported and that consumers must render the component client-side only (e.g., using Next.js `dynamic` with `ssr: false`).
3. THE SDK SHALL document that React Native is not supported.
4. IF `MediaRecorder` is not available in the current environment, THEN THE Hook SHALL prevent `startRecording` from executing and immediately transition to `error` with the message `"MediaRecorder is not supported in this browser."` when `startRecording` is called.

---

### Requirement 8: Monorepo Integration

**User Story:** As a maintainer, I want the React SDK to integrate cleanly into the existing Turborepo monorepo, so that it builds alongside `apps/api` and `apps/web` without breaking existing workflows.

#### Acceptance Criteria

1. THE SDK package SHALL be named `@hearloop/react` in its `package.json`.
2. THE SDK SHALL include a `build` script in its `package.json` that runs `tsup`.
3. THE SDK SHALL be included in the root `turbo.json` pipeline so that `turbo run build` builds the SDK alongside other packages.
4. THE SDK SHALL not introduce any runtime dependencies beyond React peer dependencies — all utilities SHALL be implemented inline or sourced from the existing codebase.
5. WHEN `turbo run build` is executed from the monorepo root, THE SDK SHALL produce output in `packages/react/dist/` without errors.
