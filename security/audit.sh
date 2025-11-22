#!/bin/bash
#
# ESP32 RoIP Security Audit Script
# Comprehensive automated security scanning for the RoIP system
#
# Usage: ./security/audit.sh [options]
# Options:
#   --full      Run full audit including slow scans
#   --quick     Run quick audit (skip dependency scans)
#   --fix       Attempt to auto-fix issues where possible
#   --report    Generate detailed HTML report
#

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
REPORT_DIR="$PROJECT_ROOT/security/reports"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
REPORT_FILE="$REPORT_DIR/security_audit_$TIMESTAMP.txt"

# Audit settings
MODE="normal"
AUTO_FIX=false
GENERATE_REPORT=false

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --full)
            MODE="full"
            shift
            ;;
        --quick)
            MODE="quick"
            shift
            ;;
        --fix)
            AUTO_FIX=true
            shift
            ;;
        --report)
            GENERATE_REPORT=true
            shift
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Create report directory
mkdir -p "$REPORT_DIR"

# Initialize report
echo "╔═══════════════════════════════════════════════════════════════╗" | tee "$REPORT_FILE"
echo "║        ESP32 RoIP Security Audit Report                      ║" | tee -a "$REPORT_FILE"
echo "║        $(date)                           ║" | tee -a "$REPORT_FILE"
echo "╚═══════════════════════════════════════════════════════════════╝" | tee -a "$REPORT_FILE"
echo "" | tee -a "$REPORT_FILE"

# Track issues
CRITICAL_ISSUES=0
HIGH_ISSUES=0
MEDIUM_ISSUES=0
LOW_ISSUES=0
INFO_ISSUES=0

# Helper functions
log_section() {
    echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo "" | tee -a "$REPORT_FILE"
    echo "=== $1 ===" | tee -a "$REPORT_FILE"
    echo "" | tee -a "$REPORT_FILE"
}

log_pass() {
    echo -e "${GREEN}[✓]${NC} $1" | tee -a "$REPORT_FILE"
}

log_fail() {
    echo -e "${RED}[✗]${NC} $1" | tee -a "$REPORT_FILE"
}

log_warn() {
    echo -e "${YELLOW}[!]${NC} $1" | tee -a "$REPORT_FILE"
}

log_info() {
    echo -e "${BLUE}[i]${NC} $1" | tee -a "$REPORT_FILE"
}

issue_critical() {
    CRITICAL_ISSUES=$((CRITICAL_ISSUES + 1))
    log_fail "CRITICAL: $1"
}

issue_high() {
    HIGH_ISSUES=$((HIGH_ISSUES + 1))
    log_fail "HIGH: $1"
}

issue_medium() {
    MEDIUM_ISSUES=$((MEDIUM_ISSUES + 1))
    log_warn "MEDIUM: $1"
}

issue_low() {
    LOW_ISSUES=$((LOW_ISSUES + 1))
    log_warn "LOW: $1"
}

issue_info() {
    INFO_ISSUES=$((INFO_ISSUES + 1))
    log_info "INFO: $1"
}

# ============================================================================
# 1. FILE SYSTEM SECURITY CHECKS
# ============================================================================
check_file_permissions() {
    log_section "1. File System Security"

    # Check for world-writable files
    log_info "Checking for world-writable files..."
    if find "$PROJECT_ROOT" -type f -perm -002 2>/dev/null | grep -q .; then
        issue_high "World-writable files found"
        find "$PROJECT_ROOT" -type f -perm -002 2>/dev/null | tee -a "$REPORT_FILE"
    else
        log_pass "No world-writable files found"
    fi

    # Check for SUID/SGID files
    log_info "Checking for SUID/SGID files..."
    if find "$PROJECT_ROOT" -type f \( -perm -4000 -o -perm -2000 \) 2>/dev/null | grep -q .; then
        issue_medium "SUID/SGID files found"
        find "$PROJECT_ROOT" -type f \( -perm -4000 -o -perm -2000 \) 2>/dev/null | tee -a "$REPORT_FILE"
    else
        log_pass "No SUID/SGID files found"
    fi

    # Check .git directory permissions
    if [ -d "$PROJECT_ROOT/.git" ]; then
        GIT_PERMS=$(stat -c %a "$PROJECT_ROOT/.git" 2>/dev/null || stat -f %A "$PROJECT_ROOT/.git" 2>/dev/null)
        if [[ ! "$GIT_PERMS" =~ ^7[0-5][0-5]$ ]]; then
            issue_low ".git directory has overly permissive permissions: $GIT_PERMS"
        else
            log_pass ".git directory permissions OK"
        fi
    fi
}

