import { createHash, randomUUID } from "crypto";
import {
  createFinalizePinner,
  FinalizeGrantRow,
  FinalizePinDependencies,
  FinalizeReceiptRow,
} from "../finalize-pinning";
import {
  deleteVersion,
  getVersionedUploadSignedUrl,
  headVersion,
  StorageError,
} from "../storage";

const RUN_LIVE = process.env.RUN_LIVE_S3_STORAGE_CONTRACT === "1";
const describeLive = RUN_LIVE ? describe : describe.skip;

// Live probe requires the runtime IAM user to PutObject (via presign),
// HeadObject with VersionId, and DeleteObjectVersion. hearloop-s3-user can
// PUT; HEAD/DELETE of versions returned 403 on 2026-08-15.

const bucket = process.env.STORAGE_BUCKET!;

function checksumSha256(body: Buffer): string {
  return createHash("sha256").update(body).digest("base64");
}

async function putVersion(
  key: string,
  body: Buffer
): Promise<{ versionId: string; etag: string; checksum: string }> {
  const checksum = checksumSha256(body);
  const signed = await getVersionedUploadSignedUrl({
    storageKey: key,
    mimeType: "audio/webm",
    checksumSha256: checksum,
    expiresInSeconds: 300,
  });
  const response = await fetch(signed.uploadUrl, {
    method: "PUT",
    headers: signed.requiredHeaders,
    body,
  });

  if (!response.ok) {
    throw new Error(`Live S3 PUT failed with status ${response.status}`);
  }

  const versionId = response.headers.get("x-amz-version-id");
  const etag = response.headers.get("etag");
  const responseChecksum = response.headers.get("x-amz-checksum-sha256");
  if (!versionId || !etag || responseChecksum !== checksum) {
    throw new Error(
      "Live S3 PUT omitted required version, ETag, or checksum headers"
    );
  }

  return { versionId, etag, checksum };
}

function makeLiveDeps(grant: FinalizeGrantRow): {
  persistCalls: unknown[];
  receipts: FinalizeReceiptRow[];
  dependencies: FinalizePinDependencies;
} {
  const persistCalls: unknown[] = [];
  const receipts: FinalizeReceiptRow[] = [];

  const dependencies: FinalizePinDependencies = {
    now: () => new Date(),
    createId: () => randomUUID(),
    findReceipt: async (sessionId, idempotencyKey) =>
      receipts.find(
        (row) =>
          row.session_id === sessionId && row.idempotency_key === idempotencyKey
      ),
    insertVerifyingReceipt: async (row) => {
      receipts.push({
        id: row.id,
        partner_id: row.partner_id,
        session_id: row.session_id,
        upload_grant_id: row.upload_grant_id,
        idempotency_key: row.idempotency_key,
        request_hash: row.request_hash,
        status: "verifying",
        response_status: null,
        response_json: null,
        verification_lease_until: row.verification_lease_until,
      });
    },
    renewVerifyingLease: async (id, _token, until) => {
      const row = receipts.find((candidate) => candidate.id === id);
      if (row) row.verification_lease_until = until;
    },
    completeReceipt: async (id, responseStatus, responseJson) => {
      const row = receipts.find((candidate) => candidate.id === id);
      if (row) {
        row.status = "completed";
        row.response_status = responseStatus;
        row.response_json = responseJson;
        row.verification_lease_until = null;
      }
    },
    deleteReceipt: async (id) => {
      const index = receipts.findIndex((row) => row.id === id);
      if (index >= 0) receipts.splice(index, 1);
    },
    findGrant: async () => grant,
    findRecording: async () => undefined,
    persistPin: async (input) => {
      persistCalls.push(input);
    },
    headVersion,
    enqueueValidate: async () => undefined,
  };

  return { persistCalls, receipts, dependencies };
}

describeLive("finalize pinning live S3 HEAD contract", () => {
  jest.setTimeout(60_000);

  it("pins the PUT VersionId and rejects a checksum mismatch", async () => {
    const prefix = `phase1-finalize-probe/${randomUUID()}`;
    const key = `${prefix}/audio.webm`;
    const body = Buffer.from(`${"hearloop-finalize-probe-".repeat(50)}`);
    const partnerId = randomUUID();
    const sessionId = randomUUID();
    const uploadId = randomUUID();
    let put: { versionId: string; etag: string; checksum: string } | undefined;

    try {
      put = await putVersion(key, body);
      const headed = await headVersion({
        bucket,
        key,
        versionId: put.versionId,
      });
      expect(headed.checksumSha256).toBe(put.checksum);
      expect(headed.sizeBytes).toBe(body.byteLength);

      const grant: FinalizeGrantRow = {
        id: uploadId,
        partner_id: partnerId,
        session_id: sessionId,
        storage_bucket: bucket,
        storage_key: key,
        expected_mime_type: "audio/webm",
        expected_size_bytes: body.byteLength,
        expected_checksum_sha256: headed.checksumSha256,
        state: "available",
      };
      const { persistCalls, dependencies } = makeLiveDeps(grant);
      const pinner = createFinalizePinner(dependencies);

      await expect(
        pinner.pin({
          partnerId,
          sessionId,
          maxDurationSec: 5,
          idempotencyKey: "final-key-0001",
          body: {
            uploadId,
            versionId: headed.versionId,
            etag: headed.etag,
          },
        })
      ).resolves.toMatchObject({
        replayed: false,
        responseStatus: 200,
        response: { sessionId, status: "submitted" },
      });
      expect(persistCalls).toHaveLength(1);

      const mismatch = makeLiveDeps({
        ...grant,
        expected_checksum_sha256: Buffer.alloc(32, 1).toString("base64"),
      });
      const mismatchPinner = createFinalizePinner(mismatch.dependencies);

      await expect(
        mismatchPinner.pin({
          partnerId,
          sessionId,
          maxDurationSec: 5,
          idempotencyKey: "final-key-0002",
          body: {
            uploadId,
            versionId: headed.versionId,
            etag: headed.etag,
          },
        })
      ).rejects.toMatchObject({
        statusCode: 422,
        errorCode: "integrity_mismatch",
      });
      expect(mismatch.persistCalls).toHaveLength(0);
    } finally {
      if (put) {
        try {
          await deleteVersion({
            bucket,
            key,
            versionId: put.versionId,
          });
        } catch (error) {
          if (
            !(error instanceof StorageError) ||
            error.code !== "access_denied"
          ) {
            throw error;
          }
        }
      }
    }
  });
});
