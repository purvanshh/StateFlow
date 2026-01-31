#!/bin/bash
# ============================================================================
# StateFlow v1.0 - Preflight Checks
# ============================================================================
# Verifies system readiness before production deployment
# Usage: ./preflight-checks.sh [--production]
# ============================================================================

set -e

ENVIRONMENT=${1:-staging}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

PASSED=0
FAILED=0
WARNINGS=0

check_passed() {
    echo -e "${GREEN}✓${NC} $1"
    ((PASSED++))
}

check_failed() {
    echo -e "${RED}✗${NC} $1"
    ((FAILED++))
}

check_warning() {
    echo -e "${YELLOW}!${NC} $1"
    ((WARNINGS++))
}

section() {
    echo -e "\n${BLUE}==========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}==========================================${NC}"
}

echo -e "${YELLOW}StateFlow v1.0 - Preflight Checks${NC}"
echo "Environment: $ENVIRONMENT"
echo "Started at: $(date)"
echo ""

# ============================================================================
# 1. SYSTEM REQUIREMENTS
# ============================================================================
section "1. System Requirements"

# Node.js version
if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -ge 18 ]; then
        check_passed "Node.js version: $(node -v)"
    else
        check_failed "Node.js version must be 18+. Found: $(node -v)"
    fi
else
    check_failed "Node.js not installed"
fi

# pnpm version
if command -v pnpm &> /dev/null; then
    PNPM_VERSION=$(pnpm -v | cut -d'.' -f1)
    if [ "$PNPM_VERSION" -ge 8 ]; then
        check_passed "pnpm version: $(pnpm -v)"
    else
        check_failed "pnpm version must be 8+. Found: $(pnpm -v)"
    fi
else
    check_failed "pnpm not installed"
fi

# Docker
if command -v docker &> /dev/null; then
    if docker ps &> /dev/null; then
        check_passed "Docker daemon running"
    else
        check_failed "Docker daemon not accessible"
    fi
else
    check_warning "Docker not installed (optional for local deployment)"
fi

# Docker Compose
if command -v docker-compose &> /dev/null || docker compose version &> /dev/null; then
    check_passed "Docker Compose available"
else
    check_warning "Docker Compose not installed (optional)"
fi

# ============================================================================
# 2. ENVIRONMENT VARIABLES
# ============================================================================
section "2. Environment Variables"

ENV_FILE="$PROJECT_ROOT/.env"
if [ -f "$ENV_FILE" ]; then
    check_passed ".env file exists"
    
    # Check required variables
    REQUIRED_VARS=("SUPABASE_URL" "SUPABASE_SERVICE_ROLE_KEY")
    for var in "${REQUIRED_VARS[@]}"; do
        if grep -q "^${var}=" "$ENV_FILE" 2>/dev/null; then
            VALUE=$(grep "^${var}=" "$ENV_FILE" | cut -d'=' -f2)
            if [ -n "$VALUE" ] && [ "$VALUE" != "your-value" ]; then
                check_passed "$var is set"
            else
                check_failed "$var is empty or placeholder"
            fi
        else
            check_failed "$var not found in .env"
        fi
    done
else
    check_failed ".env file not found at $ENV_FILE"
fi

# ============================================================================
# 3. CODE QUALITY
# ============================================================================
section "3. Code Quality Checks"

cd "$PROJECT_ROOT"

# TypeScript compilation
if pnpm run typecheck &> /dev/null; then
    check_passed "TypeScript compilation successful"
else
    check_failed "TypeScript compilation failed"
fi

# Tests
if cd apps/api && pnpm test &> /dev/null; then
    check_passed "All tests passing"
    cd "$PROJECT_ROOT"
else
    check_failed "Tests failing"
    cd "$PROJECT_ROOT"
fi

# Linting
if pnpm run lint &> /dev/null; then
    check_passed "Linting passed"
else
    check_warning "Linting warnings (non-blocking)"
fi

# ============================================================================
# 4. DATABASE READINESS
# ============================================================================
section "4. Database Readiness"

if [ -n "$SUPABASE_URL" ]; then
    # Test database connection
    if curl -s "$SUPABASE_URL/rest/v1/" \
        -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
        -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" &> /dev/null; then
        check_passed "Database connection successful"
    else
        check_failed "Cannot connect to database"
    fi
    
    # Check migrations exist
    MIGRATION_002="$PROJECT_ROOT/infra/migrations/002_atomic_claiming.sql"
    if [ -f "$MIGRATION_002" ]; then
        check_passed "Migration 002 (atomic claiming) exists"
    else
        check_failed "Migration 002 not found"
    fi
    
    # Check rollback exists
    ROLLBACK_003="$PROJECT_ROOT/infra/migrations/003_rollback_atomic.sql"
    if [ -f "$ROLLBACK_003" ]; then
        check_passed "Rollback migration 003 exists"
    else
        check_failed "Rollback migration not found"
    fi
else
    check_warning "SUPABASE_URL not set, skipping database checks"
fi

# ============================================================================
# 5. DEPLOYMENT ARTIFACTS
# ============================================================================
section "5. Deployment Artifacts"

# Docker Compose
COMPOSE_FILE="$PROJECT_ROOT/deploy/docker-compose.prod.yml"
if [ -f "$COMPOSE_FILE" ]; then
    check_passed "Production Docker Compose exists"
else
    check_failed "docker-compose.prod.yml not found"
