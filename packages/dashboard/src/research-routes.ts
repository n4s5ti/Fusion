import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import { AsyncLocalStorage } from "node:async_hooks";
import type { TaskStore, ResearchRun, TaskCreateInput } from "@fusion/core";
import {
  RESEARCH_RUN_STATUSES,
  RESEARCH_SOURCE_TYPES,
  RESEARCH_SOURCE_STATUSES,
  RESEARCH_EVENT_TYPES,
  type ResearchRunListOptions,
  type ResearchRunStatus,
} from "@fusion/core";
import { ApiError, badRequest, notFound } from "./api-error.js";

const DEFAULT_AVAILABILITY = {
  available: true,
  supportedProviders: ["web-search", "page-fetch", "github", "local-docs", "llm-synthesis"],
  supportedExportFormats: ["markdown", "json", "html"],
} as const;

function unavailableResponse(reason: string, code: "unavailable" | "not-configured" | "feature-disabled" = "unavailable") {
  return {
    availability: {
      available: false,
      code,
      reason,
      setupInstructions: "Enable the research subsystem and provider integrations to use this endpoint.",
    },
  };
}

function rethrowAsApiError(error: unknown, fallback = "Internal server error"): never {
  if (error instanceof ApiError) throw error;
  if (error instanceof Error) throw new ApiError(500, error.message);
  throw new ApiError(500, fallback);
}

function getProjectId(req: Request): string | undefined {
  if (typeof req.query.projectId === "string" && req.query.projectId.trim()) return req.query.projectId;
  if (req.body && typeof req.body === "object" && typeof req.body.projectId === "string" && req.body.projectId.trim()) return req.body.projectId;
  return undefined;
}

function toRunListItem(run: ResearchRun) {
  return {
    id: run.id,
    query: run.query,
    title: run.topic || run.query,
    status: run.status,
    summary: run.results?.summary,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
  };
}

function toRunDetail(run: ResearchRun) {
  return {
    ...run,
    title: run.topic || run.query,
  };
}

