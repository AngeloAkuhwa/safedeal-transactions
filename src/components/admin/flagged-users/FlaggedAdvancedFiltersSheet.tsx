import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { FlaggedFilters } from "./FlaggedFilters";
import type { FlaggedQuery } from "@/services/admin-flagged-users.service";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  value: FlaggedQuery;
  search: string;
  onChange: (next: FlaggedQuery) => void;
  onSearchChange: (v: string) => void;
  onApply: () => void;
  onReset: () => void;
}

export function FlaggedAdvancedFiltersSheet(props: Props) {
  const { open, onOpenChange, ...rest } = props;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="bg-slate-950 border-slate-800 text-white max-h-[90dvh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-white">Filters</SheetTitle>
        </SheetHeader>
        <div className="mt-3 [&>div]:!block">
          <FlaggedFilters {...rest} onApply={() => { rest.onApply(); onOpenChange(false); }} />
        </div>
      </SheetContent>
    </Sheet>
  );
}