import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";

interface NotificationFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  type: string;
  onTypeChange: (value: string) => void;
  unreadOnly: boolean;
  onUnreadOnlyChange: (value: boolean) => void;
}

const typeOptions = [
  { value: "all", label: "All Types" },
  { value: "payments", label: "Payments" },
  { value: "transaction_updates", label: "Transaction Updates" },
  { value: "delivery_updates", label: "Delivery Updates" },
  { value: "verification_reminders", label: "Verification Reminders" },
  { value: "disputes", label: "Disputes" },
  { value: "system_alerts", label: "System Alerts" },
];

export function NotificationFilters({
  search,
  onSearchChange,
  type,
  onTypeChange,
  unreadOnly,
  onUnreadOnlyChange,
}: NotificationFiltersProps) {
  return (
    <Card className="p-2.5 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search notifications..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-8 h-11 text-xs"
          />
        </div>
        <Select value={type} onValueChange={onTypeChange}>
          <SelectTrigger className="h-11 text-xs sm:w-48">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            {typeOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value} className="text-xs">
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1.5 sm:pl-2 sm:border-l sm:border-border">
          <Checkbox
            id="unread-only"
            checked={unreadOnly}
            onCheckedChange={(checked) => onUnreadOnlyChange(checked === true)}
            className=""
          />
          <label
            htmlFor="unread-only"
            className="text-xs font-medium text-foreground cursor-pointer select-none min-h-11 inline-flex items-center"
          >
            Unread only
          </label>
        </div>
      </div>
    </Card>
  );
}
