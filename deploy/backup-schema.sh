#!/bin/bash
# =============================================================================
# StateFlow Database Backup Script
# =============================================================================
# This script backs up the Supabase PostgreSQL database schema and data
# Supports: Local backups, S3 upload, retention policies
#
# Usage: ./backup-schema.sh [backup_type] [destination]
#   backup_type: full (default), schema-only, data-only
#   destination: local (default), s3
#
# Examples:
#   ./backup-schema.sh full local
#   ./backup-schema.sh schema-only s3
#   ./backup-schema.sh full s3
#
# Requirements:
#   - pg_dump (PostgreSQL client tools)
#   - AWS CLI (for S3 backups)
#   - Environment variables from .env.production
# =============================================================================

set -euo pipefail

# Configuration
BACKUP_TYPE="${1:-full}"
DESTINATION="${2:-local}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Load environment variables
if [ -f "$SCRIPT_DIR/.env.production" ]; then
    # shellcheck source=/dev/null
    set -a
    source "$SCRIPT_DIR/.env.production"
    set +a
elif [ -f "$PROJECT_ROOT/.env" ]; then
    # shellcheck source=/dev/null
    set -a
    source "$PROJECT_ROOT/.env"
    set +a
fi

# Backup configuration
BACKUP_DIR="${BACKUP_DIR:-$SCRIPT_DIR/backups}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
S3_BUCKET="${BACKUP_S3_BUCKET:-}"
S3_REGION="${BACKUP_S3_REGION:-us-east-1}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DATE_PREFIX=$(date +%Y/%m/%d)

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
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

log_debug() {
    echo -e "${BLUE}[DEBUG]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check pg_dump
    if ! command -v pg_dump &> /dev/null; then
        log_error "pg_dump is required but not installed"
        log_info "Install with: brew install libpq (macOS) or apt-get install postgresql-client (Ubuntu)"
        exit 1
    fi
    
    # Check S3 requirements
    if [ "$DESTINATION" == "s3" ]; then
        if ! command -v aws &> /dev/null; then
            log_error "AWS CLI is required for S3 backups but not installed"
            exit 1
        fi
        
        if [ -z "$S3_BUCKET" ]; then
            log_error "BACKUP_S3_BUCKET environment variable is required for S3 backups"
            exit 1
        fi
    fi
    
    # Check database URL
    if [ -z "${DATABASE_URL:-}" ] && [ -z "${SUPABASE_URL:-}" ]; then
        log_error "Either DATABASE_URL or SUPABASE_URL environment variable must be set"
        exit 1
    fi
    
    log_info "All prerequisites satisfied"
}

# Extract connection details from DATABASE_URL or construct from Supabase URL
get_connection_params() {
    local db_url="${DATABASE_URL:-}"
    
    # If DATABASE_URL not set, construct from Supabase URL
    if [ -z "$db_url" ] && [ -n "${SUPABASE_URL:-}" ]; then
        # Extract project ID from Supabase URL
        local project_id=$(echo "$SUPABASE_URL" | sed -E 's|https://([^.]+)\..*|\1|')
        log_info "Constructing connection for Supabase project: $project_id"
        
        # Note: Direct PostgreSQL connection requires password
        # You may need to get this from Supabase dashboard
        log_warn "Direct PostgreSQL backup requires database password"
        log_warn "Set DATABASE_URL with full connection string for automated backups"
        log_warn "Format: postgresql://postgres:PASSWORD@db.PROJECT_ID.supabase.co:5432/postgres"
        exit 1
    fi
    
    echo "$db_url"
}

# Create backup filename
generate_backup_filename() {
    local suffix=""
    case "$BACKUP_TYPE" in
        schema-only)
            suffix="schema"
            ;;
        data-only)
            suffix="data"
            ;;
        *)
            suffix="full"
            ;;
    esac
    
    echo "stateflow_${suffix}_${TIMESTAMP}.sql"
}

