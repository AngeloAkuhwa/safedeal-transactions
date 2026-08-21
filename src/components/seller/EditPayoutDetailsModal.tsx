import { useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, CheckCircle2, AlertCircle, Shield, Info } from "lucide-react";

const NIGERIAN_BANKS = [
  { code: "044", name: "Access Bank" },
  { code: "023", name: "Citibank Nigeria" },
  { code: "063", name: "Diamond Bank" },
  { code: "050", name: "Ecobank Nigeria" },
  { code: "070", name: "Fidelity Bank" },
  { code: "011", name: "First Bank of Nigeria" },
  { code: "214", name: "First City Monument Bank" },
  { code: "058", name: "Guaranty Trust Bank" },
  { code: "030", name: "Heritage Bank" },
  { code: "301", name: "Jaiz Bank" },
  { code: "082", name: "Keystone Bank" },
  { code: "526", name: "Parallex Bank" },
  { code: "076", name: "Polaris Bank" },
  { code: "101", name: "Providus Bank" },
  { code: "221", name: "Stanbic IBTC Bank" },
  { code: "068", name: "Standard Chartered Bank" },
  { code: "232", name: "Sterling Bank" },
  { code: "100", name: "Suntrust Bank" },
  { code: "032", name: "Union Bank of Nigeria" },
  { code: "033", name: "United Bank for Africa" },
  { code: "215", name: "Unity Bank" },
  { code: "035", name: "Wema Bank" },
  { code: "057", name: "Zenith Bank" },
  { code: "999992", name: "Opay" },
  { code: "999991", name: "PalmPay" },
  { code: "999993", name: "Kuda Bank" },
  { code: "999994", name: "Moniepoint" },
];

interface EditPayoutDetailsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: {
    bank_code: string;
    bank_name: string;
    account_number: string;
    account_name: string;
  }) => Promise<void>;
  existingAccount?: {
    bank_name: string | null;
    masked_account_number: string | null;
  } | null;
}

export function EditPayoutDetailsModal({
  open, onOpenChange, onSave, existingAccount,
}: EditPayoutDetailsModalProps) {
  const [bankCode, setBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const selectedBank = NIGERIAN_BANKS.find((b) => b.code === bankCode);
  const isValid = bankCode && accountNumber.length === 10 && accountName.trim().length >= 2;

  const handleSave = async () => {
    if (!isValid || !selectedBank) return;
    setSaving(true);
    setError("");
    try {
      await onSave({
        bank_code: bankCode,
        bank_name: selectedBank.name,
        account_number: accountNumber,
        account_name: accountName.trim(),
      });
      // Reset form
      setBankCode("");
      setAccountNumber("");
      setAccountName("");
      onOpenChange(false);
    } catch (err) {
      setError((err as Error).message || "Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleClose = (val: boolean) => {
    if (!saving) {
      if (!val) {
        setBankCode("");
        setAccountNumber("");
        setAccountName("");
        setError("");
      }
      onOpenChange(val);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg">Edit Payout Details</DialogTitle>
          <DialogDescription>
            Update the bank account where released funds will be sent.
          </DialogDescription>
        </DialogHeader>

        {existingAccount?.bank_name && (
          <div className="bg-muted/50 rounded-lg p-3 flex items-start gap-2.5 text-sm">
            <Info className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-muted-foreground">
                Current account: <span className="font-medium text-foreground">{existingAccount.bank_name}</span>
                {existingAccount.masked_account_number && (
                  <>: {existingAccount.masked_account_number}</>
                )}
              </p>
            </div>
          </div>
        )}

        <div className="space-y-4 pt-2">
          {/* Bank Selector */}
          <div className="space-y-2">
            <Label htmlFor="bank">Bank</Label>
            <Select value={bankCode} onValueChange={setBankCode}>
              <SelectTrigger id="bank">
                <SelectValue placeholder="Select your bank" />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                {NIGERIAN_BANKS.map((bank) => (
                  <SelectItem key={bank.code} value={bank.code}>
                    {bank.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Account Number */}
          <div className="space-y-2">
            <Label htmlFor="account-number">Account Number</Label>
            <Input
              id="account-number"
              type="text"
              inputMode="numeric"
              maxLength={10}
              placeholder="Enter 10-digit account number"
              value={accountNumber}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, "").slice(0, 10);
                setAccountNumber(val);
              }}
            />
            {accountNumber.length > 0 && accountNumber.length < 10 && (
              <p className="text-xs text-muted-foreground">
                {10 - accountNumber.length} more digit{10 - accountNumber.length !== 1 ? "s" : ""} needed
              </p>
            )}
          </div>

          {/* Account Name */}
          <div className="space-y-2">
            <Label htmlFor="account-name">Account Name</Label>
            <Input
              id="account-name"
              type="text"
              maxLength={100}
              placeholder="Enter account holder name"
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
            />
          </div>

          {/* Trust notes */}
          <div className="space-y-2">
            <div className="flex items-start gap-2 text-xs text-muted-foreground">
              <Shield className="h-3.5 w-3.5 flex-shrink-0 mt-0.5 text-primary" />
              <span>Only masked account details are shown after saving. Full numbers are never stored.</span>
            </div>
            {existingAccount?.bank_name && (
              <div className="flex items-start gap-2 text-xs text-muted-foreground">
                <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5 text-warning" />
                <span>Changing your account may require reverification.</span>
              </div>
            )}
          </div>

          {error && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => handleClose(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              className="flex-1"
              onClick={handleSave}
              disabled={!isValid || saving}
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Saving...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Save Account
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
