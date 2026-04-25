"use strict";
// hearloop/apps/api/src/lib/storage.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAudioBuffer = getAudioBuffer;
exports.uploadAudio = uploadAudio;
exports.getUploadSignedUrl = getUploadSignedUrl;
exports.getDownloadSignedUrl = getDownloadSignedUrl;
exports.deleteAudio = deleteAudio;
const client_s3_1 = require("@aws-sdk/client-s3");
const s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
const crypto_1 = require("crypto");
const s3 = new client_s3_1.S3Client({
    region: process.env.STORAGE_REGION ?? "auto",
    endpoint: process.env.STORAGE_ENDPOINT, // Cloudflare R2 endpoint
    credentials: {
        accessKeyId: process.env.STORAGE_ACCESS_KEY_ID,
        secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY,
    },
});
const BUCKET = process.env.STORAGE_BUCKET;
// Fetch audio buffer from R2/S3
async function getAudioBuffer(storageKey) {
    const command = new client_s3_1.GetObjectCommand({
        Bucket: BUCKET,
        Key: storageKey,
    });
    const response = await s3.send(command);
    if (!response.Body) {
        throw new Error(`Empty body for storage key: ${storageKey}`);
    }
    const stream = response.Body;
    const chunks = [];
    for await (const chunk of stream) {
        chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
}
// Upload audio buffer, returns storage key + sha256
async function uploadAudio(sessionId, audioBuffer, mimeType) {
    const ext = mimeType.split("/")[1] ?? "webm";
    const storageKey = `recordings/${sessionId}/audio.${ext}`;
    const sha256Hash = (0, crypto_1.createHash)("sha256").update(audioBuffer).digest("hex");
    await s3.send(new client_s3_1.PutObjectCommand({
        Bucket: BUCKET,
        Key: storageKey,
        Body: audioBuffer,
        ContentType: mimeType,
        Metadata: {
            sessionId,
            sha256: sha256Hash,
        },
    }));
    return {
        storageKey,
        sha256Hash,
        sizeBytes: audioBuffer.byteLength,
    };
}
// Short-lived signed URL for direct browser upload (15 min)
async function getUploadSignedUrl(sessionId, mimeType) {
    const ext = mimeType.split("/")[1] ?? "webm";
    const storageKey = `recordings/${sessionId}/audio.${ext}`;
    const command = new client_s3_1.PutObjectCommand({
        Bucket: BUCKET,
        Key: storageKey,
        ContentType: mimeType,
    });
    const uploadUrl = await (0, s3_request_presigner_1.getSignedUrl)(s3, command, { expiresIn: 900 });
    return { uploadUrl, storageKey };
}
// Short-lived signed URL for playback (5 min)
async function getDownloadSignedUrl(storageKey) {
    const command = new client_s3_1.GetObjectCommand({
        Bucket: BUCKET,
        Key: storageKey,
    });
    return (0, s3_request_presigner_1.getSignedUrl)(s3, command, { expiresIn: 300 });
}
// Delete audio — called on session delete (privacy)
async function deleteAudio(storageKey) {
    await s3.send(new client_s3_1.DeleteObjectCommand({
        Bucket: BUCKET,
        Key: storageKey,
    }));
}
