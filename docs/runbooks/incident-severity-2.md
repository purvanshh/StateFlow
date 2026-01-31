# Incident Runbook: Severity 2 - Performance Degradation

## Severity Level: HIGH (P2)

**Impact:** Service significantly slower, customer experience degraded  
**Response Time:** 30 minutes (business hours)  
**Resolution Target:** 4 hours  
**DRI (Directly Responsible Individual):** On-Call SRE

---

## Severity Matrix

| Metric         | S2 Threshold              | Example             |
| -------------- | ------------------------- | ------------------- |
| Response Time  | > 95th percentile + 500ms | API latency > 2s    |
| Error Rate     | > 1% but < 5%             | 500 errors spike    |
| Throughput     | < 80% of baseline         | Requests dropping   |
| Resource Usage | > 85% sustained           | CPU/memory pressure |

---

## Detection

### Automated Alerts

- P95/P99 latency thresholds exceeded
- Error rate spike (1-5% range)
- Resource utilization alerts
- Queue depth warnings
- Apdex score drop

### Manual Detection

- Customer complaints about slowness
- Dashboard anomalies
- Load testing failures

---

## Immediate Response (0-30 minutes)

### 1. Verify Alert

```bash
# Check current system state
kubectl top nodes
kubectl top pods -l app=api

# Review recent metrics
curl -s $METRICS_API/latency?window=5m | jq '.p95, .p99'
curl -s $METRICS_API/errors?window=5m | jq '.rate'
```

### 2. Page On-Call (if sustained > 10 min)

```bash
/escalate severity=2 component=performance
```

### 3. Establish Monitoring

- Open dashboards: [Grafana URL]
- Create incident channel: `#incident-sev2-{YYYYMMDD}`
- Start incident timer

---

## Investigation (30-60 minutes)

### Phase 1: Identify Component

```bash
# Check service health
for service in api db cache queue; do
  echo "=== $service ==="
  kubectl get pods -l app=$service -o wide
  kubectl describe service $service | grep -A5 Endpoints
done

# Review error patterns
kubectl logs -l app=api --since=10m | grep ERROR | sort | uniq -c | sort -rn | head -20
```

### Phase 2: Analyze Resource Bottlenecks

```bash
# Database performance
psql -c "SELECT pid, state, query_start, query
         FROM pg_stat_activity
         WHERE state = 'active'
         ORDER BY query_start
         LIMIT 20;"

# Check slow queries
psql -c "SELECT query, mean_exec_time, calls
         FROM pg_stat_statements
         ORDER BY mean_exec_time DESC
         LIMIT 10;"

# Cache hit ratio
redis-cli INFO stats | grep hit

# Queue depth
kubectl exec -it queue-pod -- rabbitmqctl list_queues | grep -v "0$"
```

### Phase 3: Correlation Analysis

Common performance degradation patterns:

| Pattern           | Likely Cause        | Quick Check             |
| ----------------- | ------------------- | ----------------------- |
| Gradual increase  | Resource exhaustion | `htop`, `df -h`         |
| Sudden spike      | Traffic surge       | Check CDN/WAF logs      |
| Periodic drops    | Background job      | Cron schedule           |
| Specific endpoint | Bad query/deploy    | Git diff recent changes |

---

## Mitigation Procedures

### Traffic Management

```bash
# Enable circuit breaker if available
kubectl patch configmap app-config --patch '{"data":{"CIRCUIT_BREAKER_ENABLED":"true"}}'

# Rate limiting (emergency)
kubectl apply -f - <<EOF
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: emergency-rate-limit
spec:
  podSelector:
    matchLabels:
      app: api
  policyTypes:
  - Ingress
  ingress:
  - from: []
    ports:
    - protocol: TCP
      port: 80
EOF

# Enable caching layers
curl -X POST $CACHE_API/purge-and-warm
```

### Resource Scaling

```bash
# Horizontal scaling (if CPU bound)
kubectl scale deployment api --replicas=20

# Vertical scaling (if memory bound)
kubectl patch deployment api -p '{"spec":{"template":{"spec":{"containers":[{"name":"api","resources":{"limits":{"memory":"4Gi"}}}]}}}}'

# Database connection scaling
kubectl patch configmap db-config --patch '{"data":{"MAX_CONNECTIONS":"200"}}'
```

