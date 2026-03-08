import { useState, useEffect } from "react";
import { Clock, Calendar } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { format } from "date-fns";

interface VerificationCountdownProps {
  deadlineAt: string;
  deliveredAt: string | null;
}

function calcRemaining(deadline: Date) {
  const diff = Math.max(0, deadline.getTime() - Date.now());
  const hours = Math.floor(diff / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  const seconds = Math.floor((diff % 60_000) / 1_000);
  const pct = Math.min(100, Math.max(0, (diff / (72 * 3_600_000)) * 100));
  return { hours, minutes, seconds, expired: diff === 0, pct };
}

export function VerificationCountdown({ deadlineAt, deliveredAt }: VerificationCountdownProps) {
  const deadline = new Date(deadlineAt);
  const [rem, setRem] = useState(() => calcRemaining(deadline));

  useEffect(() => {
    const id = setInterval(() => setRem(calcRemaining(deadline)), 1_000);
    return () => clearInterval(id);
  }, [deadlineAt]);

  return (
    <Card className="border-warning/30 bg-gradient-to-br from-warning/5 via-warning/3 to-transparent overflow-hidden">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-warning/10 flex items-center justify-center">
            <Clock className="h-5 w-5 text-warning" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Verification Window</h3>
            <p className="text-xs text-muted-foreground">
              {rem.expired
                ? "Window has expired"
                : "Time remaining to verify your item"}
            </p>
          </div>
        </div>

        {/* Countdown */}
        <div className="flex items-center justify-center gap-4">
          {[
            { val: rem.hours, label: "Hours" },
            { val: rem.minutes, label: "Minutes" },
            { val: rem.seconds, label: "Seconds" },
          ].map((u) => (
            <div key={u.label} className="text-center">
              <div className="text-3xl font-bold tabular-nums text-foreground">
                {String(u.val).padStart(2, "0")}
              </div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {u.label}
              </div>
            </div>
          ))}
        </div>

        {/* Progress */}
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-warning transition-all duration-1000"
            style={{ width: `${rem.pct}%` }}
          />
        </div>

        {/* Dates */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          {deliveredAt && (
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              Delivered {format(new Date(deliveredAt), "MMM dd, yyyy")}
            </span>
          )}
          <span>Deadline: {format(deadline, "MMM dd, yyyy HH:mm")}</span>
        </div>
      </CardContent>
    </Card>
  );
}
