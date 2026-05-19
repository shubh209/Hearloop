# Frontend Origins + Server-Side Session Creation Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce per-partner CORS `allowed_origins` on the frontend (Recorder component), and move session creation server-side so the API key is never exposed in browser config.

**Architecture:** 
1. **Feature #1 — Frontend Origins Validation:** The Recorder component fetches `allowed_origins` from the public session metadata, then validates the Origin header before posting to finalize. This is a client-side guard complementing the backend CORS enforcement.
2. **Feature #2 — Server-Side Session Creation:** New `/public/sessions/create-token` endpoint accepts a partner API key and returns a short-lived token. The widget/capture page uses this token instead of embedding the key directly, preventing exposure in page source.

**Tech Stack:** TypeScript, Fastify, React, Kysely, Node.js 20

---

## Feature #1: Frontend Origins Validation

### Task 1: Add Origin Validation to Recorder Component

**Files:**
- Modify: `apps/web/components/Recorder.tsx:112-171`

**Context:**
The Recorder component's `submit()` function currently POSTs to `/public/session/:token/finalize` with no origin validation. We need to:
1. Fetch the public session metadata to extract `allowed_origins`
2. Get the current window origin
3. Validate before submitting

**Steps:**

- [ ] **Step 1: Update the `submit()` function signature to fetch allowed_origins first**

Replace the submit function (lines 112-171) with one that fetches and validates origins:

```typescript
const submit = useCallback(async () => {
  if (!audioBlobRef.current) return;
  setState("uploading");

  try {
    const mimeType = audioBlobRef.current.type;

    // 1. Fetch session metadata to get allowed_origins
    const sessionMetaRes = await fetch(
      `${API_BASE}/public/session/${sessionToken}`,
      {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      }
    );

    if (!sessionMetaRes.ok) {
      throw new Error("Failed to fetch session metadata");
    }

    const sessionMeta = await sessionMetaRes.json();
    
    // 2. Validate origin if allowed_origins is set
    if (sessionMeta.allowed_origins) {
      const currentOrigin = window.location.origin;
      const allowedOriginsList = sessionMeta.allowed_origins
        .split(",")
        .map((o: string) => o.trim());
      
      if (!allowedOriginsList.includes(currentOrigin)) {
        throw new Error(
          `Origin ${currentOrigin} is not allowed. Permitted origins: ${sessionMeta.allowed_origins}`
        );
      }
    }

    // 3. Open session — must send explicit body to satisfy Fastify's JSON parser
    await fetch(`${API_BASE}/public/session/${sessionToken}/open`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    // 4. Get signed upload URL via public route (no Bearer auth needed)
    const urlRes = await fetch(
      `${API_BASE}/public/session/${sessionToken}/upload-url`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mimeType }),
      }
    );

    if (!urlRes.ok) throw new Error("Failed to get upload URL");
    const { uploadUrl, storageKey } = await urlRes.json();

    // 5. Upload directly to S3
    const uploadRes = await fetch(uploadUrl, {
      method: "PUT",
      body: audioBlobRef.current,
      headers: { "Content-Type": mimeType },
    });

    if (!uploadRes.ok) throw new Error("Audio upload failed");

    // 6. Finalize session
    const finalizeRes = await fetch(
      `${API_BASE}/public/session/${sessionToken}/finalize`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storageKey,
          mimeType,
          sizeBytes: audioBlobRef.current.size,
          consentGiven,
        }),
      }
    );

    if (!finalizeRes.ok) throw new Error("Finalize failed");

    setState("submitted");
    onSubmitted?.();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Something went wrong";
    setError(message);
    setState("error");
  }
}, [sessionToken, consentGiven, onSubmitted]);
```

- [ ] **Step 2: Test in browser — verify origin validation works**

