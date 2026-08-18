export function isInsightsQueryEnabled(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return env.INSIGHTS_QUERY_ENABLED === "true";
}
