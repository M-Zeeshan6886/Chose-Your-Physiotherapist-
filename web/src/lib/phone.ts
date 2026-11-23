/** Pakistan mobile numbers. Accepts 0300-1234567, 03001234567, +923001234567, 923001234567. Returns 923001234567 or null. */
export function normalizePkPhone(input: string): string | null {
  let d = input.replace(/[^\d+]/g, "");
  if (d.startsWith("+")) d = d.slice(1);
  if (d.startsWith("0092")) d = d.slice(2);
  if (d.startsWith("0")) d = "92" + d.slice(1);
  return /^923\d{9}$/.test(d) ? d : null;
}