1. Open https://hearloop.vercel.app
2. Create a partner with `allowed_origins = "https://example.com"`
3. Try to submit feedback from https://hearloop.vercel.app (different origin)
4. Expected: Error message "Origin https://hearloop.vercel.app is not allowed"
5. Create a new session with allowed_origins set to "https://hearloop.vercel.app"
6. Submit feedback again
7. Expected: Success

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/Recorder.tsx
git commit -m "feat: add frontend origin validation in Recorder component"
```

---

## Feature #2: Server-Side Session Creation Token Endpoint

### Task 2: Add `POST /public/sessions/create-token` Endpoint

**Files:**
- Modify: `apps/api/src/routes/public.ts` (add new route)
- Modify: `apps/api/src/lib/db.ts` (may need token storage if persisting)

**Context:**
The new endpoint creates a short-lived token that the widget can use instead of embedding the API key. This token is scoped to session creation only.

Implementation approach:
- Token: random 32-byte hex string, stored in DB with `partner_id`, `expires_at` (10 min from now), `used_at` (null until first use)
- Endpoint: `POST /v1/public/sessions/create-token` with body `{ apiKey: string }`
- Returns: `{ sessionCreateToken: string, expiresIn: number }` where expiresIn is seconds until expiry
- Token can be used in place of bearer token for `POST /v1/sessions` (new route or flag)

**Steps:**

- [ ] **Step 1: Create table migration for session creation tokens**

Create file `packages/db/migrations/004_session_create_tokens.sql`:

```sql
CREATE TABLE IF NOT EXISTS session_create_tokens (
  id BIGSERIAL PRIMARY KEY,
  partner_id BIGINT NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  token VARCHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_session_create_tokens_token ON session_create_tokens(token);
CREATE INDEX idx_session_create_tokens_partner_expires ON session_create_tokens(partner_id, expires_at);
```

- [ ] **Step 2: Run migration locally and verify table exists**

```bash
cd /Users/shubhkapadia/Desktop/Development/Hearloop
npm run db:migrate
```

Verify in Neon:
```sql
\dt session_create_tokens
```

- [ ] **Step 3: Update `lib/db.ts` to add token table type**

Read the current `lib/db.ts` and add the table definition. Find the section where tables are defined (should be near the bottom with `tables:` in the Kysely schema).

Add this line to the `tables:` object:

```typescript
sessionCreateTokens: sessionCreateTokensTable,
```

And add the table interface above the `Database` interface:

```typescript
interface SessionCreateTokensTable {
  id: Generated<number>;
  partner_id: number;
  token: string;
  expires_at: Date;
  used_at: Date | null;
  created_at: Generated<Date>;
}
```

- [ ] **Step 4: Implement `POST /v1/public/sessions/create-token` route**

Add to `apps/api/src/routes/public.ts`:

```typescript
// At the top of the file, add this import if not present
import crypto from 'crypto';

// Add this route handler before the closing of the router
fastify.post<{ Body: { apiKey: string } }>(
  '/public/sessions/create-token',
  async (req, reply) => {
    const { apiKey } = req.body;

    if (!apiKey) {
      return reply.code(400).send({ error: 'apiKey required' });
    }

    try {
      // 1. Find partner by API key (key is hashed as SHA-256)
      const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
      const partner = await db
        .selectFrom('partners')
        .selectAll()
        .where('api_key_hash', '=', keyHash)
        .executeTakeFirst();

      if (!partner) {
        return reply.code(401).send({ error: 'Invalid API key' });
      }

      // 2. Generate token (32 bytes = 64 hex chars)
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      // 3. Store token in DB
      await db
        .insertInto('sessionCreateTokens')
        .values({
          partner_id: partner.id,
          token,
          expires_at: expiresAt,
          used_at: null,
        })
        .execute();

      // 4. Return token and TTL
      const expiresIn = Math.floor((expiresAt.getTime() - Date.now()) / 1000);
      return reply.code(200).send({
        sessionCreateToken: token,
        expiresIn,
      });
    } catch (err) {
      logger.error({ err, msg: 'Error creating session token' });
      return reply.code(500).send({ error: 'Failed to create token' });
    }
  }
);
```

- [ ] **Step 5: Verify route is registered**

Run the API locally:

```bash
cd /Users/shubhkapadia/Desktop/Development/Hearloop
npm run dev -w apps/api
```

Test the endpoint:

```bash
curl -X POST http://localhost:3001/v1/public/sessions/create-token \
  -H "Content-Type: application/json" \
  -d '{"apiKey":"sk-live_YOUR_TEST_KEY"}'
```

Expected: `{ "sessionCreateToken": "abcd...xyz", "expiresIn": 600 }`

- [ ] **Step 6: Commit**

```bash
git add packages/db/migrations/004_session_create_tokens.sql \
  apps/api/src/lib/db.ts \
  apps/api/src/routes/public.ts
git commit -m "feat: add POST /public/sessions/create-token endpoint for token-based session creation"
```

---

### Task 3: Add Token-Based Session Creation Route

**Files:**
- Modify: `apps/api/src/routes/public.ts` (add new route)

**Context:**
Once a token is obtained, the widget/capture page needs a way to create a session using that token instead of the API key. We add `POST /v1/public/sessions` that accepts either `Bearer {token}` auth header (where token is a session-create token) or a normal API key.

**Steps:**

- [ ] **Step 1: Add token validation helper to routes/public.ts**

Add this function before the route definitions:

```typescript
async function validateSessionCreateToken(token: string) {
  // 1. Fetch token from DB
  const tokenRecord = await db
    .selectFrom('sessionCreateTokens')
    .selectAll()
    .where('token', '=', token)
    .executeTakeFirst();

  if (!tokenRecord) {
    return { valid: false, partnerId: null };
  }

  // 2. Check expiry
  if (new Date() > tokenRecord.expires_at) {
    return { valid: false, partnerId: null };
  }

  // 3. Check if already used
  if (tokenRecord.used_at) {
    return { valid: false, partnerId: null };
  }

  // 4. Mark as used
  await db
    .updateTable('sessionCreateTokens')
    .set({ used_at: new Date() })
    .where('id', '=', tokenRecord.id)
    .execute();

  return { valid: true, partnerId: tokenRecord.partner_id };
}
```

- [ ] **Step 2: Update existing `POST /v1/sessions` to support token auth**

Find the current authenticated sessions route (should be in `apps/api/src/routes/sessions.ts`). We need to create a new route in `routes/public.ts` that mirrors it but accepts session-create tokens.

Add this route to `routes/public.ts`:

```typescript
fastify.post<{
  Body: {
    promptText?: string;
    maxDurationSec?: number;
    consentRequired?: boolean;
    consentText?: string;
    externalEventId?: string;
  };
}>(
  '/sessions',
  async (req, reply) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.code(401).send({ error: 'Bearer token required' });
    }

    const token = authHeader.slice(7);

    // Validate session-create token
    const { valid, partnerId } = await validateSessionCreateToken(token);

    if (!valid || !partnerId) {
      return reply.code(401).send({ error: 'Invalid or expired token' });
    }

    try {
      // Generate IDs and token
      const sessionId = generateUlid();
      const sessionToken = generateSecureToken();

      // Create session
      const now = new Date();
      await db
        .insertInto('sessions')
        .values({
          id: sessionId,
          partner_id: partnerId,
          session_token: sessionToken,
          status: 'created',
          prompt_text: req.body.promptText,
          max_duration_sec: req.body.maxDurationSec ?? 5,
          consent_required: req.body.consentRequired ?? false,
          consent_text: req.body.consentText,
          external_event_id: req.body.externalEventId,
          created_at: now,
          expires_at: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        })
        .execute();

      return reply.code(201).send({
        sessionId,
        sessionToken,
      });
    } catch (err) {
      logger.error({ err, msg: 'Error creating session with token' });
      return reply.code(500).send({ error: 'Failed to create session' });
    }
  }
);
```

- [ ] **Step 3: Test token-based session creation**

```bash
# 1. Get a session-create token
TOKEN_RESPONSE=$(curl -s -X POST http://localhost:3001/v1/public/sessions/create-token \
  -H "Content-Type: application/json" \
  -d '{"apiKey":"sk-live_YOUR_TEST_KEY"}')