### Query Optimization

```sql
-- Kill long-running queries (if necessary)
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE state = 'active'
  AND query_start < NOW() - INTERVAL '5 minutes';

-- Add emergency index (use with caution)
CREATE INDEX CONCURRENTLY idx_emergency_search
ON large_table (search_column)
WHERE created_at > '2024-01-01';
```

### Code/Config Rollback

```bash
# Identify recent deployments
kubectl rollout history deployment/api

# Rollback to last known good
kubectl rollout undo deployment/api --to-revision=42

# Or redeploy stable version
kubectl apply -f releases/stable/api-deployment.yaml
```

---

## Rollback Steps

### If Mitigation Worsens Performance

```bash
# 1. Revert all emergency changes
kubectl rollout undo deployment/api
kubectl delete networkpolicy emergency-rate-limit
kubectl patch configmap app-config --patch '{"data":{"CIRCUIT_BREAKER_ENABLED":"false"}}'

# 2. Scale back to baseline
kubectl scale deployment api --replicas=10

# 3. Document rollback reason
# 4. Escalate to senior SRE
```

### Rollback Decision Tree

```
Performance degraded after change?
├─ YES: Was it a deployment?
│  ├─ YES: Rollback deployment immediately
│  └─ NO: Was it config change?
│     ├─ YES: Revert config, redeploy
│     └─ NO: Check infrastructure changes
├─ NO: Is issue worsening?
│  ├─ YES: Engage senior SRE + consider failover
│  └─ NO: Continue monitoring, document
```

---

## Recovery Verification

### Success Criteria

```bash
# Check all metrics return to normal
./scripts/verify_performance.sh \
  --latency-threshold=500ms \
  --error-rate-threshold=0.1% \
  --duration=10m

# Verify customer experience
curl -w "@curl-format.txt" -o /dev/null -s $API_ENDPOINT/health
```

### Metrics to Monitor

- [ ] P50 latency < 200ms
- [ ] P95 latency < 500ms
- [ ] P99 latency < 1000ms
- [ ] Error rate < 0.1%
- [ ] CPU usage < 70%
- [ ] Memory usage < 80%

---

## Communication Plan

### Internal (Every 60 min)

```
S2 INCIDENT UPDATE - Performance Degradation
Status: [INVESTIGATING/MITIGATING/MONITORING/RESOLVED]
Impact: [Latency Xms, Error rate Y%]
Action: [Current remediation]
ETA: [Expected resolution]
Customers affected: [Number/Percentage]
```

### External (if > 30 min or > 10% customers)

```
We are currently experiencing slower than normal response times.
Our team is actively working to resolve this.
Expected resolution: [TIME/ETA]
Thank you for your patience.
```

---

## Post-Incident Review Template

### Summary

- **Incident ID:** INC-YYYY-MM-DD-###
- **Duration:**
- **Severity:** S2
- **Component:**
- **DRI:**

### Performance Impact

- Peak latency:
- Baseline vs. Degraded:
- Duration of degradation:
- Customers affected:
- Revenue impact (if any):

### Root Cause

**Primary:**
**Contributing Factors:**

### Detection & Response

- Time to detect:
- Time to respond:
- Time to mitigate:
- Time to resolve:

### Resolution Steps

1.
2.
3.

### Action Items

| ID  | Action | Owner | Due | Priority |
| --- | ------ | ----- | --- | -------- |
|     |        |       |     |          |

### Prevention

- Monitoring improvements:
- Alert tuning:
- Capacity planning:
- Code review process:

---

## Quick Reference

### Emergency Commands

```bash
# Quick health check
curl $API/health | jq

# View top errors
kubectl logs --since=5m | grep ERROR | tail -50

# Scale quickly
kubectl scale deployment api --replicas=20

# Restart with care
kubectl rollout restart deployment/api
```

### Key Dashboards

- [Service Overview](https://grafana.example.com/d/service)
- [Database Performance](https://grafana.example.com/d/database)
- [Infrastructure](https://grafana.example.com/d/infra)

### Escalation Path

1. On-Call SRE (30 min response)
2. Senior SRE (immediate if SLO breach)
3. Engineering Manager (if > 2 hours)
4. CTO (if customer-facing > 4 hours)
