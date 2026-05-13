# Hearloop AI and Bedrock Runbook

## Current classifier path

File: `apps/api/src/lib/claude.ts`

- Bedrock client region: `BEDROCK_REGION` or `us-east-2`
- Primary model: `us.amazon.nova-lite-v1:0`
- Fallback model: `us.anthropic.claude-haiku-4-5-20251001-v1:0`
- Prompt asks for JSON with sentiment, sentimentScore, topics, urgency, summary, qualityFlags, moderationFlags.

## Highest-risk token/quota issues

1. The Nova request uses `inferenceConfig.max_new_tokens`. Nova docs/examples use `maxTokens`. This may mean the output cap is not applied.
2. Bedrock quota systems reserve `input tokens + maxTokens` at the start of each request, then reconcile after generation. A bad or missing cap makes quota usage look instant.
3. `analyzeQueue` has concurrency 5 and attempts 3. A backlog of jobs can drain quota immediately after worker startup.
4. The transcript is not bounded before classification. Cap it; this product is only 5-second feedback.
5. The validation job is bypassed. Invalid, silent, or long audio can still reach STT and classifier.
6. If DB writes fail after the Bedrock call, BullMQ retries the whole analyze job and calls Bedrock again.
7. Parse failure triggers a fallback model call. That doubles model invocations when Nova returns non-JSON.

## Immediate code fix sketch

Use Nova's `maxTokens` and add a hard transcript cap.

```ts
const MAX_TRANSCRIPT_CHARS = 800;
const safeTranscript = transcript.trim().slice(0, MAX_TRANSCRIPT_CHARS);

if (safeTranscript.split(/\s+/).filter(Boolean).length < 2) {
  return fallbackAnalysis("too_short");
}

const requestBody = {
  schemaVersion: "messages-v1",
  messages: [{ role: "user", content: [{ text: `Transcript: ${JSON.stringify(safeTranscript)}` }] }],
  system: [{ text: SYSTEM_PROMPT }],
  inferenceConfig: {
    maxTokens: 120,
    temperature: 0.00001
  }
};
```

## Queue safety settings while debugging

In `createWorker`, set analyze concurrency to 1.

In `enqueueAnalyze`, set attempts to 1 until token issue is solved.

Add a Redis/BullMQ cleanup step before redeploying if there are stale test jobs.

## Observability to add

- Enable Bedrock model invocation logging to CloudWatch/S3.
- Add CloudWatch dashboard for InputTokenCount, OutputTokenCount, InvocationCount, InvocationThrottles, and Daily Token Counts by ModelID.
- Use Bedrock CountTokens before invoking Nova during debugging.
- Log request ID, model ID, transcript length, estimated input tokens, output text length, parse status, and modelUsed.
- Store `model_used`, `input_tokens`, `output_tokens`, `token_estimate`, and `analysis_error` in `analyses` or a separate `ai_invocations` table.

## Product-level optimization

For v1, do not call an LLM for every recording:

- Empty transcript -> local fallback.
- Under 2 words -> local fallback.
- Low confidence from Whisper -> local quality flag only.
- Transcript over cap -> classify only first 800 chars.
- Obvious positive/negative one-liners can use a cheap deterministic baseline and reserve Nova for ambiguous cases.
