import {
  RESERVED_SYNC_PASSPHRASE_KEY,
  SecretsSyncError,
  type SecretsSyncRecord,
  getSyncPassphrase,
  unwrapSecretsBundle,
  wrapSecretsBundle,
} from "@fusion/core";
import { ApiError, badRequest } from "../api-error.js";
import type { ApiRouteRegistrar } from "./types.js";

function emitSecretsAudit(
  req: { runAuditor?: { filesystem?: (input: { type: string; target: string; metadata?: Record<string, unknown> }) => void } },
  ctx: Parameters<ApiRouteRegistrar>[0],
  type: "secret:sync-pull",
  target: string,
  metadata: Record<string, unknown>,
): void {
  if (req.runAuditor?.filesystem) {
    req.runAuditor.filesystem({ type, target, metadata });
    return;
  }
  ctx.runtimeLogger.child("secrets-sync").info("Secrets sync audit event", { type, target, ...metadata });
}

async function upsertRecords(
  store: Parameters<ApiRouteRegistrar>[0]["store"],
  records: SecretsSyncRecord[],
): Promise<{ appliedCount: number; skippedCount: number; appliedKeys: Array<{ key: string; scope: "project" | "global" }> }> {
  const secretsStore = await store.getSecretsStore();
  let appliedCount = 0;
  let skippedCount = 0;
  const appliedKeys: Array<{ key: string; scope: "project" | "global" }> = [];

  for (const record of records) {
    if (record.key === RESERVED_SYNC_PASSPHRASE_KEY) {
      skippedCount += 1;
      continue;
    }
    const existing = secretsStore.listSecrets(record.scope).find((secret) => secret.key === record.key);
    if (existing) {
      await secretsStore.updateSecret(existing.id, record.scope, {
        plaintextValue: record.value,
        description: record.description,
        accessPolicy: record.accessPolicy,
        envExportable: record.envExportable,
        envExportKey: record.envExportKey,
      });
    } else {
      await secretsStore.createSecret({
        scope: record.scope,
        key: record.key,
        plaintextValue: record.value,
        description: record.description,
        accessPolicy: record.accessPolicy,
        envExportable: record.envExportable,
        envExportKey: record.envExportKey,
      });
    }
    appliedCount += 1;
    appliedKeys.push({ key: record.key, scope: record.scope });
  }

  return { appliedCount, skippedCount, appliedKeys };
}

async function listSyncRecords(store: Parameters<ApiRouteRegistrar>[0]["store"]): Promise<SecretsSyncRecord[]> {
  const secretsStore = await store.getSecretsStore();
  const records = [] as SecretsSyncRecord[];
  for (const record of secretsStore.listSecrets()) {
    if (record.key === RESERVED_SYNC_PASSPHRASE_KEY) {
      continue;
    }
    const revealed = await secretsStore.revealSecret(record.id, record.scope, { agentId: null, userId: null });
    records.push({
      key: record.key,
      value: revealed.plaintextValue,
      scope: record.scope,
      description: record.description,
      accessPolicy: record.accessPolicy,
      envExportable: record.envExportable,
      envExportKey: record.envExportKey,
    });
  }
  return records;
}

