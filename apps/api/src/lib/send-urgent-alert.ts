import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { jobLogger } from "./logger";

const log = jobLogger("urgent-alert");

export interface UrgentAlertInput {
  to: string;
  sessionId: string;
  summary: string;
  sentiment: string;
  urgency: string;
  targetLabel?: string;
}

export async function sendUrgentAlert(input: UrgentAlertInput): Promise<void> {
  const to = input.to.trim();
  const from = process.env.SES_FROM_EMAIL?.trim();
  if (!to || !from) {
    log.warn(
      { sessionId: input.sessionId, hasTo: !!to, hasFrom: !!from },
      "urgent alert skipped — missing recipient or SES_FROM_EMAIL"
    );
    return;
  }

  const appUrl = (process.env.APP_URL ?? "https://hearloop.vercel.app").replace(
    /\/$/,
    ""
  );
  const targetLine = input.targetLabel ? `Target: ${input.targetLabel}\n` : "";
  const text = [
    "Urgent negative feedback",
    "",
    input.summary,
    "",
    `Sentiment: ${input.sentiment}`,
    `Urgency: ${input.urgency}`,
    targetLine.trimEnd(),
    `Session: ${input.sessionId}`,
    `${appUrl}/dashboard?nav=sessions&session=${input.sessionId}`,
  ]
    .filter((line) => line !== undefined)
    .join("\n");

  const client = new SESClient({
    region: process.env.SES_REGION ?? process.env.BEDROCK_REGION ?? "us-east-2",
  });

  await client.send(
    new SendEmailCommand({
      Source: from,
      Destination: { ToAddresses: [to] },
      Message: {
        Subject: { Data: "Urgent customer feedback", Charset: "UTF-8" },
        Body: { Text: { Data: text, Charset: "UTF-8" } },
      },
    })
  );
}
