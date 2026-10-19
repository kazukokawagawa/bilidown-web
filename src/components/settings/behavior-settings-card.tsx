"use client";

import type { CSSProperties } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { SettingsFormState } from "./settings-form";

interface BehaviorSettingsCardProps {
  form: SettingsFormState;
  onChange: <K extends keyof SettingsFormState>(key: K, value: SettingsFormState[K]) => void;
  /** 动效：设置页错峰入场时由父级传入 anim-fade-up / revealDelay 的 style（可选） */
  className?: string;
  style?: CSSProperties;
}

interface SwitchRowProps {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

function SwitchRow({ id, label, description, checked, onCheckedChange }: SwitchRowProps) {
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

export function BehaviorSettingsCard({ form, onChange, className, style }: BehaviorSettingsCardProps) {
  return (
    <Card className={className} style={style}>
      <CardHeader>
        <CardTitle>行为</CardTitle>
        <CardDescription>剪贴板监听、更新检查与任务历史策略</CardDescription>
      </CardHeader>
      <CardContent>
        <SwitchRow
          id="clipboardWatch"
          label="剪贴板监听"
          description="页面聚焦时每 2 秒读取剪贴板，自动识别 B 站链接（需浏览器剪贴板权限）。"
          checked={form.clipboardWatch}
          onCheckedChange={(checked) => onChange("clipboardWatch", checked)}
        />
        <SwitchRow
          id="autoCheckUpdate"
          label="自动检查更新"
          description="打开页面时由服务端检查是否有新版本（仅提示，不会自动安装）。"
          checked={form.autoCheckUpdate}
          onCheckedChange={(checked) => onChange("autoCheckUpdate", checked)}
        />
        <SwitchRow
          id="saveTaskHistory"
          label="保存任务历史"
          description="任务记录持久化到 data/tasks.json，重启服务后可继续查看历史任务。"
          checked={form.saveTaskHistory}
          onCheckedChange={(checked) => onChange("saveTaskHistory", checked)}
        />
        <SwitchRow
          id="deleteTempAfterMerge"
          label="合并后删除临时文件"
          description="ffmpeg 合并完成后删除音视频临时分片，节省磁盘空间。"
          checked={form.deleteTempAfterMerge}
          onCheckedChange={(checked) => onChange("deleteTempAfterMerge", checked)}
        />
        <p className="mt-3 rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          浏览器版限制：剪贴板监听仅在页面聚焦时生效；「打开下载目录」改为复制文件路径。桌面版（Electron）会由主进程监听剪贴板，并在下方提供托盘、系统通知与自动关机等本地能力。
        </p>
      </CardContent>
    </Card>
  );
}
