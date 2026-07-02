// Consistent, locale-aware formatting (story 869dz698b). Money is stored in
// integer minor units everywhere (I-8) — convert only at the display edge.

const moneyFormatters = new Map<string, Intl.NumberFormat>();

export function money(minor: number, currency: string): string {
  let formatter = moneyFormatters.get(currency);
  if (!formatter) {
    formatter = new Intl.NumberFormat(undefined, { style: 'currency', currency });
    moneyFormatters.set(currency, formatter);
  }
  return formatter.format(minor / 100);
}

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });
const dateTimeFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

export function formatDate(iso: string): string {
  // date-only strings (YYYY-MM-DD) must not shift across timezones
  const date = iso.length === 10 ? new Date(`${iso}T00:00:00`) : new Date(iso);
  return dateFormat.format(date);
}

export function formatDateTime(iso: string): string {
  return dateTimeFormat.format(new Date(iso));
}
