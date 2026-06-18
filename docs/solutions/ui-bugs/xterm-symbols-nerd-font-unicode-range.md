---
title: "xterm symbols Nerd Font unicode-range scoping"
date: 2026-06-13
category: ui-bugs
module: packages/dashboard/app/components/TerminalModal
problem_type: ui_bug
component: frontend_terminal
applies_when: "A symbols-only Nerd Font is listed in an xterm.js fontFamily stack with font-display: swap."
symptoms:
  - "Terminal glyphs render with oversized inter-character spacing after the symbols font loads"
  - "Mobile DOM/canvas xterm output wraps after very few columns even for ASCII commands"
  - "Powerline prompt glyphs are needed, but ASCII must measure against a real monospace text font"
root_cause: symbols_only_font_face_without_unicode_range_or_symbols_first_stack_participated_in_ascii_cell_measurement
resolution_type: code_fix
severity: high
related_components:
  - packages/dashboard/app/components/TerminalModal.css
  - packages/dashboard/app/components/TerminalModal.tsx
  - packages/dashboard/app/components/SessionTerminal.tsx
  - packages/dashboard/app/__tests__/terminal-input.test.ts
  - FN-6390
  - FN-6424
  - FN-6603
tags:
  - xterm
  - font-loading
  - font-display-swap
  - unicode-range
  - nerd-font
  - mobile-safari
---

# xterm symbols Nerd Font unicode-range scoping

## Problem

A symbols-only Nerd Font can corrupt xterm.js cell measurement when it appears first in the terminal `fontFamily` stack. FN-6390 correctly added an async post-font-load remeasure, but FN-6424 found the recurrence: the browser could still measure ASCII cells against `SymbolsNerdFontMono` after `font-display: swap`, producing huge gaps such as `p n p m  b u i l d` on mobile.

FN-6603 found the third recurrence: the FN-6390 remeasure and FN-6424 `unicode-range` were both present, but the shared terminal preference stack still listed the symbols face first. Mobile WebKit/xterm canvas measurement could still use that first face for cell metrics while actual ASCII glyph rendering fell through to a later monospace font. The visible symptom was the same wide-cell layout (`A G E N T S . m d`) with intact powerline glyphs.

## Solution

Keep the symbols font available for powerline/Nerd-Font codepoints, but apply both guards:

1. Scope its `@font-face` with `unicode-range` so printable ASCII is never resolved through that family during normal glyph fallback.
2. Keep real monospace text faces before the symbols family in every xterm `fontFamily` preset. The symbols family should be a fallback, not the first measurement candidate, because xterm's DOM/canvas metrics path is less reliable than normal DOM text fallback on mobile WebKit.

Use the standard Symbols Nerd Font ranges, including powerline and private-use blocks, for example:

```css
@font-face {
  font-family: "Fusion Terminal Nerd Font Symbols";
  src: url("/fonts/SymbolsNerdFontMono-Regular.ttf") format("truetype");
  font-display: swap;
  unicode-range: U+23FB-23FE, U+2665, U+26A1, U+2B58, U+E000-E00A, U+E0A0-E0D7, U+E200-E2A9, U+E300-E3E3, U+E5FA-E6B7, U+E700-E8EF, U+EA60-EC1E, U+ED00-F2FF, U+F300-F533, U+F0001-F1AF0;
}
```

Do not replace this with fixed `letterSpacing`, hardcoded column counts, or by removing the async remeasure. xterm should still refit after web fonts load; the font face and stack ordering together must prevent symbols-only metrics from applying to ASCII.

## Regression coverage

Automated jsdom tests cannot validate font advance widths, so cover the enforceable CSS contract and then run a real-browser check.

- Parse emitted/app CSS and assert the terminal symbols `@font-face` has a `unicode-range`.
- Assert the range contains required Nerd-Font/powerline blocks such as `U+E0A0-E0D7`, `U+E700-E8EF`, and `U+F0001-F1AF0`.
- Assert no range overlaps printable ASCII (`U+0020-007E`).
- Assert the shared default stack and every terminal font preset place a real text monospace face before `"Fusion Terminal Nerd Font Symbols"`.
- Check every xterm consumer: `TerminalModal` and `SessionTerminal` both use `resolveTerminalFontFamily()`, so both are affected by stack ordering and both need component-level coverage that the stack passed to `new Terminal(...)` is measurement-safe.
- Verify in a mobile/touch browser path that ASCII output renders tightly while the powerline glyph still renders for the default `nerd-font` and `system-mono` presets.
