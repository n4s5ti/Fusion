// @vitest-environment jsdom
/**
 * Per-section smoke tests for the extracted SettingsModal sections (U9 / KTD-10).
 *
 * These pin the section-component contract: each section reads from `form` and
 * emits edits via `setForm` (the shell keeps persistence/save-split). We cover
 * three representative sections — an Appearance toggle round-trip, a
 * Notifications field, and an Experimental flag — following the dashboard
 * component-test conventions in settings-primitives.test.tsx.
 */
import { useState } from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import * as jestDomMatchers from "@testing-library/jest-dom/matchers";

import { AppearanceSection } from "../components/settings/sections/AppearanceSection";
import { NotificationsSection } from "../components/settings/sections/NotificationsSection";
import { ExperimentalSection } from "../components/settings/sections/ExperimentalSection";
import type { SettingsFormState } from "../components/settings/sections/context";

expect.extend(jestDomMatchers);
afterEach(() => cleanup());

const emptyForm = {} as SettingsFormState;

describe("AppearanceSection", () => {
  function AppearanceHost() {
    const [hidden, setHidden] = useState(false);
    return (
      <AppearanceSection
        scopeBanner={null}
        form={emptyForm}
        setForm={vi.fn()}
        themeMode="dark"
        colorTheme="default"
        dashboardFontScalePct={100}
        sessionBannersHidden={hidden}
        setSessionBannersHidden={setHidden}
      />
    );
  }

  it("round-trips the session-banner toggle through its setter", () => {
    render(<AppearanceHost />);
    const toggle = screen.getByText("Hide AI session notification banners")
      .closest("label")!
      .querySelector("input[type=checkbox]") as HTMLInputElement;
    expect(toggle.checked).toBe(false);
    fireEvent.click(toggle);
    expect(toggle.checked).toBe(true);
    fireEvent.click(toggle);
    expect(toggle.checked).toBe(false);
  });
});

describe("NotificationsSection", () => {
  it("emits the chosen failure-notification mode via setForm", () => {
    const setForm = vi.fn();
    render(
      <NotificationsSection
        scopeBanner={null}
        form={emptyForm}
        setForm={setForm}
        testNotificationLoading={{}}
        testNotificationResult={{}}
        onTestProviderNotification={vi.fn()}
      />,
    );
    const select = screen.getByLabelText("Failure notification mode") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "all" } });
    expect(setForm).toHaveBeenCalledTimes(1);
    const updater = setForm.mock.calls[0][0] as (f: SettingsFormState) => SettingsFormState;
    expect(updater(emptyForm)).toMatchObject({ failureNotificationMode: "all" });
  });

  it("shows the ntfy topic field only when ntfy is enabled", () => {
    const { rerender } = render(
      <NotificationsSection
        scopeBanner={null}
        form={{ ntfyEnabled: false } as SettingsFormState}
        setForm={vi.fn()}
        testNotificationLoading={{}}
        testNotificationResult={{}}
        onTestProviderNotification={vi.fn()}
      />,
    );
    expect(screen.queryByLabelText("ntfy Topic")).not.toBeInTheDocument();
    rerender(
      <NotificationsSection
        scopeBanner={null}
        form={{ ntfyEnabled: true } as SettingsFormState}
        setForm={vi.fn()}
        testNotificationLoading={{}}
        testNotificationResult={{}}
        onTestProviderNotification={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("ntfy Topic")).toBeInTheDocument();
  });
});

describe("ExperimentalSection", () => {
  const knownFeatures = { insights: "Insights", roadmap: "Roadmaps" };
  const legacyAliases: Record<string, string> = { devServer: "devServerView" };
  const getCanonicalKey = (k: string) => legacyAliases[k] ?? k;
  const isFeatureEnabled = (features: Record<string, boolean>, key: string) => features[key] === true;

  // Stateful host so the controlled checkbox actually toggles between renders
  // (a bare mock setForm never re-renders, so jsdom reports the bound value).
  function ExperimentalHost() {
    const [form, setFormState] = useState<SettingsFormState>(
      { experimentalFeatures: {} } as SettingsFormState,
    );
    return (
      <ExperimentalSection
        scopeBanner={null}
        form={form}
        setForm={setFormState as never}
        knownFeatures={knownFeatures}
        legacyAliases={legacyAliases}
        getCanonicalKey={getCanonicalKey}
        isFeatureEnabled={isFeatureEnabled}
      />
    );
  }

  it("renders a row per known flag and round-trips the canonical key", () => {
    render(<ExperimentalHost />);
    expect(screen.getByText("Insights")).toBeInTheDocument();
    expect(screen.getByText("Roadmaps")).toBeInTheDocument();

    const insightsToggle = document.getElementById("experimental-insights") as HTMLInputElement;
    expect(insightsToggle.checked).toBe(false);
    fireEvent.click(insightsToggle);
    expect(insightsToggle.checked).toBe(true);
    fireEvent.click(insightsToggle);
    expect(insightsToggle.checked).toBe(false);
  });
});
