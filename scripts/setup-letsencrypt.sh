#!/bin/bash
###############################################################################
# Let's Encrypt Certificate Setup Script for ESP32 RoIP Server
#
# This script automates the installation and configuration of Let's Encrypt
# SSL/TLS certificates for the RoIP server.
#
# Features:
# - Installs certbot if not present
# - Generates certificates for specified domain
# - Configures automatic renewal
# - Updates server configuration
# - Tests certificate validity
#
# Usage:
#   ./setup-letsencrypt.sh <domain> <email> [--staging]
#
# Example:
#   ./setup-letsencrypt.sh roip.example.com admin@example.com
#   ./setup-letsencrypt.sh roip.example.com admin@example.com --staging
#
###############################################################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
NGINX_CONFIG="/etc/nginx/sites-available/roip"
CERTBOT_DIR="/etc/letsencrypt"
WEBROOT="/var/www/html"

###############################################################################
# Functions
###############################################################################

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_root() {
    if [[ $EUID -ne 0 ]]; then
        log_error "This script must be run as root"
        exit 1
    fi
}

check_domain_dns() {
    local domain=$1
    log_info "Checking DNS resolution for $domain..."

    if ! host "$domain" > /dev/null 2>&1; then
        log_error "Domain $domain does not resolve. Please configure DNS first."
        exit 1
    fi

    log_success "DNS resolution OK"
}

install_certbot() {
    log_info "Checking for certbot installation..."

    if command -v certbot > /dev/null 2>&1; then
        log_success "Certbot already installed: $(certbot --version)"
        return 0
    fi

    log_info "Installing certbot..."

    # Detect OS and install certbot
    if [ -f /etc/debian_version ]; then
        apt-get update
        apt-get install -y certbot python3-certbot-nginx
    elif [ -f /etc/redhat-release ]; then
        yum install -y certbot python3-certbot-nginx
    else
        log_error "Unsupported OS. Please install certbot manually."
        exit 1
    fi

    log_success "Certbot installed successfully"
}

create_webroot() {
    log_info "Setting up webroot directory..."

    if [ ! -d "$WEBROOT" ]; then
        mkdir -p "$WEBROOT"
    fi

    # Create .well-known directory for ACME challenge
    mkdir -p "$WEBROOT/.well-known/acme-challenge"
    chown -R www-data:www-data "$WEBROOT" 2>/dev/null || chown -R nginx:nginx "$WEBROOT"

    log_success "Webroot configured"
}

generate_dhparam() {
    local dhparam_file="/etc/nginx/dhparam.pem"

    if [ -f "$dhparam_file" ]; then
        log_info "DH parameters already exist"
        return 0
    fi

    log_info "Generating DH parameters (this may take several minutes)..."
    openssl dhparam -out "$dhparam_file" 2048
    log_success "DH parameters generated"
}

obtain_certificate() {
    local domain=$1
    local email=$2
    local staging=$3

    log_info "Obtaining Let's Encrypt certificate for $domain..."

    local certbot_args=(
        "certonly"
        "--webroot"
        "-w" "$WEBROOT"
        "-d" "$domain"
        "--email" "$email"
        "--agree-tos"
        "--no-eff-email"
        "--non-interactive"
    )

    if [ "$staging" = true ]; then
        log_warning "Using Let's Encrypt staging environment (test mode)"
        certbot_args+=("--staging")
    fi

    if certbot "${certbot_args[@]}"; then
        log_success "Certificate obtained successfully"
    else
        log_error "Failed to obtain certificate"
        exit 1
    fi
}

setup_auto_renewal() {
    log_info "Setting up automatic certificate renewal..."

    # Create renewal hook script
    local renewal_hook="/etc/letsencrypt/renewal-hooks/deploy/roip-reload.sh"
    mkdir -p "$(dirname "$renewal_hook")"

    cat > "$renewal_hook" << 'EOF'
#!/bin/bash
# Reload services after certificate renewal

# Reload nginx
if systemctl is-active --quiet nginx; then
    systemctl reload nginx
fi

# Restart RoIP server
if systemctl is-active --quiet roip-server; then
    systemctl restart roip-server
fi

# Restart Docker containers (if using Docker)
if command -v docker > /dev/null && docker ps | grep -q roip-server; then
    docker restart roip-server
fi

logger "Let's Encrypt certificate renewed for RoIP server"
EOF

    chmod +x "$renewal_hook"

    # Test renewal
    log_info "Testing certificate renewal..."
    if certbot renew --dry-run; then
        log_success "Automatic renewal configured successfully"
    else
        log_warning "Renewal test failed - please check configuration"
    fi

    # Ensure renewal cron job exists
    if [ ! -f /etc/cron.d/certbot ]; then
        log_info "Creating certbot cron job..."
        echo "0 0,12 * * * root certbot renew --quiet" > /etc/cron.d/certbot
    fi
}

