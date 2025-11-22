#!/bin/bash
###############################################################################
# Self-Signed Certificate Generation Script for ESP32 RoIP Server
#
# This script generates self-signed SSL/TLS certificates for development
# and testing purposes. NOT FOR PRODUCTION USE!
#
# For production, use Let's Encrypt: ./setup-letsencrypt.sh
#
# Usage:
#   ./generate-self-signed-cert.sh [domain] [output-dir]
#
# Example:
#   ./generate-self-signed-cert.sh roip.local ./certs
#   ./generate-self-signed-cert.sh 192.168.1.100 ./certs
#
###############################################################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default configuration
DEFAULT_DOMAIN="roip.local"
DEFAULT_OUTPUT_DIR="./certs"
VALIDITY_DAYS=365

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

check_openssl() {
    if ! command -v openssl > /dev/null 2>&1; then
        log_error "OpenSSL is not installed. Please install it first."
        exit 1
    fi
    log_success "OpenSSL found: $(openssl version)"
}

create_output_dir() {
    local output_dir=$1

    if [ ! -d "$output_dir" ]; then
        log_info "Creating output directory: $output_dir"
        mkdir -p "$output_dir"
    fi

    # Set appropriate permissions
    chmod 700 "$output_dir"
    log_success "Output directory ready"
}

generate_private_key() {
    local output_file=$1

    log_info "Generating 2048-bit RSA private key..."
    openssl genrsa -out "$output_file" 2048 2>/dev/null

    # Secure the private key
    chmod 600 "$output_file"

    log_success "Private key generated: $output_file"
}

