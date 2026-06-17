// hearloop/apps/api/src/routes/partner-dashboard.ts

import { db } from "../lib/db";

export async function buildDashboardPayload(partnerId: string) {
  const sessions = (await db
    .selectFrom("sessions")
    .leftJoin("analyses", "analyses.session_id", "sessions.id")
    .leftJoin("recordings", "recordings.session_id", "sessions.id")
    .select([
      "sessions.id",
      "sessions.status",
      "sessions.external_event_id",
      "sessions.metadata_json",
      "sessions.created_at",
      "sessions.processing_started_at",
      "sessions.processing_completed_at",
      "analyses.transcript",
      "analyses.sentiment_label",
      "analyses.sentiment_score",
      "analyses.topics_json",
      "analyses.moderation_json",
      "analyses.detected_language",
      "analyses.model_used",
      "analyses.input_tokens",
      "analyses.output_tokens",
      "recordings.duration_ms",
      "recordings.mime_type",
    ] as any)
    .where("sessions.partner_id", "=", partnerId)
    .orderBy("sessions.created_at", "desc")
    .limit(100)
    .execute()) as any[];

  const completed = sessions.filter((s) => s.status === "completed");
  const total = sessions.length;

  const sentiments = completed.map((s) => s.sentiment_label).filter(Boolean);
  const positiveCount = sentiments.filter((s) => s === "positive").length;
  const negativeCount = sentiments.filter((s) => s === "negative").length;
  const neutralCount = sentiments.filter((s) => s === "neutral").length;

  const topicMap: Record<string, number> = {};
  completed.forEach((s) => {
    if (!s.topics_json) return;
    const topics = JSON.parse(s.topics_json) as string[];
    topics.forEach((t) => {
      topicMap[t] = (topicMap[t] ?? 0) + 1;
    });
  });

  const topics = Object.entries(topicMap)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({
      name,
      count,
      pct: Math.round((count / Math.max(completed.length, 1)) * 100),
    }));

  const urgentSessions = completed.filter((s) => {
    if (!s.moderation_json) return false;
    const mod = JSON.parse(s.moderation_json);
    return mod.urgency === "urgent";
  });

  const followUpSessions = completed.filter((s) => {
    if (!s.moderation_json) return false;
    const mod = JSON.parse(s.moderation_json);
    return mod.urgency === "follow_up";
  });

  const latencies = completed
    .filter((s) => s.processing_started_at && s.processing_completed_at)
    .map(
      (s) =>
        new Date(s.processing_completed_at).getTime() -
        new Date(s.processing_started_at).getTime()
    );

  const avgLatencyMs =
    latencies.length > 0
      ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
      : null;

  const totalInputTokens = completed.reduce(
    (sum: number, s: any) => sum + (s.input_tokens ?? 0),
    0
  );
  const totalOutputTokens = completed.reduce(
    (sum: number, s: any) => sum + (s.output_tokens ?? 0),
    0
  );

  const estimatedCostUsd = parseFloat(
    (totalInputTokens * 0.00000006 + totalOutputTokens * 0.00000024).toFixed(6)
  );

  const modelBreakdown = completed.reduce(
    (acc: Record<string, number>, s: any) => {
      const key = s.model_used ?? "none";
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const formattedSessions = sessions.map((s) => {
    let moderation: any = {};
    try {
      moderation = s.moderation_json ? JSON.parse(s.moderation_json) : {};
    } catch {
      /* ignore */
    }
    let sessionTopics: string[] = [];
    try {
      sessionTopics = s.topics_json ? JSON.parse(s.topics_json) : [];
    } catch {
      /* ignore */
    }

    return {
      id: s.id,
      status: s.status,
      externalEventId: s.external_event_id,
      createdAt: s.created_at,
      transcript: s.transcript,
      sentiment: s.sentiment_label,
      sentimentScore: s.sentiment_score,
      topics: sessionTopics,
      urgency: moderation.urgency ?? "none",
      summary: moderation.summary ?? "",
      qualityFlags: moderation.qualityFlags ?? [],
      language: s.detected_language,
      durationMs: s.duration_ms,
    };
  });

  return {
    stats: {
      total,
      completed: completed.length,
      urgent: urgentSessions.length,
      followUp: followUpSessions.length,
      sentiment: {
        positive: positiveCount,
        negative: negativeCount,
        neutral: neutralCount,
        positiveRate: Math.round(
          (positiveCount / Math.max(sentiments.length, 1)) * 100
        ),
      },
      completionRate: Math.round((completed.length / Math.max(total, 1)) * 100),
      metrics: {
        avgLatencyMs,
        totalInputTokens,
        totalOutputTokens,
        estimatedCostUsd,
        modelBreakdown,
      },
    },
    topics,
    sessions: formattedSessions,
  };
}