# ============================================================================
# 2. SECRET SCANNING
# ============================================================================
scan_for_secrets() {
    log_section "2. Secret Scanning"

    log_info "Scanning for hardcoded secrets..."

    # Patterns to search for
    declare -A PATTERNS=(
        ["API Keys"]="(?i)(api[_-]?key|apikey|api[_-]?secret)[\s]*[=:][\s]*['\"][a-zA-Z0-9_\-]{16,}['\"]"
        ["Passwords"]="(?i)(password|passwd|pwd)[\s]*[=:][\s]*['\"][^'\"]{8,}['\"]"
        ["JWT Secrets"]="(?i)(jwt[_-]?secret|secret[_-]?key)[\s]*[=:][\s]*['\"][^'\"]+['\"]"
        ["AWS Keys"]="(?i)(aws[_-]?access[_-]?key[_-]?id|aws[_-]?secret[_-]?access[_-]?key)"
        ["Private Keys"]="-----BEGIN\s+(RSA|DSA|EC|OPENSSH)\s+PRIVATE\s+KEY-----"
        ["Database URLs"]="(?i)(postgres|mysql|mongodb):\/\/[^\s]+"
    )

    for pattern_name in "${!PATTERNS[@]}"; do
        pattern="${PATTERNS[$pattern_name]}"

        # Search in source files
        matches=$(grep -rEn "$pattern" \
            --include="*.js" \
            --include="*.cpp" \
            --include="*.h" \
            --include="*.yaml" \
            --include="*.json" \
            --exclude-dir="node_modules" \
            --exclude-dir=".git" \
            --exclude-dir="build" \
            "$PROJECT_ROOT" 2>/dev/null || true)

        if [ -n "$matches" ]; then
            issue_critical "$pattern_name found in source code"
            echo "$matches" | tee -a "$REPORT_FILE"
        fi
    done

    # Check for default credentials
    log_info "Checking for default credentials..."

    if grep -rn "change-me-in-production" "$PROJECT_ROOT"/roip-server/src 2>/dev/null; then
        issue_critical "Default 'change-me-in-production' secret found"
    fi

    if grep -rn "roip_password" "$PROJECT_ROOT"/roip-server/src 2>/dev/null; then
        issue_high "Default database password 'roip_password' found"
    fi

    # Check .env files
    if [ -f "$PROJECT_ROOT/.env" ]; then
        issue_medium ".env file exists in repository root"
        log_warn "Ensure .env is in .gitignore"
    fi

    # Check for committed .env files
    if git -C "$PROJECT_ROOT" ls-files 2>/dev/null | grep -q "\.env$"; then
        issue_critical ".env file is tracked in git"
    else
        log_pass "No .env files tracked in git"
    fi

    log_pass "Secret scanning complete"
}

