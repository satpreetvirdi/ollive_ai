# Kubernetes deployment (no custom domain)

Self-hosted manifests using **Kustomize**. One entry point: **web** Service (nginx serves UI and proxies `/api` → `chat-api`).

## Prerequisites

- Kubernetes cluster (minikube, kind, k3s, kubeadm, Docker Desktop K8s)
- `kubectl` and `docker`
- StorageClass for Postgres PVC (default on most clusters)
- Groq API key (or other provider keys)

## Architecture in the cluster

```text
Browser
   │
   ├─ NodePort :30080  OR  kubectl port-forward svc/web 8080:80
   ▼
web (nginx) ── /api/* ──► chat-api ──► ingestion-api ──► Redis Stream
                              │              ▲
                              │              └── ingestion-worker ──► Postgres
                              └──► Postgres
```

Ingestion API is **not** exposed outside the cluster (ClusterIP only).

## Quick start (minikube or kind)

### 1. Build images

```bash
chmod +x scripts/build-images.sh
./scripts/build-images.sh
```

### 2. Load images into cluster

**minikube:**

```bash
minikube image load olliveai/web:latest
minikube image load olliveai/chat-api:latest
minikube image load olliveai/ingestion-api:latest
```

**kind:**

```bash
kind load docker-image olliveai/web:latest
kind load docker-image olliveai/chat-api:latest
kind load docker-image olliveai/ingestion-api:latest
```

### 3. Create secrets

```bash
cp k8s/overlays/local/secret.example.yaml k8s/overlays/local/secret.yaml
# Edit secret.yaml — set GROQ_API_KEY at minimum
```

### 4. Deploy

```bash
kubectl apply -k k8s/overlays/local
kubectl -n olliveai get pods -w
```

Wait until all pods are `Running` (Postgres first boot ~30s).

### 5. Open the app (no domain)

**Option A — NodePort (local overlay)**

```bash
# minikube
minikube service -n olliveai web --url
# or open http://$(minikube ip):30080

# kind / generic — Node IP + port 30080
kubectl get nodes -o wide
# http://<NODE_IP>:30080
```

**Option B — Port-forward (works everywhere)**

```bash
kubectl -n olliveai port-forward svc/web 8080:80
```

Open **http://localhost:8080**

## Verify

```bash
kubectl -n olliveai get pods
kubectl -n olliveai logs deploy/chat-api --tail=20
kubectl -n olliveai logs deploy/ingestion-worker --tail=20
curl -s http://localhost:8080/api/providers   # if port-forward active
```

Send a chat message, then:

```bash
kubectl -n olliveai exec -it statefulset/postgres -- \
  psql -U ollive -d olliveai -c "SELECT provider, model, status FROM inference_logs ORDER BY created_at DESC LIMIT 5;"
```

## Assignment demo without a domain

1. Record a **Loom** showing:
   - `kubectl get pods -n olliveai`
   - App at `http://localhost:8080` (port-forward)
   - Inference rows in Postgres (command above)
2. Add to README: “Self-hosted Kubernetes — see `docs/KUBERNETES.md`”

## Teardown

```bash
kubectl delete -k k8s/overlays/local
# PVCs remain unless deleted:
kubectl delete pvc -n olliveai -l app=postgres
```

## Files

| Path | Purpose |
|------|---------|
| `k8s/base/` | Core manifests |
| `k8s/overlays/local/` | NodePort 30080 + local secret |
| `apps/web/Dockerfile.k8s` | nginx + `VITE_API_URL=""` |
| `apps/web/nginx.conf` | Proxy `/api` → `chat-api` |
| `scripts/build-images.sh` | Build all app images |

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `ImagePullBackOff` | Run `build-images.sh` + load into cluster |
| `CreateContainerConfigError` | Create `k8s/overlays/local/secret.yaml` |
| Chat 400 provider error | Set `GROQ_API_KEY` in secret |
| Empty inference_logs | Check `ingestion-worker` logs; Redis up? |
| Web calls wrong API | Rebuild `olliveai/web` with `Dockerfile.k8s` |

## Production overlay (later)

Add `k8s/overlays/prod/` with:

- Ingress + TLS (when you have a domain)
- More replicas + resource limits
- External Postgres / Redis
