/*
FNXC:CommandCenterStyling 2026-06-19-18:40:
FN-6690 invariant guard. Command Center shipped broken (entire view collapsed/unstyled on
desktop and mobile) because its CSS referenced a numeric design-token scale
(--space-1..--space-36, --font-size-*, --border-width*) that this dashboard never defines, so
~186 var() references resolved to nothing — padding, gaps, font sizes, and borders all collapsed.

The dashboard design system defines ONLY the named 4px spacing scale
(--space-xs/sm/md/lg/xl/2xl), uses raw rem font sizes (no --font-size-* tokens), and raw px
border widths (--border is a color, not a width). This guard fails if any Command Center CSS
references a custom property that is not defined in styles.css (the canonical token vocabulary)
or set as a component-local property. It fixes the invariant, not just the one repro: any future
undefined-token reference in Command Center CSS is caught here.

This class of bug slipped past the recent FN-66xx Command Center work because those tests ran in
jsdom, which does not resolve CSS custom properties or compute layout. This guard reads raw CSS
text, so it catches the collapse jsdom cannot see.

Follow-up FN-6693 extends this guard dashboard-wide (other components carry the same latent
undefined-token references).
*/
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const APP_DIR = resolve(__dirname, "..", "..", "..");
const STYLES_CSS = join(APP_DIR, "styles.css");
const COMMAND_CENTER_DIR = resolve(__dirname, "..");

/**
 * Custom properties that are legitimately set at runtime via JS inline styles
 * (style={{ "--name": ... }}) rather than declared in a stylesheet. These are
 * valid targets for var() even though no CSS file assigns them.
 */
const JS_SET_PROPERTY_ALLOWLIST = new Set<string>([
  "--cc-radial-value", // RadialGauge.tsx sets this per-instance
]);

function collectCssFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".") || entry === "__tests__") continue;
    const full = join(dir, entry);
    const info = statSync(full);
    if (info.isDirectory()) out.push(...collectCssFiles(full));
    else if (entry.endsWith(".css")) out.push(full);
  }
  return out;
}

function collectDefinedProperties(css: string, into: Set<string>): void {
  // Match `--name:` declarations (definitions/assignments), not var() references.
  const re = /(--[a-z0-9-]+)\s*:/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css)) !== null) {
    into.add(m[1]);
  }
}

function collectReferencedProperties(css: string): Map<string, number[]> {
  // Match `var(--name` references; ignore the optional fallback — referencing an
  // undefined token even with a fallback is the anti-pattern that hid FN-6690.
  const refs = new Map<string, number[]>();
  const lines = css.split("\n");
  lines.forEach((line, idx) => {
    const re = /var\(\s*(--[a-z0-9-]+)/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line)) !== null) {
      const name = m[1];
      const list = refs.get(name) ?? [];
      list.push(idx + 1);
      refs.set(name, list);
    }
  });
  return refs;
}

describe("Command Center CSS token validity (FN-6690)", () => {
  // Defined vocabulary = every --name: declared in styles.css, plus any
  // component-local properties assigned within Command Center CSS, plus
  // JS-set runtime properties.
  const defined = new Set<string>(JS_SET_PROPERTY_ALLOWLIST);
  collectDefinedProperties(readFileSync(STYLES_CSS, "utf8"), defined);
  const ccFiles = collectCssFiles(COMMAND_CENTER_DIR);
  for (const file of ccFiles) {
    collectDefinedProperties(readFileSync(file, "utf8"), defined);
  }

  it("has at least one Command Center stylesheet to validate", () => {
    expect(ccFiles.length).toBeGreaterThan(0);
  });

  it("references only defined design tokens (no undefined --space-N / --font-size-* / etc.)", () => {
    const violations: string[] = [];
    for (const file of ccFiles) {
      const refs = collectReferencedProperties(readFileSync(file, "utf8"));
      for (const [name, lineNos] of refs) {
        if (!defined.has(name)) {
          const rel = relative(APP_DIR, file);
          violations.push(`${rel}: var(${name}) at line(s) ${lineNos.join(", ")}`);
        }
      }
    }
    expect(violations, `Undefined CSS custom properties referenced in Command Center CSS:\n${violations.join("\n")}`).toEqual([]);
  });

  it("does not reintroduce the undefined numeric --space-N scale", () => {
    const offenders: string[] = [];
    for (const file of ccFiles) {
      const css = readFileSync(file, "utf8");
      // var(--space-<digits>) is the broken numeric scale; the valid scale is named
      // (xs/sm/md/lg/xl/2xl). The negative lookahead excludes the valid --space-2xl token,
      // which starts with a digit but is a named token, not the numeric scale.
      if (/var\(\s*--space-\d+(?![a-z])/i.test(css)) {
        offenders.push(relative(APP_DIR, file));
      }
    }
    expect(offenders, `Numeric --space-N tokens are undefined in this design system; use the named --space-xs/sm/md/lg/xl/2xl scale:\n${offenders.join("\n")}`).toEqual([]);
  });
});
