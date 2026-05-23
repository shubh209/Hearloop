# Requirements Document

## Introduction

This feature adds CloudWatch observability to the Hearloop API. It covers two distinct concerns:

1. **Bedrock invocation logging** — after every `analyzeTranscript()` call in `jobs/analyze.ts`, emit a custom CloudWatch metric to the `Hearloop/Pipeline` namespace capturing model, token counts, latency, session ID, and whether a Nova Lite → Haiku fallback occurred. This makes P50/P95 latency and per-model token cost queryable directly in the AWS console.

2. **EC2 infrastructure alarms** — CPU and memory alarms on the t3.micro instance. These are infrastructure configuration (AWS console / CLI), not runtime API code. The spec defines the alarm thresholds and the boundary between runtime code and infra config.

The implementation is constrained to a single new file (`apps/api/src/lib/cloudwatch.ts`) that owns the CloudWatch client and emit helpers. No new npm dependencies are introduced — `@aws-sdk/client-cloudwatch` is part of the AWS SDK v3 family already present in the project. All CloudWatch calls are event-driven (per session), never polled on a timer, preserving the free-tier Redis budget.

---

## Glossary

- **CloudWatch_Client**: The singleton `CloudWatchClient` instance created in `lib/cloudwatch.ts`, configured with the AWS region and credentials from environment variables.
- **Emit_Helper**: A function exported from `lib/cloudwatch.ts` that calls `PutMetricData` to write one or more metric data points to CloudWatch.
- **Invocation_Metric**: A CloudWatch custom metric data point emitted after each Bedrock call, carrying dimensions for `ModelId`, `SessionId`, and `Outcome`.
- **Namespace**: The CloudWatch custom metrics namespace `Hearloop/Pipeline` used for all Bedrock invocation metrics.
- **Analyzer**: The `runAnalyzeJob()` function in `jobs/analyze.ts` that orchestrates Bedrock classification and calls the Emit_Helper after each invocation.
- **Env_Validator**: The `validateEnv()` function in `lib/env.ts` that checks required environment variables at startup.
- **Nova_Lite**: AWS Bedrock `amazon.nova-lite-v1:0`, the primary model used by the Analyzer.
- **Haiku**: AWS Bedrock `anthropic.claude-haiku-*`, the fallback model used by the Analyzer when Nova_Lite fails.
- **EC2_Instance**: The `t3.micro` EC2 instance in `us-east-2` running the Hearloop API container.
- **CloudWatch_Agent**: The AWS-provided daemon that can be installed on EC2 to report OS-level metrics (memory, disk) not natively available in CloudWatch.
- **SNS_Topic**: An AWS Simple Notification Service topic that receives alarm state-change notifications.
- **CPU_Alarm**: A CloudWatch alarm on the `AWS/EC2` `CPUUtilization` metric for the EC2_Instance.
- **Memory_Alarm**: A CloudWatch alarm on a memory metric for the EC2_Instance, sourced either from the CloudWatch_Agent or a custom metric emitted by the API process.
- **PutMetricData**: The AWS CloudWatch API action used to write custom metric data points.
- **Fire-and-forget**: An async call pattern where the caller does not await the result and errors are caught internally, preventing metric emission failures from blocking the pipeline.

---

## Requirements

### Requirement 1: CloudWatch Client Module

**User Story:** As a developer, I want a single dedicated module that owns the CloudWatch client and emit helpers, so that CloudWatch concerns are isolated from pipeline logic and every other file has a clean, single-import interface.

#### Acceptance Criteria

