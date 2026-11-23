import { getConfig } from "./config";

/**
 * ONE interface for sending codes. Development prints to the server log.
 * When the owner picks a real provider (WhatsApp Business, local SMS, Twilio), add a new
 * case here and a value for OTP_PROVIDER in config.ts. Nothing else changes.
 */
export async function sendOtp(phone: string, code: string): Promise<void> {
  const provider = getConfig().OTP_PROVIDER;
  switch (provider) {
    case "console":
      console.log(`[OTP:console] phone=${phone} code=${code}`);
      return;
  }
}
