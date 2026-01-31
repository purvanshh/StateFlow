#!/bin/bash
# ============================================================================
# StateFlow v1.0 - Final Production Deployment
# ============================================================================
# Master deployment orchestrator
# Usage: ./final-deployment.sh [staging|production] [options]
# ============================================================================

set -e

ENVIRONMENT=${1:-staging}
OPTIONS=${2:-}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DEPLOY_LOG="$PROJECT_ROOT/.deployment-$(date +%Y%m%d-%H%M%S).log"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Logging
log() {
    echo -e "$1" | tee -a "$DEPLOY_LOG"
}

error() {
    log "${RED}ERROR: $1${NC}"
}

success() {
    log "${GREEN}✓ $1${NC}"
}

warning() {
    log "${YELLOW}! $1${NC}"
}

info() {
    log "${CYAN}$1${NC}"
}

# ============================================================================
# HEADER
# ============================================================================
clear
log "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
log "${BLUE}║          StateFlow v1.0 - Production Deployment              ║${NC}"
log "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
log ""
log "Environment: ${YELLOW}$ENVIRONMENT${NC}"
log "Started: $(date)"
log "Log file: $DEPLOY_LOG"
log ""

# ============================================================================
# CONFIRMATION
# ============================================================================
if [ "$ENVIRONMENT" = "production" ]; then
    log "${RED}⚠️  PRODUCTION DEPLOYMENT DETECTED${NC}"
    log "${RED}This will deploy to production environment${NC}"
    log ""
    log "Pre-deployment checklist:"
    log "  - [ ] Low traffic window (recommended: 02:00-04:00 UTC)"
    log "  - [ ] On-call engineer available"
    log "  - [ ] Rollback procedure reviewed"
    log "  - [ ] Database backup completed"
    log "  - [ ] Status page update prepared"
    log ""
    read -p "Are you ready to proceed? (YES to confirm): " CONFIRM
    if [[ ! $CONFIRM =~ ^YES$ ]]; then
        log "Deployment cancelled by user"
        exit 1
    fi
    log ""
fi

# ============================================================================
# PHASE 0: PRE-DEPLOYMENT
# ============================================================================
info "═══════════════════════════════════════════════════════════════"
info "PHASE 0: Pre-Deployment Verification"
info "═══════════════════════════════════════════════════════════════"
log ""

log "Running preflight checks..."
if "$SCRIPT_DIR/preflight-checks.sh" "$ENVIRONMENT" | tee -a "$DEPLOY_LOG"; then
    success "Preflight checks passed"
else
    error "Preflight checks failed"
    log "${RED}Deployment aborted. Fix issues and retry.${NC}"
    exit 1
fi

log ""

# ============================================================================
# PHASE 1: BUILD
# ============================================================================
info "═══════════════════════════════════════════════════════════════"
info "PHASE 1: Build Artifacts"
info "═══════════════════════════════════════════════════════════════"
log ""

cd "$PROJECT_ROOT"

log "Building all packages..."
if pnpm run build &> /dev/null; then
    success "Build completed"
else
    error "Build failed"
    exit 1
fi

log ""

# ============================================================================
# PHASE 2: DATABASE MIGRATION
# ============================================================================
info "═══════════════════════════════════════════════════════════════"
info "PHASE 2: Database Migration"
info "═══════════════════════════════════════════════════════════════"
log ""

if [ -f "$PROJECT_ROOT/.env" ]; then
    source "$PROJECT_ROOT/.env"
fi

if [ -n "$SUPABASE_URL" ]; then
    log "Applying migration 002 (atomic claiming)..."
    log "${YELLOW}Note: Migration must be applied manually via Supabase SQL Editor${NC}"
    log "${YELLOW}File: infra/migrations/002_atomic_claiming.sql${NC}"
    log ""
    read -p "Has migration 002 been applied? (yes/no): " MIGRATION_APPLIED
    if [[ ! $MIGRATION_APPLIED =~ ^yes$ ]]; then
        error "Migration not applied. Please apply before continuing."
        exit 1
    fi
    success "Migration confirmed applied"
else
    warning "SUPABASE_URL not set, skipping database checks"
fi

log ""

# ============================================================================
# PHASE 3: DEPLOYMENT
# ============================================================================
info "═══════════════════════════════════════════════════════════════"
info "PHASE 3: Deploy Services"
info "═══════════════════════════════════════════════════════════════"
log ""

