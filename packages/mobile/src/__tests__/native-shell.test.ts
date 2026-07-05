import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildMobileShellHandoff } from "../plugins/shell-handoff.js";
import { patchAndroidManifest, patchManifestSource } from "../../scripts/patch-android-manifest.js";

type BackButtonListener = (event: { canGoBack: boolean }) => void;

const capacitorState = vi.hoisted(() => {
  const state: {
    isNativePlatform: ReturnType<typeof vi.fn>;
    addListener: ReturnType<typeof vi.fn>;
    backButtonRemove: ReturnType<typeof vi.fn>;
    exitApp: ReturnType<typeof vi.fn>;
    backButtonListener?: BackButtonListener;
  } = {
    isNativePlatform: vi.fn(() => false),
    addListener: vi.fn(),
    backButtonRemove: vi.fn(async () => {}),
    exitApp: vi.fn(async () => {}),
    backButtonListener: undefined,
  };

  state.addListener.mockImplementation(async (eventName: string, callback: BackButtonListener) => {
    if (eventName === "backButton") {
      state.backButtonListener = callback;
    }
    return { remove: state.backButtonRemove };
  });

  return state;
});

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: capacitorState.isNativePlatform,
  },
}));

vi.mock("@capacitor/app", () => ({
  App: {
    addListener: capacitorState.addListener,
    exitApp: capacitorState.exitApp,
  },
}));

const state = {
  activeProfileId: null as string | null,
  profiles: [] as Array<{ id: string; name: string; serverUrl: string; authToken?: string | null; createdAt: string; updatedAt: string; lastUsedAt?: string | null }>,
};

vi.mock("../plugins/connection-profiles.js", () => ({
  loadShellProfiles: vi.fn(async () => state),
  listShellProfiles: vi.fn(async () => state.profiles),
  saveShellProfile: vi.fn(async (profile: { name: string; serverUrl: string; authToken?: string | null }) => {
    const saved = {
      id: "p1",
      name: profile.name,
      serverUrl: profile.serverUrl,
      authToken: profile.authToken ?? null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      lastUsedAt: null,
    };
    state.profiles = [saved];
    return saved;
  }),
  deleteShellProfile: vi.fn(async () => {
    state.profiles = [];
    state.activeProfileId = null;
  }),
  setActiveShellProfile: vi.fn(async (profileId: string | null) => {
    state.activeProfileId = profileId;
    return state;
  }),
}));

