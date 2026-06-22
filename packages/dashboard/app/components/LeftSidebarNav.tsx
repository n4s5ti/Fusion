import "./LeftSidebarNav.css";

/*
FNXC:Navigation 2026-06-19-00:00:
When the leftSidebarNav experiment is active, this component owns the non-mobile primary navigation destinations that Header previously exposed through inline and overflow view controls. Mobile remains owned by MobileNavBar, so this sidebar keeps the desktop/tablet contract only.
*/
import { useCallback, useMemo, useState, type ComponentType, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  Bot,
  Brain,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileText,
  Gauge,
  Lightbulb,
  LayoutGrid,
  List,
  Mail,
  MessageSquare,
  Plus,
  Search,
  Settings,
  Sparkles,
  Target,
  Workflow,
  Zap,
  type LucideProps,
} from "lucide-react";
import type { ProjectInfo, PluginDashboardViewEntry } from "../api";
import type { TaskView } from "../hooks/useViewState";
import { buildPluginTaskViewId } from "../plugins/pluginViewRegistry";
import { getPluginNavIcon } from "./pluginNavIcon";

/*
FNXC:Navigation 2026-06-22-00:30:
Import Tasks uses the GitHub brand mark. lucide-react in this repo does not export a `Github` icon, so render the octocat glyph as a LucideProps-compatible component (size defaults to 16, currentColor fill) usable wherever a sidebar entry icon is expected.
*/
function GithubIcon({ size = 16, ...props }: LucideProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.203 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.942.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
    </svg>
  );
}

export interface LeftSidebarExperimentalFeatures {
  insights?: boolean;
  memoryView?: boolean;
  devServerView?: boolean;
  researchView?: boolean;
  evalsView?: boolean;
  goalsView?: boolean;
}

interface SidebarNavEntry {
  id: string;
  label: string;
  view?: TaskView;
  isActive: boolean;
  icon: ComponentType<LucideProps>;
  testId: string;
  badge?: number;
  dot?: "pending" | "online";
  onSelect: () => void;
}

/*
FNXC:Navigation 2026-06-20-00:00:
The experimental sidebar default is intentionally narrower than the original 256px layout so desktop/tablet navigation preserves more board content while keeping the existing resize clamps.

FNXC:Navigation 2026-06-21-00:00:
The minimum resizable width is lowered so users can recover board/content space without forcing full rail collapse. Keep the floor at the narrowest label-legible width; below this point users should switch to collapse/rail mode to preserve icons, badges, and labels.
*/
const LEFT_SIDEBAR_DEFAULT_WIDTH = 224;
const LEFT_SIDEBAR_MIN_WIDTH = 160;
const LEFT_SIDEBAR_MAX_WIDTH = 384;
const LEFT_SIDEBAR_WIDTH_STORAGE_KEY = "fusion:left-sidebar-width";
const LEFT_SIDEBAR_COLLAPSED_STORAGE_KEY = "fusion:left-sidebar-collapsed";

function clampSidebarWidth(width: number): number {
  return Math.max(LEFT_SIDEBAR_MIN_WIDTH, Math.min(LEFT_SIDEBAR_MAX_WIDTH, width));
}

function readStoredSidebarWidth(): number {
  if (typeof window === "undefined") return LEFT_SIDEBAR_DEFAULT_WIDTH;
  const stored = window.localStorage.getItem(LEFT_SIDEBAR_WIDTH_STORAGE_KEY);
  const parsed = stored ? Number(stored) : NaN;
  return Number.isFinite(parsed) ? clampSidebarWidth(parsed) : LEFT_SIDEBAR_DEFAULT_WIDTH;
}

function readStoredCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(LEFT_SIDEBAR_COLLAPSED_STORAGE_KEY) === "true";
}

function persistSidebarWidth(width: number): void {
  try {
    window.localStorage.setItem(LEFT_SIDEBAR_WIDTH_STORAGE_KEY, String(width));
  } catch {
    // Ignore storage errors.
  }
}

function persistCollapsed(collapsed: boolean): void {
  try {
    window.localStorage.setItem(LEFT_SIDEBAR_COLLAPSED_STORAGE_KEY, String(collapsed));
  } catch {
    // Ignore storage errors.
  }
}

