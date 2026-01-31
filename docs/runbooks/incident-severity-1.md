# Incident Runbook: Severity 1 - Data Corruption

## Severity Level: CRITICAL (P1)

**Impact:** Customer data integrity compromised  
**Response Time:** 15 minutes (24/7 on-call)  
**Resolution Target:** 4 hours  
**DRI (Directly Responsible Individual):** On-Call Engineering Lead

---

## Detection

### Automated Alerts

- Data integrity check failures
- Checksum mismatches in critical tables
- Anomaly detection in transaction logs
- Customer-reported data inconsistencies

### Manual Detection

- Customer support escalations
- Data team anomaly reports
- Audit log discrepancies

---

## Immediate Response (0-15 minutes)

### 1. Page the On-Call Team

```bash
# Trigger P1 incident page
/escalate severity=1 component=data-integrity
```

### 2. Establish War Room

- Create Slack channel: `#incident-sev1-{YYYYMMDD}`
- Bridge call: [Bridge URL]
- Document timeline in incident tracking system

### 3. Assess Scope

Execute data corruption assessment:

```sql
-- Identify corrupted records
SELECT table_name, COUNT(*) as corrupted_records
FROM data_integrity_log
WHERE status = 'FAILED'
  AND detected_at >= NOW() - INTERVAL '1 hour';
```

**Critical Questions:**

- [ ] How many records affected?
- [ ] Which customer segments impacted?
- [ ] When did corruption begin?
- [ ] Is corruption ongoing?

---

## Containment (15-30 minutes)

### 1. Stop the Bleeding

If corruption is ongoing:

```bash
# Enable read-only mode on affected services
kubectl patch service api-service -p '{"spec":{"paused":true}}'

# Disable write operations
redis-cli SET system:write_mode READONLY
```

### 2. Preserve Evidence

```bash
# Snapshot current state
pg_dump --data-only --format=custom affected_db > /backups/evidence/corruption-$(date +%Y%m%d-%H%M%S).dump

# Copy transaction logs
cp /var/log/postgresql/*.log /evidence/logs/

# Save application logs
kubectl logs -l app=api-service --since=24h > /evidence/app-logs.txt
```

### 3. Notify Stakeholders

| Role             | Channel          | Message                                                  |
| ---------------- | ---------------- | -------------------------------------------------------- |
| CTO              | Direct SMS       | "S1 Data corruption incident declared. War room: [link]" |
| Customer Success | Slack #incidents | Summary + customer impact                                |
| Legal (if PII)   | Direct call      | Immediate notification                                   |

---

## Recovery Procedures (30+ minutes)

### Option A: Point-in-Time Recovery (Recommended)

```bash
# 1. Identify last known good backup
ls -lt /backups/snapshots/ | head -20

# 2. Restore to point before corruption
pg_restore --clean --if-exists \
  --dbname=affected_db \
  /backups/snapshots/db-snapshot-20240131-080000.dump

# 3. Replay valid transactions from WAL
pg_waldump /var/lib/postgresql/wal/ | grep -A5 -B5 "VALID_TX"
```

### Option B: Record-Level Repair

```sql
-- For isolated corruption
BEGIN;
  -- Isolate affected records
  CREATE TEMP TABLE corrupted_records AS
  SELECT * FROM affected_table WHERE checksum_status = 'INVALID';

  -- Restore from replica
  INSERT INTO affected_table
  SELECT * FROM replica.affected_table r
  WHERE r.id IN (SELECT id FROM corrupted_records)
  ON CONFLICT (id) DO UPDATE SET ...;
COMMIT;
```

### Validation

```sql
-- Verify data integrity
SELECT
  table_name,
  COUNT(*) as total_records,
  COUNT(CASE WHEN checksum_valid THEN 1 END) as valid_records
FROM data_summary
GROUP BY table_name;

-- Run full reconciliation
./scripts/validate_data_integrity.sh --full-check
```

---

## Rollback Procedures

### If Recovery Fails

```bash
# 1. Document failure reasons
# 2. Engage DBA team for manual intervention
# 3. Consider failover to DR site

# Emergency failover
curl -X POST https://dr-api.example.com/failover \
  -H "Authorization: Bearer $EMERGENCY_TOKEN" \
  -d '{"reason": "data_corruption_recovery_failed"}'
```

### Data Rollback Checklist

- [ ] All writes stopped
- [ ] Backups verified and accessible
- [ ] Recovery environment prepared
- [ ] Data validation scripts ready
- [ ] Rollback plan documented and approved
- [ ] Customer communication prepared

---

## Communication Templates

### Internal Updates (Every 30 min)

```
S1 INCIDENT UPDATE - Data Corruption
Time: [TIMESTAMP]
Status: [INVESTIGATING/CONTAINED/RECOVERING/RESOLVED]
Impact: [X customers, Y records]
Action: [Current step]
ETA: [Estimated resolution]
Next update: [+30 min]
```

### Customer Communication

```
We are investigating an issue affecting data in [SERVICE].
We have identified that [BRIEF DESCRIPTION].
We are working to restore data from [TIME] backups.
No action required from your end.
Updates: [STATUS PAGE URL]
```

---

## Post-Incident Review Template

### Incident Summary

- **Incident ID:** INC-YYYY-MM-DD-###
- **Date/Time Started:**
- **Date/Time Resolved:**
- **Duration:**
- **Severity:** S1
- **DRI:**

### Impact Assessment

- Customers affected:
- Records corrupted:
- Data loss (if any):
- Financial impact:
- Reputational impact:

### Timeline

| Time (UTC) | Event                | Actor       |
| ---------- | -------------------- | ----------- |
| 00:00      | Alert triggered      | System      |
| 00:15      | War room established | On-call     |
| 00:30      | Corruption contained | Engineering |
| 01:00      | Recovery initiated   | DBA         |
| 03:45      | Service restored     | Engineering |

### Root Cause Analysis

**5 Whys:**

1. Why did data corruption occur?
2. Why wasn't it detected earlier?
3. Why did the process cause corruption?
4. Why wasn't the process safeguarded?
5. Why wasn't the safeguard in place?

### Lessons Learned

- What went well:
- What went wrong:
- Where we got lucky:

### Action Items

| ID  | Action | Owner | Due Date | Priority |
| --- | ------ | ----- | -------- | -------- |
| 1   |        |       |          |          |

### Preventive Measures

- [ ] Enhanced data validation
- [ ] Improved monitoring
- [ ] Process hardening
- [ ] Backup verification automation

---

## Appendix

### Emergency Contacts

- DBA On-Call: [PAGER]
- Engineering Manager: [PHONE]
- CTO: [PHONE]
- Legal (PII issues): [PHONE]

### Tools & Resources

- Incident Tracking: [URL]
- Status Page: [URL]
- Data Dashboard: [URL]
- Backup Storage: [PATH]
- Log Aggregation: [URL]

### Related Runbooks

- [Severity 2 - Performance Degradation](./incident-severity-2.md)
- [Severity 3 - Service Outage](./incident-severity-3.md)
