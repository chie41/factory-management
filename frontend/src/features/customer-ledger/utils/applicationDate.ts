export function applicationDateTime(value: Date | string = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  })
    .format(new Date(value))
    .replace(" ", "T");
}
export const applicationDate = (value: Date | string = new Date()) =>
  applicationDateTime(value).slice(0, 10);
