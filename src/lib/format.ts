// Display formatting. Times use UTC so the server and the browser render the same text.

const DATE_TIME = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "UTC",
});

const SHORT_DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export function formatDateTime(iso: string): string {
  return `${DATE_TIME.format(new Date(iso))} UTC`;
}

export function formatShortDate(iso: string): string {
  return SHORT_DATE.format(new Date(iso));
}

export function formatPercent(share: number): string {
  return `${Math.round(share * 100)}%`;
}