generate_certificate() {
    local domain=$1
    local key_file=$2
    local cert_file=$3

    log_info "Generating self-signed certificate for $domain..."

    # Create OpenSSL configuration file
    local config_file=$(mktemp)

    cat > "$config_file" << EOF
[req]
default_bits = 2048
prompt = no
default_md = sha256
distinguished_name = dn
req_extensions = v3_req

[dn]
C=US
ST=State
L=City
O=RoIP Development
OU=IT Department
CN=$domain

[v3_req]
keyUsage = keyEncipherment, dataEncipherment, digitalSignature
extendedKeyUsage = serverAuth
subjectAltName = @alt_names

[alt_names]
DNS.1 = $domain
DNS.2 = localhost
DNS.3 = *.${domain}
IP.1 = 127.0.0.1
IP.2 = ::1
EOF

    # Add IP address if domain is an IP
    if [[ $domain =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        echo "IP.3 = $domain" >> "$config_file"
    fi

    # Generate certificate
    openssl req \
        -new \
        -x509 \
        -nodes \
        -key "$key_file" \
        -out "$cert_file" \
        -days "$VALIDITY_DAYS" \
        -config "$config_file" \
        -extensions v3_req \
        2>/dev/null

    # Clean up
    rm -f "$config_file"

    # Set permissions
    chmod 644 "$cert_file"

    log_success "Certificate generated: $cert_file"
}

generate_dhparam() {
    local output_file=$1

    log_info "Generating DH parameters (this may take a few minutes)..."
    openssl dhparam -out "$output_file" 2048 2>/dev/null
    chmod 644 "$output_file"
    log_success "DH parameters generated: $output_file"
}

verify_certificate() {
    local cert_file=$1

    log_info "Verifying certificate..."

    # Check certificate validity
    local expiry=$(openssl x509 -enddate -noout -in "$cert_file" | cut -d= -f2)
    log_success "Certificate valid until: $expiry"

    # Display certificate details
    echo ""
    log_info "Certificate details:"
    echo "─────────────────────────────────────────────────────────────"
    openssl x509 -text -noout -in "$cert_file" | grep -E "Subject:|Issuer:|DNS:|IP Address:|Not Before|Not After"
    echo "─────────────────────────────────────────────────────────────"
}

create_readme() {
    local output_dir=$1
    local domain=$2
    local readme_file="$output_dir/README.txt"

    cat > "$readme_file" << EOF
Self-Signed TLS Certificate for ESP32 RoIP Server
==================================================

Generated: $(date)
Domain: $domain
Validity: $VALIDITY_DAYS days

FILES:
------
server.key       - Private key (KEEP SECURE!)
server.crt       - Certificate
fullchain.pem    - Certificate (same as server.crt)
dhparam.pem      - Diffie-Hellman parameters

USAGE:
------
1. Update your RoIP server configuration file:
   roip-server/config/default.yaml

   Set the following:
   tls:
     enabled: true
     cert: "$output_dir/server.crt"
     key: "$output_dir/server.key"
     redirect_http: true

2. For nginx (reverse proxy), update:
   ssl_certificate $output_dir/server.crt;
   ssl_certificate_key $output_dir/server.key;
   ssl_dhparam $output_dir/dhparam.pem;

3. Restart the RoIP server:
   systemctl restart roip-server
   OR
   docker-compose restart roip-server

SECURITY WARNING:
-----------------
These are SELF-SIGNED certificates for DEVELOPMENT/TESTING ONLY!

For production deployments, use Let's Encrypt:
  ./setup-letsencrypt.sh $domain your-email@example.com

TRUST CERTIFICATE:
------------------
Browsers will show security warnings because the certificate is not
trusted by a Certificate Authority. You can:

1. Add security exception in browser (not recommended)
2. Import server.crt into your system's trusted certificates
3. Use curl with -k flag for testing: curl -k https://$domain
4. Use proper Let's Encrypt certificates for production

RENEW CERTIFICATE:
------------------
This certificate expires in $VALIDITY_DAYS days. To renew:
  ./generate-self-signed-cert.sh $domain $output_dir

Generated by ESP32 RoIP Server certificate generation script
EOF

    log_success "README created: $readme_file"
}

display_next_steps() {
    local output_dir=$1
    local domain=$2

    echo ""
    log_success "Certificate generation complete!"
    echo ""
    echo "═══════════════════════════════════════════════════════════════"
    echo "  Generated Files"
    echo "═══════════════════════════════════════════════════════════════"
    echo ""
    ls -lh "$output_dir"/*.{key,crt,pem} 2>/dev/null || true
    echo ""
    echo "═══════════════════════════════════════════════════════════════"
    echo "  Configuration"
    echo "═══════════════════════════════════════════════════════════════"
    echo ""
    echo "Add to roip-server/config/default.yaml:"
    echo ""
    echo "tls:"
    echo "  enabled: true"
    echo "  cert: \"$output_dir/server.crt\""
    echo "  key: \"$output_dir/server.key\""
    echo "  redirect_http: true"
    echo ""
    echo "═══════════════════════════════════════════════════════════════"
    echo "  Testing"
    echo "═══════════════════════════════════════════════════════════════"
    echo ""
    echo "1. Start server with TLS enabled"
    echo ""
    echo "2. Test HTTPS connection:"
    echo "   curl -k https://$domain:8080/health"
    echo ""
    echo "3. View certificate:"
    echo "   openssl s_client -connect $domain:8080 -servername $domain"
    echo ""
    echo "4. Test with browser:"
    echo "   https://$domain:8080"
    echo "   (Accept security warning for self-signed certificate)"
    echo ""
    echo "═══════════════════════════════════════════════════════════════"
    echo ""
    log_warning "These certificates are for DEVELOPMENT/TESTING ONLY!"
    log_warning "Use Let's Encrypt for production: ./setup-letsencrypt.sh"
    echo ""
}

###############################################################################
# Main Script
###############################################################################

main() {
    local domain="${1:-$DEFAULT_DOMAIN}"
    local output_dir="${2:-$DEFAULT_OUTPUT_DIR}"

    echo "═══════════════════════════════════════════════════════════════"
    echo "  Self-Signed Certificate Generator"
    echo "  ESP32 RoIP Server - Development/Testing"
    echo "═══════════════════════════════════════════════════════════════"
    echo ""
    echo "Domain:     $domain"
    echo "Output Dir: $output_dir"
    echo "Validity:   $VALIDITY_DAYS days"
    echo ""
    log_warning "Self-signed certificates are for DEVELOPMENT/TESTING ONLY!"
    echo ""

    # Files
    local key_file="$output_dir/server.key"
    local cert_file="$output_dir/server.crt"
    local fullchain_file="$output_dir/fullchain.pem"
    local dhparam_file="$output_dir/dhparam.pem"

    # Run generation steps
    check_openssl
    create_output_dir "$output_dir"
    generate_private_key "$key_file"
    generate_certificate "$domain" "$key_file" "$cert_file"

    # Create fullchain.pem (same as cert for self-signed)
    cp "$cert_file" "$fullchain_file"
    log_info "Created fullchain.pem"

    # Generate DH parameters
    generate_dhparam "$dhparam_file"

    # Verify
    verify_certificate "$cert_file"

    # Create README
    create_readme "$output_dir" "$domain"

    # Display next steps
    display_next_steps "$output_dir" "$domain"
}

# Check arguments
if [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
    echo "Usage: $0 [domain] [output-dir]"
    echo ""
    echo "Generate self-signed SSL/TLS certificates for development/testing."
    echo ""
    echo "Arguments:"
    echo "  domain      - Domain name or IP address (default: $DEFAULT_DOMAIN)"
    echo "  output-dir  - Output directory for certificates (default: $DEFAULT_OUTPUT_DIR)"
    echo ""
    echo "Examples:"
    echo "  $0                                  # Use defaults"
    echo "  $0 roip.local                       # Custom domain"
    echo "  $0 192.168.1.100 ./my-certs        # IP address with custom dir"
    echo ""
    echo "For production, use Let's Encrypt:"
    echo "  ./setup-letsencrypt.sh domain.com your-email@example.com"
    exit 0
fi

main "$@"
