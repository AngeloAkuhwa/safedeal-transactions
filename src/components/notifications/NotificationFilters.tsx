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
    <Card className="p-4 shadow-lg">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex flex-col sm:flex-row gap-3 flex-1">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search notifications..."
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={type} onValueChange={onTypeChange}>
            <SelectTrigger className="w-full sm:w-[200px]">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              {typeOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center space-x-2">
          <Checkbox
            id="unread-only"
            checked={unreadOnly}
            onCheckedChange={(checked) => onUnreadOnlyChange(checked === true)}
          />
          <label
            htmlFor="unread-only"
            className="text-sm font-medium text-foreground cursor-pointer select-none"
          >
            Unread only
          </label>
        </div>
      </div>
    </Card>
  );
}