1. THE `CloudWatch_Client` module (`lib/cloudwatch.ts`) SHALL export exactly a singleton `CloudWatchClient` instance and all `PutMetricData` helper functions, and no other runtime symbols; TypeScript type and interface exports are permitted.
2. IF `CLOUDWATCH_REGION` is absent or resolves to an empty string at module load time, THE `CloudWatch_Client` module SHALL throw an error immediately, preventing the module from being used with an unconfigured client.
3. THE `CloudWatch_Client` module SHALL initialise the `CloudWatchClient` using credentials resolved from the environment variable aliases in this priority order: `BEDROCK_ACCESS_KEY_ID`, then `AWS_ACCESS_KEY_ID`, then `STORAGE_ACCESS_KEY_ID` for the access key, and `BEDROCK_SECRET_ACCESS_KEY`, then `AWS_SECRET_ACCESS_KEY`, then `STORAGE_SECRET_ACCESS_KEY` for the secret key; IF none of the aliases resolves to a non-empty value, THE module SHALL throw an error at load time.
4. WHEN the `CloudWatch_Client` module is imported, THE `CloudWatch_Client` module SHALL NOT call `PutMetricData`, `PutMetricAlarm`, or any other CloudWatch API during initialisation.
5. THE `CloudWatch_Client` module SHALL NOT import from any file under `jobs/`, `routes/`, or `lib/`; all configuration SHALL be read directly from `process.env`.

---

### Requirement 2: Bedrock Invocation Metric Emission

**User Story:** As a developer, I want a metric emitted to CloudWatch after every Bedrock call, so that I can query P50/P95 latency and per-model token cost directly in the AWS console without parsing log files.

#### Acceptance Criteria

1. WHEN `runAnalyzeJob()` completes a Bedrock invocation where at least one model responded (success or Haiku fallback), THE `Analyzer` SHALL call the `Emit_Helper` with the invocation data; IF both models fail and `modelUsed` is `"none"`, THE `Analyzer` SHALL NOT call the `Emit_Helper`.
2. THE `Emit_Helper` SHALL emit the following metric data points to the `Hearloop/Pipeline` namespace in a single `PutMetricData` call:
   - `BedrockLatencyMs` (unit: `Milliseconds`) — wall-clock time from Bedrock call start to response received
   - `BedrockInputTokens` (unit: `Count`) — number of input tokens reported by the Bedrock response
   - `BedrockOutputTokens` (unit: `Count`) — number of output tokens reported by the Bedrock response
   - `BedrockInvocationCount` (unit: `Count`, value: `1`) — one data point per invocation, enabling count-based alarms
3. THE `Emit_Helper` SHALL attach the following CloudWatch dimensions to every metric data point:
   - `ModelId` — the full Bedrock model identifier string as returned in the response (e.g. `amazon.nova-lite-v1:0` or the full Haiku model ID)
   - `Outcome` — `"success"` when Nova_Lite responded, `"fallback"` when Nova_Lite failed and Haiku was used
4. WHEN the `Emit_Helper` call throws an error, THE `Analyzer` SHALL log the error using `jobLogger` at `warn` level and SHALL continue normal execution without rethrowing.
5. THE `Analyzer` SHALL call the `Emit_Helper` using fire-and-forget with a `.catch()` handler that routes errors to the `warn`-level log in criterion 4, so that a CloudWatch API timeout does not increase session processing latency.
6. WHEN `BedrockLatencyMs` is computed, THE `Emit_Helper` SHALL accept the start timestamp as a millisecond-epoch integer (compatible with `Date.now()`) measured by the caller immediately before the Bedrock call, and SHALL compute the duration as `Date.now() - startTimestamp`, emitting the actual calculated value including `0` if the duration rounds to zero milliseconds.
7. THE `Emit_Helper` SHALL NOT emit a `SessionId` as a CloudWatch dimension, because high-cardinality dimensions increase CloudWatch costs; session correlation SHALL be handled via structured Pino logs already emitted by the Analyzer.

---

### Requirement 3: Environment Variable Registration

**User Story:** As a developer, I want all CloudWatch environment variables validated at startup alongside existing variables, so that a misconfigured deployment fails loudly at boot rather than silently at the first metric emission.

#### Acceptance Criteria