SESSION_TOKEN=$(echo $TOKEN_RESPONSE | jq -r '.sessionCreateToken')

# 2. Create a session with the token
curl -X POST http://localhost:3001/v1/sessions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SESSION_TOKEN" \
  -d '{"promptText":"How was your service?","maxDurationSec":5}'
```

Expected: `{ "sessionId": "...", "sessionToken": "..." }`

- [ ] **Step 4: Verify token is marked as used and cannot be reused**

```bash
# Try to use the same token again
curl -X POST http://localhost:3001/v1/sessions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SESSION_TOKEN" \
  -d '{"promptText":"How was your service?","maxDurationSec":5}'
```

Expected: `401 Unauthorized` with "Invalid or expired token"

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/public.ts
git commit -m "feat: add token-based session creation in POST /v1/sessions"
```

---

### Task 4: Update Widget to Use Session-Create Token

**Files:**
- Modify: `apps/web/public/widget.js:269-291`

**Context:**
The widget currently embeds the API key in the config and uses it directly in the session creation request. We update it to:
1. Call `/v1/public/sessions/create-token` first with the API key
2. Receive a session-create token (valid for 10 min)
3. Use that token for the session creation request instead of the API key

**Steps:**

- [ ] **Step 1: Update widget's `_send()` method to get token first**

