// hearloop/apps/api/src/jobs/expire-session.ts

import { db } from "../lib/db";
import { deleteAudio } from "../lib/storage";
import { jobLogger } from "../lib/logger";

const log = jobLogger("expire-session");

export interface ExpireSessionPayload {
  sessionId: string;
}

export async function runExpireSessionJob(
  payload: ExpireSessionPayload
): Promise<void> {
  const { sessionId } = payload;

  // 1. Fetch session — check if already terminal
  const session = await db
    .selectFrom("sessions")
    .select(["id", "status"])
    .where("id", "=", sessionId)
    .executeTakeFirst();

  if (!session) {
    log.warn({ sessionId }, "session not found, skipping expire");
    return;
  }

  // Already terminal — nothing to do
  const terminalStates = ["completed", "failed", "expired", "deleted"];
  if (terminalStates.includes(session.status)) {
    log.debug({ sessionId, status: session.status }, "session already terminal, skipping expire");
    return;
  }

  log.info({ sessionId, prevStatus: session.status }, "expiring session");

  // 2. Fetch recording if exists
  const recording = await db
    .selectFrom("recordings")
    .select("storage_key")
    .where("session_id", "=", sessionId)
    .executeTakeFirst();

  // 3. Delete audio from S3 if uploaded but never completed
  if (recording) {
    try {
      await deleteAudio(recording.storage_key);
      log.info({ sessionId, storageKey: recording.storage_key }, "deleted audio for expired session");
    } catch (err: any) {
      log.warn({ sessionId, err: err.message }, "failed to delete audio for expired session (non-fatal)");
    }
  }

  // 4. Mark session expired
  await db
    .updateTable("sessions")
    .set({ status: "expired", updated_at: new Date() })
    .where("id", "=", sessionId)
    .execute();

  log.info({ sessionId }, "session expired");
}