# Create local backup directory
prepare_backup_dir() {
    if [ ! -d "$BACKUP_DIR" ]; then
        log_info "Creating backup directory: $BACKUP_DIR"
        mkdir -p "$BACKUP_DIR"
    fi
}

# Perform database backup
perform_backup() {
    local output_file="$1"
    local db_url
    db_url=$(get_connection_params)
    
    log_info "Starting backup (type: $BACKUP_TYPE)..."
    log_info "Output file: $output_file"
    
    local pg_dump_opts="--verbose --no-owner --no-privileges"
    
    case "$BACKUP_TYPE" in
        schema-only)
            pg_dump_opts="$pg_dump_opts --schema-only"
            log_info "Backing up schema only (no data)"
            ;;
        data-only)
            pg_dump_opts="$pg_dump_opts --data-only"
            log_info "Backing up data only (no schema)"
            ;;
        *)
            log_info "Performing full backup (schema + data)"
            ;;
    esac
    
    # Add specific tables for StateFlow
    local tables="executions step_results dlq_entries execution_logs"
    
    log_debug "Running: pg_dump $pg_dump_opts"
    
    if ! pg_dump $pg_dump_opts "$db_url" > "$output_file" 2>/dev/null; then
        log_error "Backup failed"
        exit 1
    fi
    
    # Compress the backup
    local compressed_file="${output_file}.gz"
    log_info "Compressing backup..."
    gzip -c "$output_file" > "$compressed_file"
    rm "$output_file"
    
    local file_size
    file_size=$(du -h "$compressed_file" | cut -f1)
    log_info "Backup completed: $compressed_file ($file_size)"
    
    echo "$compressed_file"
}

# Upload to S3
upload_to_s3() {
    local local_file="$1"
    local filename
    filename=$(basename "$local_file")
    local s3_key="backups/${DATE_PREFIX}/${filename}"
    
    log_info "Uploading to S3..."
    log_info "Bucket: $S3_BUCKET"
    log_info "Key: $s3_key"
    
    if ! aws s3 cp "$local_file" "s3://${S3_BUCKET}/${s3_key}" --region "$S3_REGION"; then
        log_error "S3 upload failed"
        exit 1
    fi
    
    log_info "Upload successful: s3://${S3_BUCKET}/${s3_key}"
    
    # Store metadata
    local metadata_file="${local_file}.meta"
    cat > "$metadata_file" <<EOF
{
  "timestamp": "$TIMESTAMP",
  "type": "$BACKUP_TYPE",
  "s3_bucket": "$S3_BUCKET",
  "s3_key": "$s3_key",
  "filename": "$filename",
  "retention_days": $BACKUP_RETENTION_DAYS
}
EOF
    
    # Also upload metadata
    aws s3 cp "$metadata_file" "s3://${S3_BUCKET}/backups/${DATE_PREFIX}/${filename}.meta" --region "$S3_REGION" > /dev/null
    rm "$metadata_file"
}

# Clean up old backups
cleanup_old_backups() {
    log_info "Cleaning up backups older than $BACKUP_RETENTION_DAYS days..."
    
    if [ "$DESTINATION" == "local" ]; then
        # Clean local backups
        local deleted_count=0
        while IFS= read -r file; do
            log_info "Removing old backup: $file"
            rm -f "$file"
            deleted_count=$((deleted_count + 1))
        done < <(find "$BACKUP_DIR" -name "stateflow_*.sql.gz" -mtime +$BACKUP_RETENTION_DAYS 2>/dev/null)
        
        if [ $deleted_count -gt 0 ]; then
            log_info "Removed $deleted_count old backup(s)"
        else
            log_info "No old backups to remove"
        fi
    else
        # Clean S3 backups
        log_info "Checking S3 for old backups..."
        
        local cutoff_date
        cutoff_date=$(date -d "${BACKUP_RETENTION_DAYS} days ago" +%Y-%m-%d 2>/dev/null || date -v-${BACKUP_RETENTION_DAYS}d +%Y-%m-%d)
        
        # List and delete old objects (simplified - you may want more sophisticated logic)
        aws s3 ls "s3://${S3_BUCKET}/backups/" --recursive --region "$S3_REGION" | \
        while read -r line; do
            local file_date=$(echo "$line" | awk '{print $1}')
            local file_key=$(echo "$line" | awk '{$1=$2=$3=""; print $0}' | sed 's/^ *//')
            
            if [[ "$file_date" < "$cutoff_date" ]]; then
                log_info "Removing old S3 backup: $file_key"
                aws s3 rm "s3://${S3_BUCKET}/${file_key}" --region "$S3_REGION" > /dev/null
            fi
        done
    fi
}

