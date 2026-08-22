import {
  Bell,
  CreditCard,
  Truck,
  Scale,
  Clock,
  Mail,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import type { NotificationPreferences } from "@/services/profile.service";

interface Props {
  preferences: NotificationPreferences;
  onToggle: (key: keyof NotificationPreferences, value: boolean) => void;
}

const prefItems: {
  key: keyof NotificationPreferences;
  label: string;
  description: string;
  icon: React.ElementType;
}[] = [
  { key: "payment_updates", label: "Payment Updates", description: "Notifications about payments and funds", icon: CreditCard },
  { key: "delivery_updates", label: "Delivery Updates", description: "Tracking and delivery notifications", icon: Truck },
  { key: "dispute_updates", label: "Dispute Updates", description: "Dispute status and resolution alerts", icon: Scale },
  { key: "verification_reminders", label: "Verification Reminders", description: "Reminders to verify received items", icon: Clock },
  { key: "system_alerts", label: "System Alerts", description: "Important system and security alerts", icon: Bell },
  { key: "marketing_messages", label: "Marketing Messages", description: "Tips, updates and special offers", icon: Mail },
];

export function NotificationPreferencesSection({ preferences, onToggle }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">
          Notification Preferences
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {prefItems.map((item) => (
          <div
            key={item.key}
            className="flex items-center justify-between rounded-lg border p-3"
          >
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center">
                <item.icon className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">{item.label}</p>
                <p className="text-xs text-muted-foreground">{item.description}</p>
              </div>
            </div>
            <Switch
              checked={preferences[item.key]}
              onCheckedChange={(checked) => onToggle(item.key, checked)}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
