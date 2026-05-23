---
inclusion: always
---

# Jest Test Patterns — Hearloop

Hard-won rules from debugging test failures in this repo. Read before writing any new test file.

---

## 1. Run jest from the workspace root, not from `apps/api`

`apps/api/package.json` references `node_modules/.bin/jest` relative to itself, but jest is hoisted to the root by npm workspaces. Running `npm test` inside `apps/api` fails with `No such file or directory`.

```bash
# ✅ Always run from repo root
node_modules/.bin/jest --runInBand --rootDir apps/api

# ❌ This fails — no local node_modules/.bin/jest
cd apps/api && npm test
```

---

## 2. Mock paths are relative to the test file, not the module under test

A test in `jobs/__tests__/analyze.test.ts` mocking `lib/logger` must use `../../lib/logger`, not `../lib/logger`.

```
jobs/
  analyze.ts          ← imports "../lib/logger"  (relative to jobs/)
  __tests__/
    analyze.test.ts   ← must mock "../../lib/logger" (relative to __tests__/)
```

```typescript
// ✅ Correct — relative to the test file's location
jest.mock("../../lib/logger", ...);
jest.mock("../../lib/db", ...);
jest.mock("../../lib/cloudwatch", ...);

// ❌ Wrong — resolves to jobs/lib/logger which doesn't exist
jest.mock("../lib/logger", ...);
```

The same rule applies to `import` statements after the mocks.

---

## 3. `jest.mock` factories are hoisted above `const`/`let` declarations

Babel hoists `jest.mock(...)` calls to the very top of the file — above even the first line of your code. Any `const` or `let` variable you declare in the file body is **not yet initialized** when the factory runs.

```typescript
// ❌ BROKEN — mockWarn is in the TDZ when the factory runs
const mockWarn = jest.fn();
jest.mock("../../lib/logger", () => ({
  jobLogger: () => ({ warn: mockWarn }), // ReferenceError: Cannot access 'mockWarn' before initialization
}));
```

**The fix:** use `jest.fn().mockReturnValue({...})` inline inside the factory, then retrieve the instance after import via `mock.results[0].value`.

```typescript
// ✅ Correct — factory is self-contained, no outer variable references
jest.mock("../../lib/logger", () => ({
  jobLogger: jest.fn().mockReturnValue({
    info:  jest.fn(),
    warn:  jest.fn(),
    error: jest.fn(),
  }),
}));

// After imports, grab the exact instance the module under test captured
import { jobLogger } from "../../lib/logger";
const log = (jobLogger as jest.Mock).mock.results[0]?.value as {
  info: jest.Mock; warn: jest.Mock; error: jest.Mock;
};
const mockInfo  = log.info  as jest.Mock;
const mockWarn  = log.warn  as jest.Mock;
const mockError = log.error as jest.Mock;
```

This works because the module under test calls `jobLogger("analyze")` at load time, which is captured in `mock.results[0]`. Your test assertions then operate on the exact same object.

---

## 4. `jest.clearAllMocks()` wipes `mockReturnThis()` — restore it in `beforeEach`

Fluent builder chains (Kysely, etc.) use `mockReturnThis()` so each chained call returns the same mock object. `jest.clearAllMocks()` resets all mock implementations, including `mockReturnThis()`. After `clearAllMocks()`, chain methods return `undefined`, causing the chain to throw mid-execution.

```typescript
const mockSelectChain = {
  innerJoin: jest.fn().mockReturnThis(),
  select:    jest.fn().mockReturnThis(),
  where:     jest.fn().mockReturnThis(),
  executeTakeFirst: jest.fn(),
};

// ✅ Always restore chain mocks in beforeEach after clearAllMocks()
beforeEach(() => {
  jest.clearAllMocks();

  // Must re-apply after clearAllMocks() — these are wiped
  mockSelectChain.innerJoin.mockReturnThis();
  mockSelectChain.select.mockReturnThis();
  mockSelectChain.where.mockReturnThis();
  mockUpdateChain.set.mockReturnThis();
  mockUpdateChain.where.mockReturnThis();

  // Then set up return values
  mockExecuteTakeFirst.mockResolvedValue(null);
  mockExecute.mockResolvedValue([]);
});
```

---

## 5. A single mock can be called multiple times with different return values — sequence them

When the same mock function is called at different points in the code path (e.g., `executeTakeFirst` used for both a partner-context lookup and a session lookup), use `mockResolvedValueOnce` to sequence the responses.

```typescript
// analyze.ts calls executeTakeFirst twice:
//   1. Partner context lookup → null is fine (non-fatal)
//   2. Session lookup in enqueueWebhookDelivery → needs { partner_id } to proceed

// ❌ Wrong — both calls return null, second call short-circuits before enqueueWebhook
mockExecuteTakeFirst.mockResolvedValue(null);

// ✅ Correct — sequence the responses
mockExecuteTakeFirst
  .mockResolvedValueOnce(null)                          // partner context lookup
  .mockResolvedValueOnce({ partner_id: "partner-1" }); // webhook session lookup
```

If you forget this, `enqueueWebhook` will never be called and the assertion `expect(mockEnqueueWebhook).toHaveBeenCalledTimes(1)` will fail silently.

---

## 6. Fire-and-forget `.catch()` handlers need a microtask flush before asserting

`emitBedrockInvocation` is called without `await` in `analyze.ts`. Its `.catch()` handler runs asynchronously. If you assert on `mockWarn` immediately after `await runAnalyzeJob(...)`, the `.catch()` may not have executed yet.

```typescript
await runAnalyzeJob(BASE_PAYLOAD);

// ✅ Flush the microtask queue before asserting on fire-and-forget side effects
await new Promise((r) => setImmediate(r));

expect(mockWarn).toHaveBeenCalledWith(...);
```

---

## 7. Dynamic imports (`await import(...)`) are mocked by the same `jest.mock` call

`analyze.ts` uses `await import("../lib/queue")` inside `enqueueWebhookDelivery`. Jest resolves this to the same absolute path as `jest.mock("../../lib/queue", ...)` in the test. The mock works — no special handling needed. But the mock must be registered before the module under test is imported.

---

## Summary checklist before writing a new test file

- [ ] Test file is in `__tests__/` — all mock paths use one extra `../` vs the module under test
- [ ] `jest.mock` factories are self-contained — no references to outer `const`/`let` variables
- [ ] Logger mock uses `jest.fn().mockReturnValue({...})` inline; instance retrieved via `mock.results[0].value`
- [ ] `beforeEach` restores `mockReturnThis()` on all chain mocks after `jest.clearAllMocks()`
- [ ] Multi-call mocks use `mockResolvedValueOnce` to sequence responses correctly
- [ ] Fire-and-forget assertions flush with `await new Promise((r) => setImmediate(r))`
- [ ] Run tests with `node_modules/.bin/jest --runInBand --rootDir apps/api` from repo root
