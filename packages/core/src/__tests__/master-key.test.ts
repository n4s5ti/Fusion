import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { stat, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { MasterKeyManager, MASTER_KEY_FILENAME, type KeytarLike } from "../master-key.js";

function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), "fn-master-key-test-"));
}

function createKeytarStub(initial?: string): KeytarLike {
  let value = initial ?? null;
  return {
    async getPassword() {
      return value;
    },
    async setPassword(_service, _account, password) {
      value = password;
    },
    async deletePassword() {
      value = null;
      return true;
    },
  };
}

describe("MasterKeyManager", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
    tempDirs.length = 0;
  });

  it("creates and reuses a key in keychain backend", async () => {
    const globalDir = createTempDir();
    tempDirs.push(globalDir);
    const manager = new MasterKeyManager({ globalDir, keytarModule: createKeytarStub() });

    const first = await manager.getOrCreateKey();
    const second = await manager.getOrCreateKey();

    expect(first.byteLength).toBe(32);
    expect(second.equals(first)).toBe(true);
    expect(await manager.getBackend()).toBe("keychain");
  });

  it("falls back to file backend when keychain is unavailable", async () => {
    const globalDir = createTempDir();
    tempDirs.push(globalDir);
    const manager = new MasterKeyManager({
      globalDir,
      keytarModule: {
        getPassword: async () => {
          throw new Error("keychain unavailable");
        },
        setPassword: async () => {
          throw new Error("keychain unavailable");
        },
        deletePassword: async () => {
          throw new Error("keychain unavailable");
        },
      },
    });

    const key = await manager.getOrCreateKey();
    const fileStat = await stat(join(globalDir, MASTER_KEY_FILENAME));

    expect(key.byteLength).toBe(32);
    expect(await manager.getBackend()).toBe("file");
    expect(fileStat.size).toBe(32);
    expect(fileStat.mode & 0o777).toBe(0o600);
  });
});
