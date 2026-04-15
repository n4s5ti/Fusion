---
"@gsxdsm/fusion": minor
---

Add `fn daemon` command for secure remote Fusion API access with bearer token authentication

- New `fn daemon` CLI command starts Fusion engine as a daemon with bearer token authentication
- Token auto-generated if none exists, or use `--token` flag to specify
- `--token-only` flag generates/prints token without starting server
- `--port 0` defaults to OS-assigned random port
- `--host 0.0.0.0` binds to all interfaces by default
- Health endpoint `/api/health` remains unauthenticated for liveness probes
- Auth middleware uses constant-time token comparison to prevent timing attacks
