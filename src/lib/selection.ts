import type { CollectionEpisode, VideoPage } from "./types";

/**
 * 批量下载条目去重键：bvid + cid + page。
 * 分P 与合集/番剧剧集可能指向同一集（例如「合集里的多P视频」），
 * 建任务与体积预估都按该键去重，保证界面数量与实际任务数一致。
 */
export function selectionKey(bvid: string, cid: number, page: number): string {
  return bvid + ":" + String(cid) + ":" + String(page);
}

/** 去重后的选中条目（分P 优先）；duration 单位秒，未知为 0。 */
export interface SelectedItem {
  key: string;
  duration: number;
}

/** 把已勾选的分P 与合集/番剧剧集合并去重（顺序：分P 在前，与批量建任务一致）。 */
export function collectSelectedItems(
  videoBvid: string,
  pages: VideoPage[],
  episodes: CollectionEpisode[],
): SelectedItem[] {
  const items = new Map<string, SelectedItem>();
  for (const page of pages) {
    const key = selectionKey(videoBvid, page.cid, page.page);
    if (!items.has(key)) items.set(key, { key, duration: page.duration });
  }
  for (const episode of episodes) {
    const key = selectionKey(episode.bvid, episode.cid, episode.page);
    if (!items.has(key)) items.set(key, { key, duration: episode.duration });
  }
  return Array.from(items.values());
}
