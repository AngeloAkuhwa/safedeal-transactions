import { Download, UserPlus, Users as UsersIcon, RefreshCw } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { exportUsersDirectory, type UserDirectoryQuery } from "@/services/admin-users-directory.service";

interface Props {
  totalUsers: number;
  query: UserDirectoryQuery;
  isFetching: boolean;
  onRefresh: () => void;
}

export function UsersHeaderBar({ totalUsers, query, isFetching, onRefresh }: Props) {
  const onExport = async () => {
    try {
      const blob = await exportUsersDirectory(query);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `user-directory-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast({ title: "Export failed", description: (e as Error).message, variant: "destructive" });
    }
  };

  return (
    <header className="sticky top-0 z-30 hidden border-b border-slate-800 bg-slate-900/95 backdrop-blur px-4 py-5 md:px-8 lg:block">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-4 flex-wrap">
          <div>
            <h2 className="text-white text-xl font-semibold flex items-center gap-2">
              <UsersIcon className="h-5 w-5 text-emerald-400" /> User Directory
            </h2>
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
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button type="button" onClick={onRefresh} disabled={isFetching} className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-all text-sm font-medium disabled:opacity-60">
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          </button>
          <button type="button" onClick={onExport} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-all flex items-center gap-2 text-sm font-medium">
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Export Users</span>
          </button>
          <button type="button" onClick={() => toast({ title: "Coming soon", description: "User creation is on the roadmap." })} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-all flex items-center gap-2 text-sm font-medium">
            <UserPlus className="h-4 w-4" />
            <span className="hidden sm:inline">Add User</span>
          </button>
        </div>
      </div>
    </header>
  );
}