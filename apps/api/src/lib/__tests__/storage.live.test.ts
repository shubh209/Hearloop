import {
  DeleteObjectCommand,
  ListObjectVersionsCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { createHash, randomUUID } from "crypto";
import {
  deleteVersion,
  getVersion,
  getVersionedUploadSignedUrl,
  headVersion,
} from "../storage";

const RUN_LIVE = process.env.RUN_LIVE_S3_STORAGE_CONTRACT === "1";
const describeLive = RUN_LIVE ? describe : describe.skip;

const bucket = process.env.STORAGE_BUCKET!;
const client = new S3Client({
  region: process.env.STORAGE_REGION ?? "us-east-2",
  endpoint: process.env.STORAGE_ENDPOINT,
  credentials: {
    accessKeyId: process.env.STORAGE_ACCESS_KEY_ID!,
    secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY!,
  },
});

function checksumSha256(body: Buffer): string {
  return createHash("sha256").update(body).digest("base64");
}

async function listProbeVersions(prefix: string): Promise<
  Array<{ key: string; versionId: string }>
> {
  const found: Array<{ key: string; versionId: string }> = [];
  let keyMarker: string | undefined;
  let versionIdMarker: string | undefined;

  do {
    const page = await client.send(
      new ListObjectVersionsCommand({
        Bucket: bucket,
        Prefix: prefix,
        KeyMarker: keyMarker,
        VersionIdMarker: versionIdMarker,
      })
    );

    for (const item of [...(page.Versions ?? []), ...(page.DeleteMarkers ?? [])]) {
      if (
        item.Key?.startsWith(prefix) &&
        typeof item.VersionId === "string" &&
        item.VersionId.length > 0
      ) {
        found.push({ key: item.Key, versionId: item.VersionId });
      }
    }

    keyMarker = page.IsTruncated ? page.NextKeyMarker : undefined;
    versionIdMarker = page.IsTruncated ? page.NextVersionIdMarker : undefined;
  } while (keyMarker);

  return found;
}

async function removeEveryProbeVersion(prefix: string): Promise<void> {
  for (let pass = 0; pass < 5; pass += 1) {
    const versions = await listProbeVersions(prefix);
    if (versions.length === 0) return;

    await Promise.all(
      versions.map(({ key, versionId }) =>
        client.send(
          new DeleteObjectCommand({
            Bucket: bucket,
            Key: key,
            VersionId: versionId,
          })
        )
      )
    );
  }

  const remaining = await listProbeVersions(prefix);
  if (remaining.length > 0) {
    throw new Error(`Live S3 cleanup left ${remaining.length} probe version(s)`);
  }
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
    throw new Error("Live S3 PUT omitted required version, ETag, or checksum headers");
  }

  return { versionId, etag, checksum };
}

describeLive("version-aware S3 storage contract", () => {
  jest.setTimeout(60_000);

  it("preserves two same-key versions for exact HEAD, GET, and DELETE", async () => {
    const prefix = `phase1-capability-probe/task3-${randomUUID()}`;
    const key = `${prefix}/audio.webm`;
    const firstBody = Buffer.from("hearloop task 3 first version");
    const secondBody = Buffer.from("hearloop task 3 second version");

    try {
      const firstPut = await putVersion(key, firstBody);
      const secondPut = await putVersion(key, secondBody);
      expect(firstPut.versionId).not.toBe(secondPut.versionId);

      for (const expected of [
        { put: firstPut, body: firstBody },
        { put: secondPut, body: secondBody },
      ]) {
        const ref = { bucket, key, versionId: expected.put.versionId };
        await expect(headVersion(ref)).resolves.toEqual({
          ...ref,
          etag: expected.put.etag,
          checksumSha256: expected.put.checksum,
          mimeType: "audio/webm",
          sizeBytes: expected.body.byteLength,
        });
        await expect(getVersion(ref)).resolves.toEqual({
          ...ref,
          etag: expected.put.etag,
          checksumSha256: expected.put.checksum,
          mimeType: "audio/webm",
          sizeBytes: expected.body.byteLength,
          body: expected.body,
        });
        await expect(deleteVersion(ref)).resolves.toEqual(ref);
      }

      await expect(listProbeVersions(prefix)).resolves.toEqual([]);
    } finally {
      await removeEveryProbeVersion(prefix);
      await expect(listProbeVersions(prefix)).resolves.toEqual([]);
    }
  });
});
