#!/bin/bash
#
# P2P Fiat Trading E2E Test Runner
#
# This script runs end-to-end tests for the P2P trading system.
# E2E tests require:
#   1. SUPABASE_SERVICE_ROLE_KEY environment variable
#   2. Network access to Supabase
#
# Usage:
#   ./scripts/run-e2e-tests.sh
#
# Or with service key:
#   SUPABASE_SERVICE_ROLE_KEY="your-key" ./scripts/run-e2e-tests.sh
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW}P2P Fiat Trading E2E Test Suite${NC}"
echo -e "${YELLOW}========================================${NC}"
echo ""

# Check for service role key
if [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
    echo -e "${RED}ERROR: SUPABASE_SERVICE_ROLE_KEY is not set${NC}"
    echo ""
    echo "E2E tests require the Supabase service role key."
    echo "Get it from: https://supabase.com/dashboard/project/vbhftvdayqfmcgmzdxfv/settings/api"
    echo ""
    echo "Run with:"
    echo "  export SUPABASE_SERVICE_ROLE_KEY=\"your-key-here\""
    echo "  ./scripts/run-e2e-tests.sh"
    echo ""
    echo "Or:"
    echo "  SUPABASE_SERVICE_ROLE_KEY=\"your-key\" ./scripts/run-e2e-tests.sh"
    echo ""
    echo -e "${YELLOW}Running unit tests only...${NC}"
    npm run test:run -- --grep "P2P Fiat Trading E2E" --invert
    exit 0
fi

echo -e "${GREEN}Service role key found. Running full E2E test suite...${NC}"
echo ""

# Run all P2P tests including E2E
npm run test:run -- --grep "P2P"

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}E2E Tests Complete${NC}"
echo -e "${GREEN}========================================${NC}"
