"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { api, getErrorMessage } from "@/lib/api-client";
import type {
  Codec,
  CollectionEpisode,
  CollectionSection,
  CreateTaskInput,
  DownloadTask,
  ParsedInput,
  QualityOption,
  StreamDetail,
  VideoCollection,
  VideoInfo,
  VideoPage,
  VideoResponse,
} from "@/lib/types";

function uniqueCodecs(qualities: QualityOption[], qn: number): Codec[] {
  const codecs: Codec[] = [];
  for (const quality of qualities) {
    if (quality.qn === qn && !codecs.includes(quality.codec)) {
      codecs.push(quality.codec);
    }
  }
  return codecs;
}

function firstPageOf(video: VideoInfo): VideoPage | null {
  if (video.pages.length === 0) return null;
  const first = video.pages.find((page) => page.page === 1);
  return first ?? video.pages[0];
}

function sortPages(pages: VideoPage[]): VideoPage[] {
  return [...pages].sort((left, right) => left.page - right.page);
}

/** 按 sections 顺序展平合集剧集（全选/序号/去重都基于该顺序）。 */
function flattenEpisodes(sections: CollectionSection[]): CollectionEpisode[] {
  const episodes: CollectionEpisode[] = [];
  for (const section of sections) {
    for (const episode of section.episodes) {
      episodes.push(episode);
    }
  }
  return episodes;
}

function countEpisodes(collection: VideoCollection | null): number {
  if (!collection) return 0;
  let count = 0;
  for (const section of collection.sections) {
    count += section.episodes.length;
  }
  return count;
}

export interface UseVideoResult {
  /** 输入框内容 */
  input: string;
  setInput: (value: string) => void;
  /** 已解析的视频信息 */
  video: VideoInfo | null;
  parsed: ParsedInput | null;
  isLogin: boolean;
  /** 去重后的清晰度列表（高 -> 低） */
  qualityChoices: QualityOption[];
  /** 当前清晰度下可用的编码 */
  codecChoices: Codec[];
  /** 已勾选的分P（按页码升序） */
  selectedPages: VideoPage[];
  /** 已勾选的合集剧集（按合集 sections 展平顺序） */
  selectedEpisodes: CollectionEpisode[];
  /** 视频所属合集（ugc_season）；非合集为 null */
  collection: VideoCollection | null;
  /** 分P + 合集剧集的总勾选数 */
  totalSelected: number;
  /** 主分P（用于取流与预览），等于 selectedPages[0] ?? 第一个分P */
  selectedPage: VideoPage | null;
  selectedQn: number | null;
  selectedCodec: Codec | null;
  selectedStream: StreamDetail | null;
  audioOnly: boolean;
  embedSubtitles: boolean;
  embedDanmaku: boolean;
  saveDanmaku: boolean;
  /** 设置项：列表下载时按列表名创建子文件夹（仅用于界面展示） */
  listFolder: boolean;
  parsing: boolean;
  streamsLoading: boolean;
  creating: boolean;
  canDownload: boolean;
  parse: (value?: string) => Promise<VideoResponse | null>;
  togglePage: (page: number) => void;
  toggleAllPages: (checked: boolean) => void;
  toggleEpisode: (id: number) => void;
  toggleAllEpisodes: (checked: boolean) => void;
  selectQn: (qn: number) => void;
  selectCodec: (codec: Codec) => void;
  setAudioOnly: (value: boolean) => void;
  setEmbedSubtitles: (value: boolean) => void;
  setEmbedDanmaku: (value: boolean) => void;
  setSaveDanmaku: (value: boolean) => void;
  /** 为所有已勾选分P/合集剧集批量创建下载任务 */
  createDownloads: () => Promise<DownloadTask[]>;
}

