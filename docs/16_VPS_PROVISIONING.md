# 16 — VPS Provisioning on Google Cloud

Target: **one e2-standard-4 (4 vCPU / 16 GB) or e2-standard-2 (2 vCPU / 8 GB)** running the whole stack. Start with e2-standard-4 if budget allows — Docker builds + Postgres share the box.

## 1. Create the VM

```bash
gcloud compute instances create bocardo-prod \
  --project=<your-gcp-project> \
  --zone=asia-south1-a \
  --machine-type=e2-standard-4 \
  --image-family=ubuntu-2404-lts-amd64 --image-project=ubuntu-os-cloud \
  --boot-disk-size=80GB --boot-disk-type=pd-ssd \
  --tags=bocardo-web
```

Mumbai/Delhi (`asia-south1/2`) keeps latency low for Indian users. PD-SSD is mandatory — Postgres on standard PD will hurt.

## 2. Firewall (VPC level)

```bash
gcloud compute firewall-rules create bocardo-web \
  --target-tags=bocardo-web --allow tcp:80,tcp:443
```

No other inbound ports. Postgres/Redis bind to the **internal docker network only** (never published to host) — double protection.

## 3. Reserve a Static IP

```bash
gcloud compute addresses create bocardo-ip --region=asia-south1
# attach to the instance (or note the ephemeral IP and promote it)
gcloud compute addresses describe bocardo-ip --region=asia-south1  # note the IP for DNS
```

## 4. Provision the OS

```bash
gcloud compute ssh bocardo-prod --zone=asia-south1-a
sudo bash -c "$(curl -fsSL https://raw.githubusercontent.com/anurag3407/Bocardo/main/infra/scripts/provision_vps.sh)"
# (or scp infra/scripts/provision_vps.sh and run it)
```

The script installs: Docker CE + compose plugin, 2G swap (build OOM protection), UFW (22/80/443 only), fail2ban, unattended security upgrades, kernel tuning for many concurrent socket connections.

## 5. Harden SSH (do this first!)

```bash
sudo sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sudo systemctl reload ssh
```
GCP OS Login already gives you key-based auth; password auth must be off.

## 6. Deploy User & Repo

```bash
sudo mkdir -p /opt/bocardo && sudo chown bocardo:bocardo /opt/bocardo
sudo -u bocardo git clone https://github.com/anurag3407/Bocardo.git /opt/bocardo
cd /opt/bocardo
sudo -u bocardo cp .env.production.example .env.production
chmod 600 .env.production && $EDITOR .env.production   # fill every CHANGE_ME
```

## Sizing Guide

| Load | Machine | Notes |
|---|---|---|
| Dev/pilot | e2-medium (2vCPU/4GB) | add 4G swap; builds will be slow |
| **Launch (≤2k orders/day)** | **e2-standard-4 (4/16GB)** | recommended start |
| Growth | e2-standard-8 + managed DB | see doc 01 scaling path |

## Cost Control

- Committed-use discount after month 1 (~37% off 1yr).
- Snapshot schedule on the boot disk (daily, keep 7).
- Budget alert at ₹X/month in GCP Billing.