verify_certificate() {
    local domain=$1
    local cert_file="$CERTBOT_DIR/live/$domain/fullchain.pem"

    log_info "Verifying certificate..."

    if [ ! -f "$cert_file" ]; then
        log_error "Certificate file not found: $cert_file"
        exit 1
    fi

    # Check certificate validity
    local expiry=$(openssl x509 -enddate -noout -in "$cert_file" | cut -d= -f2)
    log_success "Certificate valid until: $expiry"

    # Check certificate details
    log_info "Certificate details:"
    openssl x509 -text -noout -in "$cert_file" | grep -E "Subject:|Issuer:|DNS:"
}

update_roip_config() {
    local domain=$1
    local config_file="$PROJECT_ROOT/roip-server/config/default.yaml"

    log_info "Updating RoIP server configuration..."

    if [ ! -f "$config_file" ]; then
        log_warning "Configuration file not found: $config_file"
        return 0
    fi

    # Create backup
    cp "$config_file" "$config_file.bak.$(date +%Y%m%d_%H%M%S)"

    # Update TLS settings (basic update - manual verification recommended)
    log_info "Configuration backup created. Please manually update TLS settings in:"
    log_info "  $config_file"
    log_info ""
    log_info "Set the following values:"
    log_info "  tls.enabled: true"
    log_info "  tls.cert: /etc/letsencrypt/live/$domain/fullchain.pem"
    log_info "  tls.key: /etc/letsencrypt/live/$domain/privkey.pem"
}

display_next_steps() {
    local domain=$1

    log_success "Certificate setup complete!"
    echo ""
    echo "═══════════════════════════════════════════════════════════════"
    echo "  Next Steps"
    echo "═══════════════════════════════════════════════════════════════"
    echo ""
    echo "1. Update your RoIP server configuration:"
    echo "   Edit: $PROJECT_ROOT/roip-server/config/default.yaml"
    echo "   Set: tls.enabled = true"
    echo ""
    echo "2. Configure nginx (if using reverse proxy):"
    echo "   Update: $NGINX_CONFIG"
    echo "   Enable SSL configuration"
    echo ""
    echo "3. Restart services:"
    echo "   systemctl restart roip-server"
    echo "   systemctl restart nginx"
    echo ""
    echo "   OR (if using Docker):"
    echo "   docker-compose restart roip-server"
    echo ""
    echo "4. Test HTTPS connection:"
    echo "   curl https://$domain/health"
    echo "   openssl s_client -connect $domain:443 -servername $domain"
    echo ""
    echo "5. Test SSL configuration:"
    echo "   https://www.ssllabs.com/ssltest/analyze.html?d=$domain"
    echo ""
    echo "Certificate files:"
    echo "  Cert:  /etc/letsencrypt/live/$domain/fullchain.pem"
    echo "  Key:   /etc/letsencrypt/live/$domain/privkey.pem"
    echo "  Chain: /etc/letsencrypt/live/$domain/chain.pem"
    echo ""
    echo "Automatic renewal is configured to run twice daily."
    echo "═══════════════════════════════════════════════════════════════"
}

###############################################################################
# Main Script
###############################################################################

main() {
    # Parse arguments
    if [ $# -lt 2 ]; then
        echo "Usage: $0 <domain> <email> [--staging]"
        echo ""
        echo "Arguments:"
        echo "  domain    - Your domain name (e.g., roip.example.com)"
        echo "  email     - Your email address for Let's Encrypt notifications"
        echo "  --staging - Use Let's Encrypt staging environment (for testing)"
        echo ""
        echo "Example:"
        echo "  $0 roip.example.com admin@example.com"
        exit 1
    fi

    local domain=$1
    local email=$2
    local staging=false

    if [ "$3" = "--staging" ]; then
        staging=true
    fi

    echo "═══════════════════════════════════════════════════════════════"
    echo "  Let's Encrypt Setup for ESP32 RoIP Server"
    echo "═══════════════════════════════════════════════════════════════"
    echo ""
    echo "Domain: $domain"
    echo "Email:  $email"
    if [ "$staging" = true ]; then
        echo "Mode:   STAGING (test certificates)"
    else
        echo "Mode:   PRODUCTION"
    fi
    echo ""

    # Run setup steps
    check_root
    check_domain_dns "$domain"
    install_certbot
    create_webroot
    generate_dhparam
    obtain_certificate "$domain" "$email" "$staging"
    setup_auto_renewal
    verify_certificate "$domain"
    update_roip_config "$domain"

    echo ""
    display_next_steps "$domain"
}

main "$@"
