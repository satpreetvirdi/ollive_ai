#!/usr/bin/env bash
# Build images for local Kubernetes (minikube/kind/k3s).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "Building olliveai/ingestion-api:latest ..."
docker build -t olliveai/ingestion-api:latest ./apps/ingestion-api

echo "Building olliveai/chat-api:latest ..."
docker build -f apps/chat-api/Dockerfile -t olliveai/chat-api:latest .

echo "Building olliveai/web:latest (K8s nginx + /api proxy) ..."
docker build -f apps/web/Dockerfile.k8s -t olliveai/web:latest .

echo "Done. Images:"
docker images | grep olliveai || true
