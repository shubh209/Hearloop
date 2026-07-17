import { db } from "../../lib/db";
import type { jobLogger } from "../../lib/logger";

export async function markFailed(
  sessionId: string,
  reason: string,
  log: Pick<ReturnType<typeof jobLogger>, "error">,
  updateTimestamp = true
): Promise<void> {
  log.error({ sessionId, reason }, "session failed");
  await db
    .updateTable("sessions")
    .set({
      status: "failed",
      failure_reason: reason,
      ...(updateTimestamp ? { updated_at: new Date() } : {}),
    })
    .where("id", "=", sessionId)
    .execute();
}
