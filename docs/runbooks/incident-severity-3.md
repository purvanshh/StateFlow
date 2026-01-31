# Incident Runbook: Severity 3 - Service Outage

## Severity Level: MEDIUM-HIGH (P3)

**Impact:** Complete service unavailability for subset of customers  
**Response Time:** 1 hour (business hours) / 2 hours (after-hours)  
**Resolution Target:** 8 hours  
**DRI (Directly Responsible Individual):** On-Call Engineer

---

## Severity Classification

### P3-Critical (P3-C)

- Core service completely down
- > 25% of customers affected
- Payment/checkout flows broken
- Data ingestion stopped

### P3-Major (P3-M)

- Significant feature unavailable
- 10-25% of customers affected
- Workaround available
- Degraded but functional

### P3-Minor (P3-m)

- Non-critical service down
- < 10% customers affected
- Workaround exists
- Limited functionality impact

---

## Detection Methods

### Automated Detection

- Health check failures
- Zero traffic alerts
- DNS resolution failures
- SSL certificate errors
- Load balancer 5xx spikes

### Customer Reports

- Support ticket volume spike
- Social media monitoring
- Status page subscriptions

### External Monitoring

- Uptime checker services
- CDN edge status
- Third-party health checks

---

## Immediate Response (0-60 minutes)

### Step 1: Verify Outage (5 min)

```bash
# Multi-region health check
for region in us-east-1 us-west-2 eu-west-1; do
  echo "=== $region ==="
  curl -s -o /dev/null -w "%{http_code}" \
    https://api-$region.example.com/health
done

# DNS propagation check
dig +short api.example.com
dig +short @8.8.8.8 api.example.com

# SSL verification
curl -vI https://api.example.com 2>&1 | grep -E "(SSL|TLS|error)"
```

### Step 2: Scope Assessment (10 min)

```bash
# Check global traffic
./scripts/traffic_analysis.sh --last-hour

# Identify affected endpoints
kubectl logs -l app=api --since=15m | grep -E "(500|502|503|504)" | cut -d' ' -f6 | sort | uniq -c

# Customer impact query
curl -s $ANALYTICS_API/outage-impact?service=api | jq '.affected_customers'
```

### Step 3: Escalation Decision

**Page On-Call if:**

- [ ] Service completely down > 15 minutes
- [ ] > 10% customer impact
- [ ] Revenue-impacting functionality
- [ ] No immediate workaround

```bash
/escalate severity=3 component=$SERVICE
```

---

## Investigation Procedures

### Layer 1: Infrastructure (15 min)

```bash
# Cloud provider status
curl https://status.cloudprovider.com/api/v2/status.json | jq '.status.indicator'

# Kubernetes cluster health
kubectl get nodes -o wide
kubectl describe nodes | grep -A5 Conditions

# Pod status
kubectl get pods --all-namespaces | grep -v Running | grep -v Completed

# Events
kubectl get events --sort-by='.lastTimestamp' | tail -20
```

### Layer 2: Networking (15 min)

```bash
# Service endpoints
kubectl get endpoints $SERVICE
kubectl describe service $SERVICE

# Ingress/controller
kubectl get ingress
kubectl logs -l app=ingress-nginx --tail=100 | grep error

# Network policies
kubectl get networkpolicies
```

### Layer 3: Application (15 min)

```bash
# Recent deployments
kubectl rollout history deployment/$SERVICE

# Application logs
kubectl logs -l app=$SERVICE --tail=500 | grep -E "(ERROR|FATAL|EXCEPTION)"

# Resource consumption
kubectl top pods -l app=$SERVICE

# Configuration
kubectl get configmap $SERVICE-config -o yaml
```

### Layer 4: Dependencies (15 min)

```bash
# Database connectivity
kubectl exec -it $SERVICE-pod -- nc -zv db-host 5432

# Cache availability
redis-cli -h cache-host PING

# External services
curl -s https://third-party-api.com/health
```

---

## Recovery Procedures

### Scenario A: Deployment Issue

```bash
# Check recent changes
git log --oneline -10

# Rollback to stable
kubectl rollout undo deployment/$SERVICE
# OR
kubectl rollout undo deployment/$SERVICE --to-revision=$STABLE_REVISION

# Verify rollback
kubectl rollout status deployment/$SERVICE --timeout=120s
```

### Scenario B: Resource Exhaustion

```bash
# Scale horizontally
kubectl scale deployment $SERVICE --replicas=15

# Or vertically (if needed)
kubectl patch deployment $SERVICE -p '{"spec":{"template":{"spec":{"containers":[{"name":"$SERVICE","resources":{"limits":{"cpu":"2000m","memory":"4Gi"}}}]}}}}'

# Check resource quotas
kubectl describe resourcequota
```

### Scenario C: Database Issue

```bash
# Check connection pool
psql -c "SELECT count(*), state FROM pg_stat_activity GROUP BY state;"

# Restart stuck connections (if safe)
psql -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE state = 'idle in transaction' AND state_change < NOW() - INTERVAL '10 minutes';"

# Check replication lag
psql -c "SELECT extract(epoch from now() - pg_last_xact_replay_timestamp()) AS lag_seconds;"
```