fi

# Environment template
ENV_TEMPLATE="$PROJECT_ROOT/deploy/.env.production.example"
if [ -f "$ENV_TEMPLATE" ]; then
    check_passed "Production environment template exists"
else
    check_warning "Environment template not found"
fi

# Startup health check
HEALTH_SCRIPT="$PROJECT_ROOT/deploy/startup-health-check.sh"
if [ -f "$HEALTH_SCRIPT" ]; then
    check_passed "Health check script exists"
else
    check_warning "Health check script not found"
fi

# Backup script
BACKUP_SCRIPT="$PROJECT_ROOT/deploy/backup-schema.sh"
if [ -f "$BACKUP_SCRIPT" ]; then
    check_passed "Backup script exists"
else
    check_warning "Backup script not found"
fi

# Rollback procedure
ROLLBACK_DOC="$PROJECT_ROOT/deploy/rollback-procedure.md"
if [ -f "$ROLLBACK_DOC" ]; then
    check_passed "Rollback procedure documented"
else
    check_warning "Rollback procedure not documented"
fi

# ============================================================================
# 6. DOCUMENTATION
# ============================================================================
section "6. Documentation"

# Architecture doc
if [ -f "$PROJECT_ROOT/docs/architecture.md" ]; then
    check_passed "Architecture documentation exists"
else
    check_warning "Architecture documentation missing"
fi

# Runbooks
RUNBOOK_COUNT=$(find "$PROJECT_ROOT/docs/runbooks" -name "*.md" 2>/dev/null | wc -l)
if [ "$RUNBOOK_COUNT" -ge 4 ]; then
    check_passed "Runbooks complete ($RUNBOOK_COUNT found)"
else
    check_warning "Runbooks incomplete ($RUNBOOK_COUNT found, expected 4+)"
fi

# README
if [ -f "$PROJECT_ROOT/README.md" ]; then
    check_passed "README.md exists"
else
    check_warning "README.md not found"
fi

# ============================================================================
# 7. SECURITY CHECKS
# ============================================================================
section "7. Security Checks"

# Check for secrets in code
SECRETS_FOUND=$(grep -r "password\|secret\|key" --include="*.ts" --include="*.js" "$PROJECT_ROOT/apps" "$PROJECT_ROOT/packages" 2>/dev/null | grep -v "node_modules" | grep -v "\.env" | head -5)
if [ -z "$SECRETS_FOUND" ]; then
    check_passed "No hardcoded secrets detected in code"
else
    check_warning "Potential secrets in code (review manually)"
fi

# .env in .gitignore
if grep -q "\.env" "$PROJECT_ROOT/.gitignore" 2>/dev/null; then
    check_passed ".env files ignored by git"
else
    check_failed ".env files not in .gitignore"
fi

# ============================================================================
# 8. MONITORING SETUP
# ============================================================================
section "8. Monitoring & Observability"

# Health endpoint documented
if grep -q "/api/admin/health" "$PROJECT_ROOT/README.md" 2>/dev/null; then
    check_passed "Health endpoints documented"
else
    check_warning "Health endpoints not documented in README"
fi

# Metrics endpoint
if grep -q "/api/metrics" "$PROJECT_ROOT/README.md" 2>/dev/null; then
    check_passed "Metrics endpoints documented"
else
    check_warning "Metrics endpoints not documented"
fi

# ============================================================================
# 9. CLI TOOL
# ============================================================================
section "9. CLI Tool Availability"

CLI_SCRIPT="$PROJECT_ROOT/apps/api/src/cli.ts"
if [ -f "$CLI_SCRIPT" ]; then
    check_passed "CLI script exists"
    
    # Count CLI commands
    CMD_COUNT=$(grep -c "case '" "$CLI_SCRIPT" 2>/dev/null || echo "0")
    if [ "$CMD_COUNT" -ge 10 ]; then
        check_passed "CLI has $CMD_COUNT commands"
    else
        check_warning "CLI has only $CMD_COUNT commands"
    fi
else
    check_failed "CLI script not found"
fi

# ============================================================================
# 10. FINAL SUMMARY
# ============================================================================
section "10. Preflight Summary"

echo ""
echo "Checks completed at: $(date)"
echo ""
echo -e "Results:"
echo -e "  ${GREEN}Passed: $PASSED${NC}"
echo -e "  ${RED}Failed: $FAILED${NC}"
echo -e "  ${YELLOW}Warnings: $WARNINGS${NC}"
echo ""

TOTAL=$((PASSED + FAILED))
PASS_RATE=$((PASSED * 100 / TOTAL))

echo "Pass rate: $PASS_RATE%"
echo ""

if [ $FAILED -eq 0 ]; then
    if [ $WARNINGS -eq 0 ]; then
        echo -e "${GREEN}✅ ALL CHECKS PASSED - READY FOR DEPLOYMENT${NC}"
        exit 0
    else
        echo -e "${YELLOW}⚠️  ALL CRITICAL CHECKS PASSED - Review warnings before deployment${NC}"
        exit 0
    fi
else
    echo -e "${RED}❌ CHECKS FAILED - Fix issues before deployment${NC}"
    echo ""
    echo "Common fixes:"
    echo "  - Run 'pnpm install' to install dependencies"
    echo "  - Set required environment variables in .env"
    echo "  - Run tests: cd apps/api && pnpm test"
    echo "  - Apply database migrations"
    exit 1
fi
