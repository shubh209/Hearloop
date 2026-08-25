import { randomUUID } from "crypto";
import { db } from "./db";
import { enqueueValidate } from "./queue";
import {
  readLegacyValidationHandoff,
  readSessionCaptureConfig,
  writeLegacyValidationHandoff,
} from "./session-capture-config";

const ACCEPTED_FINALIZE_STATES = ["opened", "recording", "uploaded"] as const;

type LegacyFinalizeSession = {
  id: string;
  metadata_json: string | null;
  max_duration_sec: number;
};

type LegacyRecordingInput = {
  storageKey: string;
  mimeType: string;
  durationMs?: number;
  sizeBytes?: number;
  sha256Hash?: string;
};

export async function claimLegacyFinalize(
  session: LegacyFinalizeSession,
  recording: LegacyRecordingInput,
  languageHint?: string
): Promise<{ claimed: boolean; pendingMetadata: string }> {
  const pendingMetadata = writeLegacyValidationHandoff(session.metadata_json, {
    state: "pending",
    languageHint,
  });

  return db.transaction().execute(async (trx) => {
    const claimed = await trx
      .updateTable("sessions")
      .set({
        status: "submitted",
        metadata_json: pendingMetadata,
        updated_at: new Date(),
      })
      .where("id", "=", session.id)
      .where("status", "in", [...ACCEPTED_FINALIZE_STATES])
      .returning("id")
      .executeTakeFirst();

    if (!claimed) {
      return { claimed: false, pendingMetadata };
    }

    await trx
      .insertInto("recordings")
      .values({
        id: randomUUID(),
        session_id: session.id,
        storage_key: recording.storageKey,
        mime_type: recording.mimeType,
        duration_ms: recording.durationMs ?? null,
        size_bytes: recording.sizeBytes ?? 0,
        sha256_hash: recording.sha256Hash ?? "",
        created_at: new Date(),
      })
      .onConflict((oc) =>
        oc.column("session_id").doUpdateSet({
          storage_key: recording.storageKey,
          mime_type: recording.mimeType,
        })
      )
      .execute();

    return { claimed: true, pendingMetadata };
  });
}

export async function deliverPendingLegacyValidation(
  session: LegacyFinalizeSession,
  persistedRecording?: Pick<LegacyRecordingInput, "storageKey" | "mimeType">
): Promise<boolean> {
  const handoff = readLegacyValidationHandoff(session.metadata_json);
  if (handoff?.state !== "pending") {
    return false;
  }

  const recording = persistedRecording
    ? {
        storage_key: persistedRecording.storageKey,
        mime_type: persistedRecording.mimeType,
      }
    : await db
        .selectFrom("recordings")
        .select(["storage_key", "mime_type"])
        .where("session_id", "=", session.id)
        .executeTakeFirst();

  if (!recording) {
    throw new Error(`Pending validation handoff has no Recording: ${session.id}`);
  }

  const captureConfig = readSessionCaptureConfig(session.metadata_json);
  await enqueueValidate({
    sessionId: session.id,
    storageKey: recording.storage_key,
    mimeType: recording.mime_type,
    languageHint: handoff.languageHint,
    promptText: captureConfig.promptText,
    maxDurationSec: session.max_duration_sec,
  });

  const enqueuedMetadata = writeLegacyValidationHandoff(session.metadata_json, {
    state: "enqueued",
    languageHint: handoff.languageHint,
  });
  await db
    .updateTable("sessions")
    .set({ metadata_json: enqueuedMetadata, updated_at: new Date() })
    .where("id", "=", session.id)
    .where("metadata_json", "=", session.metadata_json)
    .execute();

  return true;
}