# ============================================================================
# 3. DEPENDENCY VULNERABILITY SCANNING
# ============================================================================
scan_dependencies() {
    log_section "3. Dependency Vulnerability Scanning"

    if [ "$MODE" = "quick" ]; then
        log_info "Skipping dependency scan in quick mode"
        return
    fi

    # NPM audit
    if [ -f "$PROJECT_ROOT/roip-server/package.json" ]; then
        log_info "Running npm audit..."
        cd "$PROJECT_ROOT/roip-server"

        if npm audit --json > "$REPORT_DIR/npm_audit_$TIMESTAMP.json" 2>/dev/null; then
            log_pass "npm audit completed"

            # Parse results
            CRITICAL_VULNS=$(jq '.metadata.vulnerabilities.critical // 0' "$REPORT_DIR/npm_audit_$TIMESTAMP.json")
            HIGH_VULNS=$(jq '.metadata.vulnerabilities.high // 0' "$REPORT_DIR/npm_audit_$TIMESTAMP.json")
            MODERATE_VULNS=$(jq '.metadata.vulnerabilities.moderate // 0' "$REPORT_DIR/npm_audit_$TIMESTAMP.json")

            if [ "$CRITICAL_VULNS" -gt 0 ]; then
                issue_critical "$CRITICAL_VULNS critical npm vulnerabilities found"
            fi

            if [ "$HIGH_VULNS" -gt 0 ]; then
                issue_high "$HIGH_VULNS high npm vulnerabilities found"
            fi

            if [ "$MODERATE_VULNS" -gt 0 ]; then
                issue_medium "$MODERATE_VULNS moderate npm vulnerabilities found"
            fi

            if [ "$CRITICAL_VULNS" -eq 0 ] && [ "$HIGH_VULNS" -eq 0 ] && [ "$MODERATE_VULNS" -eq 0 ]; then
                log_pass "No critical or high npm vulnerabilities found"
            fi
        else
            log_warn "npm audit failed or not available"
        fi

        cd "$PROJECT_ROOT"
    fi

    # Check for outdated packages
    log_info "Checking for outdated packages..."
    if command -v npm &> /dev/null && [ -f "$PROJECT_ROOT/roip-server/package.json" ]; then
        cd "$PROJECT_ROOT/roip-server"
        OUTDATED=$(npm outdated 2>/dev/null || true)
        if [ -n "$OUTDATED" ]; then
            issue_info "Outdated npm packages found"
            echo "$OUTDATED" | tee -a "$REPORT_FILE"
        else
            log_pass "All npm packages are up to date"
        fi
        cd "$PROJECT_ROOT"
    fi
}

# ============================================================================
# 4. CODE SECURITY ANALYSIS
# ============================================================================
analyze_code_security() {
    log_section "4. Code Security Analysis"

    log_info "Analyzing JavaScript code..."

    # Check for eval() usage
    if grep -rn "eval(" "$PROJECT_ROOT"/roip-server/src 2>/dev/null | grep -v "node_modules"; then
        issue_high "Use of eval() found - potential code injection vulnerability"
    else
        log_pass "No eval() usage found"
    fi

    # Check for exec/system calls
    if grep -rn "exec\|system\|spawn" "$PROJECT_ROOT"/roip-server/src 2>/dev/null | grep -v "node_modules" | grep -v "//"; then
        issue_medium "Command execution functions found - ensure input sanitization"
    fi

    # Check for SQL injection vulnerabilities
    log_info "Checking for potential SQL injection..."
    if grep -rn "query.*+\|execute.*+" "$PROJECT_ROOT"/roip-server/src 2>/dev/null | grep -v "node_modules"; then
        issue_high "Potential SQL injection - string concatenation in queries"
    else
        log_pass "No obvious SQL injection vulnerabilities"
    fi

    # Check for proper input validation
    log_info "Checking for input validation..."
    if ! grep -rq "joi\|validator\|express-validator" "$PROJECT_ROOT"/roip-server/package.json 2>/dev/null; then
        issue_medium "No input validation library found in dependencies"
    else
        log_pass "Input validation library present (joi)"
    fi

    # Check for HTTPS/TLS usage
    log_info "Checking for HTTPS/TLS configuration..."
    if ! grep -rq "https\|tls\|ssl" "$PROJECT_ROOT"/roip-server/src 2>/dev/null; then
        issue_high "No HTTPS/TLS configuration found - communications may be unencrypted"
    fi

    # Check for rate limiting
    log_info "Checking for rate limiting..."
    if ! grep -rq "rate-limit\|express-rate-limit" "$PROJECT_ROOT"/roip-server 2>/dev/null; then
        issue_medium "No rate limiting implementation found"
    fi

    # Check for CORS configuration
    log_info "Checking CORS configuration..."
    if grep -rq "cors()" "$PROJECT_ROOT"/roip-server/src 2>/dev/null; then
        issue_medium "CORS enabled with default settings - review allowed origins"
    fi

    # Check for security headers
    log_info "Checking for security headers..."
    if grep -rq "helmet" "$PROJECT_ROOT"/roip-server/src 2>/dev/null; then
        log_pass "Helmet security headers middleware found"
    else
        issue_high "No security headers middleware (helmet) found"
    fi

    # Check for proper password hashing
    log_info "Checking password hashing..."
    if grep -rq "bcrypt\|argon2\|scrypt" "$PROJECT_ROOT"/roip-server/src 2>/dev/null; then
        log_pass "Proper password hashing library in use"
    else
        issue_critical "No secure password hashing found"
    fi

    # Check for JWT secret configuration
    log_info "Checking JWT configuration..."
    if grep -rn "jwtSecret.*process.env" "$PROJECT_ROOT"/roip-server/src 2>/dev/null; then
        log_pass "JWT secret uses environment variable"
    else
        issue_high "JWT secret may be hardcoded"
    fi
}

