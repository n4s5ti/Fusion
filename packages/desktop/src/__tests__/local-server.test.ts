import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  type Handler = (...args: unknown[]) => void;
  class SimpleEmitter {
    private listeners = new Map<string, Handler[]>();
    on(event: string, handler: Handler) {
      const current = this.listeners.get(event) ?? [];
      current.push(handler);
      this.listeners.set(event, current);
      return this;
    }
    once(event: string, handler: Handler) {
      const wrapped: Handler = (...args) => {
        this.removeListener(event, wrapped);
        handler(...args);
      };
      return this.on(event, wrapped);
    }
    removeListener(event: string, handler: Handler) {
      const current = this.listeners.get(event) ?? [];
      this.listeners.set(event, current.filter((item) => item !== handler));
      return this;
    }
    emit(event: string, ...args: unknown[]) {
      const current = this.listeners.get(event) ?? [];
      for (const handler of current) {
        handler(...args);
      }
    }
  }

  const store = {
    init: vi.fn(async () => undefined),
    watch: vi.fn(async () => undefined),
    close: vi.fn(),
  };
  const centralCore = {
    init: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
  };
  const engine = { id: "engine-1" };
  const engineMap = new Map([["project-1", engine]]);
  const engineManager = {
    startAll: vi.fn(async () => undefined),
    startReconciliation: vi.fn(),
    stopAll: vi.fn(async () => undefined),
    getAllEngines: vi.fn(() => engineMap),
    onProjectAccessed: vi.fn(),
  };

  class TaskStore {
    constructor(_rootDir: string) {}
    init = store.init;
    watch = store.watch;
    close = store.close;
  }

  const server = Object.assign(new SimpleEmitter(), {
    address: vi.fn(() => ({ port: 4545 })),
    close: vi.fn((cb: () => void) => cb()),
  });

  const listen = vi.fn(() => {
    queueMicrotask(() => server.emit("listening"));
    return server;
  });

  const createServer = vi.fn(() => ({ listen }));

  const CentralCore = vi.fn(function () {
    return centralCore;
  });
  const ProjectEngineManager = vi.fn(function () {
    return engineManager;
  });

  return { TaskStore, CentralCore, ProjectEngineManager, createServer, store, listen, centralCore, engineManager, engine };
});

vi.mock("@fusion/core", () => ({ TaskStore: mocks.TaskStore, CentralCore: mocks.CentralCore }));
vi.mock("@fusion/dashboard", () => ({ createServer: mocks.createServer }));
vi.mock("@fusion/engine", () => ({ ProjectEngineManager: mocks.ProjectEngineManager }));

describe("DesktopLocalServerManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts local runtime and exposes port", async () => {
    const { DesktopLocalServerManager } = await import("../local-server.ts");
    const manager = new DesktopLocalServerManager("/repo");

    const runtime = await manager.start();

    expect(runtime.port).toBe(4545);
    expect(manager.getPort()).toBe(4545);
    expect(manager.getState().status).toBe("ready");
    expect(mocks.engineManager.startAll).toHaveBeenCalledTimes(1);
    expect(mocks.createServer).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        engine: mocks.engine,
        engineManager: mocks.engineManager,
        centralCore: mocks.centralCore,
      }),
    );
  });

  it("stops local runtime and resets state", async () => {
    const { DesktopLocalServerManager } = await import("../local-server.ts");
    const manager = new DesktopLocalServerManager("/repo");
    await manager.start();

    await manager.stop();

    expect(mocks.engineManager.stopAll).toHaveBeenCalled();
    expect(mocks.centralCore.close).toHaveBeenCalled();
    expect(mocks.store.close).toHaveBeenCalled();
    expect(manager.getState().status).toBe("idle");
    expect(manager.getPort()).toBeUndefined();
  });

  it("sets error state when startup fails", async () => {
    mocks.store.init.mockRejectedValueOnce(new Error("init failed"));
    const { DesktopLocalServerManager } = await import("../local-server.ts");
    const manager = new DesktopLocalServerManager("/repo");

    await expect(manager.start()).rejects.toThrow("init failed");
    expect(manager.getState()).toMatchObject({ status: "error", error: "init failed" });
  });

  it("returns existing runtime when start is called twice", async () => {
    const { DesktopLocalServerManager } = await import("../local-server.ts");
    const manager = new DesktopLocalServerManager("/repo");

    const first = await manager.start();
    const second = await manager.start();

    expect(first).toBe(second);
    expect(mocks.listen).toHaveBeenCalledTimes(1);
  });
});
