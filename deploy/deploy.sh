#!/bin/bash
# =============================================================================
# KhushFus Deployment Helper
# =============================================================================
# Usage: ./deploy/deploy.sh staging|production [service_name]
# Deploys all services or a specific service to the target environment.
#
# Environment variables:
#   CI_COMMIT_SHA        - Git commit SHA for the image tag (default: latest)
#   DOCKER_IMAGE_PREFIX  - Container registry prefix
# =============================================================================

set -euo pipefail

ENVIRONMENT="${1:?Usage: $0 staging|production [service_name]}"
SERVICE="${2:-}"
TAG="${CI_COMMIT_SHA:-latest}"
NAMESPACE="khushfus-${ENVIRONMENT}"
REGISTRY="${DOCKER_IMAGE_PREFIX:-registry.gitlab.com/khushfus/khushfus}"

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

if [ -n "$SERVICE" ]; then
  SERVICES=("$SERVICE")
fi

echo "============================================="
echo "Deploying to ${ENVIRONMENT} (namespace: ${NAMESPACE})"
echo "Image tag: ${TAG}"
echo "Registry:  ${REGISTRY}"
echo "============================================="

FAILED=0

for svc in "${SERVICES[@]}"; do
  echo ""
  echo "--- Deploying ${svc} ---"
  if kubectl set image "deployment/${svc}" "${svc}=${REGISTRY}/${svc}:${TAG}" -n "${NAMESPACE}"; then
    kubectl rollout status "deployment/${svc}" -n "${NAMESPACE}" --timeout=300s || {
      echo "WARNING: Rollout for ${svc} did not complete within timeout."
      FAILED=$((FAILED + 1))
    }
  else
    echo "WARNING: Failed to update image for ${svc}. Deployment may not exist."
    FAILED=$((FAILED + 1))
  fi
done

echo ""
echo "============================================="
if [ "$FAILED" -gt 0 ]; then
  echo "Deployment completed with ${FAILED} warning(s)."
  exit 1
else
  echo "All services deployed successfully."
fi