# Verify backup integrity
verify_backup() {
    local backup_file="$1"
    
    log_info "Verifying backup integrity..."
    
    if [ ! -f "$backup_file" ]; then
        log_error "Backup file not found: $backup_file"
        return 1
    fi
    
    # Check file size
    local file_size
    file_size=$(stat -f%z "$backup_file" 2>/dev/null || stat -c%s "$backup_file" 2>/dev/null)
    
    if [ "$file_size" -lt 100 ]; then
        log_error "Backup file is too small ($file_size bytes) - likely corrupted"
        return 1
    fi
    
    # Test gzip integrity
    if ! gzip -t "$backup_file" 2>/dev/null; then
        log_error "Backup file failed gzip integrity check"
        return 1
    fi
    
    log_info "Backup integrity verified"
    return 0
}

# Send notification
send_notification() {
    local status="$1"
    local message="$2"
    
    # Slack notification
    if [ -n "${SLACK_WEBHOOK_URL:-}" ]; then
        local payload
        payload=$(cat <<EOF
{
  "text": "StateFlow Database Backup",
  "attachments": [
    {
      "color": "$status",
      "fields": [
        {
          "title": "Status",
          "value": "$message",
          "short": true
        },
        {
          "title": "Type",
          "value": "$BACKUP_TYPE",
          "short": true
        },
        {
          "title": "Destination",
          "value": "$DESTINATION",
          "short": true
        }
      ]
    }
  ]
}
EOF
)
        
        curl -s -X POST -H 'Content-type: application/json' \
            --data "$payload" \
            "$SLACK_WEBHOOK_URL" > /dev/null 2>&1 || true
    fi
}

# Main execution
main() {
    log_info "========================================"
    log_info "StateFlow Database Backup"
    log_info "Type: $BACKUP_TYPE"
    log_info "Destination: $DESTINATION"
    log_info "Timestamp: $TIMESTAMP"
    log_info "========================================"
    
    check_prerequisites
    prepare_backup_dir
    
    local backup_file
    local filename
    filename=$(generate_backup_filename)
    local local_path="${BACKUP_DIR}/${filename}"
    
    # Perform backup
    backup_file=$(perform_backup "$local_path")
    
    # Verify backup
    if ! verify_backup "$backup_file"; then
        log_error "Backup verification failed"
        send_notification "danger" "Backup failed - integrity check failed"
        exit 1
    fi
    
    # Upload to S3 if requested
    if [ "$DESTINATION" == "s3" ]; then
        upload_to_s3 "$backup_file"
        
        # Remove local copy after successful S3 upload
        log_info "Removing local backup file..."
        rm -f "$backup_file"
    fi
    
    # Cleanup old backups
    cleanup_old_backups
    
    log_info "========================================"
    log_info "Backup completed successfully!"
    if [ "$DESTINATION" == "local" ]; then
        log_info "Location: $backup_file"
    else
        log_info "Location: s3://${S3_BUCKET}/backups/${DATE_PREFIX}/"
    fi
    log_info "========================================"
    
    send_notification "good" "Backup completed successfully"
}

# Handle errors
trap 'log_error "Backup script failed"; send_notification "danger" "Backup failed"; exit 1' ERR

main "$@"
