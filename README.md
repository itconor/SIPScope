# SIPScope

Self-hosted SIP server for broadcast outside broadcasts. Replaces paid SIP.audio accounts with your own registrar/proxy — making internal OB-to-station calls free.

![SIPScope Login](https://img.shields.io/badge/SIPScope-Broadcast_SIP_Server-17a8ff?style=for-the-badge)

## What it does

SIPScope sits on a VPS and acts as a SIP registrar and call proxy between your OB equipment (Roadcaster, codec, softphone) and your studio (Tieline, codec, playout). Both devices register to SIPScope, and calls between them are routed internally — no third-party SIP provider needed.

```
Roadcaster (OB) ──SIP──▶ SIPScope (VPS) ──SIP──▶ Tieline (Studio)
                              │
                        rtpengine (RTP relay)
                              │
Roadcaster ◀────────── RTP audio ──────────▶ Tieline
```

## Quick Install

On a fresh Ubuntu/Debian VPS with your domain's DNS already pointing to the server:

```bash
curl -sSL https://raw.githubusercontent.com/itconor/SIPScope/main/install.sh | sudo bash
```

The installer handles everything: Docker, firewall, Let's Encrypt SSL, SIP account creation, and auto-start on boot.

## Features

- **SIP Registrar** — digest authentication, NAT-aware contact binding
- **Call Proxy (B2BUA)** — routes calls between registered devices with SDP rewriting
- **RTP Media Relay** — rtpengine handles NAT traversal, symmetric NAT on 4G, RTP latching
- **TLS + SRTP** — Let's Encrypt certificates, secure signaling and media
- **Web Admin UI** — SIPScope dashboard with live device status, active calls, account management
- **Codec Agnostic** — passes through whatever your devices negotiate (G.722, Opus, G.711)
- **Docker Deployment** — single `docker compose up` with host networking
- **Auto SSL Renewal** — cron job renews certs and restarts the server automatically

## Web Admin UI

Access the admin dashboard at `http://your-server:3000` after installation.

- **Dashboard** — live view of registered devices (online/offline, IP, user-agent) and active calls with duration
- **Accounts** — add, edit, and delete SIP accounts from the browser

## Manual Setup

If you prefer to set things up yourself instead of using the installer:

### Prerequisites

- Docker and Docker Compose
- Node.js 20+ (for account management CLI)
- A public IP address
- A domain with DNS pointing to your server (for SSL)

### Steps

```bash
git clone https://github.com/itconor/SIPScope.git
cd SIPScope

# Install dependencies
npm ci
cd web-ui && npm ci && npm run build && cd ..

# Configure
cp .env.example .env
# Edit .env — set PUBLIC_IP to your server's public IP
# Edit config/server.json — set domain, publicIp, admin credentials

# Create SIP accounts
npx ts-node scripts/manage-accounts.ts add --user roadcaster-ob1 --password yourpassword
npx ts-node scripts/manage-accounts.ts add --user tieline-studio --password yourpassword

# Add SSL certs (optional but recommended)
# Place your cert at certs/server.crt and key at certs/server.key

# Build and run
docker compose up -d
```

### Firewall

Open these ports on your server:

| Port | Protocol | Purpose |
|------|----------|---------|
| 5060 | UDP/TCP | SIP signaling |
| 5061 | TCP | SIP over TLS |
| 8089 | TCP | SIP over WebSocket (WSS) |
| 3000 | TCP | Web admin UI |
| 20000-30000 | UDP | RTP media |

## Device Configuration

Point your broadcast equipment to SIPScope:

| Setting | Value |
|---------|-------|
| SIP Server | `your-domain.com` |
| Port | `5060` (or `5061` for TLS) |
| WebSocket URL | `wss://your-domain.com:8089` |
| Transport | UDP, TLS, or WebSocket |
| Username | *(account you created)* |
| Password | *(account password)* |
| Realm | `your-domain.com` |

## Managing Accounts

### Via Web UI

Open `http://your-server:3000`, log in, and go to the Accounts page.

### Via CLI

```bash
# Add account
npx ts-node scripts/manage-accounts.ts add --user ob-unit-2 --password mypassword --display "OB Unit 2"

# List accounts
npx ts-node scripts/manage-accounts.ts list

# Reset password
npx ts-node scripts/manage-accounts.ts reset --user ob-unit-2 --password newpassword

# Remove account
npx ts-node scripts/manage-accounts.ts remove --user ob-unit-2
```

## Architecture

| Component | Role |
|-----------|------|
| **Node.js SIP Server** | Registrar + B2BUA call proxy using the `sip` npm package |
| **rtpengine** | RTP media relay — handles NAT traversal, SDP rewriting, codec passthrough |
| **Express API** | REST endpoints for account CRUD and live status |
| **React SPA** | Admin dashboard served as static files |

Both containers run with `network_mode: host` because SIP and RTP embed IP addresses in their payloads — Docker's NAT bridge breaks this.

## Useful Commands

```bash
# View logs
cd /opt/sipserver && docker compose logs -f

# Restart
cd /opt/sipserver && docker compose restart

# Check SSL certificate status
certbot certificates

# Rebuild after changes
docker compose build && docker compose up -d
```

## License

ISC
