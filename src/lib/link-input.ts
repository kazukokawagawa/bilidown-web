/**
 * B站链接 / 视频编号提取。
 *
 * B站 App 的分享文案通常是「【中文标题】 https://b23.tv/xxxx 复制此链接…」，
 * 剪贴板监听或手动粘贴时整段文本都会进入解析；旧实现把整段当作 URL，
 * 一旦带中文就构造出非法地址（https://【标题】https://b23.tv/…）导致解析失败。
 * 这里在解析前先把真正的链接抠出来，中文标题、全角标点与尾缀都不再影响结果。
 */

/** 文本中的完整 URL（先匹配到空白，再由 trimUrlTail 裁掉中文/全角尾缀）。 */
const URL_IN_TEXT = /https?:\/\/[^\s]+/i;
/** 不带协议头的 b23 短链（前面不能紧贴字母，避免误伤其它域名）。 */
const BARE_SHORT_LINK = /(?:^|[^0-9A-Za-z.])((?:b23\.tv|bili2233\.cn|bili2233\.com)\/[0-9A-Za-z]+)/i;
/** URL 合法字符集：遇到中文、全角符号、书名号等即视为链接结束。 */
const URL_SAFE_CHAR = /[A-Za-z0-9\-._~:/?#\[\]@!$&'()*+,;=%]/;
/** 视频编号：允许夹在中文中间（如「【标题】BV1xx411c7mD 分享」）。 */
const VIDEO_ID = /(?:BV[0-9A-Za-z]{10}|av\d{1,12}|ep\d{1,12}|ss\d{1,12})/i;
/** B 站域名（用于判断一段文本是不是 B 站链接）。 */
const BILIBILI_HOST = /^https?:\/\/[^\s]*?(?:bilibili\.com|b23\.tv|bili2233\.(?:cn|com))\//i;

/** 裁掉 URL 末尾的中文、全角标点与包裹用的右括号。 */
function trimUrlTail(value: string): string {
  let end = value.length;
  while (end > 0 && !URL_SAFE_CHAR.test(value[end - 1])) end -= 1;
  while (end > 0 && (value[end - 1] === ")" || value[end - 1] === "]")) end -= 1;
  return value.slice(0, end);
}

/**
 * 从任意文本中抽出可解析的目标：
 * 完整链接 > 裸 b23 短链 > 原文本（交给 BV/av/ep/ss 规则继续识别）。
 */
export function extractShareInput(input: string): string {
  const text = (input ?? "").replace(/\u3000/g, " ").trim();
  if (!text) return "";
  const url = URL_IN_TEXT.exec(text);
  if (url) {
    const trimmed = trimUrlTail(url[0]);
    if (trimmed.length > "https://".length) return trimmed;
  }
  const short = BARE_SHORT_LINK.exec(text);
  if (short) return "https://" + trimUrlTail(short[1]);
  return text;
}

/** 提取 B 站链接或视频编号；找不到返回 null（用于剪贴板/协议链接等入口）。 */
export function extractBilibiliTarget(input: string | null | undefined): string | null {
  if (!input) return null;
  const value = extractShareInput(input);
  if (!value) return null;
  if (BILIBILI_HOST.test(value)) return value;
  const id = VIDEO_ID.exec(value);
  return id ? id[0] : null;
}
