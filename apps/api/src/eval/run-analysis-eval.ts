import { analyzeTranscript } from "../lib/claude";
import { GOLDEN_SET, type GoldenCase } from "./golden-set";

const BUSINESS_CONTEXT =
  "Quick-service automotive shop. Oil changes, tire rotations, brake jobs.";

interface CaseResult {
  id: string;
  category: GoldenCase["category"];
  pass: boolean;
  expected: {
    sentiment: GoldenCase["expectedSentiment"];
    urgency: GoldenCase["expectedUrgency"];
    topics: string[];
  };
  actual: {
    sentiment: string;
    urgency: string;
    topics: string[];
    modelUsed?: string;
  };
  failures: string[];
}

function grade(c: GoldenCase, actual: CaseResult["actual"]): string[] {
  const failures: string[] = [];
  if (actual.sentiment !== c.expectedSentiment) {
    failures.push(
      `sentiment ${actual.sentiment} != ${c.expectedSentiment}`
    );
  }
  if (actual.urgency !== c.expectedUrgency) {
    failures.push(`urgency ${actual.urgency} != ${c.expectedUrgency}`);
  }
  const missing = c.expectedTopics.filter(
    (topic) => !actual.topics.includes(topic)
  );
  if (missing.length > 0) {
    failures.push(`missing topics: ${missing.join(", ")}`);
  }
  return failures;
}

async function main(): Promise<void> {
  const results: CaseResult[] = [];

  for (const c of GOLDEN_SET) {
    process.stderr.write(`eval ${c.id}...\n`);
    try {
      const analysis = await analyzeTranscript(c.transcript, {
        businessContext: BUSINESS_CONTEXT,
        target: c.target,
      });
      const actual = {
        sentiment: analysis.sentiment,
        urgency: analysis.urgency,
        topics: analysis.topics,
        modelUsed: analysis.modelUsed,
      };
      const failures = grade(c, actual);
      results.push({
        id: c.id,
        category: c.category,
        pass: failures.length === 0,
        expected: {
          sentiment: c.expectedSentiment,
          urgency: c.expectedUrgency,
          topics: c.expectedTopics,
        },
        actual,
        failures,
      });
    } catch (err) {
      results.push({
        id: c.id,
        category: c.category,
        pass: false,
        expected: {
          sentiment: c.expectedSentiment,
          urgency: c.expectedUrgency,
          topics: c.expectedTopics,
        },
        actual: { sentiment: "error", urgency: "error", topics: [] },
        failures: [err instanceof Error ? err.message : String(err)],
      });
    }
  }

  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass);

  console.log(
    `classifier accuracy: ${passed}/${results.length} on synthetic golden set`
  );
  if (failed.length > 0) {
    console.log("failures:");
    for (const r of failed) {
      console.log(
        `  - ${r.id} [${r.category}]: ${r.failures.join("; ")} (got ${r.actual.sentiment}/${r.actual.urgency} topics=${r.actual.topics.join(",")})`
      );
    }
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