export interface LeftSidebarNavProps {
  view: TaskView;
  onChangeView: (view: TaskView) => void;
  onNewTask?: () => void;
  onOpenSettings?: () => void;
  todosEnabled?: boolean;
  mailboxUnreadCount?: number;
  mailboxPendingApprovalCount?: number;
  chatHasUnreadResponse?: boolean;
  experimentalFeatures?: LeftSidebarExperimentalFeatures;
  pluginDashboardViews?: PluginDashboardViewEntry[];
  showAgentsTab?: boolean;
  showSkillsTab?: boolean;
  projects?: ProjectInfo[];
  currentProject?: ProjectInfo | null;
  onSelectProject?: (project: ProjectInfo) => void;
  onViewAllProjects?: () => void;
  footerVisible?: boolean;
}

function formatCount(count: number): string {
  return count > 99 ? "99+" : String(count);
}

function getPluginEntryView(entry: PluginDashboardViewEntry): TaskView {
  if (entry.pluginId === "fusion-plugin-dependency-graph" && entry.view.viewId === "graph") {
    return "graph";
  }
  return buildPluginTaskViewId(entry.pluginId, entry.view.viewId);
}

function isPluginEntryActive(view: TaskView, entry: PluginDashboardViewEntry): boolean {
  const pluginTaskView = buildPluginTaskViewId(entry.pluginId, entry.view.viewId);
  return view === pluginTaskView || (view === "graph" && entry.pluginId === "fusion-plugin-dependency-graph" && entry.view.viewId === "graph");
}

function sortPluginViews(entries: PluginDashboardViewEntry[]): PluginDashboardViewEntry[] {
  return [...entries].sort((a, b) => (a.view.order ?? Number.MAX_SAFE_INTEGER) - (b.view.order ?? Number.MAX_SAFE_INTEGER));
}

/*
FNXC:Navigation 2026-06-20-00:00:
Experimental sidebar plugin labels must read as plain navigation nouns without an appended "view" suffix. The Compound Engineering plugin is intentionally shortened to "Compound" so its label fits the narrower sidebar.
*/
function getSidebarPluginLabel(entry: PluginDashboardViewEntry): string {
  return entry.pluginId === "fusion-plugin-compound-engineering" ? "Compound" : entry.view.label;
}

