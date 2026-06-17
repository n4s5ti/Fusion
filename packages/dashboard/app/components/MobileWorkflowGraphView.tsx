import { ChevronDown, ChevronRight, GitBranch, Pencil } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { MobileWorkflowNodeSummary } from "./workflow-mobile-graph";
import "./MobileWorkflowGraphView.css";

interface MobileWorkflowGraphViewProps {
  rows: MobileWorkflowNodeSummary[];
  selectedNodeId?: string | null;
  selectedEdgeId?: string | null;
  onSelectNode: (id: string) => void;
  onSelectEdge: (id: string) => void;
  onCreateConnection?: (source: string, target: string) => void;
}

function NodeRow({
  row,
  depth,
  selectedNodeId,
  selectedEdgeId,
  onSelectNode,
  onSelectEdge,
  onCreateConnection,
}: {
  row: MobileWorkflowNodeSummary;
  depth: number;
  selectedNodeId?: string | null;
  selectedEdgeId?: string | null;
  onSelectNode: (id: string) => void;
  onSelectEdge: (id: string) => void;
  onCreateConnection?: (source: string, target: string) => void;
}) {
  const { t } = useTranslation("app");
  const hasChildren = row.children.length > 0;
  const [expanded, setExpanded] = useState(depth === 0);
  const [connectPickerOpen, setConnectPickerOpen] = useState(false);
  const selected = selectedNodeId === row.id;
  const connectionTargets = row.connectionTargets ?? [];
  const canCreateConnection = !!onCreateConnection && row.editable && connectionTargets.length > 0;

  return (
    <div className="mobile-wf-node-group">
      <div
        className={`mobile-wf-node-row${selected ? " mobile-wf-node-row--selected" : ""}`}
        style={{ ["--mobile-wf-depth" as string]: String(depth) }}
        data-testid={`mobile-wf-node-${row.id}`}
      >
        <button
          type="button"
          className="mobile-wf-node-main"
          onClick={() => onSelectNode(row.id)}
          aria-current={selected ? "true" : undefined}
        >
          <span className="mobile-wf-node-kind">{row.kind}</span>
          <span className="mobile-wf-node-text">
            <span className="mobile-wf-node-title">{row.label}</span>
            {row.summary ? <span className="mobile-wf-node-summary">{row.summary}</span> : null}
          </span>
          {row.editable ? <Pencil size={14} aria-hidden /> : null}
        </button>
        {hasChildren ? (
          <div className="mobile-wf-node-actions">
            <button
              type="button"
              className="mobile-wf-node-expand"
              aria-expanded={expanded}
              aria-label={expanded ? t("common.collapse", "Collapse") : t("common.expand", "Expand")}
              onClick={() => setExpanded((value) => !value)}
            >
              {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </button>
          </div>
        ) : null}
      </div>
      {canCreateConnection ? (
        <div
          className="mobile-wf-node-actions mobile-wf-node-actions--connect"
          style={{ ["--mobile-wf-depth" as string]: String(depth) }}
        >
          <button
            type="button"
            className="mobile-wf-connect-button"
            data-testid={`mobile-wf-connect-${row.id}`}
            aria-expanded={connectPickerOpen}
            onClick={() => setConnectPickerOpen((value) => !value)}
          >
            <GitBranch size={14} aria-hidden />
            <span>{t("workflowNodes.mobileConnect", "Connect")}</span>
          </button>
        </div>
      ) : null}
      {/*
        FNXC:WorkflowEditor 2026-06-16-23:45:
        Mobile and compact simple editing do not render the React Flow canvas, so drag-to-connect handles are unavailable. This picker gives touch users a non-canvas path while the editor still owns edge validation and construction.
      */}
      {canCreateConnection && connectPickerOpen ? (
        <div
          className="mobile-wf-connect-picker"
          style={{ ["--mobile-wf-depth" as string]: String(depth) }}
        >
          <label className="mobile-wf-connect-label" htmlFor={`mobile-wf-connect-target-${row.id}`}>
            {t("workflowNodes.mobileConnectTarget", "Target node")}
          </label>
          <select
            id={`mobile-wf-connect-target-${row.id}`}
            className="input mobile-wf-connect-select"
            data-testid={`mobile-wf-connect-target-${row.id}`}
            defaultValue=""
            onChange={(event) => {
              const target = event.currentTarget.value;
              if (!target) return;
              onCreateConnection?.(row.id, target);
              event.currentTarget.value = "";
              setConnectPickerOpen(false);
            }}
          >
            <option value="">{t("workflowNodes.mobileConnectChooseTarget", "Choose a target…")}</option>
            {connectionTargets.map((target) => (
              <option key={target.id} value={target.id}>
                {target.label} ({target.kind})
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {(row.columnName || row.outgoing.length > 0) && (
        <div
          className="mobile-wf-node-meta"
          style={{ ["--mobile-wf-depth" as string]: String(depth) }}
        >
          {row.columnName ? <span className="mobile-wf-column-chip">{row.columnName}</span> : null}
          {row.outgoing.map((edge) => (
            <button
              key={edge.id}
              type="button"
              className={`mobile-wf-edge-chip${selectedEdgeId === edge.id ? " mobile-wf-edge-chip--selected" : ""}`}
              data-testid={`mobile-wf-edge-${edge.id}`}
              onClick={() => onSelectEdge(edge.id)}
            >
              <GitBranch size={12} aria-hidden />
              <span>{edge.label}</span>
              <span className="mobile-wf-edge-target">{edge.targetLabel}</span>
            </button>
          ))}
        </div>
      )}
      {hasChildren && expanded ? (
        <div className="mobile-wf-node-children">
          {row.children.map((child) => (
            <NodeRow
              key={child.id}
              row={child}
              depth={depth + 1}
              selectedNodeId={selectedNodeId}
              selectedEdgeId={selectedEdgeId}
              onSelectNode={onSelectNode}
              onSelectEdge={onSelectEdge}
              onCreateConnection={onCreateConnection}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function MobileWorkflowGraphView({
  rows,
  selectedNodeId,
  selectedEdgeId,
  onSelectNode,
  onSelectEdge,
  onCreateConnection,
}: MobileWorkflowGraphViewProps) {
  const { t } = useTranslation("app");
  if (rows.length === 0) {
    return (
      <div className="mobile-wf-graph-empty" data-testid="mobile-wf-graph-empty">
        {t("workflowNodes.mobileGraphEmpty", "No graph nodes yet.")}
      </div>
    );
  }

  return (
    <div className="mobile-wf-graph" data-testid="mobile-wf-graph">
      {rows.map((row) => (
        <NodeRow
          key={row.id}
          row={row}
          depth={0}
          selectedNodeId={selectedNodeId}
          selectedEdgeId={selectedEdgeId}
          onSelectNode={onSelectNode}
          onSelectEdge={onSelectEdge}
          onCreateConnection={onCreateConnection}
        />
      ))}
    </div>
  );
}
