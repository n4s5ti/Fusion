import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const css = readFileSync(
  resolve(__dirname, "../styles.css"),
  "utf-8",
);

describe("mobile input font size CSS", () => {
  describe("base (desktop) styles", () => {
    it("quick-entry-input has desktop font-size below 16px", () => {
      // Extract the .quick-entry-input rule
      const quickEntryMatch = css.match(/\.quick-entry-input\s*\{[^}]*\}/);
      expect(quickEntryMatch).not.toBeNull();
      
      // Should have 13px font-size on desktop
      expect(quickEntryMatch![0]).toContain("font-size: 13px");
    });

    it("form-group textarea has desktop font-size below 16px", () => {
      // Extract the .form-group textarea rule
      const textareaMatch = css.match(/\.form-group\s+textarea\s*\{[^}]*\}/);
      expect(textareaMatch).not.toBeNull();
      
      // Should have 14px font-size on desktop
      expect(textareaMatch![0]).toContain("font-size: 14px");
    });
  });

  describe("mobile @media (max-width: 768px)", () => {
    // Extract the main mobile media block for scoped assertions
    const mediaStart = css.search(
      /@media\s*\([^)]*max-width:\s*768px[^)]*\)\s*\{/,
    );
    const afterMedia = css.slice(mediaStart);

    it("contains mobile font-size override for task-entry inputs", () => {
      // Both .quick-entry-input and #new-task-description should be targeted
      expect(afterMedia).toContain(".quick-entry-input,");
      expect(afterMedia).toContain("#new-task-description");
      expect(afterMedia).toContain("font-size: 16px");
    });

    it("task-entry font-size override is inside the mobile @media block", () => {
      expect(mediaStart).toBeGreaterThanOrEqual(0);
      
      // Find the next @media after the main mobile one to scope our search
      const nextMedia = afterMedia.search(/@media/);
      const mobileBlock = nextMedia > 0 ? afterMedia.slice(0, nextMedia) : afterMedia;
      
      // The override should be in the first mobile block
      expect(mobileBlock).toContain(".quick-entry-input");
      expect(mobileBlock).toContain("font-size: 16px");
    });

    it("only targets task-entry inputs, not all inputs globally", () => {
      // The selector should specifically target quick-entry and new-task-description
      // not a global input selector that would affect all inputs
      const globalInputPattern = /@media[^{]*max-width[^}]*\{[^}]*input\s*\{[^}]*font-size:\s*16px/s;
      expect(css).not.toMatch(globalInputPattern);
    });
  });
});
