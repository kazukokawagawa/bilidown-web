/** Small display formatting helpers shared by all pages. */

export function formatBytes(bytes: number | null | undefined, digits = 1): string {
  if (!bytes || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / Math.pow(1024, i);
  return value.toFixed(i === 0 ? 0 : digits) + " " + units[i];
}

export function formatSpeed(bytesPerSecond: number | null | undefined): string {
  if (!bytesPerSecond || bytesPerSecond <= 0) return "0 B/s";
  return formatBytes(bytesPerSecond) + "/s";
}

export function formatCount(count: number | null | undefined): string {
  if (!count || count <= 0) return "0";
  if (count >= 100000000) return (count / 100000000).toFixed(1) + " 亿";
  if (count >= 10000) return (count / 10000).toFixed(1) + " 万";
  return String(count);
}

export function formatDuration(seconds: number | null | undefined): string {
  const total = Math.max(0, Math.floor(seconds || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => (n < 10 ? "0" + n : String(n));
  return h > 0 ? h + ":" + pad(m) + ":" + pad(s) : m + ":" + pad(s);
}

export function formatEta(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0 || !Number.isFinite(seconds)) return "--";
  if (seconds < 60) return Math.ceil(seconds) + " 秒";
  if (seconds < 3600) return Math.ceil(seconds / 60) + " 分钟";
  return (seconds / 3600).toFixed(1) + " 小时";
}

export function formatDate(timestamp: number | null | undefined): string {
  if (!timestamp) return "--";
  const d = new Date(timestamp);
  const pad = (n: number) => (n < 10 ? "0" + n : String(n));
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
}

export function formatUnixDate(seconds: number | null | undefined): string {
  if (!seconds) return "--";
  return formatDate(seconds * 1000);
}

/** Strip the <em class="keyword">...</em> tags bilibili puts in search results. */
export function stripHtml(text: string | null | undefined): string {
  if (!text) return "";
  return text.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');
}
