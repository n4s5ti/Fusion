import type { DiscoveryResult } from "../../artifacts/discovery.js";

const BASE = "/api/plugins/fusion-plugin-compound-engineering";

function qp(params: Record<string, string | undefined>): string {
  const entries = Object.entries(params).filter(
    ([, v]) => typeof v === "string" && v.length > 0,
  ) as Array<[string, string]>;
  if (entries.length === 0) return "";
  return `?${entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&")}`;
}

async function request<T>(path: string, init?: RequestInit, responseType: "json" | "text" = "json"): Promise<T> {
  const response = await fetch(`${BASE}${path}`, init);
  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    try {
      const data = (await response.json()) as { error?: string };
      if (data.error) message = data.error;
    } catch {
      // ignore
    }
    throw new Error(message);
  }
  if (responseType === "text") return (await response.text()) as T;
  return (await response.json()) as T;
}

export async function listArtifacts(projectId?: string): Promise<DiscoveryResult> {
  return request<DiscoveryResult>(`/artifacts${qp({ projectId })}`);
}

export async function getArtifact(
  id: string,
  projectId?: string,
): Promise<{ content: string; name: string }> {
  const data = await request<{ artifact: { name: string }; content: string }>(
    `/artifacts/${encodeURIComponent(id)}${qp({ projectId })}`,
  );
  return { content: data.content, name: data.artifact.name };
}

export function getArtifactPreviewUrl(id: string, projectId?: string): string {
  return `${BASE}/artifacts/${encodeURIComponent(id)}/preview.html${qp({ projectId })}`;
}
