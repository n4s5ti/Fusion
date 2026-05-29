import type { GoalCitationMatch } from "./types.js";

export const GOAL_ID_PATTERN = /\bG-[0-9A-Z]+(?:-[0-9A-Z]+)*\b/g;

export const GOAL_CITATION_SNIPPET_MAX = 200;

export function extractGoalCitations(text: string): GoalCitationMatch[] {
  const normalized = String(text ?? "");
  if (normalized.length === 0) {
    return [];
  }

  const matches: GoalCitationMatch[] = [];
  const seen = new Set<string>();
  const pattern = new RegExp(GOAL_ID_PATTERN.source, GOAL_ID_PATTERN.flags);

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(normalized)) !== null) {
    const goalId = match[0];
    if (seen.has(goalId)) {
      continue;
    }
    seen.add(goalId);
    matches.push({ goalId, index: match.index });
  }

  return matches;
}

export function buildSnippet(text: string, index: number, max = GOAL_CITATION_SNIPPET_MAX): string {
  const normalized = String(text ?? "");
  if (normalized.length === 0 || max <= 0) {
    return "";
  }

  const goalMatch = normalized
    .slice(Math.max(0, index))
    .match(/^G-[0-9A-Z]+(?:-[0-9A-Z]+)*/);
  const goalEnd = goalMatch ? index + goalMatch[0].length : index;

  let start = Math.max(0, index - Math.floor(max / 2));
  let end = Math.min(normalized.length, start + max);
  if (end < goalEnd) {
    end = Math.min(normalized.length, goalEnd);
    start = Math.max(0, end - max);
  } else {
    start = Math.max(0, end - max);
  }

  const snippet = normalized
    .slice(start, end)
    .replace(/\s+/g, " ")
    .trim();

  return snippet.length <= max ? snippet : snippet.slice(0, max).trim();
}
