// hearloop/apps/api/src/jobs/expire-session.ts

import { db } from "../lib/db";
import { deleteAudio } from "../lib/storage";

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
    console.log(`Session ${sessionId} not found — skip expire`);
    return;
  }

  // Already terminal — nothing to do
  const terminalStates = ["completed", "failed", "expired", "deleted"];
  if (terminalStates.includes(session.status)) {
    console.log(`Session ${sessionId} already ${session.status} — skip expire`);
    return;
  }

  console.log(`Expiring session ${sessionId} (was: ${session.status})`);

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
      console.log(`Deleted audio for expired session ${sessionId}`);
    } catch (err: any) {
      // Non-fatal — log and continue
      console.warn(`Failed to delete audio for ${sessionId}:`, err.message);
    }
  }

  // 4. Mark session expired
  await db
    .updateTable("sessions")
    .set({ status: "expired", updated_at: new Date() })
    .where("id", "=", sessionId)
    .execute();

  console.log(`Session ${sessionId} expired`);
}