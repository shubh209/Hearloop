# Hearloop — Testing

This folder contains all testing scripts, configs, and documentation for Hearloop.

## Structure

```
testing/
  load-performance/       — k6 scripts for load, stress, spike, and smoke tests
  vulnerability-security/ — OWASP ZAP configs, manual security checklists, npm audit
  uptime-monitoring/      — UptimeRobot setup, endpoint list, incident log
```

## Quick reference

| Concern | Tool | Folder |
|---------|------|--------|
| 200 concurrent users | k6 | `load-performance/` |
| SQL injection, XSS, SSRF | OWASP ZAP | `vulnerability-security/` |
| Site down alerts | UptimeRobot | `uptime-monitoring/` |

## Live endpoints

- API: `https://18-223-189-193.nip.io`
- Web: `https://hearloop.vercel.app`
- Health: `https://18-223-189-193.nip.io/health/detailed`
