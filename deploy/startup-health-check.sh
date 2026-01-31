#!/bin/bash
# =============================================================================
# StateFlow Production Startup Health Check
# =============================================================================
# This script verifies the deployment health before marking it as ready
# Run this after deployment to ensure all services are operational
#
# Usage: ./startup-health-check.sh [API_URL] [TIMEOUT_SECONDS]
# Example: ./startup-health-check.sh https://api.yourdomain.com 300
# =============================================================================

set -euo pipefail

# Configuration
API_URL="${1:-http://localhost:4000}"
TIMEOUT_SECONDS="${2:-300}"
CHECK_INTERVAL=5
START_TIME=$(date +%s)

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

# Check if curl is available
check_prerequisites() {
    if ! command -v curl &> /dev/null; then
        log_error "curl is required but not installed"
        exit 1
    fi
    
    if ! command -v jq &> /dev/null; then
        log_warn "jq not installed - JSON output will be raw"
    fi
}

# Health check functions
check_liveness() {
    local url="${API_URL}/api/health/live"
    local response
    local http_code
    
    response=$(curl -s -w "\n%{http_code}" --max-time 10 "$url" 2>/dev/null || echo -e "\n000")
    http_code=$(echo "$response" | tail -n1)
    
    if [ "$http_code" == "200" ]; then
        return 0
    else
        return 1
    fi
}

check_readiness() {
    local url="${API_URL}/api/health/ready"
    local response
    local http_code
    
    response=$(curl -s -w "\n%{http_code}" --max-time 10 "$url" 2>/dev/null || echo -e "\n000")
    http_code=$(echo "$response" | tail -n1)
    
    if [ "$http_code" == "200" ]; then
        local body=$(echo "$response" | head -n -1)
        if command -v jq &> /dev/null; then
            local status=$(echo "$body" | jq -r '.status' 2>/dev/null || echo "unknown")
            if [ "$status" == "ready" ]; then
                return 0
            else
                log_warn "API reports status: $status"
                return 1
            fi
        else
            return 0
        fi
    else
        return 1
    fi
}

check_detailed_health() {
    local url="${API_URL}/api/admin/health"
    local response
    local http_code
    
    response=$(curl -s -w "\n%{http_code}" --max-time 15 "$url" 2>/dev/null || echo -e "\n000")
    http_code=$(echo "$response" | tail -n1)
    
    if [ "$http_code" == "200" ]; then
        return 0
    else
        return 1
    fi
}

check_metrics_endpoint() {
    local url="${API_URL}/api/metrics"
    local response
    local http_code
    
    response=$(curl -s -w "\n%{http_code}" --max-time 10 "$url" 2>/dev/null || echo -e "\n000")
    http_code=$(echo "$response" | tail -n1)
    
    if [ "$http_code" == "200" ]; then
        return 0
    else
        log_warn "Metrics endpoint not accessible (HTTP $http_code) - this is OK if monitoring is disabled"
        return 0  # Non-blocking
    fi
}

# Main health check logic
run_health_checks() {
    local attempts=0
    local liveness_ok=false
    local readiness_ok=false
    local detailed_ok=false
    local metrics_ok=false
    
    log_info "Starting health checks for ${API_URL}"
    log_info "Timeout set to ${TIMEOUT_SECONDS} seconds"
    
    while true; do
        local current_time=$(date +%s)
        local elapsed=$((current_time - START_TIME))
        
        if [ $elapsed -ge $TIMEOUT_SECONDS ]; then
            log_error "Health check timeout reached after ${TIMEOUT_SECONDS} seconds"
            return 1
        fi
        
        attempts=$((attempts + 1))
        
        # Check liveness
        if ! $liveness_ok; then
            if check_liveness; then
                log_info "✓ Liveness check passed (attempt ${attempts})"
                liveness_ok=true
            else
                log_warn "✗ Liveness check failed - waiting..."
            fi
        fi
        
        # Check readiness
        if $liveness_ok && ! $readiness_ok; then
            if check_readiness; then
                log_info "✓ Readiness check passed"
                readiness_ok=true
            else
                log_warn "✗ Readiness check failed - waiting..."
            fi
        fi
        
        # Check detailed health
        if $readiness_ok && ! $detailed_ok; then
            if check_detailed_health; then
                log_info "✓ Detailed health check passed"
                detailed_ok=true
            else
                log_warn "✗ Detailed health check failed - waiting..."
            fi
        fi
        
        # Check metrics endpoint
        if $detailed_ok && ! $metrics_ok; then
            if check_metrics_endpoint; then
                log_info "✓ Metrics endpoint accessible"
                metrics_ok=true
            fi
        fi
        
        # All checks passed
        if $liveness_ok && $readiness_ok && $detailed_ok; then
            log_info "========================================"
            log_info "All health checks passed!"
            log_info "Total attempts: ${attempts}"
            log_info "Elapsed time: ${elapsed} seconds"
            log_info "========================================"
            return 0
        fi
        
        sleep $CHECK_INTERVAL
    done
}

# Display health summary
show_health_summary() {
    log_info "Fetching health summary..."
    
    local health_url="${API_URL}/api/health"
    local response
    
    response=$(curl -s --max-time 10 "$health_url" 2>/dev/null || echo "{}")
    
    if command -v jq &> /dev/null; then
        echo "$response" | jq -r '
            "Status: \(.status)",
            "Version: \(.version)",
            "Uptime: \(.uptimeSec // "unknown") seconds",
            "",
            "Worker Status:",
            "  Running: \(.worker.running)",
            "  Scheduled: \(.worker.scheduled)",
            "  Queue Depth: \(.worker.queueDepth)",
            "  Memory: \(.worker.memoryUsageMb) MB",
            "",
            "Metrics:",
            "  Total Executions: \(.metrics.totalExecutions)",
            "  Successful: \(.metrics.successfulExecutions)",
            "  Failed: \(.metrics.failedExecutions)"
        ' 2>/dev/null || log_warn "Could not parse health response"
    else
        echo "$response"
    fi
}

# Cleanup function
cleanup() {
    log_info "Health check script completed"
}

trap cleanup EXIT

# Main execution
main() {
    check_prerequisites
    
    if run_health_checks; then
        show_health_summary
        log_info "Deployment is healthy and ready for traffic"
        exit 0
    else
        log_error "Deployment health checks failed"
        log_error "Check application logs for details"
        exit 1
    fi
}

main "$@"
