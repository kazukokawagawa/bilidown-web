/** B 站 BV 号 ⇄ AV 号互转（客户端算法，无需请求接口）。 */

const XOR_CODE = BigInt("23442827791579");
const MASK_CODE = BigInt("2251799813685247");
const MAX_AID = BigInt(1) << BigInt(51);
const BASE = BigInt(58);
const TABLE = "FcwAPNKTMug3GV5Lj7EJnHpWsx4tb8haYeviqBz6rkCy12mUSDQX9RdoZf";
const BV_PATTERN = /^BV1[1-9A-HJ-NP-Za-km-z]{9}$/;

/** 归一化 BV 号输入（允许小写前缀与首尾空格），非法返回 null */
export function normalizeBv(raw: string): string | null {
  const value = raw.trim().replace(/^bv/i, "BV");
  return BV_PATTERN.test(value) ? value : null;
}

export function isValidBv(raw: string): boolean {
  return normalizeBv(raw) !== null;
}

/** BV 号 → AV 号（纯数字），格式非法返回 null */
export function bvToAv(raw: string): number | null {
  const bvid = normalizeBv(raw);
  if (!bvid) return null;

  const chars = bvid.split("");
  const swap1 = chars[3];
  chars[3] = chars[9];
  chars[9] = swap1;
  const swap2 = chars[4];
  chars[4] = chars[7];
  chars[7] = swap2;

  let tmp = BigInt(0);
  for (let index = 3; index < chars.length; index += 1) {
    const digit = TABLE.indexOf(chars[index]);
    if (digit < 0) return null;
    tmp = tmp * BASE + BigInt(digit);
  }

  const aid = Number((tmp & MASK_CODE) ^ XOR_CODE);
  return Number.isSafeInteger(aid) && aid > 0 ? aid : null;
}

/** AV 号 → BV 号，invalid 返回 null */
export function avToBv(aid: number): string | null {
  if (!Number.isSafeInteger(aid) || aid <= 0) return null;
  const bigAid = BigInt(aid);
  if (bigAid >= MAX_AID) return null;

  const bytes: string[] = ["B", "V", "1", "0", "0", "0", "0", "0", "0", "0", "0", "0"];
  let bvIndex = bytes.length - 1;
  let tmp = (MAX_AID | bigAid) ^ XOR_CODE;

  while (tmp > BigInt(0)) {
    bytes[bvIndex] = TABLE[Number(tmp % BASE)];
    tmp = tmp / BASE;
    bvIndex -= 1;
  }

  const swap1 = bytes[3];
  bytes[3] = bytes[9];
  bytes[9] = swap1;
  const swap2 = bytes[4];
  bytes[4] = bytes[7];
  bytes[7] = swap2;

  return bytes.join("");
}

/** 解析用户输入的 av 号（支持 "av123"、"123"），非法返回 null */
export function parseAvInput(raw: string): number | null {
  const match = raw.trim().match(/^(?:av)?(\d+)$/i);
  if (!match) return null;
  const aid = Number(match[1]);
  return Number.isSafeInteger(aid) && aid > 0 ? aid : null;
}