### Scenario D: Certificate/SSL Issue

```bash
# Check certificate expiry
openssl s_client -connect api.example.com:443 -servername api.example.com 2>/dev/null | openssl x509 -noout -dates

# Renew if needed (emergency)
kubectl cert-manager renew $CERTIFICATE_NAME

# Or manually apply emergency cert
kubectl create secret tls emergency-tls --cert=emergency.crt --key=emergency.key
kubectl patch ingress $SERVICE-ingress -p '{"spec":{"tls":[{"secretName":"emergency-tls"}]}}'
```

### Scenario E: DNS/Traffic Routing

```bash
# Check DNS records
dig api.example.com +trace

# Verify load balancer
kubectl get service $SERVICE -o jsonpath='{.status.loadBalancer.ingress[0].hostname}'

# Failover to secondary (if available)
kubectl patch service $SERVICE -p '{"spec":{"selector":{"version":"stable-fallback"}}}'
```

---

## Failover Procedures

### Activate DR Site

```bash
# 1. Update DNS to point to DR
aws route53 change-resource-record-sets \
  --hosted-zone-id $ZONE_ID \
  --change-batch file://dr-failover.json

# 2. Promote DR database
curl -X POST $DR_API/promote-replica

# 3. Enable DR services
kubectl --context=dr apply -f production-services/

# 4. Verify traffic flow
curl -s https://api-dr.example.com/health
```

### DR Activation Checklist

- [ ] DNS TTL set to 60 seconds (if not already)
- [ ] Database replication confirmed
- [ ] DR environment capacity verified
- [ ] SSL certificates valid in DR
- [ ] Monitoring active in DR region
- [ ] Customer communication sent

---

## Rollback Procedures

### If Recovery Attempts Fail

```bash
# 1. Document all attempted fixes
# 2. Capture current state for forensics
collect-debug-info.sh --service=$SERVICE --output=/debug/$(date +%Y%m%d-%H%M%S)

# 3. Engage platform team for deep dive
# 4. Consider DR activation if prolonged
```

### Safe Rollback Rules

1. Never rollback database migrations without DBA approval
2. Always backup current state before major changes
3. Test rollback procedure in staging first (if time permits)
4. Communicate before and after rollback
5. Monitor closely for 30 minutes post-rollback

---

## Communication Templates

### Internal Status Updates

```
S3 INCIDENT UPDATE - Service Outage
Service: [SERVICE NAME]
Status: [IDENTIFIED/INVESTIGATING/MITIGATING/RESOLVED]
Scope: [X% of customers / specific regions]
Impact: [Functional impact]
Action: [Current step]
ETA: [Resolution estimate]
Next update: [+30 min or at resolution]
```

### Customer Status Page

```
**Investigating** - We are currently investigating an issue with [SERVICE].
Some customers may experience [SYMPTOMS]. We will provide updates every 30 minutes.

**Update 1** - [TIME] We have identified the cause and are working on a fix.

**Resolved** - [TIME] Service is fully restored. We are monitoring closely.
```

---

## Post-Incident Review

### Incident Details

- **ID:** INC-YYYY-MM-DD-###
- **Service:**
- **Duration:**
- **Severity:** P3-[C/M/m]
- **Root Cause Category:** [Infrastructure/Code/Config/External/Unknown]

### Impact Metrics

- Customers affected:
- Regions impacted:
- Revenue impact: $
- Support tickets generated:

### Timeline

| UTC Time | Event                      | Action Taken |
| -------- | -------------------------- | ------------ |
|          | Detection                  |              |
|          | Alert acknowledged         |              |
|          | Investigation started      |              |
|          | Root cause identified      |              |
|          | Fix applied                |              |
|          | Service restored           |              |
|          | Monitoring period complete |              |

### Technical Analysis

**What failed:**
**Why it failed:**
**How we fixed it:**

### Process Analysis

**Detection:**
**Response:**
**Communication:**
**Escalation:**

### Corrective Actions

| ID  | Description | Owner | Due Date | Priority |
| --- | ----------- | ----- | -------- | -------- |
|     |             |       |          |          |

### Prevention Strategies

- [ ] Improved monitoring coverage
- [ ] Better alerting thresholds
- [ ] Automated recovery procedures
- [ ] Chaos engineering tests
- [ ] Documentation updates

---

## Appendix

### Quick Command Reference

```bash
# Service health
curl $API/health/ready
curl $API/health/live

# Quick restart (use sparingly)
kubectl rollout restart deployment/$SERVICE

# View all resources
kubectl get all -l app=$SERVICE

# Check logs across pods
kubectl logs -l app=$SERVICE --all-containers --tail=1000

# Port-forward for debugging
kubectl port-forward svc/$SERVICE 8080:80
```

### Escalation Contacts

- P3-C: Immediate SRE team page
- P3-M: On-call engineer (1 hour response)
- P3-m: Next business day queue

### Related Documentation

- Architecture diagrams: [Link]
- Dependency map: [Link]
- DR procedures: [Link]
- Previous incidents: [Link]
