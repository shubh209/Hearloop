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
  status: string;
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

type LegacyFinalizeResult = {
  sessionId: string;
  status: string;
};

type ReadScopedSession = () => Promise<LegacyFinalizeSession | undefined>;

export async function orchestrateLegacyFinalize({
  session,
  readScopedSession,
  recording,
  languageHint,
}: {
  session: LegacyFinalizeSession;
  readScopedSession: ReadScopedSession;
  recording?: LegacyRecordingInput;
  languageHint?: string;
}): Promise<LegacyFinalizeResult | null> {
  if (session.status === "processing") {
    return { sessionId: session.id, status: session.status };
  }

  if (session.status === "submitted") {
    await deliverPendingLegacyValidation(session);
    return toResult(await readScopedSession());
  }

  if (!recording) {
    throw new Error("Accepted legacy finalize requires Recording metadata");
  }

  const claim = await claimLegacyFinalize(session, recording, languageHint);
  if (claim.claimed) {
    await deliverPendingLegacyValidation(
      { ...session, metadata_json: claim.pendingMetadata },
      recording
    );
    return { sessionId: session.id, status: "submitted" };
  }

  const durableSession = await readScopedSession();
  if (!durableSession) {
    return null;
  }
  if (durableSession.status !== "submitted") {
    return toResult(durableSession);
  }

  await deliverPendingLegacyValidation(durableSession);
  return toResult(await readScopedSession());
}

export async function acknowledgeLegacyValidationHandoff(
  sessionId: string
): Promise<void> {
  const session = await db
    .selectFrom("sessions")
    .select(["id", "metadata_json"])
    .where("id", "=", sessionId)
    .executeTakeFirst();
  if (!session) {
    return;
  }

  const handoff = readLegacyValidationHandoff(session.metadata_json);
  if (!handoff || handoff.state === "enqueued") {
    return;
  }

  const enqueuedMetadata = writeLegacyValidationHandoff(session.metadata_json, {
    state: "enqueued",
    languageHint: handoff.languageHint,
  });
  const acknowledged = await db
    .updateTable("sessions")
    .set({ metadata_json: enqueuedMetadata, updated_at: new Date() })
    .where("id", "=", sessionId)
    .where("metadata_json", "=", session.metadata_json)
    .returning("id")
    .executeTakeFirst();
  if (acknowledged) {
    return;
  }

  const durableSession = await db
    .selectFrom("sessions")
    .select(["id", "metadata_json"])
    .where("id", "=", sessionId)
    .executeTakeFirst();
  if (
    durableSession &&
    readLegacyValidationHandoff(durableSession.metadata_json)?.state ===
      "enqueued"
  ) {
    return;
  }

  throw new Error("validation_handoff_acknowledgement_failed");
}

async function claimLegacyFinalize(
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

async function deliverPendingLegacyValidation(
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

function toResult(
  session: LegacyFinalizeSession | undefined
): LegacyFinalizeResult | null {
  return session
    ? { sessionId: session.id, status: session.status }
    : null;
}
