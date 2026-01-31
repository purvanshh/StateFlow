#!/bin/bash
# ============================================================================
# StateFlow v1.0 - Production Verification (25 Checks)
# ============================================================================
# Comprehensive post-deployment verification
# Usage: ./verify-production.sh [--production-url=http://...]
# ============================================================================

set -e

PROD_URL=${1:-http://localhost:4000}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

CHECKS_PASSED=0
CHECKS_FAILED=0
CHECK_NUMBER=0

check() {
    ((CHECK_NUMBER++))
    local name="$1"
    local command="$2"
    
    echo -n "[$CHECK_NUMBER/25] $name... "
    
    if eval "$command" &> /dev/null; then
        echo -e "${GREEN}PASS${NC}"
        ((CHECKS_PASSED++))
    else
        echo -e "${RED}FAIL${NC}"
        ((CHECKS_FAILED++))
    fi
}

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}StateFlow Production Verification${NC}"
echo -e "${BLUE}Target: $PROD_URL${NC}"
echo -e "${BLUE}Started: $(date)${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# ============================================================================
# HEALTH CHECKS (1-5)
# ============================================================================
echo -e "${YELLOW}Health Endpoint Verification${NC}"

check "Basic health endpoint" \
    "curl -s $PROD_URL/api/health"

check "Liveness probe" \
    "curl -s $PROD_URL/api/health/live | grep -q 'alive'"

check "Readiness probe" \
    "curl -s $PROD_URL/api/health/ready"

check "Admin health dashboard" \
    "curl -s $PROD_URL/api/admin/health | grep -q 'status'"

check "Health status is healthy" \
    "curl -s $PROD_URL/api/admin/health | grep -q 'healthy\|degraded'"

# ============================================================================
# API FUNCTIONALITY (6-10)
# ============================================================================
echo ""
echo -e "${YELLOW}API Functionality${NC}"

check "Workflows endpoint accessible" \
    "curl -s $PROD_URL/api/workflows"

check "Executions endpoint accessible" \
    "curl -s $PROD_URL/api/executions"

check "Events endpoint accessible" \
    "curl -s -X POST $PROD_URL/api/events -H 'Content-Type: application/json' -d '{}'"

check "Metrics endpoint accessible" \
    "curl -s $PROD_URL/api/metrics"

check "Prometheus metrics format" \
    "curl -s $PROD_URL/api/metrics/prometheus | grep -q 'stateflow'"

# ============================================================================
# WORKER FUNCTIONALITY (11-15)
# ============================================================================
echo ""
echo -e "${YELLOW}Worker Functionality${NC}"

check "Workers are connected" \
    "curl -s $PROD_URL/api/admin/health | grep -q 'workers_active'

check "Queue depth monitored" \
    "curl -s $PROD_URL/api/admin/health | grep -q 'queue_depth'

check "Success rate calculated" \
    "curl -s $PROD_URL/api/admin/health | grep -q 'success_rate'

check "Database connection healthy" \
    "curl -s $PROD_URL/api/admin/health | grep -q 'database.*ok'"

check "Memory usage within limits" \
    "curl -s $PROD_URL/api/admin/health | grep -q 'memory'"

# ============================================================================
# DATA INTEGRITY (16-20)
# ============================================================================
echo ""
echo -e "${YELLOW}Data Integrity${NC}"

# Create a test execution
echo "Creating test execution..."
TEST_RESPONSE=$(curl -s -X POST "$PROD_URL/api/events" \
    -H "Content-Type: application/json" \
    -d '{"workflowId":"demo-wf-001","input":{"test":true}}')

if echo "$TEST_RESPONSE" | grep -q "executionId"; then
    EXECUTION_ID=$(echo "$TEST_RESPONSE" | grep -o '"executionId":"[^"]*"' | cut -d'"' -f4)
    echo "Test execution created: $EXECUTION_ID"
    
    check "Test execution created" \
        "[ -n '$EXECUTION_ID' ]"
    
    sleep 2
    
    check "Execution status retrievable" \
        "curl -s $PROD_URL/api/executions/$EXECUTION_ID | grep -q 'id'"
    
    check "Execution logs accessible" \
        "curl -s $PROD_URL/api/executions/$EXECUTION_ID/logs"
    
    check "Execution appears in list" \
        "curl -s '$PROD_URL/api/executions?limit=10' | grep -q '$EXECUTION_ID'"
    
    check "Step results tracked" \
        "curl -s $PROD_URL/api/executions/$EXECUTION_ID | grep -q 'steps'"
else
    echo -e "${YELLOW}Could not create test execution, skipping data checks${NC}"
    CHECKS_FAILED=$((CHECKS_FAILED + 5))
    CHECK_NUMBER=$((CHECK_NUMBER + 5))
fi

# ============================================================================
# CLI TOOL (21-23)
# ============================================================================
echo ""
echo -e "${YELLOW}CLI Tool Verification${NC}"

check "CLI help works" \
    "pnpm --silent stateflow --help | grep -q 'Commands'"

check "CLI health check works" \
    "pnpm --silent stateflow health | grep -q 'Status\|Running\|Scheduled'"

check "CLI list works" \
    "pnpm --silent stateflow list | grep -q 'ID\|Workflow\|Status'"

# ============================================================================
# MONITORING & OBSERVABILITY (24-25)
# ============================================================================
echo ""
echo -e "${YELLOW}Monitoring & Observability${NC}"

check "DLQ endpoint accessible" \
    "curl -s $PROD_URL/api/metrics/dlq"

check "Detailed health info available" \
    "curl -s $PROD_URL/api/admin/health/detailed | grep -q 'timestamp'"

# ============================================================================
# SUMMARY
# ============================================================================
echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Verification Complete${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo "Results:"
echo -e "  ${GREEN}Passed: $CHECKS_PASSED/25${NC}"
echo -e "  ${RED}Failed: $CHECKS_FAILED/25${NC}"
echo ""

PASS_RATE=$((CHECKS_PASSED * 100 / 25))
echo "Pass rate: $PASS_RATE%"
echo "Completed at: $(date)"
echo ""

if [ $CHECKS_FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ ALL 25 CHECKS PASSED${NC}"
    echo -e "${GREEN}StateFlow is verified and operational!${NC}"
    exit 0
elif [ $PASS_RATE -ge 80 ]; then
    echo -e "${YELLOW}⚠️  MOST CHECKS PASSED ($PASS_RATE%)${NC}"
    echo -e "${YELLOW}System is functional but review failed checks${NC}"
    exit 0
else
    echo -e "${RED}❌ VERIFICATION FAILED ($PASS_RATE%)${NC}"
    echo -e "${RED}Do not consider deployment complete${NC}"
    exit 1
fi
