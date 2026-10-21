import { extractShareInput } from "@/lib/link-input";
import type { InputType, ParsedInput } from "@/lib/types";

export const INPUT_TYPE_LABELS: Record<InputType, string> = {
  bvid: "BV 号",
  av: "AV 号",
  b23: "b23 短链",
  ep: "番剧 EP",
  ss: "番剧 Season",
  url: "链接",
};

const BV_PATTERN = /BV[0-9A-Za-z]{10}/i;

/** 服务端 /api/bili/resolve 不可用时的本地降级解析 */
export function parseInputLocally(raw: string): ParsedInput | null {
  const input = extractShareInput(raw);
  if (!input) return null;

  const bv = input.match(BV_PATTERN);
  if (bv) return { type: "bvid", bvid: bv[0] };

  const ep = input.match(/ep(\d+)/i);
  if (ep) return { type: "ep", epId: Number(ep[1]), url: input };

  const ss = input.match(/ss(\d+)/i);
  if (ss) return { type: "ss", seasonId: Number(ss[1]), url: input };

  const av = input.match(/av(\d+)/i) ?? input.match(/^\d+$/);
  if (av) {
    const digits = av[1] ?? av[0];
    const aid = Number(digits);
    if (Number.isSafeInteger(aid) && aid > 0) return { type: "av", aid };
  }

  if (/(?:b23\.tv|bili2233\.(?:cn|com))\//i.test(input)) return { type: "b23", url: input };
  if (/^https?:\/\//i.test(input)) return { type: "url", url: input };

  return null;
}

/** 跳转首页时使用的 input 参数 */
export function videoInputOf(parsed: ParsedInput, fallback: string): string {
  return parsed.bvid ?? fallback;
}
