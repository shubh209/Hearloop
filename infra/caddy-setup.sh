#!/usr/bin/env bash
# infra/caddy-setup.sh
#
# Installs Caddy on the EC2 instance and configures it as an HTTPS reverse
# proxy in front of the hearloop-api container on port 3001.
#
# Domain: 18-223-189-193.nip.io
#   nip.io resolves any IP-based subdomain to that IP automatically.
#   Let's Encrypt issues a real cert for it — no domain purchase needed.
#
# To migrate to a paid domain later:
#   1. Update DOMAIN below to your real domain (e.g. api.hearloop.dev)
#   2. Point an A record at 18.223.189.193
#   3. Re-run this script — Caddy fetches a new cert automatically
#
# Usage (run from your local machine):
#   ssh -i ~/.ssh/hearloop-key.pem ec2-user@18.223.189.193 'bash -s' < infra/caddy-setup.sh

set -euo pipefail

DOMAIN="18-223-189-193.nip.io"
API_PORT="3001"

echo "==> Installing Caddy..."
# Add Caddy's official repo and install
sudo dnf install -y 'dnf-command(copr)' 2>/dev/null || sudo yum install -y yum-plugin-copr 2>/dev/null || true
sudo dnf copr enable -y @caddy/caddy 2>/dev/null || true

# Fallback: install via direct binary download (works on any Amazon Linux)
if ! command -v caddy &>/dev/null; then
  echo "    dnf/copr not available — installing Caddy binary directly..."
  CADDY_VERSION="2.8.4"
  curl -fsSL "https://github.com/caddyserver/caddy/releases/download/v${CADDY_VERSION}/caddy_${CADDY_VERSION}_linux_amd64.tar.gz" \
    -o /tmp/caddy.tar.gz
  tar -xzf /tmp/caddy.tar.gz -C /tmp caddy
  sudo mv /tmp/caddy /usr/local/bin/caddy
  sudo chmod +x /usr/local/bin/caddy
  rm /tmp/caddy.tar.gz
fi

caddy version
echo "    ✓ Caddy installed"

# ---------------------------------------------------------------------------
# Caddyfile
# ---------------------------------------------------------------------------
echo "==> Writing Caddyfile..."
sudo mkdir -p /etc/caddy

sudo tee /etc/caddy/Caddyfile > /dev/null <<EOF
# Hearloop API — HTTPS reverse proxy
# Auto-managed TLS via Let's Encrypt (HTTP-01 challenge on port 80)
${DOMAIN} {
    reverse_proxy localhost:${API_PORT}

    # Forward real client IP to the Node process
    header_up X-Real-IP {remote_host}
    header_up X-Forwarded-For {remote_host}
    header_up X-Forwarded-Proto {scheme}

    # Security headers
    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        X-Content-Type-Options "nosniff"
        X-Frame-Options "DENY"
    }

    # Access log
    log {
        output file /var/log/caddy/access.log {
            roll_size 10mb
            roll_keep 5
        }
    }
}

# Redirect bare HTTP to HTTPS (Caddy handles this automatically,
# but explicit redirect ensures clean behaviour)
http://${DOMAIN} {
    redir https://${DOMAIN}{uri} permanent
}
EOF

sudo mkdir -p /var/log/caddy
echo "    ✓ Caddyfile written to /etc/caddy/Caddyfile"

# ---------------------------------------------------------------------------
# systemd service
# ---------------------------------------------------------------------------
echo "==> Creating Caddy systemd service..."

# Create caddy user if it doesn't exist
id -u caddy &>/dev/null || sudo useradd --system --home /var/lib/caddy --shell /sbin/nologin caddy
sudo mkdir -p /var/lib/caddy
sudo chown caddy:caddy /var/lib/caddy
sudo chown caddy:caddy /var/log/caddy 2>/dev/null || true

sudo tee /etc/systemd/system/caddy.service > /dev/null <<'UNIT'
[Unit]
Description=Caddy HTTP/2 web server
Documentation=https://caddyserver.com/docs/
After=network-online.target
Wants=network-online.target

[Service]
Type=notify
User=caddy
Group=caddy
ExecStart=/usr/local/bin/caddy run --environ --config /etc/caddy/Caddyfile
ExecReload=/usr/local/bin/caddy reload --config /etc/caddy/Caddyfile --force
TimeoutStopSec=5s
LimitNOFILE=1048576
PrivateTmp=true
ProtectSystem=full
AmbientCapabilities=CAP_NET_BIND_SERVICE

[Install]
WantedBy=multi-user.target
UNIT

sudo systemctl daemon-reload
sudo systemctl enable caddy
sudo systemctl start caddy

echo "    ✓ Caddy service started"

# ---------------------------------------------------------------------------
# Verify
# ---------------------------------------------------------------------------
echo ""
echo "==> Waiting 5s for Caddy to obtain TLS certificate..."
sleep 5

echo "==> Testing HTTPS endpoint..."
if curl --fail --silent --max-time 15 "https://${DOMAIN}/health" | grep -q '"status"'; then
  echo "    ✓ HTTPS health check passed"
  echo ""
  echo "Done! API is now available at:"
  echo "  https://${DOMAIN}"
  echo "  https://${DOMAIN}/health"
  echo "  https://${DOMAIN}/health/detailed"
else
  echo "    ⚠ HTTPS check not ready yet — cert may still be issuing (takes ~30s)"
  echo "    Check status: sudo systemctl status caddy"
  echo "    Check logs:   sudo journalctl -u caddy -f"
fi

echo ""
echo "Next steps:"
echo "  1. Update NEXT_PUBLIC_API_URL in Vercel to: https://${DOMAIN}"
echo "  2. Update APP_URL in /home/ec2-user/.env to: https://${DOMAIN}"
echo "  3. Remove the Vercel proxy rewrite from apps/web/next.config.js (optional)"
