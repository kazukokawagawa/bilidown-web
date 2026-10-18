"use client";

import type { LucideIcon } from "lucide-react";
import { ArrowLeftRight, Braces, FileJson, FileText, ImageDown, Link2, Music } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BvAvConverter } from "./bv-av-converter";
import { CcToSrtTool } from "./cc-to-srt-tool";
import { CoverExtractor } from "./cover-extractor";
import { LinkResolver } from "./link-resolver";
import { MediaTools } from "./media-tools";
import { RegexTester } from "./regex-tester";
import { SrtToTextTool } from "./srt-to-text-tool";

interface ToolTab {
  value: string;
  label: string;
  icon: LucideIcon;
}

const TOOL_TABS: ToolTab[] = [
  { value: "resolver", label: "链接解析", icon: Link2 },
  { value: "bvav", label: "BV/AV 互转", icon: ArrowLeftRight },
  { value: "cc", label: "CC → SRT", icon: FileJson },
  { value: "srt", label: "SRT → 文本", icon: FileText },
  { value: "cover", label: "封面提取", icon: ImageDown },
  { value: "media", label: "音视频", icon: Music },
  { value: "regex", label: "正则测试", icon: Braces },
];

export function ToolsView() {
  return (
    <div className="mx-auto w-full max-w-6xl p-4 sm:p-6">
      <PageHeader
        title="工具"
        description="链接解析、BV/AV 互转、字幕格式转换、封面提取与音视频处理"
      />

      <Tabs defaultValue="resolver" className="space-y-4">
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 sm:grid-cols-4 lg:grid-cols-7">
          {TOOL_TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <TabsTrigger key={tab.value} value={tab.value} className="gap-1.5 py-2">
                <Icon className="h-4 w-4" />
                {tab.label}
              </TabsTrigger>
            );
          })}
        </TabsList>

        <TabsContent value="resolver">
          <LinkResolver />
        </TabsContent>
        <TabsContent value="bvav">
          <BvAvConverter />
        </TabsContent>
        <TabsContent value="cc">
          <CcToSrtTool />
        </TabsContent>
        <TabsContent value="srt">
          <SrtToTextTool />
        </TabsContent>
        <TabsContent value="cover">
          <CoverExtractor />
        </TabsContent>
        <TabsContent value="media">
          <MediaTools />
        </TabsContent>
        <TabsContent value="regex">
          <RegexTester />
        </TabsContent>
      </Tabs>

      <p className="mt-6 rounded-lg border border-dashed px-4 py-3 text-xs text-muted-foreground">
        音视频工具由服务端 ffmpeg 完成，上传与转码时间取决于文件大小，请耐心等待；大文件建议直接使用下载页面。
      </p>
    </div>
  );
}