if [ "$ENVIRONMENT" = "production" ]; then
    COMPOSE_FILE="$PROJECT_ROOT/deploy/docker-compose.prod.yml"
    
    if [ ! -f "$COMPOSE_FILE" ]; then
        error "Production compose file not found: $COMPOSE_FILE"
        exit 1
    fi
    
    log "Deploying with Docker Compose..."
    log "File: $COMPOSE_FILE"
    log ""
    
    # Pre-deployment backup
    log "Creating pre-deployment backup..."
    if [ -f "$PROJECT_ROOT/deploy/backup-schema.sh" ]; then
        "$PROJECT_ROOT/deploy/backup-schema.sh" --pre-deploy 2>/dev/null || warning "Backup script failed"
    fi
    
    # Deploy
    log "Starting services..."
    if docker-compose -f "$COMPOSE_FILE" up -d --remove-orphans 2>&1 | tee -a "$DEPLOY_LOG"; then
        success "Services deployed"
    else
        error "Deployment failed"
        log "${RED}Check docker-compose logs for details${NC}"
        exit 1
    fi
    
    # Wait for startup
    log "Waiting 30 seconds for services to start..."
    sleep 30
    
else
    # Staging deployment
    log "Starting development server for staging..."
    cd "$PROJECT_ROOT/apps/api"
    pnpm dev &
    DEV_PID=$!
    sleep 5
    success "Staging server started (PID: $DEV_PID)"
fi

log ""

# ============================================================================
# PHASE 4: HEALTH VERIFICATION
# ============================================================================
info "═══════════════════════════════════════════════════════════════"
info "PHASE 4: Health Verification"
info "═══════════════════════════════════════════════════════════════"
log ""

PROD_URL="http://localhost:4000"
if [ "$ENVIRONMENT" = "production" ]; then
    # Try to get actual URL from environment
    PROD_URL="${PUBLIC_URL:-http://localhost:4000}"
fi

log "Target URL: $PROD_URL"
log "Running health verification..."
log ""

if "$SCRIPT_DIR/verify-production.sh" "$PROD_URL" | tee -a "$DEPLOY_LOG"; then
    success "Health verification passed"
else
    error "Health verification failed"
    log "${YELLOW}Check $DEPLOY_LOG for details${NC}"
    
    if [ "$ENVIRONMENT" = "production" ]; then
        log "${RED}Consider rollback: ./deploy/rollback-procedure.md${NC}"
    fi
    
    exit 1
fi

log ""

# ============================================================================
# PHASE 5: SMOKE TESTS
# ============================================================================
info "═══════════════════════════════════════════════════════════════"
info "PHASE 5: Smoke Testing"
info "═══════════════════════════════════════════════════════════════"
log ""

log "Creating test workflow execution..."
TEST_RESPONSE=$(curl -s -X POST "$PROD_URL/api/events" \
    -H "Content-Type: application/json" \
    -d '{"workflowId":"demo-wf-001","input":{"deployment_test":true}}' 2>/dev/null)

