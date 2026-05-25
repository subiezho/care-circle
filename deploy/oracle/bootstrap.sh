#!/usr/bin/env bash
set -Eeuo pipefail

# Usage:
#   sudo bash deploy/oracle/bootstrap.sh
# Optional env vars:
#   REPO_URL, APP_DIR, DATA_DIR, APP_PORT, APP_USER, APP_GROUP

REPO_URL="${REPO_URL:-https://github.com/subiezho/care-circle.git}"
APP_DIR="${APP_DIR:-/opt/care-circle}"
DATA_DIR="${DATA_DIR:-/var/lib/care-circle}"
APP_PORT="${APP_PORT:-3001}"
APP_USER="${APP_USER:-carecircle}"
APP_GROUP="${APP_GROUP:-carecircle}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run this script as root (sudo)."
  exit 1
fi

log() {
  printf '\n[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
}

run_as_app() {
  su -s /bin/bash -c "$1" "$APP_USER"
}

install_packages() {
  if command -v apt-get >/dev/null 2>&1; then
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -y
    apt-get install -y ca-certificates curl git nodejs npm nginx
    return
  fi

  if command -v dnf >/dev/null 2>&1; then
    dnf -y install ca-certificates curl git nodejs npm nginx
    return
  fi

  if command -v yum >/dev/null 2>&1; then
    yum -y install ca-certificates curl git nodejs npm nginx
    return
  fi

  echo "Unsupported package manager. Install git/nodejs/npm/nginx manually."
  exit 1
}

write_service() {
  cat >/etc/systemd/system/care-circle.service <<SERVICE
[Unit]
Description=Care Circle MVP
After=network.target

[Service]
Type=simple
User=${APP_USER}
Group=${APP_GROUP}
WorkingDirectory=${APP_DIR}
EnvironmentFile=/etc/care-circle.env
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
SERVICE
}

write_env() {
  cat >/etc/care-circle.env <<ENV
NODE_ENV=production
PORT=${APP_PORT}
DATA_DIR=${DATA_DIR}
ENV
}

write_nginx() {
  cat >/etc/nginx/sites-available/care-circle <<NGINX
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    location / {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
NGINX

  ln -sf /etc/nginx/sites-available/care-circle /etc/nginx/sites-enabled/care-circle
  rm -f /etc/nginx/sites-enabled/default || true
}

log "Installing dependencies"
install_packages

log "Preparing system user and directories"
if ! id -u "$APP_USER" >/dev/null 2>&1; then
  useradd --system --create-home --home-dir "/home/${APP_USER}" --shell /usr/sbin/nologin "$APP_USER"
fi

if ! getent group "$APP_GROUP" >/dev/null 2>&1; then
  groupadd --system "$APP_GROUP"
fi

usermod -a -G "$APP_GROUP" "$APP_USER" || true
mkdir -p "$APP_DIR" "$DATA_DIR"
chown -R "$APP_USER:$APP_GROUP" "$APP_DIR" "$DATA_DIR"

log "Cloning/updating repo"
if [[ -d "${APP_DIR}/.git" ]]; then
  run_as_app "git -C '${APP_DIR}' fetch --depth 1 origin main"
  run_as_app "git -C '${APP_DIR}' reset --hard origin/main"
else
  rm -rf "${APP_DIR}"/*
  run_as_app "git clone --depth 1 '${REPO_URL}' '${APP_DIR}'"
fi

log "Installing npm dependencies"
run_as_app "cd '${APP_DIR}' && npm install --omit=dev"

log "Configuring systemd service"
write_env
write_service
systemctl daemon-reload
systemctl enable --now care-circle

log "Configuring nginx reverse proxy"
write_nginx
nginx -t
systemctl enable --now nginx
systemctl reload nginx

log "Health check"
sleep 2
curl -sS "http://127.0.0.1:${APP_PORT}/healthz" || true

echo
echo "Done."
echo "Open in browser: http://<YOUR_PUBLIC_IP>/"
echo "If site is not reachable, open port 80 in OCI Security List + VM firewall."
echo "Service logs: journalctl -u care-circle -n 80 --no-pager"
