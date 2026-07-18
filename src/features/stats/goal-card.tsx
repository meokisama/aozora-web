import { useTranslation } from "react-i18next";
import { Target } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatCompact } from "@/lib/stats/aggregate";
import { DAILY_GOAL_OPTIONS } from "@/stores/stats-prefs-store";

/** A circular progress ring for today's goal completion. */
function GoalRing({ pct, label, sub }: { pct: number; label: React.ReactNode; sub?: React.ReactNode }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, pct));
  return (
    <div className="relative flex size-24 shrink-0 items-center justify-center">
      <svg viewBox="0 0 80 80" className="size-24 -rotate-90">
        <circle cx="40" cy="40" r={r} fill="none" strokeWidth="7" className="stroke-muted" />
        <circle
          cx="40"
          cy="40"
          r={r}
          fill="none"
          strokeWidth="7"
          strokeLinecap="round"
          className={cn(clamped >= 1 ? "stroke-amber-500 dark:stroke-amber-400" : "stroke-primary")}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - clamped)}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-base font-semibold tabular-nums">{label}</span>
        {sub && <span className="text-[10px] text-muted-foreground">{sub}</span>}
      </div>
    </div>
  );
}

/** The "Daily goal" column: progress ring, goal-meeting streak, and target picker. */
interface GoalCardProps {
  dailyGoal: number;
  setDailyGoal: (goal: number) => void;
  todayChars: number;
  goalPct: number;
  goalStreak: { current: number; longest: number };
}

export function GoalCard({ dailyGoal, setDailyGoal, todayChars, goalPct, goalStreak }: GoalCardProps) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-3 lg:col-span-1">
      <div className="flex min-h-7 items-center">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t("goal.dailyGoal")}</h2>
      </div>
      <Card size="sm" className="flex-1 justify-center">
        <div className="flex items-center gap-5 px-3 py-1">
          <GoalRing pct={goalPct} label={dailyGoal > 0 ? `${Math.round(goalPct * 100)}%` : "—"} sub={dailyGoal > 0 ? t("goal.today") : t("goal.off")} />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <Target className="size-3.5 text-muted-foreground" />
              <span className="text-xs">
                {dailyGoal > 0
                  ? t("goal.todayProgress", { current: formatCompact(todayChars), target: formatCompact(dailyGoal) })
                  : t("goal.setTarget")}
              </span>
            </div>
            {dailyGoal > 0 && (
              <p className="text-[11px] text-muted-foreground">
                {goalStreak.current > 0
                  ? t("goal.streakSummary", { count: goalStreak.current, best: goalStreak.longest })
                  : t("goal.bestStreak", { count: goalStreak.longest })}
              </p>
            )}
            <Select value={String(dailyGoal)} onValueChange={(v) => setDailyGoal(Number(v))}>
              <SelectTrigger size="sm" className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DAILY_GOAL_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={String(o.value)}>
                    {o.value === 0 ? t("options.dailyGoal.off") : t("options.dailyGoal.chars", { count: o.value })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>
    </div>
  );
}
