import { useState, useEffect } from "react";
import { Clock } from "lucide-react";
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
  return { hours, minutes, seconds, expired: diff === 0 };
}

export function VerificationCountdown({ deadlineAt, deliveredAt }: VerificationCountdownProps) {
  const deadline = new Date(deadlineAt);
  const [rem, setRem] = useState(() => calcRemaining(deadline));

  useEffect(() => {
    const id = setInterval(() => setRem(calcRemaining(deadline)), 1_000);
    return () => clearInterval(id);
  }, [deadlineAt]);

  const timerStr = `${String(rem.hours).padStart(2, "0")}:${String(rem.minutes).padStart(2, "0")}:${String(rem.seconds).padStart(2, "0")}`;

  return (
    <div className="bg-gradient-to-br from-warning to-warning/80 rounded-2xl shadow-xl p-8 text-warning-foreground">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
        <div className="flex items-start gap-4">
          <div className="w-16 h-16 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center shrink-0">
            <Clock className="h-8 w-8" />
          </div>
          <div>
            <h2 className="text-2xl font-bold mb-2">Verification Countdown</h2>
            <p className="text-sm opacity-80 mb-1">
              {rem.expired
                ? "Verification window has expired"
                : "Funds will auto-release if no action is taken"}
            </p>
            {deliveredAt && (
              <p className="text-xs opacity-60">
                Delivered on {format(new Date(deliveredAt), "MMM dd, yyyy 'at' h:mm a")}
              </p>
            )}
          </div>
        </div>

        <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border-2 border-white/30">
          <div className="text-center">
            <div className="text-5xl font-bold mb-2 tabular-nums">{timerStr}</div>
            <div className="flex justify-center gap-8 text-sm opacity-80">
              <span>Hours</span>
              <span>Minutes</span>
              <span>Seconds</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
