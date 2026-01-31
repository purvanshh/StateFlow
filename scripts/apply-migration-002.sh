#!/bin/bash
# ============================================================================
# Apply Migration 002 - Atomic Claiming
# ============================================================================
# This script applies the atomic claiming migration to the database
# Usage: ./apply-migration-002.sh [staging|production]
# ============================================================================

set -e

ENVIRONMENT=${1:-staging}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}StateFlow Migration 002 - Atomic Claiming${NC}"
echo "Environment: $ENVIRONMENT"
echo "=========================================="

# Check environment variables
if [ -z "$SUPABASE_URL" ]; then
    echo -e "${RED}Error: SUPABASE_URL not set${NC}"
    echo "Please source your .env file or set the environment variables"
    exit 1
fi

if [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
    echo -e "${RED}Error: SUPABASE_SERVICE_ROLE_KEY not set${NC}"
    exit 1
fi

# Verify database connection
echo -e "\n${YELLOW}Step 1: Verifying database connection...${NC}"
curl -s "$SUPABASE_URL/rest/v1/" \
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" > /dev/null

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Database connection successful${NC}"
else
    echo -e "${RED}✗ Database connection failed${NC}"
    exit 1
fi

# Pre-flight checks
echo -e "\n${YELLOW}Step 2: Pre-flight checks...${NC}"

# Check if executions table exists
TABLE_EXISTS=$(curl -s "$SUPABASE_URL/rest/v1/executions?select=id&limit=1" \
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
    -w "%{http_code}" \
    -o /dev/null)

if [ "$TABLE_EXISTS" == "200" ]; then
    echo -e "${GREEN}✓ Executions table exists${NC}"
else
    echo -e "${RED}✗ Executions table not found (HTTP $TABLE_EXISTS)${NC}"
    exit 1
fi

# Check if function already exists
echo -e "\n${YELLOW}Step 3: Checking existing function...${NC}"
FUNCTION_EXISTS=$(curl -s "$SUPABASE_URL/rest/v1/rpc/claim_executions" \
    -X POST \
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Content-Type: application/json" \
    -d '{"p_worker_id": "test", "p_batch_size": 1}' \
    -w "%{http_code}" \
    -o /dev/null 2>&1 || echo "404")

if [ "$FUNCTION_EXISTS" == "200" ]; then
    echo -e "${YELLOW}! claim_executions function already exists${NC}"
    read -p "Do you want to recreate it? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Migration cancelled."
        exit 0
    fi
fi

# Apply migration
echo -e "\n${YELLOW}Step 4: Applying migration...${NC}"
MIGRATION_FILE="$PROJECT_ROOT/infra/migrations/002_atomic_claiming.sql"

if [ ! -f "$MIGRATION_FILE" ]; then
    echo -e "${RED}Error: Migration file not found at $MIGRATION_FILE${NC}"
    exit 1
fi

echo "Migration file: $MIGRATION_FILE"
echo -e "${GREEN}✓ Migration file found${NC}"

# Note: For Supabase, you need to run SQL via the SQL Editor or use the CLI
# This script assumes you're using the Supabase CLI or SQL Editor
echo -e "\n${YELLOW}==========================================${NC}"
echo -e "${YELLOW}MANUAL STEP REQUIRED${NC}"
echo -e "${YELLOW}==========================================${NC}"
echo ""
echo "Please execute the following SQL in your Supabase SQL Editor:"
echo ""
cat "$MIGRATION_FILE"
echo ""
echo -e "${YELLOW}==========================================${NC}"

read -p "Have you executed the SQL? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Migration incomplete. Please run the SQL and try again."
    exit 1
fi

# Verify migration
echo -e "\n${YELLOW}Step 5: Verifying migration...${NC}"

# Test the function
TEST_RESULT=$(curl -s "$SUPABASE_URL/rest/v1/rpc/claim_executions" \
    -X POST \
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Content-Type: application/json" \
    -d '{"p_worker_id": "test-worker-verify", "p_batch_size": 5}')

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Function call successful${NC}"
    echo "Response: $TEST_RESULT"
else
    echo -e "${RED}✗ Function call failed${NC}"
    exit 1
fi

# Record migration
echo -e "\n${YELLOW}Step 6: Recording migration...${NC}"
MIGRATION_RECORD="{
  \"migration_id\": \"002_atomic_claiming\",
  \"applied_at\": \"$(date -u +"%Y-%m-%dT%H:%M:%SZ")\",
  \"environment\": \"$ENVIRONMENT\",
  \"applied_by\": \"$(whoami)@$(hostname)\"\n}"

echo "$MIGRATION_RECORD" > "$PROJECT_ROOT/.migration-002.log"
echo -e "${GREEN}✓ Migration recorded${NC}"

echo -e "\n${GREEN}==========================================${NC}"
echo -e "${GREEN}Migration 002 Applied Successfully!${NC}"
echo -e "${GREEN}==========================================${NC}"
echo ""
echo "Next steps:"
echo "1. Monitor worker behavior for 15 minutes"
echo "2. Check logs for any errors"
echo "3. Run: pnpm test to verify functionality"
echo ""
echo "If you need to rollback:"
echo "  ./scripts/rollback-migration-002.sh"