# ============================================================================
# 5. CONFIGURATION SECURITY
# ============================================================================
check_configuration() {
    log_section "5. Configuration Security"

    # Check YAML config files
    log_info "Checking YAML configuration files..."

    for config_file in $(find "$PROJECT_ROOT"/roip-server/config -name "*.yaml" 2>/dev/null); do
        log_info "Analyzing $config_file..."

        # Check for default passwords
        if grep -qi "password.*password\|password.*admin\|password.*123" "$config_file"; then
            issue_critical "Default/weak password in config: $config_file"
        fi

        # Check for debug mode
        if grep -qi "debug.*true\|verbose.*true" "$config_file"; then
            issue_low "Debug mode enabled in: $config_file"
        fi

        # Check for exposed ports
        if grep -qi "0\.0\.0\.0" "$config_file"; then
            issue_medium "Service binding to 0.0.0.0 in: $config_file"
        fi
    done

    # Check for secure defaults
    log_info "Checking for secure defaults..."

    # Check if firewall rules exist
    if [ -f "$PROJECT_ROOT/security/security-config.yaml" ]; then
        log_pass "Security configuration file exists"
    else
        issue_medium "No security configuration file found"
    fi

    # Check database encryption
    log_info "Checking database encryption..."
    if grep -rq "is_encrypted" "$PROJECT_ROOT"/roip-server/src/database 2>/dev/null; then
        log_pass "Database encryption field present"
    else
        issue_low "No database encryption configuration found"
    fi
}

# ============================================================================
# 6. SSL/TLS CERTIFICATE VALIDATION
# ============================================================================
check_ssl_certificates() {
    log_section "6. SSL/TLS Certificate Validation"

    log_info "Checking for SSL/TLS certificates..."

    # Find certificate files
    CERT_FILES=$(find "$PROJECT_ROOT" -name "*.crt" -o -name "*.pem" -o -name "*.key" 2>/dev/null || true)

    if [ -n "$CERT_FILES" ]; then
        echo "$CERT_FILES" | while read cert_file; do
            if [ -f "$cert_file" ]; then
                log_info "Found certificate: $cert_file"

                # Check if it's in git
                if git -C "$PROJECT_ROOT" ls-files 2>/dev/null | grep -q "$(basename "$cert_file")"; then
                    issue_critical "SSL certificate/key tracked in git: $cert_file"
                fi

                # Check expiration for .crt files
                if [[ "$cert_file" == *.crt ]] || [[ "$cert_file" == *.pem ]]; then
                    if command -v openssl &> /dev/null; then
                        EXPIRY=$(openssl x509 -enddate -noout -in "$cert_file" 2>/dev/null || echo "")
                        if [ -n "$EXPIRY" ]; then
                            log_info "Certificate expiry: $EXPIRY"

                            # Check if expiring soon (30 days)
                            EXPIRY_EPOCH=$(date -d "$(echo $EXPIRY | cut -d= -f2)" +%s 2>/dev/null || echo "0")
                            NOW_EPOCH=$(date +%s)
                            DAYS_LEFT=$(( ($EXPIRY_EPOCH - $NOW_EPOCH) / 86400 ))

                            if [ "$DAYS_LEFT" -lt 30 ] && [ "$DAYS_LEFT" -gt 0 ]; then
                                issue_medium "Certificate expires in $DAYS_LEFT days: $cert_file"
                            elif [ "$DAYS_LEFT" -le 0 ]; then
                                issue_high "Certificate expired: $cert_file"
                            else
                                log_pass "Certificate valid for $DAYS_LEFT days"
                            fi
                        fi
                    fi
                fi

                # Check key file permissions
                if [[ "$cert_file" == *.key ]]; then
                    PERMS=$(stat -c %a "$cert_file" 2>/dev/null || stat -f %A "$cert_file" 2>/dev/null)
                    if [ "$PERMS" != "600" ] && [ "$PERMS" != "400" ]; then
                        issue_high "Private key has insecure permissions: $cert_file ($PERMS)"
                    else
                        log_pass "Private key permissions OK: $cert_file"
                    fi
                fi
            fi
        done
    else
        issue_info "No SSL/TLS certificates found"
    fi
}

