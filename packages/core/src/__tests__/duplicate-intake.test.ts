import { describe, expect, it } from "vitest";

import { findSameAgentDuplicates } from "../duplicate-intake.js";

describe("findSameAgentDuplicates", () => {
  const nowMs = Date.now();

  it("returns same-agent high-similarity match within window", () => {
    const matches = findSameAgentDuplicates(
      { title: "Fix typecheck in secrets sync", description: "promisify scrypt causes typecheck error" },
      [{
        id: "FN-1",
        title: "Fix typecheck in secrets sync",
        description: "promisify scrypt causes typecheck error",
        column: "todo",
        createdAt: nowMs - 60 * 60 * 1000,
        sourceAgentId: "agent-x",
      }],
      { nowMs },
    );
    expect(matches[0]?.id).toBe("FN-1");
  });

  it("filters out entries older than 24h", () => {
    const matches = findSameAgentDuplicates(
      { title: "Fix typecheck", description: "typecheck error" },
      [{ id: "FN-1", title: "Fix typecheck", description: "typecheck error", column: "todo", createdAt: nowMs - 25 * 60 * 60 * 1000, sourceAgentId: "agent-x" }],
      { nowMs },
    );
    expect(matches).toEqual([]);
  });

  it("filters out candidates without source agent", () => {
    const matches = findSameAgentDuplicates(
      { title: "Fix typecheck", description: "typecheck error" },
      [{ id: "FN-1", title: "Fix typecheck", description: "typecheck error", column: "todo", createdAt: nowMs - 60 * 1000, sourceAgentId: null }],
      { nowMs },
    );
    expect(matches).toEqual([]);
  });

  it("filters archived candidates via duplicate matcher defaults", () => {
    const matches = findSameAgentDuplicates(
      { title: "Fix typecheck", description: "typecheck error" },
      [{ id: "FN-1", title: "Fix typecheck", description: "typecheck error", column: "archived", createdAt: nowMs - 60 * 1000, sourceAgentId: "agent-x" }],
      { nowMs },
    );
    expect(matches).toEqual([]);
  });

  it("respects threshold", () => {
    const matches = findSameAgentDuplicates(
      { title: "Fix parser", description: "parse errors on sync job" },
      [{ id: "FN-1", title: "Refactor dashboard layout", description: "button spacing and css", column: "todo", createdAt: nowMs - 60 * 1000, sourceAgentId: "agent-x" }],
      { nowMs },
    );
    expect(matches).toEqual([]);
  });
});