export function LeftSidebarNav({
  view,
  onChangeView,
  onNewTask,
  onOpenSettings,
  mailboxUnreadCount = 0,
  mailboxPendingApprovalCount = 0,
  chatHasUnreadResponse = false,
  experimentalFeatures,
  pluginDashboardViews = [],
  showAgentsTab = false,
  showSkillsTab = false,
  footerVisible = false,
}: LeftSidebarNavProps) {
  const { t } = useTranslation("app");
  const [sidebarWidth, setSidebarWidth] = useState(readStoredSidebarWidth);
  const [isCollapsed, setIsCollapsed] = useState(readStoredCollapsed);

  const toggleCollapsed = useCallback(() => {
    setIsCollapsed((current) => {
      const next = !current;
      persistCollapsed(next);
      return next;
    });
  }, []);

  const handleResizeStart = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (isCollapsed) return;
    event.preventDefault();
    event.stopPropagation();

    const resizeHandle = event.currentTarget;
    if (typeof resizeHandle.setPointerCapture === "function") {
      resizeHandle.setPointerCapture(event.pointerId);
    }

    const startX = event.clientX;
    const startWidth = sidebarWidth;
    let latestWidth = startWidth;
    document.body.style.userSelect = "none";

    const onPointerMove = (moveEvent: PointerEvent) => {
      const nextWidth = clampSidebarWidth(startWidth + moveEvent.clientX - startX);
      latestWidth = nextWidth;
      setSidebarWidth(nextWidth);
    };

    const onPointerUp = (upEvent: PointerEvent) => {
      if (typeof resizeHandle.releasePointerCapture === "function") {
        resizeHandle.releasePointerCapture(upEvent.pointerId);
      }
      document.body.style.userSelect = "";
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
      persistSidebarWidth(latestWidth);
    };

    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
  }, [isCollapsed, sidebarWidth]);

  const handleResizeKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (isCollapsed) return;
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const step = event.shiftKey ? 48 : 16;
    const delta = event.key === "ArrowLeft" ? -step : step;
    const nextWidth = clampSidebarWidth(sidebarWidth + delta);
    setSidebarWidth(nextWidth);
    persistSidebarWidth(nextWidth);
  }, [isCollapsed, sidebarWidth]);

  const newTaskLabel = t("nav.newTask", "New Task");

  /*
  FNXC:Navigation 2026-06-22-12:00:
  All plugin dashboard views are flattened into a single sorted pool. Placement no longer splits the sidebar into primary/secondary sections; the sidebar is now ONE explicitly-ordered list (FN navigation reorder). The dependency-graph and compound-engineering plugin views are hoisted into fixed positions (graph after List, compound after Goals), so they must be excluded from the trailing "remaining plugin views" append to avoid duplication.
  */
  const sortedPluginViews = useMemo(
    () => sortPluginViews(pluginDashboardViews),
    [pluginDashboardViews],
  );

  const mapPluginEntry = useCallback(
    (entry: PluginDashboardViewEntry): SidebarNavEntry => {
      const PluginIcon = getPluginNavIcon(entry.view.icon);
      const targetView = getPluginEntryView(entry);
      return {
        id: `plugin-${entry.pluginId}-${entry.view.viewId}`,
        label: getSidebarPluginLabel(entry),
        view: targetView,
        isActive: isPluginEntryActive(view, entry),
        icon: PluginIcon,
        testId: `sidebar-nav-plugin-${entry.pluginId}-${entry.view.viewId}`,
        onSelect: () => onChangeView(targetView),
      };
    },
    [view, onChangeView],
  );

  const graphPluginEntry = sortedPluginViews.find(
    (entry) => entry.pluginId === "fusion-plugin-dependency-graph" && entry.view.viewId === "graph",
  );
  const compoundPluginEntry = sortedPluginViews.find(
    (entry) => entry.pluginId === "fusion-plugin-compound-engineering",
  );
  const remainingPluginViews = sortedPluginViews.filter(
    (entry) => entry !== graphPluginEntry && entry !== compoundPluginEntry,
  );

  /*
  FNXC:Navigation 2026-06-22-12:00:
  Single explicit sidebar order (top to bottom): board, list, graph, agents, chat, mailbox, planning, missions, goals, compound, automation, import, workflows, insight, research, command-center, documents (Artifacts), skills, memory, evals, then any remaining plugin views in their sorted order.

  Dev Server is intentionally absent: it moved to the right dock. Secrets and Todos remain omitted (they live in the right dock / mobile More-sheet / Header overflow).

  Flag gates preserved verbatim from the prior layout: agents (showAgentsTab), goals (goalsView), insight (insights), research (researchView), skills (showSkillsTab), memory (memoryView), evals (evalsView). graph and compound are skipped when their plugin view is absent.
  */
  const navEntries: SidebarNavEntry[] = [
    /*
    FNXC:Navigation 2026-06-22-01:15:
    Command Center is labeled "Dashboard" and sits at the very top of the sidebar. The board remains the default view on load (useViewState initial taskView is still "board").
    */
    {
      id: "command-center",
      label: t("nav.commandCenter", "Dashboard"),
      view: "command-center",
      isActive: view === "command-center",
      icon: Gauge,
      testId: "sidebar-nav-command-center",
      onSelect: () => onChangeView("command-center"),
    },
    {
      id: "board",
      label: t("nav.board", "Board"),
      view: "board",
      isActive: view === "board",
      icon: LayoutGrid,
      testId: "sidebar-nav-board",
      onSelect: () => onChangeView("board"),
    },
    {
      id: "list",
      label: t("nav.list", "List"),
      view: "list",
      isActive: view === "list",
      icon: List,
      testId: "sidebar-nav-list",
      onSelect: () => onChangeView("list"),
    },
    ...(graphPluginEntry ? [mapPluginEntry(graphPluginEntry)] : []),
    ...(showAgentsTab
      ? [
          {
            id: "agents",
            label: t("nav.agents", "Agents"),
            view: "agents" as TaskView,
            isActive: view === "agents",
            icon: Bot,
            testId: "sidebar-nav-agents",
            onSelect: () => onChangeView("agents"),
          },
        ]
      : []),
    {
      id: "chat",
      label: t("nav.chat", "Chat"),
      view: "chat",
      isActive: view === "chat",
      icon: MessageSquare,
      testId: "sidebar-nav-chat",
      dot: chatHasUnreadResponse && view !== "chat" ? "pending" : undefined,
      onSelect: () => onChangeView("chat"),
    },
    {
      id: "mailbox",
      label: t("nav.mailbox", "Mailbox"),
      view: "mailbox",
      isActive: view === "mailbox",
      icon: Mail,
      testId: "sidebar-nav-mailbox",
      badge: mailboxUnreadCount > 0 ? mailboxUnreadCount : undefined,
      dot: view !== "mailbox" && mailboxPendingApprovalCount > 0 ? "pending" : view !== "mailbox" && mailboxUnreadCount > 0 ? "online" : undefined,
      onSelect: () => onChangeView("mailbox"),
    },
    /*
    FNXC:Navigation 2026-06-22-00:50:
    Skills and Memory sit directly after Mailbox (still flag-gated by showSkillsTab / memoryView).
    */
    ...(showSkillsTab
      ? [{ id: "skills", label: t("header.skillsView", "Skills"), view: "skills" as TaskView, isActive: view === "skills", icon: Zap, testId: "sidebar-nav-skills", onSelect: () => onChangeView("skills") }]
      : []),
    ...(experimentalFeatures?.memoryView
      ? [{ id: "memory", label: t("header.memoryView", "Memory"), view: "memory" as TaskView, isActive: view === "memory", icon: Brain, testId: "sidebar-nav-memory", onSelect: () => onChangeView("memory") }]
      : []),
    {
      id: "planning",
      /*
      FNXC:Navigation 2026-06-21-00:00:
      FN-6886 makes Planning Mode a first-class sidebar destination.
      */
      label: t("nav.planning", "Planning"),
      view: "planning",
      isActive: view === "planning",
      icon: Lightbulb,
      testId: "sidebar-nav-planning",
      onSelect: () => onChangeView("planning"),
    },
    {
      id: "missions",
      label: t("nav.missions", "Missions"),
      view: "missions",
      isActive: view === "missions",
      icon: Target,
      testId: "sidebar-nav-missions",
      onSelect: () => onChangeView("missions"),
    },
    {
      id: "documents",
      /*
      FNXC:Navigation 2026-06-21-18:25:
      FN-6890 renames the top-level Documents label to Artifacts while preserving the documents view id and sidebar-nav-documents test id.
      */
      label: t("nav.documents", "Artifacts"),
      view: "documents",
      isActive: view === "documents",
      icon: FileText,
      testId: "sidebar-nav-documents",
      onSelect: () => onChangeView("documents"),
    },
    ...(experimentalFeatures?.goalsView
      ? [{ id: "goals", label: t("header.goalsView", "Goals"), view: "goalsView" as TaskView, isActive: view === "goalsView", icon: Target, testId: "sidebar-nav-goals", onSelect: () => onChangeView("goalsView") }]
      : []),
    ...(compoundPluginEntry ? [mapPluginEntry(compoundPluginEntry)] : []),
    /*
    FNXC:Navigation 2026-06-22-00:00:
    Workflows, Import Tasks, and Automations are left-sidebar destinations that load in the main content area (not modals). Import Tasks is the GitHub import view (labeled "Import Tasks", not "Import from GitHub").
    */
    {
      id: "automations",
      label: t("nav.automations", "Automations"),
      view: "automations" as TaskView,
      isActive: view === "automations",
      icon: Clock,
      testId: "sidebar-nav-automations",
      onSelect: () => onChangeView("automations"),
    },
    {
      id: "import-tasks",
      label: t("nav.importTasks", "Import Tasks"),
      view: "import-tasks" as TaskView,
      isActive: view === "import-tasks",
      icon: GithubIcon,
      testId: "sidebar-nav-import-tasks",
      onSelect: () => onChangeView("import-tasks"),
    },
    {
      id: "workflows",
      label: t("nav.workflows", "Workflows"),
      view: "workflows" as TaskView,
      isActive: view === "workflows",
      icon: Workflow,
      testId: "sidebar-nav-workflows",
      onSelect: () => onChangeView("workflows"),
    },
    ...(experimentalFeatures?.insights
      ? [{ id: "insights", label: t("header.insightsView", "Insights"), view: "insights" as TaskView, isActive: view === "insights", icon: Sparkles, testId: "sidebar-nav-insights", onSelect: () => onChangeView("insights") }]
      : []),
    ...(experimentalFeatures?.researchView
      ? [{ id: "research", label: t("header.researchView", "Research"), view: "research" as TaskView, isActive: view === "research", icon: Search, testId: "sidebar-nav-research", onSelect: () => onChangeView("research") }]
      : []),
    ...(experimentalFeatures?.evalsView
      ? [{ id: "evals", label: t("header.evalsView", "Evals"), view: "evals" as TaskView, isActive: view === "evals", icon: Target, testId: "sidebar-nav-evals", onSelect: () => onChangeView("evals") }]
      : []),
    ...remainingPluginViews.map(mapPluginEntry),
  ];

  const renderEntry = (entry: SidebarNavEntry) => {
    const Icon = entry.icon;
    return (
      <button
        key={entry.id}
        type="button"
        className={`left-sidebar-nav__item${entry.isActive ? " left-sidebar-nav__item--active" : ""}`}
        aria-label={entry.label}
        aria-current={entry.isActive && entry.view ? "page" : undefined}
        title={entry.label}
        data-testid={entry.testId}
        onClick={entry.onSelect}
      >
        <span className="left-sidebar-nav__icon-wrap">
          <Icon size={16} />
          {entry.dot ? <span className={`status-dot status-dot--${entry.dot} left-sidebar-nav__dot`} aria-hidden="true" /> : null}
        </span>
        <span className="left-sidebar-nav__label">{entry.label}</span>
        {entry.badge ? <span className="btn-badge left-sidebar-nav__badge">{formatCount(entry.badge)}</span> : null}
      </button>
    );
  };

  return (
    <aside
      className={`left-sidebar-nav${isCollapsed ? " left-sidebar-nav--collapsed" : ""}${footerVisible ? " left-sidebar-nav--with-footer" : ""}`}
      data-testid="left-sidebar-nav"
      aria-label={t("nav.sidebarAriaLabel", "Sidebar navigation")}
      style={isCollapsed ? undefined : { width: sidebarWidth, minWidth: sidebarWidth }}
    >
      {onNewTask ? (
        <button
          type="button"
          className="btn left-sidebar-nav__item left-sidebar-nav__new-task"
          aria-label={newTaskLabel}
          title={newTaskLabel}
          data-testid="sidebar-nav-new-task"
          onClick={onNewTask}
        >
          <Plus size={16} />
          <span className="left-sidebar-nav__label">{newTaskLabel}</span>
        </button>
      ) : null}
      <nav className="left-sidebar-nav__list" aria-label={t("nav.primaryNavAriaLabel", "Primary navigation")}>
        <div className="left-sidebar-nav__section">{navEntries.map(renderEntry)}</div>
      </nav>

      <div className="left-sidebar-nav__footer">
        {/*
        FNXC:Navigation 2026-06-21-00:00:
        The sidebar collapse affordance belongs in the footer immediately above Settings, using the same row-item visual language. Expanded mode shows the Collapse label, while rail mode relies on the shared label-hiding rule so the button remains icon-only like Settings.
        */}
        <button
          type="button"
          className="btn left-sidebar-nav__item left-sidebar-nav__collapse-toggle"
          aria-label={isCollapsed ? t("nav.expandSidebar", "Expand sidebar") : t("nav.collapseSidebar", "Collapse sidebar")}
          title={isCollapsed ? t("nav.expandSidebar", "Expand sidebar") : t("nav.collapseSidebar", "Collapse sidebar")}
          aria-pressed={isCollapsed}
          data-testid="sidebar-nav-collapse-toggle"
          onClick={toggleCollapsed}
        >
          {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          <span className="left-sidebar-nav__label">{t("nav.collapse", "Collapse")}</span>
        </button>
        <button
          type="button"
          className="btn left-sidebar-nav__item left-sidebar-nav__settings"
          aria-label={t("header.settings", "Settings")}
          title={t("header.settings", "Settings")}
          data-testid="sidebar-nav-settings"
          onClick={onOpenSettings}
        >
          <Settings size={16} />
          <span className="left-sidebar-nav__label">{t("header.settings", "Settings")}</span>
        </button>
      </div>

      {!isCollapsed && (
        <div
          className="left-sidebar-nav__resize-handle"
          role="separator"
          aria-orientation="vertical"
          aria-valuemin={LEFT_SIDEBAR_MIN_WIDTH}
          aria-valuemax={LEFT_SIDEBAR_MAX_WIDTH}
          aria-valuenow={sidebarWidth}
          aria-label={t("nav.resizeSidebar", "Resize sidebar")}
          tabIndex={0}
          data-testid="sidebar-nav-resize-handle"
          onPointerDown={handleResizeStart}
          onKeyDown={handleResizeKeyDown}
        />
      )}
    </aside>
  );
}
