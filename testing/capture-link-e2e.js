#!/usr/bin/env node
/**
 * capture-link-e2e.js — QR / capture-link flow against production (or any env)
 *
 * Exercises the in-person surface end-to-end without a phone:
 *   register → create capture link (with Target) → mint session from link
 *   → open → upload-url → S3 PUT → finalize → poll dashboard for attributed session
 *
 * Run:
 *   node testing/capture-link-e2e.js
 *   BASE_URL=https://18-223-189-193.nip.io/v1 WEB_ORIGIN=https://hearloop.vercel.app node testing/capture-link-e2e.js
 *
 * Optional cleanup (deactivates the capture link; partner row remains):
 *   CLEANUP=1 node testing/capture-link-e2e.js
 */

const BASE_URL =
  process.env.BASE_URL ?? "https://18-223-189-193.nip.io/v1";
const WEB_ORIGIN =
  process.env.WEB_ORIGIN ?? "https://hearloop.vercel.app";
const TARGET_LABEL =
  process.env.TARGET_LABEL ?? "E2E Bay 2 — Oil Change";
const POLL_MS = Number(process.env.POLL_MS ?? 3000);
const POLL_MAX = Number(process.env.POLL_MAX ?? 40);
const CLEANUP = process.env.CLEANUP === "1";
const REQUIRE_COMPLETED = process.env.REQUIRE_COMPLETED === "1";

/** Minimal payload that passes validate-recording header checks (EBML magic). */
function fakeWebmAudio() {
  const buf = new Uint8Array(1024);
  buf[0] = 0x1a;
  buf[1] = 0x45;
  buf[2] = 0xdf;
  buf[3] = 0xa3;
  return buf;
}

const jsonHeaders = { "Content-Type": "application/json" };

async function api(method, path, { body, token } = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      ...jsonHeaders,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      `${method} ${path} → ${res.status}: ${JSON.stringify(data)}`
    );
  }
  return data;
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function pollDashboard(token, sessionId, targetKey) {
  for (let i = 0; i < POLL_MAX; i++) {
    const dash = await api("GET", "/partners/me/dashboard", { token });
    const session = (dash.sessions ?? []).find((s) => s.id === sessionId);
    if (!session) {
      process.stdout.write("?");
      await new Promise((r) => setTimeout(r, POLL_MS));
      continue;
    }

    if (session.target?.key !== targetKey) {
      throw new Error(
        `target.key mismatch: got ${JSON.stringify(session.target)} expected ${targetKey}`
      );
    }
    if (session.target?.label !== TARGET_LABEL) {
      throw new Error(`target.label mismatch: got ${session.target?.label}`);
    }
    if (session.target?.source !== "capture-link") {
      throw new Error(`target.source mismatch: ${session.target?.source}`);
    }

    if (session.status === "failed") {
      if (REQUIRE_COMPLETED) {
        throw new Error(`session ${sessionId} failed in pipeline`);
      }
      console.warn(
        `\n   ⚠ session status=failed (fake audio); target attribution still verified.`
      );
      console.warn(
        "   For full pipeline proof, scan the QR URL on a phone (see capture-link-e2e-phone.md)."
      );
      return { session, dash };
    }

    if (!REQUIRE_COMPLETED || session.status === "completed") {
      return { session, dash };
    }

    process.stdout.write(".");
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  throw new Error(`timed out waiting for session ${sessionId} to complete`);
}

async function main() {
  const stamp = Date.now();
  const email = `e2e-qr-${stamp}@hearloop-test.invalid`;
  const password = `test-${stamp}`;

  console.log("1/8 Register partner…");
  const reg = await api("POST", "/partners/register", {
    body: {
      name: `E2E QR ${stamp}`,
      email,
      password,
      industryTemplate: "automotive",
    },
  });
  const partnerToken = reg.sessionToken;
  assert(partnerToken, "missing sessionToken from register");

  console.log("2/8 Create capture link with Target…");
  const link = await api("POST", "/partners/me/capture-links", {
    token: partnerToken,
    body: { targetLabel: TARGET_LABEL },
  });
  const linkToken = link.token;
  const targetKey = link.targetKey ?? "e2e-bay-2-oil-change";
  const captureUrl = `${WEB_ORIGIN}/c/${linkToken}`;
  console.log(`   QR URL: ${captureUrl}`);

  console.log("3/8 Mint session from capture link (simulates QR scan)…");
  const mint = await api("POST", `/public/capture/${linkToken}/session`, {
    body: {},
  });
  const { sessionId, sessionToken } = mint;
  assert(sessionToken, "missing sessionToken from mint");

  console.log("4/8 Open session…");
  await api("POST", `/public/session/${sessionToken}/open`, { body: {} });

  console.log("5/8 Get upload URL + PUT audio…");
  const uploadMeta = await api(
    "POST",
    `/public/session/${sessionToken}/upload-url`,
    { body: { mimeType: "audio/webm" } }
  );
  const fakeAudio = fakeWebmAudio();
  const putRes = await fetch(uploadMeta.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": "audio/webm" },
    body: fakeAudio,
  });
  assert(putRes.ok, `S3 PUT failed: ${putRes.status}`);

  console.log("6/8 Finalize…");
  await api("POST", `/public/session/${sessionToken}/finalize`, {
    body: {
      storageKey: uploadMeta.storageKey,
      mimeType: "audio/webm",
      sizeBytes: fakeAudio.length,
    },
  });

  console.log("7/8 Poll dashboard for completed + attributed session");
  const { session, dash } = await pollDashboard(
    partnerToken,
    sessionId,
    targetKey
  );
  console.log("");

  const groups = {};
  for (const s of dash.sessions ?? []) {
    const key = s.target?.key ?? "__unattributed";
    groups[key] = (groups[key] ?? 0) + 1;
  }
  assert(
    groups[targetKey] >= 1,
    `By-Target group missing key ${targetKey}; groups=${JSON.stringify(groups)}`
  );

  console.log("8/8 By-Target grouping verified");

  console.log("9/9 Verify Vercel /c bridge (server mint + redirect)…");
  const bridgeRes = await fetch(captureUrl, { redirect: "manual" });
  const location = bridgeRes.headers.get("location") ?? "";
  assert(
    bridgeRes.status === 307 ||
      bridgeRes.status === 308 ||
      location.includes("/capture/"),
    `expected redirect from ${captureUrl}, got ${bridgeRes.status} location=${location}`
  );
  console.log(`   redirect → ${location || "(follow manually)"}`);

  if (CLEANUP) {
    console.log("10/10 Deactivate capture link…");
    await api("DELETE", `/partners/me/capture-links/${link.id}`, {
      token: partnerToken,
    });
  } else {
    console.log("10/10 Skip cleanup (set CLEANUP=1 to deactivate link)");
  }

  console.log("\n✅ Capture-link E2E passed");
  console.log(`   partner: ${email}`);
  console.log(`   session: ${sessionId} (${session.status})`);
  console.log(`   target:  ${session.target.label} [${session.target.key}]`);
  console.log(`   QR URL:  ${captureUrl}`);
  console.log(
    "\nPhone check: open the QR URL on your phone, record real audio, refresh dashboard → By target."
  );
}

main().catch((err) => {
  console.error("\n❌ Capture-link E2E failed:", err.message);
  process.exit(1);
});
