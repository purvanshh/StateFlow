# Daily Operations Runbook

## Overview

This runbook outlines routine operational procedures to maintain system health, prevent incidents, and ensure operational excellence.

**Frequency:** Daily (automated + manual checks)  
**Owner:** SRE Team  
**Last Updated:** 2024

---

## Daily Check Schedule

### Morning Shift (09:00 - 10:00 UTC)

- [ ] Overnight alert review
- [ ] System health dashboard check
- [ ] Backup verification
- [ ] Capacity review
- [ ] Security log review

### Midday Shift (14:00 - 15:00 UTC)

- [ ] Performance metrics review
- [ ] Error rate analysis
- [ ] Customer-facing metrics
- [ ] Infrastructure health

### Evening Shift (21:00 - 22:00 UTC)

- [ ] Daily summary report
- [ ] Handoff notes for next shift
- [ ] Escalation review
- [ ] Maintenance window prep (if scheduled)

---

## Morning Procedures (09:00 UTC)

### 1. Overnight Alert Review (10 min)

```bash
# Fetch overnight alerts (00:00 - 09:00 UTC)
./scripts/fetch_alerts.sh --start="00:00" --end="09:00" --severity="P2,P3"

# Review alert frequency
cat overnight_alerts.json | jq -r '.[] | "\(.severity): \(.component) - \(.count)"' | sort | uniq -c
```

**Action Required If:**

- > 5 P2 alerts on same component
- Any unacknowledged P1/P2 alerts
- Alert fatigue indicators

### 2. System Health Dashboard (15 min)

