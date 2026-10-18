"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SettingsFormState } from "./settings-form";

interface AppearanceSettingsCardProps {
  form: SettingsFormState;
  onThemeChange: (theme: SettingsFormState["theme"]) => void;
}

const THEME_OPTIONS: { value: SettingsFormState["theme"]; label: string }[] = [
  { value: "light", label: "浅色" },
  { value: "dark", label: "深色" },
  { value: "system", label: "跟随系统" },
];

export function AppearanceSettingsCard({ form, onThemeChange }: AppearanceSettingsCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>外观</CardTitle>
        <CardDescription>主题会同时应用到当前浏览器并保存到服务端设置</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="max-w-xs space-y-2">
          <Label htmlFor="theme">主题</Label>
          <Select value={form.theme} onValueChange={(value) => onThemeChange(value as SettingsFormState["theme"])}>
            <SelectTrigger id="theme" className="w-full">
              <SelectValue placeholder="选择主题" />
            </SelectTrigger>
            <SelectContent>
              {THEME_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">切换后立即生效；保存设置后会同步到其他浏览器。</p>
        </div>
      </CardContent>
    </Card>
  );
}
