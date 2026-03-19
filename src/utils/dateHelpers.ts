/** Returns today's date as YYYY-MM-DD string */
export function getTodayString(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Returns yesterday's date as YYYY-MM-DD string */
export function getYesterdayString(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}
