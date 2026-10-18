"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { api, getErrorMessage } from "@/lib/api-client";
import type {
  Codec,
  DownloadTask,
  ParsedInput,
  QualityOption,
  StreamDetail,
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
  /** 主分P（用于取流与预览），等于 selectedPages[0] */
  selectedPage: VideoPage | null;
  selectedQn: number | null;
  selectedCodec: Codec | null;
  selectedStream: StreamDetail | null;
  audioOnly: boolean;
  embedSubtitles: boolean;
  parsing: boolean;
  streamsLoading: boolean;
  creating: boolean;
  canDownload: boolean;
  parse: (value?: string) => Promise<VideoResponse | null>;
  togglePage: (page: number) => void;
  toggleAllPages: (checked: boolean) => void;
  selectQn: (qn: number) => void;
  selectCodec: (codec: Codec) => void;
  setAudioOnly: (value: boolean) => void;
  setEmbedSubtitles: (value: boolean) => void;
  /** 为所有已勾选分P批量创建下载任务 */
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
  const [audioOnly, setAudioOnly] = useState(false);
  const [embedSubtitles, setEmbedSubtitles] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [streamsLoading, setStreamsLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  const inputRef = useRef("");
  const parseSeq = useRef(0);
  const streamsSeq = useRef(0);
  /** 设置页的默认清晰度/编码与内嵌字幕开关，解析时作为初值 */
  const defaultsRef = useRef<{ qn: number | null; codec: Codec | null; embedSubtitles: boolean }>({
    qn: null,
    codec: null,
    embedSubtitles: false,
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
        };
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
        const firstPage = firstPageOf(response.video);
        const defaults = defaultsRef.current;
        setInput(text);
        setParsed(response.input);
        setVideo(response.video);
        setSelectedPages(firstPage ? [firstPage] : []);
        setQualities([]);
        setSelectedStream(null);
        setSelectedQn(null);
        setSelectedCodec(null);
        setAudioOnly(false);
        setEmbedSubtitles(defaults.embedSubtitles);
        setParsing(false);
        if (firstPage) {
          void loadStreams(response.video.bvid, firstPage.cid, {
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
      const previousPrimary = selectedPages[0] ?? null;
      const nextPrimary = next[0] ?? null;
      setSelectedPages(next);
      if (nextPrimary && nextPrimary.cid !== previousPrimary?.cid) {
        setSelectedStream(null);
        void loadStreams(video.bvid, nextPrimary.cid, { qn: selectedQn, codec: selectedCodec });
      }
    },
    [video, selectedPages, selectedQn, selectedCodec, loadStreams],
  );

  const toggleAllPages = useCallback(
    (checked: boolean) => {
      if (!video) return;
      if (!checked) {
        setSelectedPages([]);
        return;
      }
      if (selectedPages.length === video.pages.length) {
        setSelectedPages([]);
        return;
      }
      const next = sortPages(video.pages);
      const previousPrimary = selectedPages[0] ?? null;
      setSelectedPages(next);
      if (next[0] && next[0].cid !== previousPrimary?.cid) {
        setSelectedStream(null);
        void loadStreams(video.bvid, next[0].cid, { qn: selectedQn, codec: selectedCodec });
      }
    },
    [video, selectedPages, selectedQn, selectedCodec, loadStreams],
  );

  const selectQn = useCallback(
    (qn: number) => {
      const available = uniqueCodecs(qualities, qn);
      const nextCodec = selectedCodec && available.includes(selectedCodec) ? selectedCodec : available[0] ?? null;
      setSelectedQn(qn);
      setSelectedCodec(nextCodec);
      if (!video || !selectedPages[0]) return;
      void loadStreams(video.bvid, selectedPages[0].cid, { qn, codec: nextCodec });
    },
    [qualities, selectedCodec, video, selectedPages, loadStreams],
  );

  const selectCodec = useCallback((codec: Codec) => {
    setSelectedCodec(codec);
  }, []);

  const createDownloads = useCallback(async (): Promise<DownloadTask[]> => {
    if (!video || selectedPages.length === 0) {
      toast.error("请先解析视频并勾选要下载的分P");
      return [];
    }
    if (selectedQn === null || selectedCodec === null) {
      toast.error("清晰度或编码信息尚未就绪，请稍候重试");
      return [];
    }
    setCreating(true);
    const created: DownloadTask[] = [];
    let failed = 0;
    try {
      for (const page of selectedPages) {
        try {
          const response = await api.tasks.create({
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
            sourceUrl: "https://www.bilibili.com/video/" + video.bvid + (page.page > 1 ? "?p=" + String(page.page) : ""),
          });
          created.push(response.task);
        } catch (error) {
          failed += 1;
          toast.error("第 " + String(page.page) + " P 创建失败：" + getErrorMessage(error));
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
  }, [video, selectedPages, selectedQn, selectedCodec, audioOnly, embedSubtitles]);

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

  const selectedPage = selectedPages[0] ?? null;
  const canDownload =
    video !== null &&
    selectedPages.length > 0 &&
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
    selectedPage,
    selectedQn,
    selectedCodec,
    selectedStream,
    audioOnly,
    embedSubtitles,
    parsing,
    streamsLoading,
    creating,
    canDownload,
    parse,
    togglePage,
    toggleAllPages,
    selectQn,
    selectCodec,
    setAudioOnly,
    setEmbedSubtitles,
    createDownloads,
  };
}
