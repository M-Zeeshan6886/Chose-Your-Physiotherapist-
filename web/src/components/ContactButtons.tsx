"use client";
import { useState } from "react";
import { getInquiryId, postJson } from "@/lib/client";

type Contact = { contactId: string; channel: "whatsapp" | "call"; url: string; contactsToday: number; dailyLimit: number };
type Channel = "whatsapp" | "call";

/**
 * WhatsApp / Call buttons. The number is revealed only AFTER the server accepts the contact
 * (daily limit, phone check from the 3rd contact, billing).
 */
export default function ContactButtons({ therapistId, compact = false }: { therapistId: string; compact?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Contact | null>(null);
  const [pending, setPending] = useState<Channel | null>(null); // waiting for phone check
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [otpBusy, setOtpBusy] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);

  async function contact(channel: Channel) {
    setBusy(true); setError(null); setDone(null);
    const r = await postJson<Contact>("/api/contact", { therapistId, channel, inquiryId: getInquiryId() });
    setBusy(false);
    if (r.ok) {
      setDone(r.data); setPending(null);
      if (channel === "call") window.location.href = r.data.url;
      else window.open(r.data.url, "_blank", "noopener");
    } else if (r.error.code === "otp_required") {
      setPending(channel); setSent(false); setCode(""); setOtpError(null);
    } else {
      setError(r.error.message);
    }
  }

  async function sendCode() {
    setOtpBusy(true); setOtpError(null);
    const r = await postJson<{ devCode?: string }>("/api/otp/request", { phone });
    setOtpBusy(false);
    if (r.ok) { setSent(true); setDevCode(r.data.devCode ?? null); } else setOtpError(r.error.message);
  }

  async function verify() {
    setOtpBusy(true); setOtpError(null);
    const r = await postJson<{ verified: boolean }>("/api/otp/verify", { phone, code });
    setOtpBusy(false);
    if (r.ok && pending) await contact(pending);
    else if (!r.ok) setOtpError(r.error.message);
  }

  const size = compact ? "btn small" : "btn";
  return (
    <div>
      <div className="row">
        <button className={`${size} wa`} disabled={busy} onClick={() => contact("whatsapp")}>
          {busy ? "Please wait…" : "WhatsApp"}
        </button>
        <button className={`${size} secondary`} disabled={busy} onClick={() => contact("call")}>Call</button>
      </div>

      {error && <div className="alert err" role="alert">{error}</div>}
      {done && (
        <div className="alert ok" role="status">
          {done.channel === "whatsapp" ? (
            <>WhatsApp should open in a new tab. <a href={done.url} target="_blank" rel="noopener noreferrer">Open WhatsApp</a>.</>
          ) : (
            <>Calling now. <a href={done.url}>Tap here if nothing happened</a>.</>
          )}
          <div className="small">You have contacted {done.contactsToday} of {done.dailyLimit} physiotherapists today.</div>
        </div>
      )}

      {pending && (
        <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="otp-title">
          <div className="modal">
            <h2 id="otp-title">Verify your phone number</h2>
            <p className="muted small">To protect physiotherapists from spam, we ask for a quick phone check from your 3rd contact in a day.</p>
            {!sent ? (
              <>
                <label htmlFor={`ph-${therapistId}`}>Mobile number</label>
                <input id={`ph-${therapistId}`} type="tel" inputMode="tel" placeholder="0300 1234567" value={phone} onChange={(e) => setPhone(e.target.value)} />
                <div className="row" style={{ marginTop: 14 }}>
                  <button className="btn" onClick={sendCode} disabled={otpBusy || phone.length < 10}>{otpBusy ? "Sending…" : "Send code"}</button>
                  <button className="btn secondary" onClick={() => setPending(null)}>Cancel</button>
                </div>
              </>
            ) : (
              <>
                {devCode && <div className="notice small" style={{ marginBottom: 10 }}>Test mode: your code is <b>{devCode}</b> (not shown in production).</div>}
                <label htmlFor={`cd-${therapistId}`}>6 digit code</label>
                <input id={`cd-${therapistId}`} type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
                <div className="row" style={{ marginTop: 14 }}>
                  <button className="btn" onClick={verify} disabled={otpBusy || code.length !== 6}>{otpBusy ? "Checking…" : "Verify and continue"}</button>
                  <button className="btn secondary" onClick={() => setPending(null)}>Cancel</button>
                </div>
              </>
            )}
            {otpError && <div className="alert err" role="alert">{otpError}</div>}
          </div>
        </div>
      )}
    </div>
  );
}
