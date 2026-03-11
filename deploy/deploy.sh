#!/bin/bash
# =============================================================================
# KhushFus Deployment Helper
# =============================================================================
# Usage: ./deploy/deploy.sh staging|production [service_name]
# Deploys all services or a specific service to the target environment.
# Includes automated rollback if health checks fail after deployment.
#
# Environment variables:
#   CI_COMMIT_SHA        - Git commit SHA for the image tag (default: latest)
#   DOCKER_IMAGE_PREFIX  - Container registry prefix
#   HEALTH_CHECK_TIMEOUT - Seconds to wait for health (default: 60)
# =============================================================================

set -euo pipefail

ENVIRONMENT="${1:?Usage: $0 staging|production [service_name]}"
SERVICE="${2:-}"
TAG="${CI_COMMIT_SHA:-latest}"
NAMESPACE="khushfus-${ENVIRONMENT}"
REGISTRY="${DOCKER_IMAGE_PREFIX:-registry.gitlab.com/khushfus/khushfus}"
HEALTH_CHECK_TIMEOUT="${HEALTH_CHECK_TIMEOUT:-60}"

SERVICES=(
  gateway
  collector
  analyzer
  query
  report
  notification
  identity
  tenant
  media
  search
  publishing
  rate-limiter
  enrichment
  export
  competitive
  scheduler
  audit
  realtime
  project
  frontend
)

# Map of services that expose HTTP health endpoints (service -> port)
declare -A HEALTH_ENDPOINTS=(
  [gateway]=8000
  [identity]=8010
  [tenant]=8011
  [search]=8012
  [publishing]=8013
  [rate-limiter]=8014
  [export]=8015
  [competitive]=8016
  [scheduler]=8017
  [audit]=8018
  [realtime]=8019
  [project]=8020
  [frontend]=3000
)

if [ -n "$SERVICE" ]; then
  SERVICES=("$SERVICE")
fi

echo "============================================="
echo "Deploying to ${ENVIRONMENT} (namespace: ${NAMESPACE})"
echo "Image tag: ${TAG}"
echo "Registry:  ${REGISTRY}"
echo "Health check timeout: ${HEALTH_CHECK_TIMEOUT}s"
echo "============================================="

# ---------------------------------------------------------------------------
# check_health: Verify a service is healthy after deployment
# ---------------------------------------------------------------------------
check_health() {
  local svc="$1"
  local port="${HEALTH_ENDPOINTS[$svc]:-}"

  # If the service has no HTTP health endpoint, just check rollout status
  if [ -z "$port" ]; then
    echo "  [${svc}] No HTTP health endpoint; relying on rollout status."
    return 0
  fi

  echo "  [${svc}] Checking health endpoint on port ${port}..."

  local pod
  pod=$(kubectl get pods -n "${NAMESPACE}" -l "app=${svc}" -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || true)

  if [ -z "$pod" ]; then
    echo "  [${svc}] WARNING: No pod found for health check."
    return 1
  fi

  local elapsed=0
  while [ "$elapsed" -lt "$HEALTH_CHECK_TIMEOUT" ]; do
    if kubectl exec -n "${NAMESPACE}" "$pod" -- curl -sf "http://localhost:${port}/health" > /dev/null 2>&1; then
      echo "  [${svc}] Health check passed."
      return 0
    fi
    sleep 5
    elapsed=$((elapsed + 5))
    echo "  [${svc}] Waiting for health... (${elapsed}s / ${HEALTH_CHECK_TIMEOUT}s)"
  done

  echo "  [${svc}] Health check FAILED after ${HEALTH_CHECK_TIMEOUT}s."
  return 1
}

# ---------------------------------------------------------------------------
# rollback_service: Undo a failed deployment
# ---------------------------------------------------------------------------
rollback_service() {
  local svc="$1"
  echo "  [${svc}] Rolling back to previous revision..."
  if kubectl rollout undo "deployment/${svc}" -n "${NAMESPACE}"; then
    kubectl rollout status "deployment/${svc}" -n "${NAMESPACE}" --timeout=120s || true
    echo "  [${svc}] Rollback complete."
  else
    echo "  [${svc}] ERROR: Rollback failed. Manual intervention required."
  fi
}

FAILED=0

for svc in "${SERVICES[@]}"; do
  echo ""
  echo "--- Deploying ${svc} ---"
  if kubectl set image "deployment/${svc}" "${svc}=${REGISTRY}/${svc}:${TAG}" -n "${NAMESPACE}"; then
    # Wait for rollout to complete
    if kubectl rollout status "deployment/${svc}" -n "${NAMESPACE}" --timeout=300s; then
      # Verify health after successful rollout
      if ! check_health "$svc"; then
        echo "  [${svc}] Deployment succeeded but health check failed. Initiating rollback."
        rollback_service "$svc"
        FAILED=$((FAILED + 1))
      fi
    else
      echo "  [${svc}] WARNING: Rollout did not complete within timeout. Initiating rollback."
      rollback_service "$svc"
      FAILED=$((FAILED + 1))
    fi
  else
    echo "  [${svc}] WARNING: Failed to update image. Deployment may not exist."
    FAILED=$((FAILED + 1))
  fi
done

echo ""
echo "============================================="
if [ "$FAILED" -gt 0 ]; then
  echo "Deployment completed with ${FAILED} failure(s). Rolled back failing services."
  exit 1
else
  echo "All services deployed and verified successfully."
fi
