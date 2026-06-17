"use client";

// Internal — not exported from package entry point

/** Options passed when creating a session. */
interface SessionCreateOpts {
  promptText: string;
  maxDurationSec: number;
}

/** Auth credentials — exactly one field must be present when runApiFlow is called. */
export interface ApiAuth {
  sessionCreateToken?: string;
  embedKey?: string;
  /** @deprecated Prefer embedKey in the browser. */
  apiKey?: string;
}

// ---------------------------------------------------------------------------
// Step 1 — Exchange raw API key for a short-lived session-create token
// ---------------------------------------------------------------------------

export async function getSessionCreateToken(
  apiBaseUrl: string,
  key: string,
  kind: "embed" | "secret" = "embed"
): Promise<string> {
  const body =
    kind === "embed" || key.startsWith("pk-live_")
      ? { embedKey: key }
      : { apiKey: key };

  const res = await fetch(`${apiBaseUrl}/public/sessions/create-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error("Failed to get session token. Check your embed key.");
  }

  const data = (await res.json()) as { token?: string; sessionCreateToken?: string };
  const token = data.token ?? data.sessionCreateToken;
  if (!token) {
    throw new Error("Failed to get session token. Check your API key.");
  }
  return token;
}

// ---------------------------------------------------------------------------
// Step 2 — Create a session using the session-create token
// ---------------------------------------------------------------------------

export async function createSession(
  apiBaseUrl: string,
  token: string,
  opts: SessionCreateOpts
): Promise<{ sessionId: string; sessionToken: string }> {
  const res = await fetch(`${apiBaseUrl}/public/sessions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      promptText: opts.promptText,
      maxDurationSec: opts.maxDurationSec,
    }),
  });

  if (!res.ok) {
    throw new Error("Failed to create session.");
  }

  const data = (await res.json()) as { sessionId?: string; sessionToken?: string; id?: string; token?: string };
  const sessionId = data.sessionId ?? data.id;
  const sessionToken = data.sessionToken ?? data.token;

  if (!sessionId || !sessionToken) {
    throw new Error("Failed to create session.");
  }

  return { sessionId, sessionToken };
}

// ---------------------------------------------------------------------------
// Step 3 — Open the session (transitions it to "opened" state)
// ---------------------------------------------------------------------------

export async function openSession(
  apiBaseUrl: string,
  sessionToken: string
): Promise<void> {
  const res = await fetch(`${apiBaseUrl}/public/session/${sessionToken}/open`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });

  if (!res.ok) {
    throw new Error("Failed to open session.");
  }
}

// ---------------------------------------------------------------------------
// Step 4a — Get a signed S3 upload URL
// ---------------------------------------------------------------------------

export async function getUploadUrl(
  apiBaseUrl: string,
  sessionToken: string,
  mimeType: string
): Promise<{ uploadUrl: string; storageKey: string }> {
  const res = await fetch(`${apiBaseUrl}/public/session/${sessionToken}/upload-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mimeType }),
  });

  if (!res.ok) {
    throw new Error("Failed to get upload URL.");
  }

  const data = (await res.json()) as { uploadUrl?: string; storageKey?: string; url?: string; key?: string };
  const uploadUrl = data.uploadUrl ?? data.url;
  const storageKey = data.storageKey ?? data.key;

  if (!uploadUrl || !storageKey) {
    throw new Error("Failed to get upload URL.");
  }

  return { uploadUrl, storageKey };
}

// ---------------------------------------------------------------------------
// Step 4b — Upload the audio blob to S3 via the signed URL
// ---------------------------------------------------------------------------

export async function uploadAudio(
  uploadUrl: string,
  blob: Blob,
  mimeType: string
): Promise<void> {
  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": mimeType },
    body: blob,
  });

  if (!res.ok) {
    throw new Error("Audio upload failed.");
  }
}

// ---------------------------------------------------------------------------
// Step 5 — Finalize the session (triggers the async analysis pipeline)
// ---------------------------------------------------------------------------

export async function finalizeSession(
  apiBaseUrl: string,
  sessionToken: string,
  storageKey: string,
  mimeType: string,
  sizeBytes: number
): Promise<void> {
  const res = await fetch(`${apiBaseUrl}/public/session/${sessionToken}/finalize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ storageKey, mimeType, sizeBytes }),
  });

  if (!res.ok) {
    throw new Error("Failed to finalize session.");
  }
}

// ---------------------------------------------------------------------------
// Orchestrator — runs all 5 steps in sequence
// ---------------------------------------------------------------------------

export async function runApiFlow(
  apiBaseUrl: string,
  auth: ApiAuth,
  blob: Blob,
  mimeType: string,
  opts: SessionCreateOpts
): Promise<void> {
  // Resolve the session-create token
  let sessionCreateToken: string;
  if (auth.sessionCreateToken) {
    sessionCreateToken = auth.sessionCreateToken;
  } else if (auth.embedKey) {
    sessionCreateToken = await getSessionCreateToken(apiBaseUrl, auth.embedKey, "embed");
  } else if (auth.apiKey) {
    sessionCreateToken = await getSessionCreateToken(apiBaseUrl, auth.apiKey, "secret");
  } else {
    throw new Error(
      "No authentication provided. Pass sessionCreateToken or embedKey."
    );
  }

  // Step 2: create session
  const { sessionToken } = await createSession(apiBaseUrl, sessionCreateToken, opts);

  // Step 3: open session
  await openSession(apiBaseUrl, sessionToken);

  // Step 4a: get upload URL
  const { uploadUrl, storageKey } = await getUploadUrl(apiBaseUrl, sessionToken, mimeType);

  // Step 4b: upload audio
  await uploadAudio(uploadUrl, blob, mimeType);

  // Step 5: finalize
  await finalizeSession(apiBaseUrl, sessionToken, storageKey, mimeType, blob.size);
}
