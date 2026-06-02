import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { getProjectRootFromWorktree, resolvePiExtensionProjectRoot } from "../pi-extensions.js";

describe("getProjectRootFromWorktree", () => {
  it("detects POSIX worktree paths", () => {
    expect(getProjectRootFromWorktree("/repo/.worktrees/fn-001")).toBe("/repo");
    expect(getProjectRootFromWorktree("/repo/.worktrees/fn-001/src/file.ts")).toBe("/repo");
    expect(getProjectRootFromWorktree("/repo/.fusion/worktrees/fn-001")).toBe("/repo");
    expect(getProjectRootFromWorktree("/repo/.fusion/worktrees/fn-001/src/file.ts")).toBe("/repo");
  });

  it("detects Windows worktree paths", () => {
    expect(getProjectRootFromWorktree("C:\\repo\\.worktrees\\fn-001")).toBe("C:\\repo");
    expect(getProjectRootFromWorktree("C:\\repo\\.worktrees\\fn-001\\src\\file.ts")).toBe("C:\\repo");
    expect(getProjectRootFromWorktree("C:\\repo\\.fusion\\worktrees\\fn-001")).toBe("C:\\repo");
    expect(getProjectRootFromWorktree("C:\\repo\\.fusion\\worktrees\\fn-001\\src\\file.ts")).toBe("C:\\repo");
  });

  it("supports configured candidate worktrees dir paths", () => {
    expect(
      getProjectRootFromWorktree("/tmp/.fn-worktrees/repo/fn-001/src", {
        worktreesDirCandidates: ["/tmp/.fn-worktrees/repo"],
      }),
    ).toBe("/tmp/.fn-worktrees");

    expect(
      getProjectRootFromWorktree("/tmp/repo.worktrees/fn-001", {
        worktreesDirCandidates: ["/tmp/repo.worktrees"],
      }),
    ).toBe("/tmp");
  });
});

describe("@fusion/core export surface", () => {
  it("re-exports getProjectRootFromWorktree as a callable function", async () => {
    const core = await import("../index.js");
    expect(typeof core.getProjectRootFromWorktree).toBe("function");
  });
});

describe("resolvePiExtensionProjectRoot", () => {
  it("prefers parent repo root for worktree paths when parent .fusion exists", () => {
    const root = mkdtempSync(join(tmpdir(), "fn-4904-root-"));
    try {
      mkdirSync(join(root, ".fusion"), { recursive: true });
      mkdirSync(join(root, ".worktrees", "feature", ".fusion"), { recursive: true });
      mkdirSync(join(root, ".fusion", "worktrees", "feature", ".fusion"), { recursive: true });
      const legacyCwd = join(root, ".worktrees", "feature", "sub");
      const fusionCwd = join(root, ".fusion", "worktrees", "feature", "sub");
      mkdirSync(legacyCwd, { recursive: true });
      mkdirSync(fusionCwd, { recursive: true });

      expect(resolvePiExtensionProjectRoot(legacyCwd)).toBe(root);
      expect(resolvePiExtensionProjectRoot(fusionCwd)).toBe(root);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("falls back to legacy walk when parent repo root does not have .fusion", () => {
    const root = mkdtempSync(join(tmpdir(), "fn-4904-root-"));
    try {
      const worktreeRoot = join(root, ".worktrees", "feature");
      mkdirSync(join(worktreeRoot, ".fusion"), { recursive: true });
      const cwd = join(worktreeRoot, "sub");
      mkdirSync(cwd, { recursive: true });

      expect(resolvePiExtensionProjectRoot(cwd)).toBe(worktreeRoot);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("preserves non-worktree behavior", () => {
    const root = mkdtempSync(join(tmpdir(), "fn-4904-root-"));
    try {
      mkdirSync(join(root, ".fusion"), { recursive: true });
      const cwd = join(root, "sub", "dir");
      mkdirSync(cwd, { recursive: true });

      expect(resolvePiExtensionProjectRoot(cwd)).toBe(root);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