1. IF `CLOUDWATCH_REGION` is absent or resolves to an empty string at startup, THE `Env_Validator` SHALL include `CLOUDWATCH_REGION` in the startup error output and SHALL call `process.exit(1)`.
2. IF `CLOUDWATCH_NAMESPACE` is absent or resolves to an empty string at startup, THE `Env_Validator` SHALL include `CLOUDWATCH_NAMESPACE` in the startup error output and SHALL call `process.exit(1)`.
3. WHEN both `CLOUDWATCH_REGION` and `CLOUDWATCH_NAMESPACE` are present and non-empty, THE `Env_Validator` SHALL complete validation for these two variables without error.
4. THE `Env_Validator` SHALL NOT require a separate CloudWatch access key entry when `BEDROCK_ACCESS_KEY_ID` or its aliases are already present and non-empty, because the same IAM credentials are reused for CloudWatch calls.
5. IF the resolved IAM credentials are present but lack `cloudwatch:PutMetricData` permission, THE `Env_Validator` SHALL surface a clear error message at startup identifying the missing IAM permission, so the developer can fix the IAM policy before deployment.

---

### Requirement 4: Free-Tier Budget Compliance

**User Story:** As a developer, I want CloudWatch metric emission to be strictly event-driven and bounded by session volume, so that the feature never introduces background polling that could exhaust the Upstash Redis free-tier budget.

#### Acceptance Criteria

1. THE `Emit_Helper` SHALL be called only from within `runAnalyzeJob()`, triggered by a BullMQ job event, and SHALL NOT be called from any timer, `setInterval`, `setTimeout`, `setImmediate`, or recursive `process.nextTick` loop.
2. WHEN a session analysis completes, THE `Emit_Helper` SHALL emit exactly one `PutMetricData` request per session, batching all metric data points collected during that single `runAnalyzeJob()` invocation into a single API call.
3. THE `Emit_Helper` SHALL NOT interact with Redis, BullMQ queues, or Upstash in any way; CloudWatch API calls are direct AWS SDK calls and do not consume Redis commands. IF `PutMetricData` throws, THE `Emit_Helper` SHALL log the error with the session ID and continue without retry, preserving the session's processing outcome.
4. THE `CloudWatch_Client` module SHALL NOT start any background process, worker thread, interval, or deferred loop during import execution or in top-level module scope; all initialisation SHALL be deferred to the first explicit call.

---

### Requirement 5: EC2 CPU Alarm

**User Story:** As a developer, I want a CloudWatch alarm that fires when EC2 CPU is sustained above 80%, so that I am notified before the t3.micro instance becomes a bottleneck.

#### Acceptance Criteria

1. THE `CPU_Alarm` SHALL monitor the `CPUUtilization` metric in the `AWS/EC2` namespace for the EC2_Instance identified by its `InstanceId` dimension.
2. THE `CPU_Alarm` threshold SHALL be set to `80` percent.
3. THE `CPU_Alarm` SHALL enter `ALARM` state only WHEN `CPUUtilization` equals or exceeds `80` percent for `2` consecutive evaluation periods of `5` minutes each (total sustained duration: 10 minutes).
4. THE `CPU_Alarm` SHALL use the `Average` statistic over each evaluation period.
5. WHERE an SNS_Topic is configured, THE `CPU_Alarm` SHALL send a notification to the SNS_Topic on state transition to `ALARM`.
6. THE `CPU_Alarm` configuration SHALL be defined as infrastructure-as-code (AWS CLI `put-metric-alarm` command or equivalent CDK construct) stored in the repository, not created manually through the AWS console.
7. WHEN `CPUUtilization` drops below `80` percent for `2` consecutive evaluation periods after an `ALARM` state, THE `CPU_Alarm` SHALL transition to `OK` state.

---

### Requirement 6: EC2 Memory Alarm

**User Story:** As a developer, I want a CloudWatch alarm on EC2 memory utilisation, so that I can detect memory pressure on the t3.micro before the Node.js process is OOM-killed.

#### Acceptance Criteria

