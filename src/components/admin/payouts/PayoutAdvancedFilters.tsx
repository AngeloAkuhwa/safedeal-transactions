export function PayoutAdvancedFilters() {
  const fields: { label: string; options: string[] }[] = [
    { label: "Status", options: ["All Statuses", "Pending", "Processing", "Failed", "Completed", "Blocked"] },
    { label: "Date Range", options: ["Last 7 days", "Last 30 days", "Last 3 months", "Custom Range"] },
    { label: "Amount Range", options: ["Any Amount", "₦0 - ₦10,000", "₦10,000 - ₦100,000", "₦100,000 - ₦1,000,000", "₦1,000,000+"] },
    { label: "Bank Verification", options: ["All Accounts", "Verified", "Unverified", "Pending Verification"] },
    { label: "Quick Filters", options: ["None", "Failed Only", "Blocked Only", "High Priority"] },
  ];
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
      {fields.map((f) => (
        <div key={f.label}>
          <label className="text-muted-foreground text-xs font-medium mb-2 block">{f.label}</label>
          <select className="w-full p-2.5 bg-muted/40 border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-emerald-500">
            {f.options.map((o) => <option key={o}>{o}</option>)}
          </select>
        </div>
      ))}
    </div>
  );
}