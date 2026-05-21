# Shareable demo link (no domain)

Your app is on **NodePort 30080** (`http://localhost:30080`). Use a tunnel to get a public HTTPS URL for the assignment.

## Prerequisites

- Kubernetes running, all pods `Running`
- App works locally: http://localhost:30080

## Option 1 — Cloudflare Tunnel (free, no account for quick try)

```bash
# Install: brew install cloudflared
cloudflared tunnel --url http://localhost:30080
```

Copy the `https://*.trycloudflare.com` URL from the terminal. Share that link.

## Option 2 — ngrok (free tier)

```bash
# Install: brew install ngrok
# One-time: ngrok config add-authtoken <token>  from https://dashboard.ngrok.com
ngrok http 30080
```

Use the **Forwarding** URL, e.g. `https://abc123.ngrok-free.app`.

## Option 3 — localtunnel

```bash
npx localtunnel --port 30080
```

Uses a random `https://*.loca.lt` URL (may show a reminder page on first visit).

---

## Verify before sharing

1. Open the tunnel URL in an **incognito** window.
2. **New chat** → send a message → reply streams.
3. **Dashboard** tab loads metrics.

## Assignment email snippet

> Demo (live): https://your-tunnel-url.trycloudflare.com  
> Repo: https://github.com/you/olliveai  
> Architecture: see docs/ARCHITECTURE.md  
> Stack: Docker Desktop Kubernetes, no custom domain.

## Notes

- Tunnel must stay running while reviewers test (keep the terminal open).
- Free URLs change each time you restart the tunnel.
- Do not commit API keys; K8s secret stays local.

## If API calls fail through tunnel

Use port-forward + tunnel (same origin still works):

```bash
kubectl -n olliveai port-forward svc/web 8080:80
cloudflared tunnel --url http://localhost:8080
```