Navigate to: [Grafana Daily Dashboard](https://grafana.example.com/d/daily-ops)

**Key Metrics to Verify:**

```bash
# Health score (should be > 95%)
curl -s $METRICS_API/health-score | jq '.score'

# Service availability (24h)
curl -s $METRICS_API/availability?window=24h | jq '.availability_pct'

# Error budget consumption
curl -s $SLO_API/error-budget | jq '.remaining_pct'
```

| Metric              | Healthy Threshold | Warning    | Critical |
| ------------------- | ----------------- | ---------- | -------- |
| System Health Score | > 95%             | 90-95%     | < 90%    |
| API Availability    | > 99.9%           | 99.5-99.9% | < 99.5%  |
| Error Rate          | < 0.1%            | 0.1-1%     | > 1%     |
| P95 Latency         | < 500ms           | 500ms-1s   | > 1s     |

### 3. Backup Verification (10 min)

```bash
# Check backup completion
./scripts/verify_backups.sh --date=$(date +%Y-%m-%d)

# Verify backup integrity (spot check)
./scripts/test_backup_restore.sh --sample --verify-only
```

**Backup Checklist:**

- [ ] Database backups completed
- [ ] File/object storage backups completed
- [ ] Configuration backups completed
- [ ] Backup sizes within expected range
- [ ] Restore test completed (weekly)

**Alert if:**

- Any backup failed
- Backup size < 80% or > 120% of baseline
- Backup duration > 200% of baseline

### 4. Capacity Review (10 min)

```bash
# Resource utilization trends
kubectl top nodes
kubectl top pods --all-namespaces | sort -k3 -n -r | head -20

# Disk space
df -h | grep -E "(Use%|/data|/var)"

# Database size
psql -c "SELECT pg_size_pretty(pg_database_size(current_database()));"

# Connection pools
psql -c "SELECT count(*), state FROM pg_stat_activity GROUP BY state;"
```

**Capacity Thresholds:**

- CPU: Alert at > 70% sustained
- Memory: Alert at > 80% sustained
- Disk: Alert at > 85% usage
- DB connections: Alert at > 80% of max

**Weekly Capacity Actions:**

- Review growth trends
- Plan scaling activities
- Update capacity forecasts

### 5. Security Log Review (15 min)

```bash
# Failed authentication attempts
./scripts/security_review.sh --window=24h --type=auth-failures

# Unusual access patterns
./scripts/security_review.sh --window=24h --type=access-anomalies

# Privilege escalations
./scripts/security_review.sh --window=24h --type=privilege-changes
```

**Escalate if:**

- > 100 failed logins from single IP
- Privilege changes outside change window
- Unusual data access patterns
- New admin accounts created

---

## Midday Procedures (14:00 UTC)

### 1. Performance Metrics (15 min)

**Load Patterns:**

```bash
# Traffic volume vs. baseline
curl -s $METRICS_API/traffic-comparison | jq '.percentage_change'

# Peak load times
./scripts/analyze_load_patterns.sh --date=$(date +%Y-%m-%d)
```

**Latency Trends:**

```bash
# API endpoint latency distribution
curl -s $METRICS_API/latency-distribution | jq '.endpoints[] | {name: .name, p50: .p50, p95: .p95, p99: .p99}'
```

**Cache Performance:**

```bash
# Cache hit ratios
redis-cli INFO stats | grep -E "(keyspace_hits|keyspace_misses)"
# Hit ratio should be > 80%
```

### 2. Error Analysis (15 min)

```bash
# Top error types
kubectl logs --since=24h -l app=api | grep ERROR | cut -d' ' -f5- | sort | uniq -c | sort -rn | head -10

# Error trends
curl -s $METRICS_API/error-trend?window=24h | jq '.'
```

**Review:**

- [ ] New error patterns
- [ ] Recurring errors > 100 occurrences
- [ ] Error spikes correlating with deployments
- [ ] Customer-facing error impact

### 3. Customer Metrics (10 min)

```bash
# Apdex score
curl -s $METRICS_API/apdex | jq '.score'
# Should be > 0.85

# Customer satisfaction (from telemetry)
curl -s $ANALYTICS_API/cs-metrics | jq '.satisfaction_score'

# Support ticket volume
curl -s $SUPPORT_API/ticket-volume?window=24h | jq '.count'
```

### 4. Infrastructure Health (10 min)

```bash
# Node status
kubectl get nodes -o wide

# Pod status
kubectl get pods --all-namespaces | grep -v "Running\|Completed" | wc -l
# Should be 0 or minimal

# Certificate expiry (30-day warning)
./scripts/check_cert_expiry.sh --warning-days=30

# External dependencies
./scripts/check_dependencies.sh
```

---

## Evening Procedures (21:00 UTC)

### 1. Daily Summary Report (15 min)

Generate and review daily operations report:

```bash
./scripts/generate_daily_report.sh --date=$(date +%Y-%m-%d)
```

**Report Contents:**

- System health score
- Incident count and summary
- Performance metrics
- Security events
- Completed maintenance
- Capacity changes

### 2. Handoff Notes (10 min)

Document in `#sre-handoff` channel:

```
**Daily Ops Handoff - $(date +%Y-%m-%d)**

**Health Status:** [Green/Yellow/Red]
**Incidents:** [Count] - [Brief summary]
**Ongoing Issues:** [List]
**Maintenance Scheduled:** [Details]
**Action Items for Next Shift:** [List]
```

### 3. Escalation Review (5 min)

- Review open P2/P3 incidents
- Check SLA compliance
- Verify escalation paths are clear

### 4. Maintenance Prep (if scheduled)

- Verify maintenance window approved
- Prepare rollback procedures
- Notify stakeholders
- Stage changes (if applicable)

---

## Weekly Tasks (Every Monday)

### Deep Health Check (60 min)

```bash
# Full system scan
./scripts/weekly_health_check.sh

# Dependency review
./scripts/dependency_audit.sh

# Security patch review
./scripts/check_security_updates.sh

# Documentation review
./scripts/verify_documentation.sh
```

### Capacity Planning Review

- Review 4-week growth trends
- Update capacity models
- Plan infrastructure scaling
- Review cost optimization opportunities

### Incident Review

- Review all incidents from past week
- Update runbooks based on learnings
- Track action item completion

---

## Monthly Tasks (First Monday)

### Comprehensive Audit

- Full backup restore test
- Disaster recovery walkthrough
- Security audit
- Compliance review
- Cost analysis
- Performance baseline update

### Documentation Updates

- Review and update all runbooks
- Verify contact lists
- Update architecture diagrams
- Refresh dashboard links

---

## Emergency Override Procedures

### If Critical Issue Detected During Checks

1. **Stop routine procedures** immediately
2. **Follow relevant incident runbook:**
   - Data corruption → [S1 Runbook](./incident-severity-1.md)
   - Performance degradation → [S2 Runbook](./incident-severity-2.md)
   - Service outage → [S3 Runbook](./incident-severity-3.md)
3. **Page on-call** if not already engaged
4. **Document** in incident channel

---

## Automation Checklist

### Automated Daily Tasks

- [ ] Alert aggregation and deduplication
- [ ] Health score calculation
- [ ] Backup monitoring
- [ ] Capacity threshold checks
- [ ] Certificate expiry monitoring
- [ ] Security log analysis
- [ ] Daily report generation

### Manual Tasks Required

- [ ] Human review of automated findings
- [ ] Contextual analysis
- [ ] Stakeholder communication
- [ ] Incident decision making
- [ ] Complex troubleshooting

---

## Key Metrics Dashboard

### Daily Operations Scorecard

| Metric               | Target     | Actual | Trend |
| -------------------- | ---------- | ------ | ----- |
| System Uptime        | 99.99%     |        |       |
| Mean Time to Detect  | < 5 min    |        |       |
| Mean Time to Respond | < 15 min   |        |       |
| Backup Success Rate  | 100%       |        |       |
| Security Events      | 0 critical |        |       |
| Ops Tasks Completed  | 100%       |        |       |

---

## Tool Reference

### Essential URLs

- [Main Dashboard](https://grafana.example.com/d/main)
- [Alert Manager](https://alerts.example.com)
- [Incident Tracker](https://incidents.example.com)
- [Runbooks Wiki](https://wiki.example.com/runbooks)
- [On-Call Schedule](https://pagerduty.example.com)

### CLI Tools

```bash
# Quick system status
status              # Overall health
dashboard          # Open main dashboard
alerts             # List active alerts
incidents          # List active incidents

# Information gathering
logs <service>     # Get service logs
metrics <service>  # Get service metrics
events             # Get cluster events
```

---

## Contact Information

### Escalation Path

1. **SRE On-Call** - Primary operations contact
2. **SRE Manager** - Policy and resource decisions
3. **Engineering Manager** - Technical direction
4. **CTO** - Business-critical decisions

### Team Contacts

- SRE Team: `#sre-team` / sre@example.com
- Platform Team: `#platform` / platform@example.com
- Security Team: `#security` / security@example.com

---

## Revision History

| Date       | Version | Changes                  | Author   |
| ---------- | ------- | ------------------------ | -------- |
| 2024-01-31 | 1.0     | Initial runbook creation | SRE Team |

---

**Remember:** When in doubt, escalate. It's better to over-communicate than to let issues escalate unnoticed.
