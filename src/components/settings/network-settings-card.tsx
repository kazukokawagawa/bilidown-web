"use client";

import type { CSSProperties } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { SettingsFormState } from "./settings-form";

interface NetworkSettingsCardProps {
  form: SettingsFormState;
  onChange: <K extends keyof SettingsFormState>(key: K, value: SettingsFormState[K]) => void;
  /** 动效：设置页错峰入场时由父级传入 anim-fade-up / revealDelay 的 style（可选） */
  className?: string;
  style?: CSSProperties;
}

export function NetworkSettingsCard({ form, onChange, className, style }: NetworkSettingsCardProps) {
  return (
    <Card className={className} style={style}>
      <CardHeader>
        <CardTitle>网络</CardTitle>
        <CardDescription>服务端访问 B 站与下载视频时使用的代理</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <Label htmlFor="proxy">HTTP 代理</Label>
        <Input
          id="proxy"
          value={form.proxy}
          onChange={(event) => onChange("proxy", event.target.value)}
          placeholder="http://127.0.0.1:7890"
          autoComplete="off"
        />
        <p className="text-xs text-muted-foreground">
          留空表示不使用代理。代理仅在服务端生效，浏览器访问本站不受影响。
        </p>
      </CardContent>
    </Card>
  );
}
