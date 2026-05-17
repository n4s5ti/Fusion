import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestProject } from "./test-project.js";
import { CentralCore } from "../central-core.js";
import { MasterKeyManager } from "../master-key.js";
import { SecretsStore } from "../secrets-store.js";

async function createSecretsStore(auditEmitter?: (event: any) => void) {
  const fixture = await createTestProject();
  const central = new CentralCore(fixture.globalDir);
  await central.init();
  const centralDb = (central as unknown as { db: import("../central-db.js").CentralDatabase | null }).db;
  if (!centralDb) throw new Error("central db unavailable");
  const masterKeyManager = new MasterKeyManager({ globalDir: fixture.globalDir });
  const store = new SecretsStore(fixture.store.getDatabase(), centralDb, () => masterKeyManager.getOrCreateKey(), { auditEmitter });
  return { fixture, store };
}

describe("SecretsStore audit emitter", () => {
  const emitter = vi.fn();

  beforeEach(() => {
    emitter.mockReset();
  });

  it("emits create/update/delete/read without secret values", async () => {
    const { fixture, store } = await createSecretsStore(emitter);
    try {
      const created = await store.createSecret({ scope: "project", key: "API_KEY", plaintextValue: "secret-a" });
      await store.updateSecret(created.id, "project", { plaintextValue: "secret-b", key: "API_KEY_2" });
      await store.revealSecret(created.id, "project", { agentId: "agent-1" });
      store.deleteSecret(created.id, "project");

      expect(emitter).toHaveBeenCalledTimes(4);
      for (const event of emitter.mock.calls.map((call) => call[0])) {
        expect(event).toHaveProperty("key");
        expect(event).toHaveProperty("scope");
        expect(event).not.toHaveProperty("plaintextValue");
        expect(event).not.toHaveProperty("value");
        expect(event).not.toHaveProperty("ciphertext");
        expect(event).not.toHaveProperty("nonce");
      }
      expect(emitter.mock.calls[2][0]).toMatchObject({ mutationType: "secret:read", actor: { agentId: "agent-1" } });
    } finally {
      await fixture.cleanup();
    }
  });

  it("swallows emitter exceptions", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { fixture, store } = await createSecretsStore(() => {
      throw new Error("boom");
    });
    try {
      await expect(store.createSecret({ scope: "project", key: "API_KEY", plaintextValue: "secret-a" })).resolves.toBeTruthy();
    } finally {
      warnSpy.mockRestore();
      await fixture.cleanup();
    }
  });
});
