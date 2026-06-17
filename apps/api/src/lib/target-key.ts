// hearloop/apps/api/src/lib/target-key.ts

// Normalize a human Target label into a stable grouping key so the dashboard can
// collapse "North Ave - Oil Change", "north ave oil change", etc. into one Target.
// Lowercase, collapse non-alphanumerics to single hyphens, trim, cap length.
export function normalizeTargetKey(label: string): string {
  const key = label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return key || "general";
}
