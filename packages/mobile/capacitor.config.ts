/// <reference types="@capacitor-community/safe-area" />
import type { CapacitorConfig } from "@capacitor/cli";

const liveReloadEnabled = process.env.FUSION_LIVE_RELOAD === "true";

const config: CapacitorConfig = {
  appId: "com.fusion.mobile",
  appName: "Fusion",
  webDir: "../dashboard/dist/client",
  // FNXC:MobileShell 2026-06-16-18:40: @capacitor-community/safe-area patches
  // Android edge-to-edge so env(safe-area-inset-*) reports correct values to the
  // webview (status-bar overlap fix). Defaults are fine; it is enabled natively.
  plugins: {
    SafeArea: {
      // Content is the Fusion dashboard which uses viewport-fit=cover.
      initialViewportFitCover: true,
    },
  },
  server: {
    url: liveReloadEnabled
      ? process.env.FUSION_SERVER_URL || "http://localhost:5173"
      : undefined,
    cleartext: liveReloadEnabled,
  },
};

export default config;