# ============================================================================
# 7. NETWORK SECURITY
# ============================================================================
check_network_security() {
    log_section "7. Network Security"

    log_info "Checking network security configuration..."

    # Check for open ports configuration
    if grep -rn "port.*5060\|port.*8080" "$PROJECT_ROOT"/roip-server 2>/dev/null | head -5; then
        log_info "Service ports configured"
        issue_info "Ensure firewall rules restrict access to necessary ports only"
    fi

    # Check for IP whitelisting
    if ! grep -rq "whitelist\|allowlist\|allowed.*ip" "$PROJECT_ROOT"/roip-server 2>/dev/null; then
        issue_medium "No IP whitelisting/filtering found"
    fi

    # Check for DDoS protection
    if ! grep -rq "ddos\|rate.*limit\|throttle" "$PROJECT_ROOT"/roip-server 2>/dev/null; then
        issue_medium "No DDoS protection mechanisms found"
    fi

    # Check for secure session configuration
    log_info "Checking session security..."
    if grep -rq "secure.*true\|httpOnly.*true" "$PROJECT_ROOT"/roip-server 2>/dev/null; then
        log_pass "Secure session flags found"
    else
        issue_medium "Missing secure session flags (httpOnly, secure)"
    fi
}

# ============================================================================
# 8. DOCKER SECURITY (if applicable)
# ============================================================================
check_docker_security() {
    log_section "8. Docker Security"

    if [ -f "$PROJECT_ROOT/docker/Dockerfile" ] || [ -f "$PROJECT_ROOT/Dockerfile" ]; then
        log_info "Checking Docker configuration..."

        DOCKERFILE="$PROJECT_ROOT/docker/Dockerfile"
        [ ! -f "$DOCKERFILE" ] && DOCKERFILE="$PROJECT_ROOT/Dockerfile"

        # Check for root user
        if ! grep -q "USER" "$DOCKERFILE"; then
            issue_high "Dockerfile does not specify non-root user"
        else
            log_pass "Dockerfile specifies user"
        fi

        # Check for latest tag
        if grep -q "FROM.*:latest" "$DOCKERFILE"; then
            issue_medium "Dockerfile uses :latest tag - pin to specific version"
        fi

        # Check for secrets in build
        if grep -qi "ARG.*PASSWORD\|ARG.*SECRET\|ARG.*KEY" "$DOCKERFILE"; then
            issue_high "Potential secrets in Dockerfile build args"
        fi

        # Check .dockerignore
        if [ -f "$PROJECT_ROOT/.dockerignore" ]; then
            log_pass ".dockerignore file exists"

            # Check if .env is ignored
            if ! grep -q "\.env" "$PROJECT_ROOT/.dockerignore"; then
                issue_medium ".env not in .dockerignore"
            fi
        else
            issue_low ".dockerignore file missing"
        fi
    else
        log_info "No Dockerfile found - skipping Docker security checks"
    fi
}