export const registerSecretsSyncInboundRoutes: ApiRouteRegistrar = (ctx) => {
  const { router, store, rethrowAsApiError } = ctx;

  router.post("/secrets/sync-receive", async (req, res) => {
    try {
      const { CentralCore } = await import("@fusion/core");
      const central = new CentralCore(store.getFusionDir());
      await central.init();

      // Validate auth
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        await central.close();
        throw new ApiError(401, "Missing or invalid Authorization header");
      }

      const token = authHeader.slice(7);
      const nodes = await central.listNodes();
      const localNode = nodes.find((n: import("@fusion/core").NodeConfig) => n.type === "local");
      if (!localNode) {
        await central.close();
        throw new ApiError(401, "Local node not configured");
      }
      if (token.length === 0) {
        await central.close();
        throw new ApiError(401, "Missing or invalid Authorization header");
      }
      if (!localNode.apiKey) {
        await central.close();
        throw new ApiError(401, "Invalid apiKey");
      }
      if (localNode.apiKey !== token) {
        await central.close();
        throw new ApiError(401, "Invalid apiKey");
      }

      const body = req.body;
      if (!body?.sourceNodeId) {
        await central.close();
        throw badRequest("Missing required field: sourceNodeId");
      }
      if (!body?.exportedAt) {
        await central.close();
        throw badRequest("Missing required field: exportedAt");
      }
      if (body?.version === undefined) {
        await central.close();
        throw badRequest("Missing required field: version");
      }
      if (!body?.ciphertext) {
        await central.close();
        throw badRequest("Missing required field: ciphertext");
      }
      if (!body?.salt) {
        await central.close();
        throw badRequest("Missing required field: salt");
      }
      if (!body?.nonce) {
        await central.close();
        throw badRequest("Missing required field: nonce");
      }
      if (!body?.kdf) {
        await central.close();
        throw badRequest("Missing required field: kdf");
      }
      if (!body?.kdfParams) {
        await central.close();
        throw badRequest("Missing required field: kdfParams");
      }
      if (body.version !== 1) {
        await central.close();
        res.status(400).json({ error: "version-mismatch" });
        return;
      }

      const secretsStore = await store.getSecretsStore();
      const passphrase = await getSyncPassphrase(secretsStore);
      if (passphrase === null) {
        await central.close();
        res.status(400).json({ error: "passphrase-not-configured" });
        return;
      }

      let records: SecretsSyncRecord[];
      try {
        records = await unwrapSecretsBundle(body, passphrase);
      } catch (error) {
        await central.close();
        if (error instanceof SecretsSyncError) {
          res.status(400).json({ error: error.code });
          return;
        }
        throw error;
      }

      const { appliedCount, skippedCount, appliedKeys } = await upsertRecords(store, records);
      for (const keyInfo of appliedKeys) {
        emitSecretsAudit(req, ctx, "secret:sync-pull", body.sourceNodeId, {
          nodeId: body.sourceNodeId,
          key: keyInfo.key,
          scope: keyInfo.scope,
        });
      }

      await central.close();
      res.json({ success: true, appliedCount, skippedCount });
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        throw err;
      }
      rethrowAsApiError(err);
    }
  });

  router.get("/secrets/sync-export", async (req, res) => {
    try {
      const { CentralCore } = await import("@fusion/core");
      const central = new CentralCore(store.getFusionDir());
      await central.init();

      // Validate auth
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        await central.close();
        throw new ApiError(401, "Missing or invalid Authorization header");
      }

      const token = authHeader.slice(7);
      const nodes = await central.listNodes();
      const localNode = nodes.find((n: import("@fusion/core").NodeConfig) => n.type === "local");
      if (!localNode) {
        await central.close();
        throw new ApiError(401, "Local node not configured");
      }
      if (token.length === 0) {
        await central.close();
        throw new ApiError(401, "Missing or invalid Authorization header");
      }
      if (!localNode.apiKey) {
        await central.close();
        throw new ApiError(401, "Invalid apiKey");
      }
      if (localNode.apiKey !== token) {
        await central.close();
        throw new ApiError(401, "Invalid apiKey");
      }

      const secretsStore = await store.getSecretsStore();
      const passphrase = await getSyncPassphrase(secretsStore);
      if (passphrase === null) {
        await central.close();
        res.status(400).json({ error: "passphrase-not-configured" });
        return;
      }

      const records = await listSyncRecords(store);
      const envelope = await wrapSecretsBundle(records, passphrase);
      const localPeerInfo = await central.getLocalPeerInfo();
      await central.close();
      res.json({ ...envelope, sourceNodeId: localPeerInfo.nodeId, exportedAt: new Date().toISOString() });
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        throw err;
      }
      rethrowAsApiError(err);
    }
  });
};
