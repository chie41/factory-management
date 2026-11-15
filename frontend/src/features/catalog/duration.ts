export function parseDuration(text: string): number | null {
  const value = text.trim().toLowerCase();
  if (!value) return null;
  let result: number;
  if (/^\d+p?$/.test(value)) result = Number(value.replace(/p$/, ""));
  else {
    const match = /^(\d+)h(?:(\d{1,2}))?$/.exec(value);
    if (!match || Number(match[2] ?? 0) >= 60)
      throw new Error("Thời lượng không hợp lệ");
    result = Number(match[1]) * 60 + Number(match[2] ?? 0);
  }
  if (!Number.isSafeInteger(result) || result < 0 || result > 2147483647)
    throw new Error("Thời lượng không hợp lệ");
  return result;
}
export const durationText = (minutes?: number | null) =>
  minutes == null
    ? "Chưa cấu hình thời gian"
    : minutes < 60
      ? minutes + "p"
      : Math.floor(minutes / 60) + "h" + (minutes % 60 || "");