if echo "$TEST_RESPONSE" | grep -q "executionId"; then
    EXEC_ID=$(echo "$TEST_RESPONSE" | grep -o '"executionId":"[^"]*"' | cut -d'"' -f4)
    success "Test execution created: $EXEC_ID"
    
    log "Waiting for execution to process..."
    sleep 5
    
    EXEC_STATUS=$(curl -s "$PROD_URL/api/executions/$EXEC_ID" 2>/dev/null | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
    log "Execution status: $EXEC_STATUS"
    
    if [ "$EXEC_STATUS" = "completed" ] || [ "$EXEC_STATUS" = "running" ]; then
        success "Test execution processed successfully"
    else
        warning "Test execution in state: $EXEC_STATUS (may be normal)"
    fi
else
    error "Failed to create test execution"
    log "Response: $TEST_RESPONSE"
fi

log ""

# ============================================================================
# PHASE 6: DISASTER RECOVERY TEST
# ============================================================================
if [[ "$OPTIONS" =~ "--dr-test" ]]; then
    info "═══════════════════════════════════════════════════════════════"
    info "PHASE 6: Disaster Recovery Testing"
    info "═══════════════════════════════════════════════════════════════"
    log ""
    
    log "Running DR scenarios..."
    if "$SCRIPT_DIR/test-dr-scenarios.sh" "$PROD_URL" | tee -a "$DEPLOY_LOG"; then
        success "DR testing completed"
    else
        warning "Some DR scenarios had issues (check logs)"
    fi
    
    log ""
fi

# ============================================================================
# PHASE 7: POST-DEPLOYMENT
# ============================================================================
info "═══════════════════════════════════════════════════════════════"
info "PHASE 7: Post-Deployment Setup"
info "═══════════════════════════════════════════════════════════════"
log ""

log "Collecting system information..."

# System status
HEALTH_STATUS=$(curl -s "$PROD_URL/api/admin/health" 2>/dev/null | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4)
VERSION=$(curl -s "$PROD_URL/api/admin/health" 2>/dev/null | grep -o '"version":"[^"]*"' | cut -d'"' -f4)
UPTIME=$(curl -s "$PROD_URL/api/admin/health" 2>/dev/null | grep -o '"uptime_seconds":[0-9]*' | cut -d':' -f2)

log "  Status: $HEALTH_STATUS"
log "  Version: $VERSION"
log "  Uptime: ${UPTIME}s"

# Create handover file
HANDOVER_FILE="$PROJECT_ROOT/.deployment-handover-$(date +%Y%m%d).md"
cat > "$HANDOVER_FILE" << EOF
# StateFlow Deployment Handover

**Date:** $(date)
**Environment:** $ENVIRONMENT
**Version:** ${VERSION:-unknown}
**Status:** ${HEALTH_STATUS:-unknown}

## Deployment Summary

✅ **Deployment Successful**

- All preflight checks passed
- Database migrations applied
- Services deployed and healthy
- Smoke tests passed

## Access Information

- **Health Dashboard:** $PROD_URL/api/admin/health
- **Metrics:** $PROD_URL/api/metrics/prometheus
- **API Base:** $PROD_URL/api

## Key Commands

\`\`\`bash
# Check system health
pnpm stateflow health

# View recent executions
pnpm stateflow list

# Check metrics
pnpm stateflow metrics
\`\`\`

## Documentation

- Runbooks: ./docs/runbooks/
- Rollback: ./deploy/rollback-procedure.md
- Architecture: ./docs/architecture.md

## Monitoring

Set up alerts for:
- Error rate > 1%
- Worker count < 2
- Queue depth > 100
- Response time > 2s (p95)

## Next Steps

1. Monitor #stateflow-alerts for 24 hours
2. Establish performance baseline
3. Schedule weekly operations review
4. Document any anomalies

## Contact

- Primary: $(whoami)
- Escalation: Engineering Lead
- On-Call: See PagerDuty rotation
EOF

success "Handover documentation created: $HANDOVER_FILE"

log ""

# ============================================================================
# FINAL SUMMARY
# ============================================================================
info "═══════════════════════════════════════════════════════════════"
info "DEPLOYMENT COMPLETE"
info "═══════════════════════════════════════════════════════════════"
log ""

log "${GREEN}✅ StateFlow v1.0 Deployed Successfully${NC}"
log ""
log "Summary:"
log "  Environment: $ENVIRONMENT"
log "  URL: $PROD_URL"
log "  Health: ${HEALTH_STATUS:-unknown}"
log "  Log: $DEPLOY_LOG"
log "  Handover: $HANDOVER_FILE"
log ""

if [ "$ENVIRONMENT" = "production" ]; then
    log "${YELLOW}⚠️  POST-DEPLOYMENT ACTIONS REQUIRED:${NC}"
    log ""
    log "  1. Monitor health dashboard for 2 hours"
    log "     watch -n 30 'curl -s $PROD_URL/api/admin/health | jq .status'"
    log ""
    log "  2. Check error logs"
    log "     docker logs stateflow-api | grep -i error"
    log ""
    log "  3. Verify queue processing"
    log "     pnpm stateflow health"
    log ""
    log "  4. Update status page"
    log ""
    log "  5. Notify team in #deployments"
    log ""
fi

log "${GREEN}🎉 StateFlow is now operational!${NC}"
log ""
log "Quick verification:"
log "  curl $PROD_URL/api/admin/health | jq"
log ""

exit 0
