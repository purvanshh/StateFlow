# StateFlow Production Rollback Procedure

## Overview

This document provides step-by-step instructions for rolling back a StateFlow deployment in case of critical issues. Follow these procedures carefully to minimize downtime and data loss.

## Prerequisites

- [ ] Access to production environment
- [ ] Docker/Docker Compose installed
- [ ] Access to backup files (local or S3)
- [ ] Database credentials (Supabase service role key)
- [ ] Slack/PagerDuty access for team notifications

## Quick Reference

| Scenario                | Rollback Time | Data Loss         | Procedure |
| ----------------------- | ------------- | ----------------- | --------- |
| Container restart issue | 1-2 min       | None              | Section 1 |
| Application bug         | 5-10 min      | None              | Section 2 |
| Database corruption     | 15-30 min     | Since last backup | Section 3 |
| Complete failure        | 30-60 min     | Since last backup | Section 4 |

---

## 1. Container-Level Rollback

**Use when:** Application crashes, memory issues, or container restart loops

### 1.1 Check Container Status

```bash
cd /path/to/deployment
docker-compose -f deploy/docker-compose.prod.yml ps
```

### 1.2 Restart Services

```bash
# Graceful restart (recommended first attempt)
docker-compose -f deploy/docker-compose.prod.yml restart api worker

# Check health after restart
./deploy/startup-health-check.sh https://api.yourdomain.com 60
```

### 1.3 If Restart Fails - Force Recreate

```bash
# Stop all services
docker-compose -f deploy/docker-compose.prod.yml down

# Remove old images (optional - forces fresh pull/build)
docker rmi stateflow-api stateflow-worker 2>/dev/null || true

# Recreate with latest image
docker-compose -f deploy/docker-compose.prod.yml up -d

# Verify health
./deploy/startup-health-check.sh https://api.yourdomain.com 120
```

### 1.4 Emergency Container Reset

```bash
# Nuclear option - destroy and recreate everything
docker-compose -f deploy/docker-compose.prod.yml down -v
docker system prune -f
docker-compose -f deploy/docker-compose.prod.yml up -d --build
```

---

## 2. Application Version Rollback

**Use when:** New deployment introduces bugs or performance issues

### 2.1 Pre-Rollback Checklist

- [ ] Identify last known good version (check git tags or Docker image tags)
- [ ] Verify backup exists: `./deploy/backup-schema.sh full local`
- [ ] Notify team via Slack: "Starting rollback to version X"
- [ ] Enable maintenance mode (if applicable)

### 2.2 Identify Previous Version

```bash
# Check current deployment
docker images stateflow-api --format "table {{.Tag}}\t{{.CreatedAt}}"

# Check git history
git log --oneline --tags | head -10

# Note the last stable version (e.g., v1.2.3)
```

### 2.3 Rollback to Previous Docker Image

```bash
# Option A: Rollback to specific tag (if tagged)
docker-compose -f deploy/docker-compose.prod.yml down
docker-compose -f deploy/docker-compose.prod.yml up -d --no-build
# Update docker-compose to use previous tag

# Option B: Rebuild from previous git commit
git checkout v1.2.3  # or git checkout HEAD~1
docker-compose -f deploy/docker-compose.prod.yml down
docker-compose -f deploy/docker-compose.prod.yml up -d --build

# Verify rollback
./deploy/startup-health-check.sh https://api.yourdomain.com 120
```

### 2.4 Verify Rollback Success

```bash
# Check version endpoint
curl -s https://api.yourdomain.com/api/health | jq '.version'

# Verify critical workflows still execute
curl -X POST https://api.yourdomain.com/api/execute \
  -H "Content-Type: application/json" \
  -d '{"workflowId": "health-check-workflow"}'

# Check error rates are returning to normal
```

### 2.5 Post-Rollback

- [ ] Monitor for 15 minutes
- [ ] Update deployment documentation
- [ ] Schedule hotfix deployment for newer version
- [ ] Notify team: "Rollback to vX.X.X completed successfully"

---

## 3. Database Rollback (Point-in-Time Recovery)

**Use when:** Data corruption, failed migrations, or data loss

**⚠️ WARNING:** This will result in data loss since the last backup!

### 3.1 Immediate Actions

1. **STOP all worker services immediately** to prevent further data changes:

   ```bash
   docker-compose -f deploy/docker-compose.prod.yml stop worker
   ```

2. **Create emergency backup of current state** (even if corrupted):

   ```bash
   ./deploy/backup-schema.sh full local
   mv deploy/backups/stateflow_full_*.sql.gz deploy/backups/emergency-corrupted-backup.sql.gz
   ```

3. **Notify stakeholders** of data rollback and potential loss window

### 3.2 Identify Backup to Restore

```bash
# List available backups
ls -la deploy/backups/stateflow_full_*.sql.gz | tail -5

# Or check S3
aws s3 ls s3://your-backup-bucket/backups/ --recursive | tail -10

# Select the most recent backup BEFORE the incident
```

### 3.3 Restore Database from Backup

```bash
# Download from S3 if needed
aws s3 cp s3://your-backup-bucket/backups/YYYY/MM/DD/stateflow_full_TIMESTAMP.sql.gz \
  deploy/backups/restore-target.sql.gz

# Decompress
gunzip deploy/backups/restore-target.sql.gz

# Connect to Supabase PostgreSQL (using connection string)
# IMPORTANT: This requires direct DB access - get connection string from Supabase dashboard
export PGPASSWORD="your-db-password"

# Restore schema and data
psql "postgresql://postgres:PASSWORD@db.PROJECT_ID.supabase.co:5432/postgres" \
  < deploy/backups/restore-target.sql

# Verify restoration
psql "postgresql://postgres:PASSWORD@db.PROJECT_ID.supabase.co:5432/postgres" \
  -c "SELECT COUNT(*) FROM executions;"
```