export function useVideo(): UseVideoResult {
  const [input, setInputState] = useState("");
  const [video, setVideo] = useState<VideoInfo | null>(null);
  const [parsed, setParsed] = useState<ParsedInput | null>(null);
  const [isLogin, setIsLogin] = useState(false);
  const [qualities, setQualities] = useState<QualityOption[]>([]);
  const [selectedStream, setSelectedStream] = useState<StreamDetail | null>(null);
  const [selectedQn, setSelectedQn] = useState<number | null>(null);
  const [selectedCodec, setSelectedCodec] = useState<Codec | null>(null);
  const [selectedPages, setSelectedPages] = useState<VideoPage[]>([]);
  const [selectedEpisodes, setSelectedEpisodes] = useState<CollectionEpisode[]>([]);
  const [audioOnly, setAudioOnly] = useState(false);
  const [embedSubtitles, setEmbedSubtitles] = useState(false);
  const [embedDanmaku, setEmbedDanmaku] = useState(false);
  const [saveDanmaku, setSaveDanmaku] = useState(false);
  const [listFolder, setListFolder] = useState(true);
  const [parsing, setParsing] = useState(false);
  const [streamsLoading, setStreamsLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  const inputRef = useRef("");
  const parseSeq = useRef(0);
  const streamsSeq = useRef(0);
  /** 当前已为哪个 cid 取过流；只有主分P cid 变化时才重新请求 */
  const streamsCidRef = useRef<number | null>(null);
  /** 设置页的默认清晰度/编码与弹幕开关，解析时作为初值 */
  const defaultsRef = useRef<{
    qn: number | null;
    codec: Codec | null;
    embedSubtitles: boolean;
    embedDanmaku: boolean;
    saveDanmaku: boolean;
  }>({
    qn: null,
    codec: null,
    embedSubtitles: false,
    embedDanmaku: false,
    saveDanmaku: false,
  });

  const setInput = useCallback((value: string) => {
    inputRef.current = value;
    setInputState(value);
  }, []);

  useEffect(() => {
    let cancelled = false;
    api.bili
      .nav()
      .then((nav) => {
        if (!cancelled) setIsLogin(nav.isLogin);
      })
      .catch(() => {
        if (!cancelled) setIsLogin(false);
      });
    api.settings
      .get()
      .then((response) => {
        if (cancelled) return;
        defaultsRef.current = {
          qn: response.settings.defaultQn ?? null,
          codec: response.settings.preferCodec ?? null,
          embedSubtitles: response.settings.embedSubtitles ?? false,
          embedDanmaku: response.settings.embedDanmaku ?? false,
          saveDanmaku: response.settings.saveDanmaku ?? false,
        };
        setListFolder(response.settings.listFolder ?? true);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const loadStreams = useCallback(
    async (bvid: string, cid: number, options?: { qn?: number | null; codec?: Codec | null }) => {
      streamsSeq.current += 1;
      const seq = streamsSeq.current;
      setStreamsLoading(true);
      try {
        const response = await api.bili.streams({ bvid, cid, qn: options?.qn ?? undefined });
        if (seq !== streamsSeq.current) return null;
        const available = uniqueCodecs(response.qualities, response.selected.qn);
        const preferred = options?.codec ?? null;
        setQualities(response.qualities);
        setSelectedStream(response.selected);
        setSelectedQn(response.selected.qn);
        setSelectedCodec(preferred && available.includes(preferred) ? preferred : response.selected.codec);
        return response;
      } catch (error) {
        if (seq !== streamsSeq.current) return null;
        setQualities([]);
        setSelectedStream(null);
        setSelectedQn(null);
        setSelectedCodec(null);
        toast.error("获取清晰度失败：" + getErrorMessage(error));
        return null;
      } finally {
        if (seq === streamsSeq.current) setStreamsLoading(false);
      }
    },
    [],
  );

  /** 主分P：优先已勾选的第一个分P，否则回退到视频第一个分P（合集模式始终如此）。 */
  const primaryPage = useMemo<VideoPage | null>(
    () => (video ? selectedPages[0] ?? firstPageOf(video) : null),
    [video, selectedPages],
  );

  /** 主分P cid 变化时才重新取流；相同 cid（如取消勾选后面的分P）不打断当前清晰度。 */
  const loadStreamsForPrimary = useCallback(
    (page: VideoPage | null, options?: { qn?: number | null; codec?: Codec | null }) => {
      if (!video || !page) return;
      if (streamsCidRef.current === page.cid) return;
      streamsCidRef.current = page.cid;
      void loadStreams(video.bvid, page.cid, options ?? { qn: selectedQn, codec: selectedCodec });
    },
    [video, selectedQn, selectedCodec, loadStreams],
  );

  const parse = useCallback(
    async (value?: string): Promise<VideoResponse | null> => {
      const text = (value ?? inputRef.current).trim();
      if (!text) {
        toast.error("请先输入 BV 号、视频链接或番剧 ep/ss");
        return null;
      }
      parseSeq.current += 1;
      streamsSeq.current += 1;
      const seq = parseSeq.current;
      setParsing(true);
      try {
        const response = await api.bili.video(text);
        if (seq !== parseSeq.current) return null;
        const nextVideo = response.video;
        const collection = nextVideo.collection;
        const defaults = defaultsRef.current;
        const firstPage = firstPageOf(nextVideo);
        let nextPages: VideoPage[] = [];
        let nextEpisodes: CollectionEpisode[] = [];
        if (collection && countEpisodes(collection) > 1) {
          // 合集模式：默认只勾选当前剧集；分P选择清空（取流回退到当前视频第一个分P）。
          const episodes = flattenEpisodes(collection.sections);
          const current =
            episodes.find((episode) => episode.id === collection.currentEpisodeId) ?? episodes[0] ?? null;
          nextEpisodes = current ? [current] : [];
        } else {
          nextPages = firstPage ? [firstPage] : [];
        }
        const primary = nextPages[0] ?? firstPage;
        setInput(text);
        setParsed(response.input);
        setVideo(nextVideo);
        setSelectedPages(nextPages);
        setSelectedEpisodes(nextEpisodes);
        setQualities([]);
        setSelectedStream(null);
        setSelectedQn(null);
        setSelectedCodec(null);
        setAudioOnly(false);
        setEmbedSubtitles(defaults.embedSubtitles);
        setEmbedDanmaku(defaults.embedDanmaku);
        setSaveDanmaku(defaults.saveDanmaku);
        setParsing(false);
        streamsCidRef.current = primary?.cid ?? null;
        if (primary) {
          void loadStreams(nextVideo.bvid, primary.cid, {
            qn: defaults.qn,
            codec: defaults.codec,
          });
        }
        return response;
      } catch (error) {
        if (seq !== parseSeq.current) return null;
        setParsing(false);
        toast.error("解析失败：" + getErrorMessage(error));
        return null;
      }
    },
    [loadStreams, setInput],
  );

  const togglePage = useCallback(
    (pageNumber: number) => {
      if (!video) return;
      const exists = selectedPages.some((page) => page.page === pageNumber);
      let next: VideoPage[];
      if (exists) {
        next = selectedPages.filter((page) => page.page !== pageNumber);
      } else {
        const target = video.pages.find((page) => page.page === pageNumber);
        if (!target) return;
        next = sortPages([...selectedPages, target]);
      }
      setSelectedPages(next);
      loadStreamsForPrimary(next[0] ?? firstPageOf(video));
    },
    [video, selectedPages, loadStreamsForPrimary],
  );

  const toggleAllPages = useCallback(
    (checked: boolean) => {
      if (!video) return;
      const next = checked ? sortPages(video.pages) : [];
      setSelectedPages(next);
      loadStreamsForPrimary(next[0] ?? firstPageOf(video));
    },
    [video, loadStreamsForPrimary],
  );

  const toggleEpisode = useCallback(
    (episodeId: number) => {
      const collection = video?.collection ?? null;
      if (!collection) return;
      const episodes = flattenEpisodes(collection.sections);
      const exists = selectedEpisodes.some((episode) => episode.id === episodeId);
      if (exists) {
        setSelectedEpisodes(selectedEpisodes.filter((episode) => episode.id !== episodeId));
        return;
      }
      const target = episodes.find((episode) => episode.id === episodeId);
      if (!target) return;
      const order = new Map<number, number>();
      episodes.forEach((episode, index) => order.set(episode.id, index));
      const next = [...selectedEpisodes, target].sort(
        (left, right) =>
          (order.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (order.get(right.id) ?? Number.MAX_SAFE_INTEGER),
      );
      setSelectedEpisodes(next);
    },
    [video, selectedEpisodes],
  );

  const toggleAllEpisodes = useCallback(
    (checked: boolean) => {
      const collection = video?.collection ?? null;
      if (!collection) {
        setSelectedEpisodes([]);
        return;
      }
      setSelectedEpisodes(checked ? flattenEpisodes(collection.sections) : []);
    },
    [video],
  );

  const selectQn = useCallback(
    (qn: number) => {
      const available = uniqueCodecs(qualities, qn);
      const nextCodec = selectedCodec && available.includes(selectedCodec) ? selectedCodec : available[0] ?? null;
      setSelectedQn(qn);
      setSelectedCodec(nextCodec);
      if (!video || !primaryPage) return;
      streamsCidRef.current = primaryPage.cid;
      void loadStreams(video.bvid, primaryPage.cid, { qn, codec: nextCodec });
    },
    [qualities, selectedCodec, video, primaryPage, loadStreams],
  );

  const selectCodec = useCallback((codec: Codec) => {
    setSelectedCodec(codec);
  }, []);

  const createDownloads = useCallback(async (): Promise<DownloadTask[]> => {
    if (!video || (selectedPages.length === 0 && selectedEpisodes.length === 0)) {
      toast.error("请先勾选要下载的分P或合集剧集");
      return [];
    }
    if (selectedQn === null || selectedCodec === null) {
      toast.error("清晰度或编码信息尚未就绪，请稍候重试");
      return [];
    }
    const collection = video.collection;
    const hasMultiplePages = video.pages.length > 1;
    /** 合集剧集 id -> 展平后的 1-based 序号 */
    const episodeIndexes = new Map<number, number>();
    if (collection) {
      let index = 0;
      for (const section of collection.sections) {
        for (const episode of section.episodes) {
          index += 1;
          episodeIndexes.set(episode.id, index);
        }
      }
    }

    interface PlannedTask {
      label: string;
      input: CreateTaskInput;
    }

    // 分P 与合集合并：按 bvid + cid + page 去重，分P优先。
    const planned = new Map<string, PlannedTask>();
    for (const page of selectedPages) {
      const key = video.bvid + ":" + String(page.cid) + ":" + String(page.page);
      if (planned.has(key)) continue;
      planned.set(key, {
        label: "第 " + String(page.page) + " P",
        input: {
          bvid: video.bvid,
          aid: video.aid,
          cid: page.cid,
          page: page.page,
          title: video.title,
          partTitle: page.title,
          cover: video.cover,
          upName: video.owner.name,
          qn: selectedQn,
          codec: selectedCodec,
          audioOnly,
          embedSubtitles: audioOnly ? false : embedSubtitles,
          listTitle: hasMultiplePages ? video.title : null,
          listIndex: page.page,
          embedDanmaku: !audioOnly && embedDanmaku,
          saveDanmaku,
          sourceUrl:
            "https://www.bilibili.com/video/" + video.bvid + (page.page > 1 ? "?p=" + String(page.page) : ""),
        },
      });
    }
    for (const episode of selectedEpisodes) {
      const key = episode.bvid + ":" + String(episode.cid) + ":" + String(episode.page);
      if (planned.has(key)) continue;
      planned.set(key, {
        label: episode.title || "合集剧集",
        input: {
          bvid: episode.bvid,
          aid: episode.aid,
          cid: episode.cid,
          page: episode.page,
          title: episode.title,
          partTitle: episode.title,
          cover: episode.cover || video.cover,
          upName: video.owner.name,
          qn: selectedQn,
          codec: selectedCodec,
          audioOnly,
          embedSubtitles: audioOnly ? false : embedSubtitles,
          listTitle: collection?.title ?? null,
          listIndex: episodeIndexes.get(episode.id) ?? null,
          embedDanmaku: !audioOnly && embedDanmaku,
          saveDanmaku,
          sourceUrl: "https://www.bilibili.com/video/" + episode.bvid,
        },
      });
    }

    const targets = Array.from(planned.values());
    setCreating(true);
    const created: DownloadTask[] = [];
    let failed = 0;
    try {
      for (const target of targets) {
        try {
          const response = await api.tasks.create(target.input);
          created.push(response.task);
        } catch (error) {
          failed += 1;
          toast.error("「" + target.label + "」创建失败：" + getErrorMessage(error));
        }
      }
    } finally {
      setCreating(false);
    }
    if (created.length > 0) {
      if (failed === 0) {
        toast.success("已加入 " + String(created.length) + " 个下载任务", { description: video.title });
      } else {
        toast.warning("已加入 " + String(created.length) + " 个下载任务，" + String(failed) + " 个失败");
      }
    }
    return created;
  }, [
    video,
    selectedPages,
    selectedEpisodes,
    selectedQn,
    selectedCodec,
    audioOnly,
    embedSubtitles,
    embedDanmaku,
    saveDanmaku,
  ]);

  const qualityChoices = useMemo(() => {
    const map = new Map<number, QualityOption>();
    for (const quality of qualities) {
      if (!map.has(quality.qn)) map.set(quality.qn, quality);
    }
    return Array.from(map.values()).sort((left, right) => right.qn - left.qn);
  }, [qualities]);

  const codecChoices = useMemo(() => {
    if (selectedQn === null) return [];
    const available = uniqueCodecs(qualities, selectedQn);
    if (available.length > 0) return available;
    return selectedCodec ? [selectedCodec] : [];
  }, [qualities, selectedQn, selectedCodec]);

  const collection = video?.collection ?? null;
  const totalSelected = selectedPages.length + selectedEpisodes.length;
  const canDownload =
    video !== null &&
    totalSelected > 0 &&
    selectedQn !== null &&
    selectedCodec !== null &&
    !parsing &&
    !streamsLoading &&
    !creating;

  return {
    input,
    setInput,
    video,
    parsed,
    isLogin,
    qualityChoices,
    codecChoices,
    selectedPages,
    selectedEpisodes,
    collection,
    totalSelected,
    selectedPage: primaryPage,
    selectedQn,
    selectedCodec,
    selectedStream,
    audioOnly,
    embedSubtitles,
    embedDanmaku,
    saveDanmaku,
    listFolder,
    parsing,
    streamsLoading,
    creating,
    canDownload,
    parse,
    togglePage,
    toggleAllPages,
    toggleEpisode,
    toggleAllEpisodes,
    selectQn,
    selectCodec,
    setAudioOnly,
    setEmbedSubtitles,
    setEmbedDanmaku,
    setSaveDanmaku,
    createDownloads,
  };
}
