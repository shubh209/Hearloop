// hearloop/apps/api/src/lib/__tests__/storage.test.ts
//
// buildStorageKey derives the expected recordings/{sessionId}/audio.{ext}
// key from sessionId + mimeType — used by uploadAudio, getUploadSignedUrl,
// and the finalize-handler ownership check (ticket 006).

import { buildStorageKey } from "../storage";

describe("buildStorageKey", () => {
  it("derives the recordings/{sessionId}/audio.{ext} key from the mime type", () => {
    expect(buildStorageKey("session-123", "audio/webm")).toBe(
      "recordings/session-123/audio.webm"
    );
  });
});
