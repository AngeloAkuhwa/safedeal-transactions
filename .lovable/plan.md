

# Integrate Twilio Connector for Real SMS OTP

## Overview

Replace the dev-mode OTP (code displayed on screen) with real SMS delivery via the Twilio connector, which is built into Lovable. The implementation uses a provider-agnostic pattern so switching to Termii or another provider later requires changing only the SMS sending function.

## Setup

1. **Connect Twilio** — use the `standard_connectors--connect` tool to link Twilio to this project, which provides `TWILIO_API_KEY` and `LOVABLE_API_KEY` as environment variables automatically.

2. **Store the Twilio "From" phone number** — add a secret `TWILIO_FROM_NUMBER` with the Twilio phone number to send SMS from (e.g. `+1234567890`).

## Code Change

**File:** `supabase/functions/verify-phone/index.ts`

Replace lines 147-157 (the dev-mode OTP block) with a provider-abstracted SMS sender:

```typescript
// ── SMS Provider Abstraction ──
// Currently: Twilio via Lovable connector gateway
// To switch providers: replace sendSms() body only

async function sendSms(to: string, message: string): Promise<{ success: boolean; error?: string }> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const TWILIO_API_KEY = Deno.env.get("TWILIO_API_KEY");
  const TWILIO_FROM = Deno.env.get("TWILIO_FROM_NUMBER");

  if (!LOVABLE_API_KEY || !TWILIO_API_KEY || !TWILIO_FROM) {
    // No SMS provider configured — fall back to dev mode
    return { success: false, error: "no_provider" };
  }

  const GATEWAY_URL = "https://connector-gateway.lovable.dev/twilio";

  const res = await fetch(`${GATEWAY_URL}/Messages.json`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": TWILIO_API_KEY,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      To: to,
      From: TWILIO_FROM,
      Body: message,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    console.error("Twilio SMS error:", res.status, errBody);
    return { success: false, error: `SMS delivery failed [${res.status}]` };
  }

  return { success: true };
}
```

Then in the `send_otp` block, replace the dev OTP return with:

```typescript
const smsMessage = `Your SafeDeal code is ${code}. Expires in 10 minutes. Do not share.`;
const smsResult = await sendSms(normalizedPhone, smsMessage);

if (smsResult.error === "no_provider") {
  // Dev fallback — no SMS provider configured
  console.log(`[DEV] OTP for ${normalizedPhone}: ${code}`);
  return jsonResponse({
    success: true,
    expires_in: 600,
    message: "OTP sent (dev mode)",
    dev_otp: code,
  });
}

if (!smsResult.success) {
  return jsonResponse({ error: "Failed to send SMS. Please try again." }, 500);
}

return jsonResponse({
  success: true,
  expires_in: 600,
  message: "OTP sent to your phone",
});
```

## Why This Design

- **Provider-agnostic**: Only `sendSms()` knows about Twilio. To switch to Termii later, replace that one function.
- **Graceful dev fallback**: If Twilio keys are not set, falls back to showing the OTP on screen — local development still works.
- **No frontend changes needed**: The `PhoneVerificationModal` already handles both cases (shows dev OTP banner only when `dev_otp` is in the response).

## Files Summary

| File | Change |
|---|---|
| `supabase/functions/verify-phone/index.ts` | Add `sendSms()` abstraction with Twilio gateway call + dev fallback |

## Steps to Execute

1. Connect Twilio connector via `standard_connectors--connect`
2. Add `TWILIO_FROM_NUMBER` secret
3. Update edge function code
4. Deploy and test

