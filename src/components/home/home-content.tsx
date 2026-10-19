"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Link2 } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { useVideo } from "@/hooks/use-video";
import { collectSelectedItems } from "@/lib/selection";
import { useSystemInfo } from "@/hooks/use-settings";
import { CollectionList } from "./collection-list";
import { DownloadPanel } from "./download-panel";
import { ParseInput } from "./parse-input";
import { PartsList } from "./parts-list";
import { QualitySelector } from "./quality-selector";
import { RecentTasks } from "./recent-tasks";
import { VideoCard } from "./video-card";

function ParseResultSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]">
      <div className="space-y-4">
        <Skeleton className="h-56 w-full rounded-xl" />
        <Skeleton className="h-28 w-full rounded-xl" />
      </div>
      <div className="space-y-4">
        <Skeleton className="h-72 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    </div>
  );
}

export function HomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const autoParseRef = useRef<string | null>(null);
  const {
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
    selectedPage,
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
  } = useVideo();

  const { info: systemInfo } = useSystemInfo();
  // 系统信息加载中先允许选择，避免误禁用；加载完成后按 ffmpeg 实际可用性判断
  const ffmpegAvailable = systemInfo ? systemInfo.ffmpeg.available : true;

  const queryInput = searchParams.get("input");

  useEffect(() => {
    if (!queryInput) return;
    const value = queryInput.trim();
    if (!value || autoParseRef.current === value) return;
    autoParseRef.current = value;
    void parse(value);
  }, [queryInput, parse]);

  // 桌面版：接收主进程转发来的协议链接 / 剪贴板链接，自动填入并解析
  useEffect(() => {
    function handleParseLink(event: Event) {
      const detail = (event as CustomEvent<string>).detail;
      if (!detail) return;
      autoParseRef.current = detail;
      setInput(detail);
      void parse(detail);
    }
    window.addEventListener("bilidown:parse-link", handleParseLink);
    return () => window.removeEventListener("bilidown:parse-link", handleParseLink);
  }, [parse, setInput]);

  const collectionEpisodeCount = collection
    ? collection.sections.reduce((count, section) => count + section.episodes.length, 0)
    : 0;
  // 分P 与合集剧集可能指向同一集，这里按 bvid:cid:page 去重，与批量建任务口径一致
  const selectedItemCount = video ? collectSelectedItems(video.bvid, selectedPages, selectedEpisodes).length : 0;
  const showCollection = Boolean(collection && collectionEpisodeCount > 1);
  // 分P 与合集列表同时存在时，只让最后一个列表卡填满剩余高度，避免两个列表把空白区域对半分。
  const showParts = video ? video.pages.length > 1 : false;

  async function handleDownload() {
    const tasks = await createDownloads();
    if (tasks.length > 0) router.push("/downloads");
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <PageHeader
        title="解析下载"
        description="粘贴 B 站视频链接、BV 号或番剧链接，选择清晰度与编码后开始下载。"
      />

      <ParseInput
        value={input}
        loading={parsing}
        onChange={setInput}
        onParse={() => {
          void parse();
        }}
      />

      {parsing && !video ? (
        <ParseResultSkeleton />
      ) : video ? (
        <div className="anim-fade-up grid gap-6 lg:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]">
          {/* 左栏用 flex 纵向排列：视频卡固定高度，列表卡在 lg 下拉满剩余高度，
              避免右栏（下载选项 + 开始下载）更高时左下方留出大片空白。 */}
          <div className="anim-fade-up flex min-w-0 flex-col gap-6" style={{ animationDelay: "60ms" }}>
            <div className="shrink-0">
              <VideoCard
                video={video}
                parsed={parsed}
                selectedPages={selectedPages}
                selectedEpisodesCount={selectedEpisodes.length}
              />
            </div>
            {showCollection && collection ? (
              <CollectionList
                fill={!showParts}
                title={collection.title}
                sections={collection.sections}
                currentEpisodeId={collection.currentEpisodeId}
                source={collection.source}
                selectedIds={selectedEpisodes.map((episode) => episode.id)}
                disabled={parsing}
                onToggle={toggleEpisode}
                onToggleAll={toggleAllEpisodes}
              />
            ) : null}
            {showParts ? (
              <PartsList
                fill
                pages={video.pages}
                selectedPages={selectedPages.map((page) => page.page)}
                disabled={parsing}
                onToggle={togglePage}
                onToggleAll={toggleAllPages}
              />
            ) : null}
          </div>
          <div className="anim-fade-up min-w-0 space-y-6" style={{ animationDelay: "150ms" }}>
            <QualitySelector
              qualities={qualityChoices}
              codecChoices={codecChoices}
              selectedQn={selectedQn}
              selectedCodec={selectedCodec}
              audioOnly={audioOnly}
              embedSubtitles={embedSubtitles}
              embedDanmaku={embedDanmaku}
              saveDanmaku={saveDanmaku}
              ffmpegAvailable={ffmpegAvailable}
              isLogin={isLogin}
              loading={streamsLoading || parsing}
              disabled={parsing}
              selectedPartCount={selectedItemCount}
              onQnChange={selectQn}
              onCodecChange={selectCodec}
              onAudioOnlyChange={setAudioOnly}
              onEmbedSubtitlesChange={setEmbedSubtitles}
              onEmbedDanmakuChange={setEmbedDanmaku}
              onSaveDanmakuChange={setSaveDanmaku}
            />
            <DownloadPanel
              video={video}
              pages={selectedPages}
              episodes={selectedEpisodes}
              collectionTitle={collection?.title ?? null}
              qn={selectedQn}
              codec={selectedCodec}
              audioOnly={audioOnly}
              embedSubtitles={embedSubtitles}
              embedDanmaku={embedDanmaku}
              saveDanmaku={saveDanmaku}
              listFolder={listFolder}
              ffmpegAvailable={ffmpegAvailable}
              stream={selectedStream}
              primaryPage={selectedPage}
              previewPageNumber={selectedPage?.page}
              creating={creating}
              disabled={!canDownload}
              onDownload={() => {
                void handleDownload();
              }}
            />
          </div>
        </div>
      ) : (
        <EmptyState
          icon={Link2}
          title="等待解析视频"
          description="支持 BV 号、av 号、视频链接、b23.tv 短链，以及番剧 ep/ss。解析后会显示视频信息、分P列表与可选清晰度。"
        />
      )}

      <RecentTasks />
    </div>
  );
}
