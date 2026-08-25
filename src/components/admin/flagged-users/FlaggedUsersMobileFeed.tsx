import type { FlaggedUserRow } from "@/services/admin-flagged-users.service";
import { ADMIN_GROUND } from "@/components/admin/palette";
import { FlaggedUserCard } from "./FlaggedUserCard";

interface Props {
  rows: FlaggedUserRow[];
  total: number;
  page: number;
  pageSize: number;
  onOpen: (userId: string) => void;
  onPage: (n: number) => void;
}

export function FlaggedUsersMobileFeed({ rows, total, page, pageSize, onOpen, onPage }: Props) {
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="lg:hidden space-y-4">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-white font-bold">Priority Review</h3>
        <span className="text-xs text-slate-500">Showing {start}-{end} of {total.toLocaleString()}</span>
      </div>
      {rows.length === 0 ? (
        <div className={`${ADMIN_GROUND.panel} border rounded-2xl p-10 text-center text-sm text-slate-500`}>
          No flagged users match the current filters.
        </div>
      ) : (
        rows.map((r) => <FlaggedUserCard key={r.user_id} row={r} onOpen={onOpen} />)
      )}
      {total > pageSize && (
        <div className="flex items-center justify-between pt-2">
          <button type="button" onClick={() => onPage(Math.max(1, page - 1))} disabled={page <= 1} className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-sm disabled:opacity-50 min-h-11">Previous</button>
          <span className="text-slate-500 text-xs">{page} / {lastPage}</span>
          <button type="button" onClick={() => onPage(Math.min(lastPage, page + 1))} disabled={page >= lastPage} className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-sm disabled:opacity-50 min-h-11">Next</button>
        </div>
      )}
    </div>
  );
}