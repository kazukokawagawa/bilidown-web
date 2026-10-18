"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Link2 } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { useVideo } from "@/hooks/use-video";
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
    selectedQn,
    selectedCodec,
    selectedStream,
    audioOnly,
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
    createDownloads,
  } = useVideo();

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
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]">
          <div className="min-w-0 space-y-6">
            <VideoCard video={video} parsed={parsed} selectedPages={selectedPages} />
            <PartsList
              pages={video.pages}
              selectedPages={selectedPages.map((page) => page.page)}
              disabled={parsing}
              onToggle={togglePage}
              onToggleAll={toggleAllPages}
            />
          </div>
          <div className="min-w-0 space-y-6">
            <QualitySelector
              qualities={qualityChoices}
              codecChoices={codecChoices}
              selectedQn={selectedQn}
              selectedCodec={selectedCodec}
              audioOnly={audioOnly}
              isLogin={isLogin}
              loading={streamsLoading || parsing}
              disabled={parsing}
              selectedPartCount={selectedPages.length}
              onQnChange={selectQn}
              onCodecChange={selectCodec}
              onAudioOnlyChange={setAudioOnly}
            />
            <DownloadPanel
              video={video}
              pages={selectedPages}
              qn={selectedQn}
              codec={selectedCodec}
              audioOnly={audioOnly}
              stream={selectedStream}
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