# ============================================================================
# 9. LOGGING AND MONITORING
# ============================================================================
check_logging() {
    log_section "9. Logging and Monitoring"

    log_info "Checking logging configuration..."

    # Check for logging library
    if grep -rq "winston\|bunyan\|pino" "$PROJECT_ROOT"/roip-server/package.json 2>/dev/null; then
        log_pass "Logging library found"
    else
        issue_medium "No structured logging library found"
    fi

    # Check for sensitive data in logs
    if grep -rn "log.*password\|console.*password" "$PROJECT_ROOT"/roip-server/src 2>/dev/null | grep -v "//"; then
        issue_high "Potential password logging detected"
    fi

    # Check for audit logging
    if grep -rq "audit\|security.*log" "$PROJECT_ROOT"/roip-server/src 2>/dev/null; then
        log_pass "Audit logging found"
    else
        issue_medium "No audit logging implementation found"
    fi

    # Check for error disclosure
    log_info "Checking error handling..."
    if grep -rn "error.*stack\|err\.message" "$PROJECT_ROOT"/roip-server/src 2>/dev/null | head -3; then
        issue_low "Stack traces may be exposed - review error handling"
    fi
}

# ============================================================================
# MAIN EXECUTION
# ============================================================================

echo -e "${BLUE}Starting security audit...${NC}"
echo "Mode: $MODE"
echo ""

# Run all checks
check_file_permissions
scan_for_secrets
scan_dependencies
analyze_code_security
check_configuration
check_ssl_certificates
check_network_security
check_docker_security
check_logging

# ============================================================================
# SUMMARY
# ============================================================================

log_section "Audit Summary"

echo "" | tee -a "$REPORT_FILE"
echo "╔═══════════════════════════════════════════════════════════════╗" | tee -a "$REPORT_FILE"
echo "║                      AUDIT SUMMARY                            ║" | tee -a "$REPORT_FILE"
echo "╠═══════════════════════════════════════════════════════════════╣" | tee -a "$REPORT_FILE"
printf "║  ${RED}Critical Issues:  %4d${NC}                                   ║\n" $CRITICAL_ISSUES | tee -a "$REPORT_FILE"
printf "║  ${RED}High Issues:      %4d${NC}                                   ║\n" $HIGH_ISSUES | tee -a "$REPORT_FILE"
printf "║  ${YELLOW}Medium Issues:    %4d${NC}                                   ║\n" $MEDIUM_ISSUES | tee -a "$REPORT_FILE"
printf "║  ${YELLOW}Low Issues:       %4d${NC}                                   ║\n" $LOW_ISSUES | tee -a "$REPORT_FILE"
printf "║  ${BLUE}Info Items:       %4d${NC}                                   ║\n" $INFO_ISSUES | tee -a "$REPORT_FILE"
echo "╚═══════════════════════════════════════════════════════════════╝" | tee -a "$REPORT_FILE"
echo "" | tee -a "$REPORT_FILE"

# Calculate risk score
RISK_SCORE=$(( $CRITICAL_ISSUES * 10 + $HIGH_ISSUES * 5 + $MEDIUM_ISSUES * 2 + $LOW_ISSUES ))

echo "Risk Score: $RISK_SCORE" | tee -a "$REPORT_FILE"

if [ $RISK_SCORE -gt 50 ]; then
    echo -e "${RED}Risk Level: CRITICAL - Immediate action required${NC}" | tee -a "$REPORT_FILE"
    EXIT_CODE=2
elif [ $RISK_SCORE -gt 20 ]; then
    echo -e "${YELLOW}Risk Level: HIGH - Review and fix issues${NC}" | tee -a "$REPORT_FILE"
    EXIT_CODE=1
elif [ $RISK_SCORE -gt 10 ]; then
    echo -e "${YELLOW}Risk Level: MEDIUM - Consider improvements${NC}" | tee -a "$REPORT_FILE"
    EXIT_CODE=0
else
    echo -e "${GREEN}Risk Level: LOW - Good security posture${NC}" | tee -a "$REPORT_FILE"
    EXIT_CODE=0
fi

echo "" | tee -a "$REPORT_FILE"
echo "Report saved to: $REPORT_FILE" | tee -a "$REPORT_FILE"

if [ "$GENERATE_REPORT" = true ]; then
    log_info "Generating HTML report..."
    # TODO: Generate HTML report
fi

exit $EXIT_CODE
