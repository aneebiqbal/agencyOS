const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const usdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const pkrFormatter = new Intl.NumberFormat("en-PK", {
  style: "currency",
  currency: "PKR",
  maximumFractionDigits: 0,
});

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "2-digit",
  year: "numeric",
});

const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatCurrencyCents(value: number): string {
  return currencyFormatter.format(value / 100);
}

export function formatMoneyCents(value: number, currency: "USD" | "PKR"): string {
  const formatter = currency === "PKR" ? pkrFormatter : usdFormatter;
  return formatter.format(value / 100);
}

export function formatDate(isoUtc: string): string {
  return dateFormatter.format(new Date(isoUtc));
}

export function formatDateTime(isoUtc: string): string {
  return dateTimeFormatter.format(new Date(isoUtc));
}

export function formatPercent(value: number): string {
  return `${Number(value).toFixed(1)}%`;
}

export function formatHours(value: number): string {
  return `${Number(value).toFixed(2)} h`;
}

export function formatStatusLabel(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}
