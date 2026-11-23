/** Simple placeholder mark in the brand colours (teal + slate). Replace with the final logo when ready. */
export function LogoMark({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="cyd-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3fc6b2" />
          <stop offset="1" stopColor="#1b8f80" />
        </linearGradient>
      </defs>
      <circle cx="24" cy="24" r="22" fill="url(#cyd-g)" />
      <circle cx="24" cy="15" r="5" fill="#fff" />
      <path d="M13 32c2-8 7-12 11-12s9 4 11 12" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" />
      <path d="M9 38c8 6 22 6 30 0" fill="none" stroke="#4d5764" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** Business name; the last word is highlighted. The name itself comes from APP_NAME only. */
export function Wordmark({ name }: { name: string }) {
  const parts = name.trim().split(/\s+/);
  const last = parts.pop();
  return (
    <>
      {parts.length > 0 ? `${parts.join(" ")} ` : ""}
      <em>{last}</em>
    </>
  );
}
