# Hearloop — Async pipeline (interview diagram)

## Sequence (after finalize)

```mermaid
sequenceDiagram
  participant Browser
  participant API
  participant S3
  participant Queue as BullMQ (Upstash)
  participant Worker as EC2 workers
  participant Groq
  participant Bedrock
  participant Partner

  Browser->>API: POST finalize
  API->>API: session → processing
  API->>Queue: enqueue validate
  API-->>Browser: 200 OK (fast)

  Worker->>Queue: validate
  Worker->>S3: check audio
  Worker->>Queue: enqueue transcribe
  Worker->>Groq: STT
  Worker->>Queue: enqueue analyze
  Worker->>Bedrock: classify transcript
  Worker->>API: session → completed
  Worker->>Queue: enqueue webhook
  Worker->>Partner: HMAC POST (retries)
```

## Session states (capture → done)

`created → opened → recording → uploaded → submitted → processing → completed | failed | expired`
