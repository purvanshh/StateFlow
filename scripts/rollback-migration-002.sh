#!/bin/bash
# ============================================================================
# Rollback Migration 002 - Atomic Claiming
# ============================================================================
# This script rolls back the atomic claiming migration
# Usage: ./rollback-migration-002.sh [staging|production]
# ============================================================================

set -e

ENVIRONMENT=${1:-staging}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}StateFlow Migration 002 Rollback${NC}"
echo "Environment: $ENVIRONMENT"
echo "=========================================="

# Warning
echo -e "${RED}WARNING: This will remove atomic claiming!${NC}"
echo -e "${RED}This can cause duplicate processing with multiple workers.${NC}"
echo ""
read -p "Are you sure you want to continue? (yes/no) " -r
if [[ ! $REPLY =~ ^yes$ ]]; then
    echo "Rollback cancelled."
    exit 0
fi

# Check environment variables
if [ -z "$SUPABASE_URL" ]; then
    echo -e "${RED}Error: SUPABASE_URL not set${NC}"
    exit 1
fi

# Apply rollback
echo -e "\n${YELLOW}Applying rollback migration...${NC}"
ROLLBACK_FILE="$PROJECT_ROOT/infra/migrations/003_rollback_atomic.sql"

if [ ! -f "$ROLLBACK_FILE" ]; then
    echo -e "${RED}Error: Rollback file not found${NC}"
    exit 1
fi

echo -e "${YELLOW}==========================================${NC}"
echo -e "${YELLOW}MANUAL STEP REQUIRED${NC}"
echo -e "${YELLOW}==========================================${NC}"
echo ""
echo "Please execute the following SQL in your Supabase SQL Editor:"
echo ""
cat "$ROLLBACK_FILE"
echo ""
echo -e "${YELLOW}==========================================${NC}"

read -p "Have you executed the SQL? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Rollback incomplete."
    exit 1
fi

# Verify rollback
TEST_RESULT=$(curl -s "$SUPABASE_URL/rest/v1/rpc/claim_executions" \
    -X POST \
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Content-Type: application/json" \
    -d '{"p_worker_id": "test", "p_batch_size": 1}' \
    -w "%{http_code}" \
    -o /dev/null)

if [ "$TEST_RESULT" == "404" ]; then
    echo -e "${GREEN}✓ Function removed successfully${NC}"
else
    echo -e "${YELLOW}! Function may still exist (HTTP $TEST_RESULT)${NC}"
fi

# Record rollback
echo "{\"rollback\": \"002_atomic_claiming\", \"at\": \"$(date -u +"%Y-%m-%dT%H:%M:%SZ")\"}" >> "$PROJECT_ROOT/.migration-002.log"

echo -e "\n${GREEN}Rollback complete${NC}"
echo "Note: Workers should be restarted to use the simple claiming function."
