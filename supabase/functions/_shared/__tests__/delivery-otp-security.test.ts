import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  evaluateDeliveryConfirmGuard,
  isDeliveryAlreadyDone,
  REQUIRED_MONEY_STATUS,
} from "../delivery-confirm";
import { resolveSmsConfig, isSmsConfigured, sendSms } from "../sms";

const lookupSrc = readFileSync(
  resolve(process.cwd(), "supabase/functions/delivery-token-lookup/index.ts"),
  "utf8",
);
const confirmSrc = readFileSync(
  resolve(process.cwd(), "supabase/functions/delivery-token-confirm/index.ts"),
  "utf8",
);

describe("send_otp response never carries the code", () => {
  it("does not include a dev_otp (or any code) field in the response body", () => {
    expect(lookupSrc).not.toMatch(/dev_otp/);
    // The only response payloads must not reference the generated `code` variable.
    const responseFields = lookupSrc.match(/jsonResponse\(\{[\s\S]*?\}\)/g) ?? [];
    for (const block of responseFields) {
      expect(block).not.toMatch(/\bcode\b\s*[,:]/);
    }
  });

  it("never logs the plaintext code", () => {
    const logLines = lookupSrc.split("\n").filter((l) => /console\.(log|warn|error|info)/.test(l));
    for (const line of logLines) {
      expect(line).not.toMatch(/\$\{code\}/);
      expect(line).not.toMatch(/:\s*\$\{?code/);
    }
  });

  it("delivers the code through the pluggable SMS helper only", () => {
    expect(lookupSrc).toMatch(/import \{ sendSms \} from "\.\.\/_shared\/sms\.ts"/);
    expect(lookupSrc).toMatch(/await sendSms\(/);
    expect(lookupSrc).toMatch(/sms_delivered: smsResult\.delivered/);
  });
});

describe("pluggable SMS provider", () => {
  it("reports not-configured when no provider env is set", async () => {
    const cfg = resolveSmsConfig(() => undefined);
    expect(cfg.provider).toBe("none");
    expect(isSmsConfigured(cfg)).toBe(false);
    const result = await sendSms("+2348012345678", "SafeDeal: 123456", () => undefined);
    expect(result.delivered).toBe(false);
    expect(result.reason).toBe("sms_provider_not_configured");
  });

  it("recognises termii and twilio credentials", () => {
    const termii = resolveSmsConfig((k) =>
      ({ SMS_PROVIDER: "termii", TERMII_API_KEY: "k" } as Record<string, string>)[k],
    );
    expect(isSmsConfigured(termii)).toBe(true);

    const twilioPartial = resolveSmsConfig((k) =>
      ({ SMS_PROVIDER: "twilio", TWILIO_ACCOUNT_SID: "sid" } as Record<string, string>)[k],
    );
    expect(isSmsConfigured(twilioPartial)).toBe(false);

    const twilio = resolveSmsConfig((k) =>
      ({
        SMS_PROVIDER: "twilio",
        TWILIO_ACCOUNT_SID: "sid",
        TWILIO_AUTH_TOKEN: "tok",
        TWILIO_FROM_NUMBER: "+15550001111",
      } as Record<string, string>)[k],
    );
    expect(isSmsConfigured(twilio)).toBe(true);
  });
});

describe("delivery confirm money guard", () => {
  it("refuses when money_status is not funds_held_in_escrow", () => {
    for (const money of [null, "awaiting_payment", "funds_released", "refunded", "frozen"]) {
      expect(
        evaluateDeliveryConfirmGuard({ status: "seller_dispatched", money_status: money }),
      ).toMatchObject({ error: "funds_not_held", http: 409 });
    }
  });

  it("allows the confirmable statuses when funds are held", () => {
    for (const status of ["payment_secured", "seller_preparing_delivery", "seller_dispatched"]) {
      expect(
        evaluateDeliveryConfirmGuard({ status, money_status: REQUIRED_MONEY_STATUS }),
      ).toBeNull();
    }
  });

  it("refuses statuses outside the confirmable set", () => {
    expect(
      evaluateDeliveryConfirmGuard({ status: "awaiting_payment", money_status: REQUIRED_MONEY_STATUS }),
    ).toMatchObject({ error: "invalid_status", http: 409 });
  });

  it("treats delivered/terminal states as already done", () => {
    expect(isDeliveryAlreadyDone("delivered_awaiting_verification")).toBe(true);
    expect(isDeliveryAlreadyDone("completed")).toBe(true);
    expect(isDeliveryAlreadyDone("seller_dispatched")).toBe(false);
  });
});

describe("delivery-token-confirm hardening", () => {
  it("applies the money guard before transitioning", () => {
    expect(confirmSrc).toMatch(/evaluateDeliveryConfirmGuard\(\{ status: tx\.status, money_status: tx\.money_status \}\)/);
    expect(confirmSrc).toMatch(/money_status/);
  });

  it("optimistic-locks the final transition and does not force-write on zero rows", () => {
    expect(confirmSrc).toMatch(/\.eq\("status", "seller_dispatched"\)/);
    expect(confirmSrc).toMatch(/\.eq\("money_status", "funds_held_in_escrow"\)/);
    expect(confirmSrc).toMatch(/if \(!finalUpdated\)/);
  });

  it("keeps the hashed buyer OTP verification", () => {
    expect(confirmSrc).toMatch(/submittedHash !== otpRecord\.code_hash/);
  });
});
