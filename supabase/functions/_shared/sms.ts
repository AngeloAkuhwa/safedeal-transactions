// Pluggable SMS delivery. No provider configured => no-op (the code is NEVER
// returned to the caller; it is only ever delivered out-of-band).
export type SmsProvider = "termii" | "twilio" | "none";

export interface SmsConfig {
  provider: SmsProvider;
  termiiApiKey?: string;
  termiiSenderId?: string;
  twilioAccountSid?: string;
  twilioAuthToken?: string;
  twilioFromNumber?: string;
}

export interface SmsResult {
  delivered: boolean;
  provider: SmsProvider;
  /** Present only when delivery failed or no provider is configured. Never contains the message body. */
  reason?: string;
}

type EnvReader = (key: string) => string | undefined;

export function resolveSmsConfig(getEnv: EnvReader): SmsConfig {
  const raw = (getEnv("SMS_PROVIDER") || "").trim().toLowerCase();

  if (raw === "termii") {
    return {
      provider: "termii",
      termiiApiKey: getEnv("TERMII_API_KEY"),
      termiiSenderId: getEnv("TERMII_SENDER_ID") || "SafeDeal",
    };
  }
  if (raw === "twilio") {
    return {
      provider: "twilio",
      twilioAccountSid: getEnv("TWILIO_ACCOUNT_SID"),
      twilioAuthToken: getEnv("TWILIO_AUTH_TOKEN"),
      twilioFromNumber: getEnv("TWILIO_FROM_NUMBER"),
    };
  }
  return { provider: "none" };
}

export function isSmsConfigured(config: SmsConfig): boolean {
  if (config.provider === "termii") return !!config.termiiApiKey;
  if (config.provider === "twilio") {
    return !!(config.twilioAccountSid && config.twilioAuthToken && config.twilioFromNumber);
  }
  return false;
}

/**
 * Send an SMS through the configured provider.
 * Returns delivered:false when no provider is configured. Callers must still
 * succeed (the OTP stays retrievable only via the buyer's phone / support).
 */
export async function sendSms(
  to: string,
  body: string,
  getEnv: EnvReader = (k) => Deno.env.get(k),
): Promise<SmsResult> {
  const config = resolveSmsConfig(getEnv);

  if (!isSmsConfigured(config)) {
    return { delivered: false, provider: config.provider, reason: "sms_provider_not_configured" };
  }

  try {
    if (config.provider === "termii") {
      const res = await fetch("https://api.ng.termii.com/api/sms/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to,
          from: config.termiiSenderId,
          sms: body,
          type: "plain",
          channel: "generic",
          api_key: config.termiiApiKey,
        }),
      });
      if (!res.ok) {
        return { delivered: false, provider: "termii", reason: `provider_http_${res.status}` };
      }
      return { delivered: true, provider: "termii" };
    }

    // twilio
    const auth = btoa(`${config.twilioAccountSid}:${config.twilioAuthToken}`);
    const form = new URLSearchParams({ To: to, From: config.twilioFromNumber!, Body: body });
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${config.twilioAccountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: form.toString(),
      },
    );
    if (!res.ok) {
      return { delivered: false, provider: "twilio", reason: `provider_http_${res.status}` };
    }
    return { delivered: true, provider: "twilio" };
  } catch (e) {
    // Never log the message body: it carries the OTP.
    console.error("[sendSms] provider error:", e instanceof Error ? e.message : "unknown");
    return { delivered: false, provider: config.provider, reason: "provider_error" };
  }
}
