/**
 * api-client.test.ts — Unit tests for src/api-client.ts
 *
 * Mock paths are relative to THIS file (__tests__/), so the module under test
 * is at ../../api-client (one extra ../ vs the module's own imports).
 *
 * jest.mock factories are self-contained — no outer const/let references.
 * Multi-step fetch calls use mockResolvedValueOnce to sequence responses.
 */

import {
  getSessionCreateToken,
  createSession,
  openSession,
  getUploadUrl,
  uploadAudio,
  finalizeSession,
  runApiFlow,
} from "../api-client";

const BASE_URL = "https://api.example.com/v1";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal ok Response-like object with a json() method. */
function okResponse(body: unknown = {}): Response {
  return {
    ok: true,
    json: async () => body,
  } as unknown as Response;
}

/** Build a minimal not-ok Response-like object. */
function failResponse(): Response {
  return {
    ok: false,
    json: async () => ({}),
  } as unknown as Response;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  // Replace global.fetch with a fresh jest.fn() before each test.
  // The factory is self-contained — no outer variable references.
  global.fetch = jest.fn();
  jest.clearAllMocks();
  // Re-assign after clearAllMocks so the reference is still a jest.fn()
  global.fetch = jest.fn();
});

// ===========================================================================
// getSessionCreateToken
// ===========================================================================

describe("getSessionCreateToken", () => {
  it("calls POST /public/sessions/create-token with correct URL", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      okResponse({ token: "tok-123" })
    );

    await getSessionCreateToken(BASE_URL, "my-api-key");

    expect(global.fetch).toHaveBeenCalledWith(
      `${BASE_URL}/public/sessions/create-token`,
      expect.objectContaining({ method: "POST" })
    );
  });

  it("sends Content-Type: application/json", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      okResponse({ token: "tok-123" })
    );

    await getSessionCreateToken(BASE_URL, "my-api-key");

    const [, init] = (global.fetch as jest.Mock).mock.calls[0] as [
      string,
      RequestInit
    ];
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/json"
    );
  });

  it("returns the token from the response", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      okResponse({ token: "tok-abc" })
    );

    const result = await getSessionCreateToken(BASE_URL, "key");
    expect(result).toBe("tok-abc");
  });

  it("also accepts sessionCreateToken field in response", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      okResponse({ sessionCreateToken: "tok-xyz" })
    );

    const result = await getSessionCreateToken(BASE_URL, "key");
    expect(result).toBe("tok-xyz");
  });

  it("throws exact error string when response.ok is false", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(failResponse());

    await expect(getSessionCreateToken(BASE_URL, "bad-key")).rejects.toThrow(
      "Failed to get session token. Check your embed key."
    );
  });
});

// ===========================================================================
// createSession
// ===========================================================================

describe("createSession", () => {
  const opts = { promptText: "How was your experience?", maxDurationSec: 5 };

  it("calls POST /public/sessions with correct URL", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      okResponse({ sessionId: "s1", sessionToken: "st1" })
    );

    await createSession(BASE_URL, "bearer-token", opts);

    expect(global.fetch).toHaveBeenCalledWith(
      `${BASE_URL}/public/sessions`,
      expect.objectContaining({ method: "POST" })
    );
  });

  it("sends Authorization: Bearer <token> header", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      okResponse({ sessionId: "s1", sessionToken: "st1" })
    );

    await createSession(BASE_URL, "my-bearer-token", opts);

    const [, init] = (global.fetch as jest.Mock).mock.calls[0] as [
      string,
      RequestInit
    ];
    expect((init.headers as Record<string, string>)["Authorization"]).toBe(
      "Bearer my-bearer-token"
    );
  });

  it("sends Content-Type: application/json", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      okResponse({ sessionId: "s1", sessionToken: "st1" })
    );

    await createSession(BASE_URL, "tok", opts);

    const [, init] = (global.fetch as jest.Mock).mock.calls[0] as [
      string,
      RequestInit
    ];
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/json"
    );
  });

  it("returns sessionId and sessionToken", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      okResponse({ sessionId: "sid", sessionToken: "stok" })
    );

    const result = await createSession(BASE_URL, "tok", opts);
    expect(result).toEqual({ sessionId: "sid", sessionToken: "stok" });
  });

  it("throws exact error string when response.ok is false", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(failResponse());

    await expect(createSession(BASE_URL, "tok", opts)).rejects.toThrow(
      "Failed to create session."
    );
  });
});

// ===========================================================================
// openSession
// ===========================================================================

