#!/usr/bin/env bash
# One-shot GCP VPS provisioning for Bocardo (Ubuntu 24.04 LTS)
# Usage: sudo bash provision_vps.sh
set -euo pipefail

echo '==> System update + base packages'
apt-get update && apt-get upgrade -y
apt-get install -y ca-certificates curl gnupg ufw fail2ban unattended-upgrades git jq

echo '==> Swap (2G) — protects small VPS from OOM during docker builds'
if ! swapon --show | grep -q swapfile; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile
  mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo '==> Docker CE'
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" > /etc/apt/sources.list.d/docker.list
apt-get update && apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

echo '==> Deploy user'
id -u bocardo &>/dev/null || useradd -m -s /bin/bash bocardo
usermod -aG docker bocardo

echo '==> Firewall: SSH + HTTP/S only'
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo '==> Fail2ban + automatic security updates'
systemctl enable --now fail2ban
dpkg-reconfigure -f noninteractive unattended-upgrades || true

echo '==> Kernel tuning for high-connection realtime workloads'
cat >> /etc/sysctl.conf << 'SYSCTL'
net.core.somaxconn = 4096
net.ipv4.tcp_max_syn_backlog = 4096
net.ipv4.ip_local_port_range = 10240 65535
vm.overcommit_memory = 1
SYSCTL
sysctl -p

echo '==> Done. Next: clone repo to /opt/bocardo, create .env.production, run docker compose.'