export function createResearchRouter(store: TaskStore): Router {
  const router = Router();
  const requestContext = new AsyncLocalStorage<TaskStore>();

  router.use((req: Request, _res: Response, next: NextFunction) => {
    const projectId = getProjectId(req);
    if (!projectId) {
      requestContext.run(store, () => next());
      return;
    }

    import("./project-store-resolver.js")
      .then(({ getOrCreateProjectStore }) => getOrCreateProjectStore(projectId))
      .then((scopedStore) => requestContext.run(scopedStore, () => next()))
      .catch((error) => rethrowAsApiError(error, "Failed to resolve project store"));
  });

  const getStore = () => {
    const scoped = requestContext.getStore();
    if (!scoped) throw new ApiError(500, "Store context not available");
    return scoped.getResearchStore();
  };

  router.get("/runs", (req, res) => {
    try {
      const options: ResearchRunListOptions = {};
      if (typeof req.query.status === "string") {
        if (!RESEARCH_RUN_STATUSES.includes(req.query.status as ResearchRunStatus)) {
          throw badRequest(`Invalid status: ${req.query.status}`);
        }
        options.status = req.query.status as ResearchRunStatus;
      }
      if (typeof req.query.q === "string") options.search = req.query.q;
      if (typeof req.query.limit === "string") options.limit = Number.parseInt(req.query.limit, 10);

      const runs = getStore().listRuns(options);
      res.json({ runs: runs.map(toRunListItem), availability: DEFAULT_AVAILABILITY });
    } catch (error) {
      rethrowAsApiError(error, "Failed to list research runs");
    }
  });

  router.post("/runs", (req, res) => {
    try {
      if (typeof req.body?.query !== "string" || !req.body.query.trim()) {
        throw badRequest("query is required");
      }

      const run = getStore().createRun({
        query: req.body.query,
        topic: req.body.query,
        providerConfig: {
          providers: req.body.providers,
          githubRepo: req.body.githubRepo,
          githubIssueNumber: req.body.githubIssueNumber,
          includeLocalDocs: req.body.includeLocalDocs,
          enableSynthesis: req.body.enableSynthesis,
          maxResults: req.body.maxResults,
          depth: req.body.depth,
        },
      });
      res.status(201).json({ run: toRunDetail(run), availability: DEFAULT_AVAILABILITY });
    } catch (error) {
      rethrowAsApiError(error, "Failed to create research run");
    }
  });

  router.get("/runs/:id", (req, res) => {
    try {
      const run = getStore().getRun(req.params.id);
      if (!run) throw notFound(`Run not found: ${req.params.id}`);
      res.json({ run: toRunDetail(run), availability: DEFAULT_AVAILABILITY });
    } catch (error) {
      rethrowAsApiError(error, "Failed to get research run");
    }
  });

  router.post("/runs/:id/cancel", (req, res) => {
    try {
      getStore().updateStatus(req.params.id, "cancelled");
      const run = getStore().getRun(req.params.id);
      if (!run) throw notFound(`Run not found: ${req.params.id}`);
      res.json({ run: toRunDetail(run) });
    } catch (error) {
      rethrowAsApiError(error, "Failed to cancel research run");
    }
  });

  router.post("/runs/:id/retry", (req, res) => {
    try {
      getStore().updateRun(req.params.id, { error: null });
      getStore().updateStatus(req.params.id, "pending");
      const run = getStore().getRun(req.params.id);
      if (!run) throw notFound(`Run not found: ${req.params.id}`);
      res.json({ run: toRunDetail(run) });
    } catch (error) {
      rethrowAsApiError(error, "Failed to retry research run");
    }
  });

  router.get("/runs/:id/export", (req, res) => {
    try {
      const run = getStore().getRun(req.params.id);
      if (!run) throw notFound(`Run not found: ${req.params.id}`);

      const format = String(req.query.format ?? "markdown");
      if (format === "json") {
        res.json({ format, filename: `${run.id}.json`, content: JSON.stringify(run, null, 2) });
        return;
      }
      if (format === "html") {
        const html = `<h1>${run.topic || run.query}</h1><p>${run.results?.summary ?? ""}</p>`;
        res.json({ format, filename: `${run.id}.html`, content: html });
        return;
      }
      if (format !== "markdown") throw badRequest(`Unsupported format: ${format}`);

      const markdown = `# ${run.topic || run.query}\n\n${run.results?.summary ?? ""}`;
      res.json({ format: "markdown", filename: `${run.id}.md`, content: markdown });
    } catch (error) {
      rethrowAsApiError(error, "Failed to export research run");
    }
  });

  router.post("/runs/:id/create-task", async (req, res) => {
    try {
      const run = getStore().getRun(req.params.id);
      if (!run) throw notFound(`Run not found: ${req.params.id}`);
      const includeSummary = req.body?.includeSummary !== false;
      const includeCitations = req.body?.includeCitations !== false;
      const summary = includeSummary ? run.results?.summary ?? "" : "";
      const citations = includeCitations ? (run.results?.citations ?? []).map((c) => `- ${c}`).join("\n") : "";
      const description = [summary, citations].filter(Boolean).join("\n\n");
      const taskInput: TaskCreateInput = {
        title: req.body?.title || `Research: ${run.topic || run.query}`,
        description,
      };
      const task = await requestContext.getStore()!.createTask(taskInput);
      res.json({ task: { id: task.id, title: task.title } });
    } catch (error) {
      rethrowAsApiError(error, "Failed to create task from research run");
    }
  });

  router.post("/runs/:id/attach-task", async (req, res) => {
    try {
      const scopedStore = requestContext.getStore();
      if (!scopedStore) {
        res.status(501).json(unavailableResponse("Task store context unavailable"));
        return;
      }

      const run = getStore().getRun(req.params.id);
      if (!run) throw notFound(`Run not found: ${req.params.id}`);
      const taskId = String(req.body?.taskId ?? "").trim();
      const mode = req.body?.mode;
      if (!taskId) throw badRequest("taskId is required");
      if (mode !== "document" && mode !== "attachment") throw badRequest("mode must be 'document' or 'attachment'");

      const markdown = `# Research Findings\n\n## Query\n${run.query}\n\n## Summary\n${run.results?.summary ?? ""}\n\n## Citations\n${(run.results?.citations ?? []).map((c) => `- ${c}`).join("\n")}`;

      if (mode === "document") {
        const document = await scopedStore.upsertTaskDocument(taskId, { key: `research-${run.id.toLowerCase()}`, content: markdown });
        res.json({ task: { id: taskId }, documentKey: document.key });
        return;
      }

      const attachment = await scopedStore.addAttachment(
        taskId,
        `${run.id}.txt`,
        Buffer.from(markdown, "utf8"),
        "text/plain",
      );
      res.json({ task: { id: taskId }, attachmentName: attachment.filename });
    } catch (error) {
      rethrowAsApiError(error, "Failed to attach research findings to task");
    }
  });

  router.post("/runs/:id/events", (req, res) => {
    try {
      const { type, message, metadata } = req.body ?? {};
      if (!RESEARCH_EVENT_TYPES.includes(type)) throw badRequest(`Invalid event type: ${String(type)}`);
      if (typeof message !== "string" || !message.trim()) throw badRequest("message is required");
      const event = getStore().appendEvent(req.params.id, { type, message, metadata });
      res.status(201).json(event);
    } catch (error) {
      rethrowAsApiError(error, "Failed to append research event");
    }
  });

  router.patch("/runs/:id", (req, res) => {
    try {
      const updated = getStore().updateRun(req.params.id, req.body ?? {});
      if (!updated) throw notFound(`Run not found: ${req.params.id}`);
      res.json(updated);
    } catch (error) {
      rethrowAsApiError(error, "Failed to update research run");
    }
  });

  router.delete("/runs/:id", (req, res) => {
    try {
      const deleted = getStore().deleteRun(req.params.id);
      if (!deleted) throw notFound(`Run not found: ${req.params.id}`);
      res.status(204).send();
    } catch (error) {
      rethrowAsApiError(error, "Failed to delete research run");
    }
  });

  router.post("/runs/:id/sources", (req, res) => {
    try {
      const { type, status } = req.body ?? {};
      if (!RESEARCH_SOURCE_TYPES.includes(type)) throw badRequest(`Invalid source type: ${String(type)}`);
      if (!RESEARCH_SOURCE_STATUSES.includes(status)) throw badRequest(`Invalid source status: ${String(status)}`);
      const source = getStore().addSource(req.params.id, req.body);
      res.status(201).json(source);
    } catch (error) {
      rethrowAsApiError(error, "Failed to add research source");
    }
  });

  router.patch("/runs/:id/sources/:sourceId", (req, res) => {
    try {
      getStore().updateSource(req.params.id, req.params.sourceId, req.body ?? {});
      res.status(204).send();
    } catch (error) {
      rethrowAsApiError(error, "Failed to update research source");
    }
  });

  router.put("/runs/:id/results", (req, res) => {
    try {
      getStore().setResults(req.params.id, req.body);
      res.status(204).send();
    } catch (error) {
      rethrowAsApiError(error, "Failed to set research results");
    }
  });

  router.patch("/runs/:id/status", (req, res) => {
    try {
      const status = req.body?.status as ResearchRunStatus | undefined;
      if (!status || !RESEARCH_RUN_STATUSES.includes(status)) throw badRequest(`Invalid status: ${String(status)}`);
      getStore().updateStatus(req.params.id, status, req.body?.extra);
      const run = getStore().getRun(req.params.id);
      if (!run) throw notFound(`Run not found: ${req.params.id}`);
      res.json(run);
    } catch (error) {
      rethrowAsApiError(error, "Failed to update research status");
    }
  });

  router.post("/runs/:id/exports", (req, res) => {
    try {
      const format = req.body?.format;
      const content = req.body?.content;
      if (typeof content !== "string") throw badRequest("content is required");
      const exportRow = getStore().createExport(req.params.id, format, content);
      res.status(201).json(exportRow);
    } catch (error) {
      rethrowAsApiError(error, "Failed to create research export");
    }
  });

  router.get("/runs/:id/exports", (req, res) => {
    try {
      res.json({ exports: getStore().getExports(req.params.id) });
    } catch (error) {
      rethrowAsApiError(error, "Failed to list research exports");
    }
  });

  router.get("/exports/:exportId", (req, res) => {
    try {
      const exportRow = getStore().getExport(req.params.exportId);
      if (!exportRow) throw notFound(`Export not found: ${req.params.exportId}`);
      res.json(exportRow);
    } catch (error) {
      rethrowAsApiError(error, "Failed to get research export");
    }
  });

  router.get("/stats", (_req, res) => {
    try {
      res.json(getStore().getStats());
    } catch (error) {
      rethrowAsApiError(error, "Failed to get research stats");
    }
  });

  router.get("/search", (req, res) => {
    try {
      const q = String(req.query.q ?? "").trim();
      if (!q) throw badRequest("q is required");
      res.json({ runs: getStore().searchRuns(q) });
    } catch (error) {
      rethrowAsApiError(error, "Failed to search research runs");
    }
  });

  return router;
}