1. THE `Memory_Alarm` SHALL monitor a `mem_used_percent` metric for the EC2_Instance, scoped to the specific `InstanceId` dimension to prevent matching other instances.
2. IF the CloudWatch_Agent is installed on the EC2_Instance, THE `Memory_Alarm` SHALL source the `mem_used_percent` metric from the `CWAgent` namespace emitted by the CloudWatch_Agent.
3. IF the CloudWatch_Agent is not installed, THE `Memory_Alarm` SHALL source the `mem_used_percent` metric from a custom metric emitted by the API process using the `Emit_Helper` in the `Hearloop/Pipeline` namespace.
4. THE `Memory_Alarm` threshold SHALL be set to `85` percent.
5. WHEN `mem_used_percent` equals or exceeds `85` percent for `2` consecutive evaluation periods of `5` minutes each, THE `Memory_Alarm` SHALL enter `ALARM` state.
6. THE `Memory_Alarm` SHALL use the `Average` statistic over each evaluation period.
7. WHERE an SNS_Topic is configured, THE `Memory_Alarm` SHALL send a notification to the SNS_Topic on state transition to `ALARM`.
8. THE `Memory_Alarm` SHALL be configured with `treat missing data as breaching`, so that if the CloudWatch_Agent crashes or the API process stops emitting the custom metric, the alarm enters `ALARM` state rather than remaining in `INSUFFICIENT_DATA`.
9. THE `Memory_Alarm` configuration SHALL be defined as infrastructure (AWS console, CLI, or CDK), not as runtime API code.

---

### Requirement 7: Infrastructure vs. Runtime Boundary

**User Story:** As a developer, I want a clear boundary between what is runtime API code and what is infrastructure configuration, so that the `cloudwatch.ts` module stays focused on metric emission and alarm setup is not mixed into application startup.

#### Acceptance Criteria

1. THE `CloudWatch_Client` module SHALL contain exactly the `CloudWatchClient` singleton and one or more `PutMetricData` helper functions, and no other symbols.
2. THE `CloudWatch_Client` module SHALL NOT contain alarm creation, alarm update, SNS topic creation, or any CloudWatch API calls other than `PutMetricData`.
3. THE `CPU_Alarm` and `Memory_Alarm` SHALL be created and managed exclusively through infrastructure tooling (AWS console, AWS CLI `put-metric-alarm`, or CDK) and not through any code under `apps/api/src/`.
4. WHEN the API process starts, THE `CloudWatch_Client` module SHALL NOT call any CloudWatch API to verify alarm state, describe existing alarms, or perform any operation other than `PutMetricData`.
5. IF `PutMetricData` throws, THE `CloudWatch_Client` module SHALL propagate the error to the caller without retrying and without calling any other CloudWatch API, keeping the module boundary clean on the failure path.

---

### Requirement 8: Observability Complementarity

**User Story:** As a developer, I want CloudWatch metrics to complement structured Pino logs rather than replace them, so that I have both queryable time-series data in AWS and detailed per-session log context in one place.

#### Acceptance Criteria

1. WHEN the `Emit_Helper` is called, THE `Analyzer` SHALL have already emitted a structured Pino log line at `info` level containing `sessionId`, `model`, `inputTokens`, `outputTokens`, and `sentiment`.
2. WHEN the `Emit_Helper` call succeeds, THE `Emit_Helper` SHALL produce no log output.
3. WHEN the `Emit_Helper` call fails, THE `Analyzer` SHALL emit a Pino log at `warn` level containing the error message and the metric payload that failed to emit, and the session SHALL continue to reach `completed` status and have its webhook enqueued.
4. THE `CloudWatch_Client` module SHALL NOT import or call `lib/logger.ts`; logging on failure is the caller's responsibility.

---

### Requirement 9: Metrics Baseline Capture

**User Story:** As a developer, I want before/after measurements recorded in `context/METRICS.md`, so that the CloudWatch feature produces a concrete, quotable portfolio metric.

#### Acceptance Criteria

1. IF at least 3 completed sessions exist in the database before deployment, THE developer SHALL record the following baseline values in `context/METRICS.md`: average Bedrock latency per session (from `processing_completed_at - processing_started_at`), average input token count, average output token count, and Nova_Lite vs. Haiku invocation count ratio.
2. WHEN the CloudWatch_Client module has been deployed and at least 5 sessions have been processed, THE developer SHALL query the CloudWatch console for a 1-hour window and record the P50 and P95 `BedrockLatencyMs` values in `context/METRICS.md`.
3. THE `context/METRICS.md` entry SHALL follow the project's standard format: Metric, Before, After, Delta, How measured.