describe("openSession", () => {
  it("calls POST /public/session/:token/open with correct URL", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(okResponse());

    await openSession(BASE_URL, "session-token-abc");

    expect(global.fetch).toHaveBeenCalledWith(
      `${BASE_URL}/public/session/session-token-abc/open`,
      expect.objectContaining({ method: "POST" })
    );
  });

  it("sends Content-Type: application/json", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(okResponse());

    await openSession(BASE_URL, "stok");

    const [, init] = (global.fetch as jest.Mock).mock.calls[0] as [
      string,
      RequestInit
    ];
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/json"
    );
  });

  it("throws exact error string when response.ok is false", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(failResponse());

    await expect(openSession(BASE_URL, "stok")).rejects.toThrow(
      "Failed to open session."
    );
  });
});

// ===========================================================================
// getUploadUrl
// ===========================================================================

describe("getUploadUrl", () => {
  it("calls POST /public/session/:token/upload-url with correct URL", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      okResponse({ uploadUrl: "https://s3.example.com/upload", storageKey: "key/123" })
    );

    await getUploadUrl(BASE_URL, "stok", "audio/webm");

    expect(global.fetch).toHaveBeenCalledWith(
      `${BASE_URL}/public/session/stok/upload-url`,
      expect.objectContaining({ method: "POST" })
    );
  });

  it("sends Content-Type: application/json", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      okResponse({ uploadUrl: "https://s3.example.com/upload", storageKey: "key/123" })
    );

    await getUploadUrl(BASE_URL, "stok", "audio/webm");

    const [, init] = (global.fetch as jest.Mock).mock.calls[0] as [
      string,
      RequestInit
    ];
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/json"
    );
  });

  it("returns uploadUrl and storageKey", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      okResponse({ uploadUrl: "https://s3.example.com/upload", storageKey: "key/abc" })
    );

    const result = await getUploadUrl(BASE_URL, "stok", "audio/webm");
    expect(result).toEqual({
      uploadUrl: "https://s3.example.com/upload",
      storageKey: "key/abc",
    });
  });

  it("throws exact error string when response.ok is false", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(failResponse());

    await expect(getUploadUrl(BASE_URL, "stok", "audio/webm")).rejects.toThrow(
      "Failed to get upload URL."
    );
  });
});

// ===========================================================================
// uploadAudio
// ===========================================================================

describe("uploadAudio", () => {
  const UPLOAD_URL = "https://s3.example.com/signed-upload-url";

  it("calls PUT on the signed upload URL", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(okResponse());

    const blob = new Blob(["audio-data"], { type: "audio/webm" });
    await uploadAudio(UPLOAD_URL, blob, "audio/webm");

    expect(global.fetch).toHaveBeenCalledWith(
      UPLOAD_URL,
      expect.objectContaining({ method: "PUT" })
    );
  });

  it("sends the raw Blob as the body", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(okResponse());

    const blob = new Blob(["audio-data"], { type: "audio/webm" });
    await uploadAudio(UPLOAD_URL, blob, "audio/webm");

    const [, init] = (global.fetch as jest.Mock).mock.calls[0] as [
      string,
      RequestInit
    ];
    expect(init.body).toBe(blob);
  });

  it("sends Content-Type matching the mimeType argument", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(okResponse());

    const blob = new Blob(["audio-data"], { type: "audio/mp4" });
    await uploadAudio(UPLOAD_URL, blob, "audio/mp4");

    const [, init] = (global.fetch as jest.Mock).mock.calls[0] as [
      string,
      RequestInit
    ];
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe(
      "audio/mp4"
    );
  });

  it("throws exact error string when response.ok is false", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(failResponse());

    const blob = new Blob(["audio-data"], { type: "audio/webm" });
    await expect(uploadAudio(UPLOAD_URL, blob, "audio/webm")).rejects.toThrow(
      "Audio upload failed."
    );
  });
});

// ===========================================================================
// finalizeSession
// ===========================================================================

describe("finalizeSession", () => {
  it("calls POST /public/session/:token/finalize with correct URL", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(okResponse());

    await finalizeSession(BASE_URL, "stok", "key/123", "audio/webm", 4096);

    expect(global.fetch).toHaveBeenCalledWith(
      `${BASE_URL}/public/session/stok/finalize`,
      expect.objectContaining({ method: "POST" })
    );
  });

  it("sends Content-Type: application/json", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(okResponse());

    await finalizeSession(BASE_URL, "stok", "key/123", "audio/webm", 4096);

    const [, init] = (global.fetch as jest.Mock).mock.calls[0] as [
      string,
      RequestInit
    ];
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/json"
    );
  });

  it("throws exact error string when response.ok is false", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(failResponse());

    await expect(
      finalizeSession(BASE_URL, "stok", "key/123", "audio/webm", 4096)
    ).rejects.toThrow("Failed to finalize session.");
  });
});

