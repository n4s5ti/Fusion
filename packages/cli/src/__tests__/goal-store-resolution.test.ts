import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { TaskStore, getProjectRootFromWorktree } from "@fusion/core";
import kbExtension from "../extension.js";

interface RegisteredTool {
  name: string;
  execute: (
    toolCallId: string,
    params: any,
    signal: AbortSignal | undefined,
    onUpdate: ((update: any) => void) | undefined,
    ctx: any,
  ) => Promise<any>;
}

function createMockAPI() {
  const tools = new Map<string, RegisteredTool>();
  return {
    registerTool(def: RegisteredTool) {
      tools.set(def.name, def);
    },
    registerCommand() {},
    registerShortcut() {},
    registerFlag() {},
    on() {},
    tools,
  } as any;
}

describe("extension goal tools store resolution", () => {
  let rootDir: string;
  let worktreeCwd: string;

  beforeEach(async () => {
    rootDir = await mkdtemp(join(tmpdir(), "kb-goal-resolution-"));
    await mkdir(join(rootDir, ".fusion"), { recursive: true });

    const worktreeRoot = join(rootDir, ".fusion", "worktrees", "FN-5851");
    await mkdir(join(worktreeRoot, ".fusion"), { recursive: true });
    worktreeCwd = join(worktreeRoot, "packages", "cli");
    await mkdir(worktreeCwd, { recursive: true });
  });

  afterEach(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  it("returns canonical project goals when invoked from a .fusion/worktrees cwd", async () => {
    expect(getProjectRootFromWorktree(worktreeCwd)).toBe(rootDir);

    const store = new TaskStore(rootDir);
    await store.init();
    const goal = store.getGoalStore().createGoal({
      title: "Canonical goal",
      description: "Created in the project root store",
    });

    const api = createMockAPI();
    kbExtension(api);
    const listTool = api.tools.get("fn_goal_list");
    const showTool = api.tools.get("fn_goal_show");
    expect(listTool).toBeDefined();
    expect(showTool).toBeDefined();

    const listResult = await listTool!.execute(
      "goal-list-worktree",
      { status: "active" },
      undefined,
      undefined,
      { cwd: worktreeCwd },
    );

    expect(listResult.isError).toBeUndefined();
    expect(listResult.details.goals).toEqual([
      expect.objectContaining({
        id: goal.id,
        title: "Canonical goal",
        description: "Created in the project root store",
        status: "active",
      }),
    ]);

    const showResult = await showTool!.execute(
      "goal-show-worktree",
      { id: goal.id },
      undefined,
      undefined,
      { cwd: worktreeCwd },
    );

    expect(showResult.isError).toBeUndefined();
    expect(showResult.details.goal).toMatchObject({
      id: goal.id,
      title: "Canonical goal",
      description: "Created in the project root store",
      status: "active",
    });

    store.close();
  });
});
