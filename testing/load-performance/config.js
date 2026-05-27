// config.js — shared constants for all k6 scripts
// Replace API_KEY with a real Hearloop API key before running

export const BASE_URL = 'https://18-223-189-193.nip.io/v1';

// Replace this with a real API key from your Hearloop dashboard
// Never commit a real key — use an environment variable instead:
//   k6 run -e API_KEY=sk-live_xxx smoke.js
export const API_KEY = __ENV.API_KEY || 'REPLACE_WITH_YOUR_API_KEY';

// Thresholds shared across all test types
export const THRESHOLDS = {
  // 95% of requests must complete under 3s
  http_req_duration: ['p(95)<3000'],
  // Error rate must stay below 1%
  http_req_failed: ['rate<0.01'],
};

// Minimal fake audio blob (1KB of silence) — avoids hitting S3 in load tests
// In a real test you'd upload an actual audio file
export const FAKE_AUDIO = new Uint8Array(1024).fill(0);
