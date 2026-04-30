// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import express from "express";
import { get as performGet, request as performRequest } from "../test-request.js";
import { createResearchRouter } from "../research-routes.js";

function createMockStore() {
  const run = {
    id: "RR-1",
    query: "test",
    topic: "test",
    status: "pending",
    sources: [],
    events: [],
    tags: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const researchStore = {
    listRuns: vi.fn(() => [run]),
    createRun: vi.fn(() => run),
    getRun: vi.fn(() => run),
    updateStatus: vi.fn(),
    updateRun: vi.fn(),
    appendEvent: vi.fn(),
    addSource: vi.fn(),
  };

  return {
    getResearchStore: () => researchStore,
    createTask: vi.fn(async () => ({ id: "FN-1", title: "Task" })),
    upsertTaskDocument: vi.fn(async () => ({ key: "research-rr-1" })),
    addAttachment: vi.fn(async () => ({ filename: "RR-1.md" })),
  };
}

describe("research-routes", () => {
  it("lists runs with availability envelope", async () => {
    const app = express();
    app.use(express.json());
    app.use(createResearchRouter(createMockStore() as any));

    const response = await performGet(app, "/runs");
    expect(response.status).toBe(200);
    expect(response.body.availability.available).toBe(true);
    expect(Array.isArray(response.body.runs)).toBe(true);
  });

  it("creates task from run", async () => {
    const app = express();
    app.use(express.json());
    app.use(createResearchRouter(createMockStore() as any));

    const response = await performRequest(
      app,
      "POST",
      "/runs/RR-1/create-task",
      JSON.stringify({ includeSummary: true, includeCitations: true }),
      { "content-type": "application/json" },
    );
    expect(response.status).toBe(200);
    expect(response.body.task.id).toBe("FN-1");
  });
});
