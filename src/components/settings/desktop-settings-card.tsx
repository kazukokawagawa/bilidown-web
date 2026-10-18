"use client";

import { useEffect, useState } from "react";
import { FolderOpen, HardDrive, MonitorDown } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useDesktopBridge, useDesktopPreference } from "@/hooks/use-desktop";
import type { DesktopInfo } from "@/lib/desktop";

function DesktopSwitchRow({
  id,
  label,
  description,
  checked,
  onCheckedChange,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b py-3 first:pt-0 last:border-b-0 last:pb-0">
      <div className="space-y-0.5">
        <Label htmlFor={id} className="cursor-pointer">
          {label}
        </Label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

/** 仅桌面版（Electron）可见的本地能力设置。 */
export function DesktopSettingsCard() {
  const bridge = useDesktopBridge();
  const [trayOnClose, setTrayOnClose] = useDesktopPreference("trayOnClose", true);
  const [notify, setNotify] = useDesktopPreference("notify", true);
  const [autoShutdown, setAutoShutdown] = useDesktopPreference("autoShutdown", false);
  const [info, setInfo] = useState<DesktopInfo | null>(null);

  useEffect(() => {
    if (!bridge) return;
    let cancelled = false;
    bridge
      .getInfo()
      .then((value) => {
        if (!cancelled) setInfo(value);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [bridge]);

  if (!bridge) return null;

  async function openTarget(path: string) {
    if (!bridge) return;
    const result = await bridge.openPath(path);
    if (!result.ok) toast.error(result.error || "无法打开目录");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          桌面版能力
          <Badge variant="outline" className="gap-1 font-normal">
            <MonitorDown className="h-3 w-3" />
            Electron 本地模式
          </Badge>
        </CardTitle>
        <CardDescription>
          本地下载目录、系统通知、托盘与自动关机由 Electron 主进程提供；浏览器访问时这些能力自动隐藏。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-2">
          <Button
            type="button"
            variant="outline"
            className="justify-start"
            disabled={!info}
            onClick={() => void openTarget(info ? info.downloadDir : "")}
          >
            <FolderOpen className="h-4 w-4" />
            打开下载目录
          </Button>
          <Button
            type="button"
            variant="outline"
            className="justify-start"
            disabled={!info}
            onClick={() => void openTarget(info ? info.userDataDir : "")}
          >
            <HardDrive className="h-4 w-4" />
            打开数据目录
          </Button>
        </div>

        <div>
          <DesktopSwitchRow
            id="desktop-tray"
            label="关闭窗口时最小化到托盘"
            description="开启后点击关闭按钮会隐藏到系统托盘，可在托盘菜单中退出。"
            checked={trayOnClose}
            onCheckedChange={(checked) => {
              setTrayOnClose(checked);
              void bridge.setTrayEnabled(checked).catch(() => undefined);
            }}
          />
          <DesktopSwitchRow
            id="desktop-notify"
            label="下载完成系统通知"
            description="任务下载完成时弹出系统通知，点击通知回到主窗口。"
            checked={notify}
            onCheckedChange={setNotify}
          />
          <DesktopSwitchRow
            id="desktop-shutdown"
            label="全部下载完成后自动关机"
            description="本轮任务全部结束时弹窗确认，确认后执行系统关机（谨慎开启）。"
            checked={autoShutdown}
            onCheckedChange={setAutoShutdown}
          />
        </div>

        <p className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          桌面版内置本地服务与 ffmpeg 调用：下载文件直接写入本机下载目录，媒体转换无需上传。
        </p>
      </CardContent>
    </Card>
  );
}
