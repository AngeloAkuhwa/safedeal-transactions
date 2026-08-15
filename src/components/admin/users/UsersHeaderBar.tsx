import { useState } from "react";
import { Download, Loader2, UserPlus, Users as UsersIcon } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { type UserDirectoryQuery } from "@/services/admin-users-directory.service";
import { runExport } from "@/services/admin-escrow.service";
import { PresenceCountChip } from "./PresenceDot";

interface Props {
  totalUsers: number;
  query: UserDirectoryQuery;
  onlineCount?: number;
  offlineCount?: number;
  globalOnline?: number;
}

export function UsersHeaderBar({ totalUsers, query, onlineCount = 0, offlineCount = 0 }: Props) {
  const [busy, setBusy] = useState(false);
  const onExport = async () => {
    setBusy(true);
    try {
      toast({ title: "Preparing export…", description: "Generating CSV in the background." });
      const params: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(query)) {
        if (k === "page" || k === "page_size") continue;
        if (v !== undefined && v !== null && v !== "") params[k] = v;
      }
      const { url, job } = await runExport("users_directory", params);
      const a = document.createElement("a");
      a.href = url;
      a.download = `user-directory-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
      toast({ title: "Export ready", description: `${job.row_count?.toLocaleString() ?? 0} rows downloaded.` });
    } catch (e) {
      toast({ title: "Export failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <header className="sticky top-0 z-sticky hidden border-b border-slate-800 bg-slate-900/95 backdrop-blur px-4 py-5 md:px-8 lg:block">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-4 flex-wrap">
          <div>
            <h2 className="text-white text-xl font-semibold">User Directory</h2>
            <p className="text-slate-400 text-sm mt-0.5">Search and manage all platform users</p>
          </div>
          <div className="flex items-center gap-2 ml-0 md:ml-4">
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-emerald-400 font-semibold text-sm">Live</span>
            </div>
            <div className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg">
              <UsersIcon className="h-3 w-3 text-slate-400" />
              <span className="text-slate-300 text-sm">{totalUsers.toLocaleString()} total users</span>
            </div>
            <PresenceCountChip
              online={onlineCount}
              offline={offlineCount}
              className="hidden md:inline-flex"
            />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button type="button" onClick={onExport} disabled={busy} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-all flex items-center gap-2 text-sm font-medium disabled:opacity-60 min-h-11">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            <span className="hidden sm:inline">{busy ? "Exporting…" : "Export Users"}</span>
          </button>
          <button type="button" onClick={() => toast({ title: "Coming soon", description: "User creation is on the roadmap." })} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-all flex items-center gap-2 text-sm font-medium min-h-11">
            <UserPlus className="h-4 w-4" />
            <span className="hidden sm:inline">Add User</span>
          </button>
        </div>
      </div>
    </header>
  );
}