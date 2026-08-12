/**
 * Loose phone comparison: strips everything but digits and compares the
 * last 10 digits. Good enough to match "+7 999 123-45-67" (app input)
 * against "79991234567" (what Telegram's contact share returns) without
 * chasing exact E.164 formatting.
 */
export function phoneDigitsMatch(a: string, b: string): boolean {
  const digitsA = a.replace(/\D/g, '').slice(-10);
  const digitsB = b.replace(/\D/g, '').slice(-10);
  return digitsA.length === 10 && digitsA === digitsB;
}

/** Turns Telegram's raw "79991234567" into a stored "+79991234567". */
export function toE164(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return `+${digits}`;
}
