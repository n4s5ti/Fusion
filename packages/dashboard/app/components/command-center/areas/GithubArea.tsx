/*
FNXC:CommandCenterGithub 2026-06-18-00:00:
The GitHub Command Center area visualizes only locally persisted task-store data: filed issues come from `githubTracking.issue`, and fixed issues are source-GitHub tasks currently in `done` using `updatedAt` as the documented completion approximation. No GitHub API or `gh` CLI calls belong in this rendering path.
*/
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { GithubIssueAnalytics } from "@fusion/core";
import type { DateRange } from "../DateRangePicker";
import { Bar } from "../charts/Bar";
import { Sparkline } from "../charts/Sparkline";
import { AreaShell } from "./AreaShell";
import { useAnalyticsArea } from "./useAnalyticsArea";
import { formatCount } from "./areaShared";

export function GithubArea({ range }: { range: DateRange }) {
  const { t } = useTranslation("app");
  const { data, isLoading, error } = useAnalyticsArea<GithubIssueAnalytics>(
    "/command-center/github",
    range,
  );

  const daily = useMemo(() => data?.daily ?? [], [data?.daily]);
  const byRepo = useMemo(() => data?.byRepo ?? [], [data?.byRepo]);
  const filedValues = useMemo(() => daily.map((d) => d.filed), [daily]);
  const fixedValues = useMemo(() => daily.map((d) => d.fixed), [daily]);
  const maxDaily = useMemo(
    () => Math.max(0, ...filedValues, ...fixedValues),
    [filedValues, fixedValues],
  );
  const repoBars = useMemo(
    () =>
      byRepo.slice(0, 12).map((repo) => ({
        label: repo.repo,
        value: repo.filed + repo.fixed,
        valueLabel: t("commandCenter.github.repoValue", "{{filed}} filed / {{fixed}} fixed", {
          filed: formatCount(repo.filed),
          fixed: formatCount(repo.fixed),
        }),
      })),
    [byRepo, t],
  );

  const filed = data?.filed ?? 0;
  const fixed = data?.fixed ?? 0;
  const net = data?.net ?? filed - fixed;
  const isEmpty = !data || (filed === 0 && fixed === 0);
  const hasDailyTrend = daily.length > 0;
  const hasRepoBreakdown = repoBars.length > 0;

  return (
    <AreaShell
      testId="github"
      isLoading={isLoading}
      error={error}
      isEmpty={isEmpty}
      emptyMessage={t("commandCenter.github.empty", "No GitHub issue activity in the selected range.")}
    >
      <div className="cc-area-section">
        <h3 className="cc-area-section-title">{t("commandCenter.github.totalsTitle", "GitHub issue flow")}</h3>
        <div className="cc-stat-grid">
          <div className="card cc-stat-card" data-testid="cc-github-filed">
            <div className="cc-stat-label">{t("commandCenter.github.filed", "Filed by Fusion")}</div>
            <div className="cc-stat-value">{formatCount(filed)}</div>
          </div>
          <div className="card cc-stat-card" data-testid="cc-github-fixed">
            <div className="cc-stat-label">{t("commandCenter.github.fixed", "Fixed by Fusion")}</div>
            <div className="cc-stat-value">{formatCount(fixed)}</div>
            <span className="cc-stat-sub">
              {t("commandCenter.github.fixedApproximation", "Uses done tasks updated in range")}
            </span>
          </div>
          <div className="card cc-stat-card" data-testid="cc-github-net">
            <div className="cc-stat-label">{t("commandCenter.github.net", "Net")}</div>
            <div className="cc-stat-value">{formatCount(net)}</div>
          </div>
        </div>
      </div>

      {hasDailyTrend ? (
        <div className="cc-area-section" data-testid="cc-github-daily-trend">
          <h3 className="cc-area-section-title">{t("commandCenter.github.dailyTrend", "Filed vs fixed trend")}</h3>
          <div className="cc-stat-grid">
            <div className="card cc-stat-card">
              <div className="cc-stat-label">{t("commandCenter.github.filedTrend", "Filed")}</div>
              <Sparkline
                values={filedValues}
                max={maxDaily}
                ariaLabel={t("commandCenter.github.filedTrend", "Filed")}
              />
            </div>
            <div className="card cc-stat-card">
              <div className="cc-stat-label">{t("commandCenter.github.fixedTrend", "Fixed")}</div>
              <Sparkline
                values={fixedValues}
                max={maxDaily}
                ariaLabel={t("commandCenter.github.fixedTrend", "Fixed")}
              />
            </div>
          </div>
        </div>
      ) : null}

      {hasRepoBreakdown ? (
        <div className="cc-area-section" data-testid="cc-github-by-repo">
          <h3 className="cc-area-section-title">{t("commandCenter.github.byRepo", "By repository")}</h3>
          <Bar data={repoBars} ariaLabel={t("commandCenter.github.byRepo", "By repository")} />
        </div>
      ) : null}
    </AreaShell>
  );
}