// ===========================================================================
// runApiFlow — auth routing
// ===========================================================================

describe("runApiFlow — auth routing", () => {
  const blob = new Blob(["audio"], { type: "audio/webm" });
  const opts = { promptText: "How was it?", maxDurationSec: 5 };

  /**
   * Sequence of successful responses for the full 5-step flow when
   * sessionCreateToken is provided directly (no create-token call):
   *   1. createSession  → { sessionId, sessionToken }
   *   2. openSession    → {}
   *   3. getUploadUrl   → { uploadUrl, storageKey }
   *   4. uploadAudio    → {}
   *   5. finalizeSession → {}
   */
  function mockFullFlowWithToken() {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(
        okResponse({ sessionId: "sid", sessionToken: "stok" })
      ) // createSession
      .mockResolvedValueOnce(okResponse()) // openSession
      .mockResolvedValueOnce(
        okResponse({ uploadUrl: "https://s3.example.com/up", storageKey: "k/1" })
      ) // getUploadUrl
      .mockResolvedValueOnce(okResponse()) // uploadAudio
      .mockResolvedValueOnce(okResponse()); // finalizeSession
  }

  /**
   * Sequence for the full flow when only apiKey is provided:
   *   1. getSessionCreateToken → { token }
   *   2. createSession         → { sessionId, sessionToken }
   *   3. openSession           → {}
   *   4. getUploadUrl          → { uploadUrl, storageKey }
   *   5. uploadAudio           → {}
   *   6. finalizeSession       → {}
   */
  function mockFullFlowWithApiKey() {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(okResponse({ token: "derived-token" })) // getSessionCreateToken
      .mockResolvedValueOnce(
        okResponse({ sessionId: "sid", sessionToken: "stok" })
      ) // createSession
      .mockResolvedValueOnce(okResponse()) // openSession
      .mockResolvedValueOnce(
        okResponse({ uploadUrl: "https://s3.example.com/up", storageKey: "k/1" })
      ) // getUploadUrl
      .mockResolvedValueOnce(okResponse()) // uploadAudio
      .mockResolvedValueOnce(okResponse()); // finalizeSession
  }

  it("does NOT call create-token endpoint when sessionCreateToken is provided", async () => {
    mockFullFlowWithToken();

    await runApiFlow(
      BASE_URL,
      { sessionCreateToken: "pre-fetched-token" },
      blob,
      "audio/webm",
      opts
    );

    const createTokenCalls = (global.fetch as jest.Mock).mock.calls.filter(
      ([url]: [string]) => String(url).includes("create-token")
    );
    expect(createTokenCalls).toHaveLength(0);
  });

  it("calls create-token endpoint exactly once when only apiKey is provided", async () => {
    mockFullFlowWithApiKey();

    await runApiFlow(
      BASE_URL,
      { apiKey: "raw-api-key" },
      blob,
      "audio/webm",
      opts
    );

    const createTokenCalls = (global.fetch as jest.Mock).mock.calls.filter(
      ([url]: [string]) => String(url).includes("create-token")
    );
    expect(createTokenCalls).toHaveLength(1);
  });

  it("uses the sessionCreateToken directly (skips create-token) — total fetch calls is 5", async () => {
    mockFullFlowWithToken();

    await runApiFlow(
      BASE_URL,
      { sessionCreateToken: "direct-token" },
      blob,
      "audio/webm",
      opts
    );

    // 5 steps: createSession, openSession, getUploadUrl, uploadAudio, finalizeSession
    expect(global.fetch).toHaveBeenCalledTimes(5);
  });

  it("calls create-token first when only apiKey provided — total fetch calls is 6", async () => {
    mockFullFlowWithApiKey();

    await runApiFlow(
      BASE_URL,
      { apiKey: "my-api-key" },
      blob,
      "audio/webm",
      opts
    );

    // 6 steps: getSessionCreateToken + 5 flow steps
    expect(global.fetch).toHaveBeenCalledTimes(6);
  });

  it("throws when neither sessionCreateToken nor apiKey is provided", async () => {
    await expect(
      runApiFlow(BASE_URL, {}, blob, "audio/webm", opts)
    ).rejects.toThrow(
      "No authentication provided. Pass sessionCreateToken or embedKey."
    );

    // No fetch calls should have been made
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
