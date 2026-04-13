/**
 * Node-Project Assignment Utilities
 *
 * Provides canonical counting logic for projects routed to a node.
 *
 * **Runtime Behavior:**
 * - Projects with `nodeId` pointing to a remote node → run on that remote node
 * - Projects with `nodeId` pointing to a local node → run on that local node
 * - Projects without `nodeId` (unassigned) → run on local in-process runtime
 *
 * **Counting Rules:**
 * - Local nodes: include both explicitly-assigned projects AND unassigned projects
 * - Remote nodes: include only explicitly-assigned projects
 */

import type { NodeInfo, ProjectInfo } from "../api";

/**
 * Check if a project is routed to a specific node based on runtime rules.
 *
 * @param project - The project to check
 * @param node - The node to check against
 * @returns true if the project runs on this node
 */
export function isProjectRoutedToNode(project: ProjectInfo, node: NodeInfo): boolean {
  if (node.type === "remote") {
    // Remote nodes: only explicit assignment counts
    return project.nodeId === node.id;
  }

  // Local nodes: explicit assignment OR unassigned (null/undefined)
  if (project.nodeId === node.id) {
    return true;
  }

  // Unassigned projects run on local in-process runtime
  if (project.nodeId === undefined || project.nodeId === null) {
    return true;
  }

  return false;
}

/**
 * Get all projects that are routed to a specific node.
 *
 * @param projects - All projects
 * @param node - The node to filter by
 * @returns Projects routed to this node
 */
export function getProjectsForNode(projects: ProjectInfo[], node: NodeInfo): ProjectInfo[] {
  return projects.filter((project) => isProjectRoutedToNode(project, node));
}

/**
 * Get the count of projects routed to a specific node.
 *
 * @param projects - All projects
 * @param node - The node to count projects for
 * @returns Number of projects on this node
 */
export function getProjectCountForNode(projects: ProjectInfo[], node: NodeInfo): number {
  return getProjectsForNode(projects, node).length;
}

/**
 * Get the count of unassigned projects (projects without nodeId).
 * These projects run on the local in-process runtime.
 *
 * @param projects - All projects
 * @returns Number of unassigned projects
 */
export function getUnassignedProjectCount(projects: ProjectInfo[]): number {
  return projects.filter((project) => project.nodeId === undefined || project.nodeId === null).length;
}
