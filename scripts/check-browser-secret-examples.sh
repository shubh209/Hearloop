#!/usr/bin/env bash

set -euo pipefail

status=0

if rg -n 'sk-live_' apps/web/public apps/web/app/page.tsx; then
  echo "Browser-delivered files must not contain Partner secret-key examples." >&2
  status=1
fi

if rg -n 'sk-live_' apps/web/app/docs/page.tsx |
  rg -v 'All partner API endpoints require a Bearer token:|  -H "Authorization: Bearer sk-live_your_key"'; then
  echo "Browser-delivered files must not contain Partner secret-key examples." >&2
  status=1
fi

if rg -n '\bapiKey\b' apps/web/public/widget.js; then
  echo "The static widget must use embedKey, not apiKey." >&2
  status=1
fi

exit "$status"
