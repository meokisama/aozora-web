import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { BookCheck, CalendarDays, Flame, Trophy, Type } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { tierStatus, formatCompact } from "@/lib/stats/aggregate";

interface MilestoneCardProps {
  icon: LucideIcon;
  label: string;
  value: number;
  format: (n: number) => string;
  status: ReturnType<typeof tierStatus>;
}

/** An achievement track: current value + a row of threshold pills (next is ringed). */
function MilestoneCard({ icon: Icon, label, value, format, status }: MilestoneCardProps) {
  const { t } = useTranslation();
  return (
    <Card size="sm" className="gap-2">
      <div className="flex items-center gap-2 px-3 text-muted-foreground">
        <Icon className="size-3.5" />
        <span className="text-[11px] font-medium uppercase tracking-wider">{label}</span>
        <span className="ml-auto text-[11px] tabular-nums">
          {status.achievedCount}/{status.tiers.length}
        </span>
      </div>
      <div className="flex flex-wrap gap-1 px-3">
        {status.tiers.map((t) => (
          <span
            key={t.threshold}
            className={cn(
              "px-1.5 py-0.5 text-[10px] tabular-nums",
              t.achieved
                ? "bg-primary text-primary-foreground"
                : t.threshold === status.next
                  ? "bg-muted text-foreground ring-1 ring-primary/60"
                  : "bg-muted/60 text-muted-foreground/70",
            )}
          >
            {format(t.threshold)}
          </span>
        ))}
      </div>
      <p className="px-3 text-[11px] text-muted-foreground">
        {status.next != null ? t("milestones.next", { current: format(value), next: format(status.next) }) : t("milestones.allReached", { current: format(value) })}
      </p>
    </Card>
  );
}

const asInt = (n: number) => String(n);

/** Achievement milestones across four tracks: streak uses all-time best, the rest lifetime totals. */
interface MilestonesProps {
  totalChars: number;
  activeDays: number;
  bestStreak: number;
  booksFinished: number;
}

export function Milestones({ totalChars, activeDays, bestStreak, booksFinished }: MilestonesProps) {
  const { t } = useTranslation();
  const tracks = useMemo(
    () => [
      {
        key: "chars",
        icon: Type,
        label: t("milestones.characters"),
        value: totalChars,
        format: formatCompact,
        thresholds: [10_000, 50_000, 100_000, 500_000, 1_000_000, 5_000_000, 10_000_000],
      },
      { key: "streak", icon: Flame, label: t("milestones.bestStreak"), value: bestStreak, format: (n) => t("milestones.daysShort", { count: n }), thresholds: [3, 7, 14, 30, 60, 100, 365] },
      { key: "days", icon: CalendarDays, label: t("milestones.activeDays"), value: activeDays, format: asInt, thresholds: [1, 7, 30, 100, 365] },
      { key: "books", icon: BookCheck, label: t("milestones.booksFinished"), value: booksFinished, format: asInt, thresholds: [1, 5, 10, 25, 50, 100] },
    ],
    [totalChars, activeDays, bestStreak, booksFinished, t],
  );

  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Trophy className="size-3.5" />
        {t("milestones.title")}
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {tracks.map((m) => (
          <MilestoneCard key={m.key} icon={m.icon} label={m.label} value={m.value} format={m.format} status={tierStatus(m.value, m.thresholds)} />
        ))}
      </div>
    </section>
  );
}
