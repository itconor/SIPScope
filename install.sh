#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────
# SIPScope Installer
# Run on a fresh Ubuntu/Debian VPS:
#   curl -sSL https://raw.githubusercontent.com/itconor/SIPScope/main/install.sh | sudo bash
# ─────────────────────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

INSTALL_DIR="/opt/sipserver"
REPO_URL="https://github.com/itconor/SIPScope.git"

log()  { echo -e "${GREEN}[+]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }
ask()  { echo -en "${CYAN}[?]${NC} $1"; }

# Read from /dev/tty so prompts work when piped via curl
prompt()     { read -r "$1" < /dev/tty; }
prompt_s()   { read -rs "$1" < /dev/tty; echo; }

# ─────────────────────────────────────────────────────────────
# Pre-flight checks
# ─────────────────────────────────────────────────────────────

if [[ $EUID -ne 0 ]]; then
  err "This script must be run as root (sudo bash install.sh)"
fi

log "SIPScope Installer"
echo ""

# ─────────────────────────────────────────────────────────────
# Gather configuration
# ─────────────────────────────────────────────────────────────

# Detect public IP
DETECTED_IP=$(curl -4 -s --max-time 5 https://ifconfig.me || curl -4 -s --max-time 5 https://api.ipify.org || echo "")

ask "Public IP address [${DETECTED_IP}]: "
prompt PUBLIC_IP
PUBLIC_IP="${PUBLIC_IP:-$DETECTED_IP}"
[[ -z "$PUBLIC_IP" ]] && err "Could not detect public IP. Please provide one."

ask "SIP domain (e.g. sip.yourdomain.com): "
prompt SIP_DOMAIN
[[ -z "$SIP_DOMAIN" ]] && err "Domain is required for SSL certificates."

ask "Admin web UI username [admin]: "
prompt ADMIN_USER
ADMIN_USER="${ADMIN_USER:-admin}"

ask "Admin web UI password: "
prompt_s ADMIN_PASS
[[ -z "$ADMIN_PASS" ]] && err "Admin password is required."

ask "Admin email (for Let's Encrypt notifications): "
prompt ADMIN_EMAIL
[[ -z "$ADMIN_EMAIL" ]] && err "Email is required for Let's Encrypt."

echo ""
ask "Set up SIP accounts now? (y/n) [y]: "
prompt SETUP_ACCOUNTS
SETUP_ACCOUNTS="${SETUP_ACCOUNTS:-y}"

SIP_ACCOUNTS=()
if [[ "$SETUP_ACCOUNTS" =~ ^[Yy] ]]; then
  while true; do
    ask "SIP account username (blank to finish): "
    prompt SIP_USER
    [[ -z "$SIP_USER" ]] && break

    ask "SIP account password for '${SIP_USER}': "
    prompt_s SIP_PASS
    [[ -z "$SIP_PASS" ]] && { warn "Skipping — password required."; continue; }

    ask "Display name for '${SIP_USER}' (optional): "
    prompt SIP_DISPLAY

    SIP_ACCOUNTS+=("${SIP_USER}:${SIP_PASS}:${SIP_DISPLAY}")
  done
fi

# Generate session secret
SESSION_SECRET=$(openssl rand -hex 32)

echo ""
echo -e "${BOLD}─── Configuration Summary ───${NC}"
echo -e "  Public IP:    ${CYAN}${PUBLIC_IP}${NC}"
echo -e "  Domain:       ${CYAN}${SIP_DOMAIN}${NC}"
echo -e "  Admin user:   ${CYAN}${ADMIN_USER}${NC}"
echo -e "  Admin email:  ${CYAN}${ADMIN_EMAIL}${NC}"
echo -e "  SIP accounts: ${CYAN}${#SIP_ACCOUNTS[@]}${NC}"
echo -e "${BOLD}─────────────────────────────${NC}"
echo ""
ask "Proceed with installation? (y/n) [y]: "
prompt CONFIRM
[[ ! "$CONFIRM" =~ ^[Yy]?$ ]] && { echo "Aborted."; exit 0; }

# ─────────────────────────────────────────────────────────────
# Install system dependencies
# ─────────────────────────────────────────────────────────────

log "Updating system packages..."
apt-get update -qq

log "Installing dependencies..."
apt-get install -y -qq curl git ufw certbot > /dev/null

# Install Docker if not present
if ! command -v docker &> /dev/null; then
  log "Installing Docker..."
  curl -fsSL https://get.docker.com | bash > /dev/null 2>&1
  systemctl enable docker
  systemctl start docker
  log "Docker installed."
else
  log "Docker already installed."
fi

# Install Docker Compose plugin if not present
if ! docker compose version &> /dev/null; then
  log "Installing Docker Compose plugin..."
  apt-get install -y -qq docker-compose-plugin > /dev/null
fi

# Install Node.js if not present (needed for account setup)
if ! command -v node &> /dev/null; then
  log "Installing Node.js..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - > /dev/null 2>&1
  apt-get install -y -qq nodejs > /dev/null
fi

# ─────────────────────────────────────────────────────────────
# Set up firewall
# ─────────────────────────────────────────────────────────────

log "Configuring firewall..."
ufw --force reset > /dev/null 2>&1
ufw default deny incoming > /dev/null
ufw default allow outgoing > /dev/null
ufw allow 22/tcp > /dev/null          # SSH
ufw allow 5060/tcp > /dev/null        # SIP TCP
ufw allow 5060/udp > /dev/null        # SIP UDP
ufw allow 5061/tcp > /dev/null        # SIP TLS
ufw allow 8089/tcp > /dev/null        # SIP WebSocket (WSS)
ufw allow 8080/tcp > /dev/null        # Web admin
ufw allow 80/tcp > /dev/null          # HTTP (certbot)
ufw allow 443/tcp > /dev/null         # HTTPS (certbot)
ufw allow 20000:30000/udp > /dev/null # RTP media
ufw --force enable > /dev/null
log "Firewall configured."

# ─────────────────────────────────────────────────────────────
# Obtain SSL certificates
# ─────────────────────────────────────────────────────────────

log "Obtaining SSL certificate for ${SIP_DOMAIN}..."

# Stop anything on port 80 temporarily
systemctl stop nginx 2>/dev/null || true
fuser -k 80/tcp 2>/dev/null || true

certbot certonly \
  --standalone \
  --non-interactive \
  --agree-tos \
  --email "$ADMIN_EMAIL" \
  --domain "$SIP_DOMAIN" \
  --preferred-challenges http

CERT_PATH="/etc/letsencrypt/live/${SIP_DOMAIN}"

if [[ ! -f "${CERT_PATH}/fullchain.pem" ]]; then
  err "SSL certificate generation failed. Make sure ${SIP_DOMAIN} DNS points to ${PUBLIC_IP}."
fi

log "SSL certificate obtained."

# ─────────────────────────────────────────────────────────────
# Deploy application
# ─────────────────────────────────────────────────────────────

log "Setting up application in ${INSTALL_DIR}..."

# Clone the repo from GitHub
if [[ -d "${INSTALL_DIR}/.git" ]]; then
  log "Updating existing installation..."
  cd "${INSTALL_DIR}"
  git pull --ff-only origin main 2>/dev/null || true
else
  rm -rf "${INSTALL_DIR}"
  git clone "${REPO_URL}" "${INSTALL_DIR}"
fi

mkdir -p "${INSTALL_DIR}/config" "${INSTALL_DIR}/certs"

# ─────────────────────────────────────────────────────────────
# Configure SSL certs
# ─────────────────────────────────────────────────────────────

log "Linking SSL certificates..."
ln -sf "${CERT_PATH}/fullchain.pem" "${INSTALL_DIR}/certs/server.crt"
ln -sf "${CERT_PATH}/privkey.pem" "${INSTALL_DIR}/certs/server.key"

# ─────────────────────────────────────────────────────────────
# Write configuration
# ─────────────────────────────────────────────────────────────

log "Writing server configuration..."
cat > "${INSTALL_DIR}/config/server.json" << SERVEREOF
{
  "domain": "${SIP_DOMAIN}",
  "publicIp": "${PUBLIC_IP}",
  "sip": {
    "port": 5060,
    "tlsPort": 5061,
    "wsPort": 8089
  },
  "rtpengine": {
    "host": "127.0.0.1",
    "port": 22222
  },
  "web": {
    "port": 8080,
    "adminUser": "${ADMIN_USER}",
    "adminPassword": "${ADMIN_PASS}",
    "sessionSecret": "${SESSION_SECRET}"
  },
  "registrationExpiry": 60,
  "realm": "${SIP_DOMAIN}",
  "logLevel": "info"
}
SERVEREOF

# Write .env
cat > "${INSTALL_DIR}/.env" << ENVEOF
PUBLIC_IP=${PUBLIC_IP}
NODE_ENV=production
ENVEOF

# ─────────────────────────────────────────────────────────────
# Create SIP accounts
# ─────────────────────────────────────────────────────────────

log "Setting up SIP accounts..."

# Install node deps for the account CLI
cd "${INSTALL_DIR}"
npm ci --quiet > /dev/null 2>&1

# Start with empty accounts
echo '{}' > "${INSTALL_DIR}/config/accounts.json"

for entry in "${SIP_ACCOUNTS[@]}"; do
  IFS=':' read -r uname upass udisplay <<< "$entry"
  args="add --user ${uname} --password ${upass}"
  [[ -n "$udisplay" ]] && args="${args} --display ${udisplay}"
  npx ts-node scripts/manage-accounts.ts ${args} 2>/dev/null || warn "Failed to create account: ${uname}"
done

if [[ ${#SIP_ACCOUNTS[@]} -eq 0 ]]; then
  echo '{}' > "${INSTALL_DIR}/config/accounts.json"
  log "No accounts created. Add them later via the web UI or CLI."
fi

# ─────────────────────────────────────────────────────────────
# Build and start containers
# ─────────────────────────────────────────────────────────────

log "Building Docker containers (this may take a few minutes)..."
cd "${INSTALL_DIR}"
docker compose build --quiet

log "Starting services..."
docker compose up -d

# ─────────────────────────────────────────────────────────────
# Set up SSL auto-renewal
# ─────────────────────────────────────────────────────────────

log "Setting up SSL auto-renewal..."
cat > /etc/cron.d/sipserver-certbot << 'CRONEOF'
# Renew SSL certs twice daily, restart SIP server on renewal
0 3,15 * * * root certbot renew --quiet --deploy-hook "cd /opt/sipserver && docker compose restart sipserver"
CRONEOF

# ─────────────────────────────────────────────────────────────
# Set up systemd service for auto-start on boot
# ─────────────────────────────────────────────────────────────

log "Creating systemd service..."
cat > /etc/systemd/system/sipserver.service << SVCEOF
[Unit]
Description=SIPScope (Docker Compose)
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=${INSTALL_DIR}
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
SVCEOF

systemctl daemon-reload
systemctl enable sipserver.service > /dev/null 2>&1

# ─────────────────────────────────────────────────────────────
# Verify services
# ─────────────────────────────────────────────────────────────

log "Verifying services..."
sleep 5

SIPSERVER_RUNNING=$(docker compose ps --format json 2>/dev/null | grep -c '"running"' || echo "0")
if [[ "$SIPSERVER_RUNNING" -ge 1 ]]; then
  log "Services are running."
else
  warn "Services may not have started correctly. Check: docker compose -f ${INSTALL_DIR}/docker-compose.yml logs"
fi

# ─────────────────────────────────────────────────────────────
# Done!
# ─────────────────────────────────────────────────────────────

echo ""
echo -e "${BOLD}${GREEN}════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}${GREEN}  SIPScope Installation Complete!${NC}"
echo -e "${BOLD}${GREEN}════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  ${BOLD}Web Admin:${NC}    http://${PUBLIC_IP}:8080"
echo -e "  ${BOLD}SIP Server:${NC}   ${SIP_DOMAIN}:5060 (UDP/TCP)"
echo -e "  ${BOLD}SIP TLS:${NC}      ${SIP_DOMAIN}:5061 (TCP)"
echo ""
echo -e "  ${BOLD}Admin Login:${NC}  ${ADMIN_USER} / (password you set)"
echo ""
if [[ ${#SIP_ACCOUNTS[@]} -gt 0 ]]; then
  echo -e "  ${BOLD}SIP Accounts:${NC}"
  for entry in "${SIP_ACCOUNTS[@]}"; do
    IFS=':' read -r uname _ udisplay <<< "$entry"
    echo -e "    - ${uname} ${udisplay:+(${udisplay})}"
  done
  echo ""
fi
echo -e "  ${BOLD}Device Configuration:${NC}"
echo -e "    SIP Server:   ${CYAN}${SIP_DOMAIN}${NC}"
echo -e "    SIP Port:     ${CYAN}5060${NC} (or 5061 for TLS)"
echo -e "    Transport:    ${CYAN}UDP${NC} (or TLS)"
echo -e "    Realm:        ${CYAN}${SIP_DOMAIN}${NC}"
echo ""
echo -e "  ${BOLD}Useful Commands:${NC}"
echo -e "    View logs:        ${CYAN}cd ${INSTALL_DIR} && docker compose logs -f${NC}"
echo -e "    Restart:          ${CYAN}cd ${INSTALL_DIR} && docker compose restart${NC}"
echo -e "    Add SIP account:  ${CYAN}cd ${INSTALL_DIR} && npx ts-node scripts/manage-accounts.ts add --user <name> --password <pass>${NC}"
echo -e "    SSL status:       ${CYAN}certbot certificates${NC}"
echo ""
echo -e "  ${BOLD}Files:${NC}"
echo -e "    Install dir:  ${INSTALL_DIR}"
echo -e "    Config:       ${INSTALL_DIR}/config/server.json"
echo -e "    Accounts:     ${INSTALL_DIR}/config/accounts.json"
echo -e "    SSL certs:    ${CERT_PATH}/"
echo ""
