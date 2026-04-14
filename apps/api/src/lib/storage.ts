// hearloop/apps/api/src/lib/storage.ts

import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommandInput,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createHash } from "crypto";
import { Readable } from "stream";

const s3 = new S3Client({
  region: process.env.STORAGE_REGION ?? "auto",
  endpoint: process.env.STORAGE_ENDPOINT, // Cloudflare R2 endpoint
  credentials: {
    accessKeyId: process.env.STORAGE_ACCESS_KEY_ID!,
    secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY!,
  },
});

const BUCKET = process.env.STORAGE_BUCKET!;

// Fetch audio buffer from R2/S3
export async function getAudioBuffer(storageKey: string): Promise<Buffer> {
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: storageKey,
  });

  const response = await s3.send(command);

  if (!response.Body) {
    throw new Error(`Empty body for storage key: ${storageKey}`);
  }

  const stream = response.Body as Readable;
  const chunks: Buffer[] = [];

  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

// Upload audio buffer, returns storage key + sha256
export async function uploadAudio(
  sessionId: string,
  audioBuffer: Buffer,
  mimeType: string
): Promise<{ storageKey: string; sha256Hash: string; sizeBytes: number }> {
  const ext = mimeType.split("/")[1] ?? "webm";
  const storageKey = `recordings/${sessionId}/audio.${ext}`;
  const sha256Hash = createHash("sha256").update(audioBuffer).digest("hex");

  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: storageKey,
      Body: audioBuffer,
      ContentType: mimeType,
      Metadata: {
        sessionId,
        sha256: sha256Hash,
      },
    })
  );

  return {
    storageKey,
    sha256Hash,
    sizeBytes: audioBuffer.byteLength,
  };
}

// Short-lived signed URL for direct browser upload (15 min)
export async function getUploadSignedUrl(
  sessionId: string,
  mimeType: string
): Promise<{ uploadUrl: string; storageKey: string }> {
  const ext = mimeType.split("/")[1] ?? "webm";
  const storageKey = `recordings/${sessionId}/audio.${ext}`;

  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: storageKey,
    ContentType: mimeType,
  });

  const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 900 });

  return { uploadUrl, storageKey };
}

// Short-lived signed URL for playback (5 min)
export async function getDownloadSignedUrl(
  storageKey: string
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: storageKey,
  });

  return getSignedUrl(s3, command, { expiresIn: 300 });
}

// Delete audio — called on session delete (privacy)
export async function deleteAudio(storageKey: string): Promise<void> {
  await s3.send(
    new DeleteObjectCommand({
      Bucket: BUCKET,
      Key: storageKey,
    })
  );
}