### 3.4 Supabase Dashboard Alternative

If direct PostgreSQL access is not available:

1. Log into Supabase Dashboard: https://app.supabase.com
2. Navigate to Database → Backups
3. Select "Restore to a specific date"
4. Choose point-in-time before the incident
5. Confirm restoration (this will recreate the database)
6. Update connection strings in `.env.production` if database URL changes

### 3.5 Verify Data Integrity

```bash
# Check critical tables
psql "$DATABASE_URL" -c "
  SELECT
    (SELECT COUNT(*) FROM executions) as execution_count,
    (SELECT COUNT(*) FROM step_results) as step_count,
    (SELECT COUNT(*) FROM dlq_entries) as dlq_count;
"

# Check for recent data
psql "$DATABASE_URL" -c "
  SELECT MAX(created_at) as latest_execution
  FROM executions;
"
```

### 3.6 Restart Services

```bash
# Start workers again
docker-compose -f deploy/docker-compose.prod.yml start worker

# Full health check
./deploy/startup-health-check.sh https://api.yourdomain.com 180
```

---

## 4. Complete Infrastructure Rollback

**Use when:** Complete system failure, infrastructure issues, or moving to disaster recovery environment

### 4.1 Disaster Recovery Checklist

- [ ] Activate disaster recovery team
- [ ] Switch DNS to failover environment (if applicable)
- [ ] Notify all stakeholders of extended downtime
- [ ] Document all actions in incident log

### 4.2 Fresh Infrastructure Deployment

```bash
# 1. Provision new server/environment
# (Use your infrastructure-as-code: Terraform, CloudFormation, etc.)

# 2. Clone repository
git clone https://github.com/yourorg/stateflow.git /opt/stateflow
cd /opt/stateflow

# 3. Checkout last known good version
git checkout v1.2.3

# 4. Copy production environment
cp /secure/location/.env.production ./deploy/.env.production

# 5. Restore database from backup
./deploy/backup-schema.sh full local
# (Download and restore from S3 backup as shown in Section 3)

# 6. Build and deploy
docker-compose -f deploy/docker-compose.prod.yml up -d --build

# 7. Verify deployment
./deploy/startup-health-check.sh http://new-server-ip:4000 300
```

### 4.3 Update DNS/Load Balancer

```bash
# Update DNS A record to new server
# Or update load balancer target group
# Or update reverse proxy configuration
```

---

## 5. Automated Rollback Script

For rapid response, use this automated rollback script:

```bash
#!/bin/bash
# rollback.sh - Automated rollback procedure

VERSION="${1:-}"
if [ -z "$VERSION" ]; then
    echo "Usage: ./rollback.sh <version_or_commit>"
    echo "Example: ./rollback.sh v1.2.3"
    exit 1
fi

echo "🚨 Initiating rollback to $VERSION"
echo "Creating backup before rollback..."
./deploy/backup-schema.sh full s3

echo "Stopping services..."
docker-compose -f deploy/docker-compose.prod.yml down

echo "Checking out $VERSION..."
git checkout "$VERSION"

echo "Rebuilding and starting..."
docker-compose -f deploy/docker-compose.prod.yml up -d --build

echo "Running health checks..."
if ./deploy/startup-health-check.sh https://api.yourdomain.com 180; then
    echo "✅ Rollback to $VERSION successful"
else
    echo "❌ Rollback failed - manual intervention required"
    exit 1
fi
```

---

## 6. Post-Incident Procedures

### 6.1 Documentation

1. **Create incident report** including:
   - Timeline of events
   - Root cause analysis
   - Actions taken
   - Data loss extent (if any)
   - Lessons learned

2. **Update runbooks** based on findings

3. **Schedule post-mortem** with team

### 6.2 Prevention Measures

1. **Enhance monitoring:**
   - Add more health checks
   - Lower alerting thresholds
   - Create custom dashboards

2. **Improve testing:**
   - Add integration tests for failed scenarios
   - Implement canary deployments
   - Enhance staging environment parity

3. **Backup improvements:**
   - Increase backup frequency
   - Test restore procedures regularly
   - Automate backup verification

---

## Emergency Contacts

| Role             | Contact           | Escalation    |
| ---------------- | ----------------- | ------------- |
| On-Call Engineer | PagerDuty/Slack   | +1 (555) 0100 |
| Database Admin   | Slack @dba-team   | +1 (555) 0101 |
| Infrastructure   | Slack @infra-team | +1 (555) 0102 |
| Product Manager  | Slack @product    | +1 (555) 0103 |

---

## Appendix: Useful Commands

```bash
# Quick status check
docker-compose -f deploy/docker-compose.prod.yml ps
docker-compose -f deploy/docker-compose.prod.yml logs --tail=100 api

# View recent errors
docker-compose -f deploy/docker-compose.prod.yml logs api 2>&1 | grep -i error

# Scale workers down/up
docker-compose -f deploy/docker-compose.prod.yml up -d --scale worker=0
docker-compose -f deploy/docker-compose.prod.yml up -d --scale worker=3

# Force kill stuck containers
docker kill stateflow-api stateflow-worker 2>/dev/null || true

# View resource usage
docker stats stateflow-api stateflow-worker --no-stream

# Export logs for analysis
docker-compose -f deploy/docker-compose.prod.yml logs > incident-$(date +%Y%m%d-%H%M%S).log
```

---

## Version History

| Date       | Version | Author | Changes                     |
| ---------- | ------- | ------ | --------------------------- |
| 2026-01-31 | 1.0     | DevOps | Initial rollback procedures |

---

**Last Updated:** 2026-01-31  
**Review Schedule:** Quarterly  
**Next Review:** 2026-04-30