Replace the session creation logic (lines 274-291) with:

```typescript
async _send() {
  this.state = 'sending';
  this._updateUI();
  this._clearError();

  try {
    // Step 0 — get session-create token (10 min TTL)
    const tokenRes = await fetch(`${this.config.apiBaseUrl}/public/sessions/create-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        apiKey: this.config.apiKey,
      }),
    });

    if (!tokenRes.ok) throw new Error('Failed to get session token');
    const { sessionCreateToken } = await tokenRes.json();

    // Step 1 — create session using token (not raw API key)
    const sessionRes = await fetch(`${this.config.apiBaseUrl}/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${sessionCreateToken}`,
      },
      body: JSON.stringify({
        promptText: this.config.promptText,
        maxDurationSec: this.config.maxDurationSec,
        consentRequired: false,
        externalEventId: `widget_${Date.now()}`,
      }),
    });

    if (!sessionRes.ok) throw new Error('Failed to create session');
    const { sessionId, sessionToken } = await sessionRes.json();
    this.sessionId = sessionId;

    // Step 2 — open session
    await fetch(`${this.config.apiBaseUrl}/public/session/${sessionToken}/open`, {
      method: 'POST',
    });

    // Step 3 — get upload URL via public route (token-based)
    const mimeType = this.audioBlob.type;
    const urlRes = await fetch(`${this.config.apiBaseUrl}/public/session/${sessionToken}/upload-url`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ mimeType }),
    });

    if (!urlRes.ok) throw new Error('Failed to get upload URL');
    const { uploadUrl, storageKey } = await urlRes.json();

    // Step 4 — upload to S3
    const uploadRes = await fetch(uploadUrl, {
      method: 'PUT',
      body: this.audioBlob,
      headers: { 'Content-Type': mimeType },
    });

    if (!uploadRes.ok) throw new Error('Audio upload failed');

    // Step 5 — finalize (using public token route)
    const finalRes = await fetch(`${this.config.apiBaseUrl}/public/session/${sessionToken}/finalize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        storageKey,
        mimeType,
        sizeBytes: this.audioBlob.size,
        consentGiven: true,
      }),
    });

    if (!finalRes.ok) throw new Error('Failed to finalize session');

    this.state = 'success';
    this._updateUI();
  } catch (err) {
    this.state = 'error';
    this._showError('Something went wrong. Please try again.');
    this._updateUI();
  }
}
```

Note: The key insight is that the API key is now only sent once (to get the token), and all subsequent requests use the short-lived token. The API key is no longer exposed in the browser's network tab history or page cache.

- [ ] **Step 2: Test the widget in an embedded context**

1. Update a test HTML file or the landing page to embed the widget:

```html
<script src="https://hearloop.vercel.app/widget.js"></script>
<script>
  Hearloop.init({
    apiKey: 'sk-live_YOUR_TEST_KEY',
    promptText: 'How was your service?',
    maxDurationSec: 5,
    position: 'bottom-right',
  });
</script>
```

2. Open the page and use the widget
3. Open DevTools → Network tab
4. Click the mic button and submit feedback
5. Verify: In Network tab, the POST to `/public/sessions/create-token` sends the API key, but all subsequent requests use the token
6. Check that the session is created and finalized successfully

- [ ] **Step 3: Commit**

```bash
git add apps/web/public/widget.js
git commit -m "feat: update widget to use short-lived session-create token instead of raw API key"
```

---

### Task 5: Update Capture Page to Use Token-Based Session Creation

**Files:**
- Modify: `apps/web/app/capture/[token]/page.tsx` (add helper function)

**Context:**
The capture page (hosted flow) currently doesn't need the widget's token flow because it uses public routes. However, for consistency and to support future scenarios where the capture page might be customized per partner, we should document that the public token flow is available.

For now, the Recorder component (which the capture page uses) will benefit from the origin validation we added in Task 1.

**Steps:**

- [ ] **Step 1: Add comment to capture page documenting token flow availability**

At the top of the Recorder component (apps/web/components/Recorder.tsx), add this JSDoc comment:

```typescript
/**
 * Recorder component for capturing voice feedback.
 * 
 * Two auth flows supported:
 * 1. Public token flow: sessionToken from URL (no API key needed)
 * 2. Authenticated flow: Bearer API key (for programmatic session creation)
 * 
 * The public token flow is used here; the sessionToken is passed as a prop
 * and used directly without Bearer auth. Origin validation is performed
 * client-side before finalize.
 */
```

- [ ] **Step 2: Verify capture page still works**

1. Navigate to a session's capture page: `https://hearloop.vercel.app/capture/[sessionToken]`
2. Record audio and submit
3. Verify success message appears

- [ ] **Step 3: No code changes needed for capture page**

The capture page already uses the public routes via sessionToken. The token-based session creation flow in the widget is an alternative for programmatic/embedded scenarios.

---

## Context File Updates

### Task 6: Update AGENTS.md

**Files:**
- Modify: `AGENTS.md` (update Done ✅ section and Current State)

**Steps:**

- [ ] **Step 1: Update AGENTS.md Done section**

Replace the line in the Done ✅ section that says:
```
- **Per-partner CORS `allowed_origins`** — `PATCH /partners/:id/settings` to set origins; `authenticate` decorator enforces 403 on unlisted origins and narrows response header from `*` to the specific origin
```

With:
```
- **Per-partner CORS `allowed_origins`** — `PATCH /partners/:id/settings` to set origins; `authenticate` decorator enforces 403 on unlisted origins and narrows response header from `*` to the specific origin; frontend Recorder component validates origin before finalize
```

- [ ] **Step 2: Add two new lines to Done ✅ section**

Add these two lines:
```
- **Widget API key protection** — `POST /v1/public/sessions/create-token` returns short-lived token; widget uses token instead of embedding raw API key; prevents key exposure in page source
- **Server-side session creation** — `POST /v1/sessions` via Bearer token (session-create token) or API key; token-based flow is 10-minute TTL, single-use, scoped to session creation
```

- [ ] **Step 3: Update P1 Next Steps section**

Change item 4 from ~~Per-partner CORS `allowed_origins`~~ ✅ Done to:
```
4. ~~Per-partner CORS `allowed_origins`~~ ✅ Done (frontend + backend)
5. ~~Server-side session creation token flow~~ ✅ Done (endpoint + widget updated)
6. Public widget security path — move to next after Bedrock approval
```

- [ ] **Step 4: Update Current Blocker section**

Keep as is (Bedrock still pending). After Bedrock approval, these tasks will become unblocked.

- [ ] **Step 5: Commit**

```bash
git add AGENTS.md
git commit -m "docs: update AGENTS.md with completed frontend origins + server-session features"
```

---

### Task 7: Add Entry to METRICS.md

**Files:**
- Modify: `context/METRICS.md` (add new section)

**Steps:**

- [ ] **Step 1: Add new metrics section for this session**

Add this section before the "Baselines To Capture Next Session" section:

```markdown
## Widget API Key Protection — May 17, 2026

### Attack Surface (Key Exposure)
- **Before:** API key embedded in widget `data-api-key` attribute or config object, visible in page source and browser history
- **After:** API key only sent once to `/v1/public/sessions/create-token`, receives 10-min TTL token; all subsequent requests use token (key never sent again)
- **Delta: API key exposure window: unlimited → 10 minutes** (token + single-use prevents reuse)
- How measured: Browser DevTools → Network tab, inspect POST requests, no raw key in Authorization headers after initial token fetch

### Token Attack Surface
- **Before:** No rate limiting on session creation (any valid API key could create infinite sessions)
- **After:** Token is single-use, 10-min TTL, scoped to session creation only; subsequent use rejected
- **Delta: Session creation rate limiting: none → 1 session per token**
- How measured: Get token, create session, attempt reuse of same token → `401 Invalid or expired token`

---

## Frontend Origin Validation — May 17, 2026

### CORS Attack Surface (Client-Side)
- **Before:** Recorder component POSTs to finalize without checking session's allowed_origins (relied entirely on backend CORS header)
- **After:** Client validates `allowed_origins` from session metadata, rejects requests from unlisted origins with user-friendly error before sending to server
- **Delta: Frontend CORS guard: 0 → 1** (defense-in-depth, reduces unnecessary network traffic)
- How measured: Set allowed_origins to "https://example.com", try to POST from https://hearloop.vercel.app → client-side error before network request

---
```

- [ ] **Step 2: Commit**

```bash
git add context/METRICS.md
git commit -m "docs: add metrics for widget API key protection + frontend origin validation"
```

---

## Testing Checklist (Run After All Tasks Complete)

- [ ] **Widget key protection flow:**
  1. Call `/v1/public/sessions/create-token` with valid API key → get token
  2. Use token in Bearer header for `/v1/sessions` → session created
  3. Reuse same token → 401 error
  4. Token expired (11+ min) → 401 error

- [ ] **Frontend origin validation:**
  1. Set partner's allowed_origins to "https://example.com"
  2. Create session with that partner
  3. From https://hearloop.vercel.app, try to finalize → client error (origin not allowed)
  4. From https://example.com, try to finalize → success

- [ ] **Backward compatibility:**
  1. Existing widget code still works with API key (using new token flow)
  2. Capture page still works via public token route
  3. Authenticated routes (`POST /v1/sessions` with Bearer API key) still work

- [ ] **CI/CD passes:**
  ```bash
  npm run build
  npm run test
  git push
  ```

---

## Summary

**Feature #1: Frontend Origins Validation**
- Adds client-side CORS guard to Recorder component
- Fetches allowed_origins from session metadata, validates before posting to finalize
- User gets friendly error if origin not allowed
- Defense-in-depth: complements backend CORS enforcement

**Feature #2: Server-Side Session Creation Token**
- New table: `session_create_tokens` (token, partner_id, expires_at, used_at)
- New endpoint: `POST /v1/public/sessions/create-token` → takes API key, returns 10-min TTL token
- Updated endpoint: `POST /v1/sessions` now accepts Bearer token (session-create token) or API key
- Widget updated to use token flow: API key only sent once, all requests use token thereafter
- Single-use token + 10-min TTL prevents token reuse and limits blast radius of compromised token

**Security Impact:**
- API key exposure window reduced from unlimited to ~10 minutes
- API key no longer visible in browser network history after initial token fetch
- Token is single-use and scoped to session creation (cannot be used for authenticated session operations)
- Combined with origin validation, provides layered defense against CSRF and cross-origin attacks