describe("MobileNativeShellBridge", () => {
  const scanner = { scanConnection: vi.fn(async () => ({ serverUrl: "https://fusion.example.com", authToken: null })) };

  beforeEach(() => {
    state.activeProfileId = null;
    state.profiles = [];
    scanner.scanConnection.mockClear();
    capacitorState.isNativePlatform.mockReturnValue(false);
    capacitorState.backButtonListener = undefined;
    vi.clearAllMocks();
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("emits state updates to subscribers", async () => {
    const { MobileNativeShellBridge } = await import("../plugins/native-shell.js");
    const bridge = new MobileNativeShellBridge(scanner as never);
    const listener = vi.fn();

    const unsubscribe = bridge.subscribe(listener);
    await bridge.saveProfile({ name: "Prod", serverUrl: "https://fusion.example.com" });

    expect(listener).toHaveBeenCalled();
    unsubscribe();
  });

  it("dispatches shell open manager event", async () => {
    const { MobileNativeShellBridge } = await import("../plugins/native-shell.js");
    const bridge = new MobileNativeShellBridge(scanner as never);
    const listener = vi.fn();
    const originalWindow = (globalThis as { window?: Window }).window;
    const mockWindow = new EventTarget() as Window;
    (globalThis as { window?: Window }).window = mockWindow;
    mockWindow.addEventListener("shell:open-connection-manager", listener as EventListener);

    await bridge.openConnectionManager();

    expect(listener).toHaveBeenCalledTimes(1);
    (globalThis as { window?: Window }).window = originalWindow;
  });

  it("returns state and listProfiles from persisted storage", async () => {
    const { MobileNativeShellBridge } = await import("../plugins/native-shell.js");
    const bridge = new MobileNativeShellBridge(scanner as never);

    const profile = await bridge.saveProfile({ name: "Prod", serverUrl: "https://fusion.example.com" });
    await bridge.setActiveProfile(profile.id);

    const stateSnapshot = await bridge.getState();
    const profiles = await bridge.listProfiles();

    expect(stateSnapshot.host).toBe("mobile-shell");
    expect(stateSnapshot.activeProfileId).toBe(profile.id);
    expect(profiles).toHaveLength(1);
    expect(profiles[0]?.id).toBe(profile.id);
  });

  it("supports QR onboarding handoff with optional auth token", async () => {
    scanner.scanConnection.mockResolvedValueOnce({ serverUrl: "https://fusion.example.com", authToken: "token-123" });
    const { MobileNativeShellBridge } = await import("../plugins/native-shell.js");
    const bridge = new MobileNativeShellBridge(scanner as never);

    const scan = await bridge.startQrScan();
    const saved = await bridge.saveProfile({ name: "QR Remote", serverUrl: scan.serverUrl, authToken: scan.authToken ?? null });
    const state = await bridge.setActiveProfile(saved.id);
    const handoff = buildMobileShellHandoff(state);

    expect(scan).toEqual({ serverUrl: "https://fusion.example.com", authToken: "token-123" });
    expect(handoff.kind).toBe("remote-launch");
    if (handoff.kind === "remote-launch") {
      const url = new URL(handoff.url);
      expect(url.searchParams.get("profileId")).toBe(saved.id);
      expect(url.searchParams.get("token")).toBe("token-123");
    }
  });

  it("rejects desktop mode switch", async () => {
    const { MobileNativeShellBridge } = await import("../plugins/native-shell.js");
    const bridge = new MobileNativeShellBridge(scanner as never);

    await expect(bridge.setDesktopMode("local")).rejects.toThrow("Desktop mode is not supported");
  });

  it("Android Back: skips Capacitor backButton registration on non-native platforms", async () => {
    const { AndroidBackButtonManager } = await import("../plugins/native-shell.js");
    const manager = new AndroidBackButtonManager();

    await manager.initialize();

    expect(capacitorState.isNativePlatform).toHaveBeenCalledTimes(1);
    expect(capacitorState.addListener).not.toHaveBeenCalled();
    expect(capacitorState.backButtonListener).toBeUndefined();

    await manager.destroy();

    expect(capacitorState.backButtonRemove).not.toHaveBeenCalled();
  });

  it("Android Back: registers and removes the native backButton listener on native platforms", async () => {
    capacitorState.isNativePlatform.mockReturnValue(true);
    const { AndroidBackButtonManager } = await import("../plugins/native-shell.js");
    const manager = new AndroidBackButtonManager();

    await manager.initialize();

    expect(capacitorState.addListener).toHaveBeenCalledWith("backButton", expect.any(Function));

    await manager.destroy();

    expect(capacitorState.backButtonRemove).toHaveBeenCalledTimes(1);
  });

  it("Android Back: does not duplicate native listener registration across repeated initialization", async () => {
    capacitorState.isNativePlatform.mockReturnValue(true);
    const { AndroidBackButtonManager } = await import("../plugins/native-shell.js");
    const manager = new AndroidBackButtonManager();

    await manager.initialize();
    await manager.initialize();

    expect(capacitorState.addListener).toHaveBeenCalledTimes(1);

    await manager.destroy();

    expect(capacitorState.backButtonRemove).toHaveBeenCalledTimes(1);
  });

  it("Android Back: dispatches a cancelable browser event before native fallback", async () => {
    capacitorState.isNativePlatform.mockReturnValue(true);
    const mockWindow = new EventTarget() as Window & typeof globalThis;
    const back = vi.fn();
    Object.defineProperty(mockWindow, "history", {
      value: { back },
      configurable: true,
    });
    vi.stubGlobal("window", mockWindow);
    const nativeBackListener = vi.fn((event: Event) => event.preventDefault());
    mockWindow.addEventListener("fusion:native-back", nativeBackListener as EventListener);
    const { AndroidBackButtonManager } = await import("../plugins/native-shell.js");
    const manager = new AndroidBackButtonManager();

    await manager.initialize();
    capacitorState.backButtonListener?.({ canGoBack: false });

    expect(nativeBackListener).toHaveBeenCalledTimes(1);
    expect(back).not.toHaveBeenCalled();
    expect(capacitorState.exitApp).not.toHaveBeenCalled();
  });

  it("Android Back: preserves browser-history fallback when Fusion does not handle it", async () => {
    capacitorState.isNativePlatform.mockReturnValue(true);
    const mockWindow = new EventTarget() as Window & typeof globalThis;
    const back = vi.fn();
    Object.defineProperty(mockWindow, "history", {
      value: { back },
      configurable: true,
    });
    vi.stubGlobal("window", mockWindow);
    const { AndroidBackButtonManager } = await import("../plugins/native-shell.js");
    const manager = new AndroidBackButtonManager();

    await manager.initialize();
    capacitorState.backButtonListener?.({ canGoBack: true });

    expect(back).toHaveBeenCalledTimes(1);
    expect(capacitorState.exitApp).not.toHaveBeenCalled();
  });

  it("Android Back: preserves native exit fallback when no history can go back", async () => {
    capacitorState.isNativePlatform.mockReturnValue(true);
    const mockWindow = new EventTarget() as Window & typeof globalThis;
    Object.defineProperty(mockWindow, "history", {
      value: { back: vi.fn() },
      configurable: true,
    });
    vi.stubGlobal("window", mockWindow);
    const { AndroidBackButtonManager } = await import("../plugins/native-shell.js");
    const manager = new AndroidBackButtonManager();

    await manager.initialize();
    capacitorState.backButtonListener?.({ canGoBack: false });

    expect(capacitorState.exitApp).toHaveBeenCalledTimes(1);
  });

  /*
  FNXC:TaskDetailAndroidBack 2026-07-05-11:45:
  FN-7583 — the Android back GESTURE (predictive back / edge swipe, Android 13+) reached
  the OS but was never delivered to `AndroidBackButtonManager`'s `backButton` listener
  because the generated AndroidManifest.xml never opted into
  `android:enableOnBackInvokedCallback="true"`. The raw OS gesture cannot be dispatched
  from a unit test, so these tests drive the actual seam the fix introduced
  (`patch-android-manifest.ts`) and assert it converges on the exact contract the button
  path above already proves: once the manifest opts in, gesture-completion delivery uses
  the SAME `OnBackPressedCallback` -> "backButton" -> `dispatchNativeBackEvent()` ->
  `fusion:native-back` chain, with the same cancelable-event and empty-stack fallback
  semantics. This test fails against the pre-fix tree (no `patch-android-manifest.ts`
  module, so the import above throws) and passes after.
  */
  describe("Android Back: gesture-delivery manifest opt-in (patch-android-manifest)", () => {
    let workDir: string;

    beforeEach(() => {
      workDir = mkdtempSync(join(tmpdir(), "fusion-fn7583-manifest-"));
    });

    afterEach(() => {
      rmSync(workDir, { recursive: true, force: true });
    });

    function writeManifest(xml: string): string {
      const manifestDir = join(workDir, "android", "app", "src", "main");
      mkdirSync(manifestDir, { recursive: true });
      const manifestPath = join(manifestDir, "AndroidManifest.xml");
      writeFileSync(manifestPath, xml, "utf8");
      return manifestPath;
    }

    const baseManifest = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="com.fusion.mobile">
    <application
        android:allowBackup="true"
        android:icon="@mipmap/ic_launcher"
        android:label="@string/app_name">
        <activity android:name=".MainActivity" />
    </application>
</manifest>
`;

    it("opts the generated manifest into predictive-back gesture delivery (the seam the gesture needs)", () => {
      const manifestPath = writeManifest(baseManifest);

      const result = patchAndroidManifest(workDir);

      expect(result.patched).toBe(true);
      expect(result.skipped).toBe(false);
      const patchedXml = readFileSync(manifestPath, "utf8");
      expect(patchedXml).toMatch(/<application[^>]*android:enableOnBackInvokedCallback="true"[^>]*>/);
    });

    it("is idempotent across repeated cap sync runs (does not duplicate the attribute)", () => {
      writeManifest(baseManifest);

      const first = patchAndroidManifest(workDir);
      const second = patchAndroidManifest(workDir);

      expect(first.patched).toBe(true);
      expect(second.patched).toBe(false);
      const manifestPath = join(workDir, "android", "app", "src", "main", "AndroidManifest.xml");
      const xml = readFileSync(manifestPath, "utf8");
      expect(xml.match(/android:enableOnBackInvokedCallback/g)).toHaveLength(1);
    });

    it("leaves an already-opted-in manifest untouched", () => {
      const alreadyOptedIn = baseManifest.replace(
        '<application\n        android:allowBackup="true"',
        '<application\n        android:enableOnBackInvokedCallback="true"\n        android:allowBackup="true"',
      );
      writeManifest(alreadyOptedIn);

      const result = patchAndroidManifest(workDir);

      expect(result.patched).toBe(false);
      const xml = readFileSync(join(workDir, "android", "app", "src", "main", "AndroidManifest.xml"), "utf8");
      expect(xml.match(/android:enableOnBackInvokedCallback/g)).toHaveLength(1);
    });

    it("no-ops safely (does not throw) when no android/ project has been added yet", () => {
      const result = patchAndroidManifest(workDir);

      expect(result.skipped).toBe(true);
      expect(result.patched).toBe(false);
    });

    it("patchManifestSource preserves the rest of the manifest verbatim aside from the opt-in attribute", () => {
      const { changed, xml } = patchManifestSource(baseManifest);

      expect(changed).toBe(true);
      expect(xml).toContain('<activity android:name=".MainActivity" />');
      expect(xml).toContain('android:label="@string/app_name"');
    });
  });
});
