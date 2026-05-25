#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/opt/care-circle}"
APP_USER="${APP_USER:-carecircle}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run this script as root (sudo)."
  exit 1
fi

su -s /bin/bash -c "git -C '${APP_DIR}' pull --ff-only" "$APP_USER"
su -s /bin/bash -c "cd '${APP_DIR}' && npm install --omit=dev" "$APP_USER"
systemctl restart care-circle
systemctl status care-circle --no-pager
