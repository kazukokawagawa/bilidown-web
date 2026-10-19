"use client";

import { useState } from "react";
import { useTheme } from "next-themes";
import { Loader2, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/page-header";
import { PageSkeleton } from "@/components/shared/loading";
import { revealDelay } from "@/components/shared/motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useSettings, useSystemInfo } from "@/hooks/use-settings";
import { api, getErrorMessage } from "@/lib/api-client";
import { AppearanceSettingsCard } from "./appearance-settings-card";
import { BehaviorSettingsCard } from "./behavior-settings-card";
import { DangerZoneCard } from "./danger-zone-card";
import { DesktopSettingsCard } from "./desktop-settings-card";
import { DownloadSettingsCard } from "./download-settings-card";
import { NetworkSettingsCard } from "./network-settings-card";
import { defaultSettingsForm, toSettingsForm, type SettingsFormState } from "./settings-form";
import { SystemInfoCard } from "./system-info-card";

export function SettingsView() {
  const { settings, loading, error, saving, save, reload } = useSettings();
  const {
    info: systemInfo,
    loading: systemLoading,
    error: systemError,
    reload: reloadSystem,
  } = useSystemInfo();
  const { setTheme } = useTheme();
  const [form, setForm] = useState<SettingsFormState | null>(null);
  const [resetting, setResetting] = useState(false);
  const [clearing, setClearing] = useState(false);

  // 表单未编辑时直接从服务端设置派生，避免在 effect 中同步 setState
  const currentForm = form ?? (settings ? toSettingsForm(settings) : null);
  const savedForm = settings ? toSettingsForm(settings) : null;

  function updateField<K extends keyof SettingsFormState>(key: K, value: SettingsFormState[K]) {
    setForm((previous) => {
      const base = previous ?? (settings ? toSettingsForm(settings) : null);
      return base ? { ...base, [key]: value } : previous;
    });
  }

  function handleThemeChange(theme: SettingsFormState["theme"]) {
    updateField("theme", theme);
    setTheme(theme);
  }

  const dirty = Boolean(
    currentForm && savedForm && JSON.stringify(currentForm) !== JSON.stringify(savedForm),
  );

  async function handleSave() {
    if (!currentForm) return;
    try {
      await save(currentForm);
      // 保存成功后清空本地草稿，重新从服务端设置派生
      setForm(null);
      setTheme(currentForm.theme);
      window.dispatchEvent(new Event("bilidown:settings-changed"));
      toast.success("设置已保存");
    } catch (cause) {
      toast.error(getErrorMessage(cause));
    }
  }

  async function handleReset() {
    setResetting(true);
    try {
      const defaults = defaultSettingsForm();
      await save(defaults);
      setForm(null);
      setTheme(defaults.theme);
      window.dispatchEvent(new Event("bilidown:settings-changed"));
      toast.success("已恢复默认设置");
    } catch (cause) {
      toast.error(getErrorMessage(cause));
    } finally {
      setResetting(false);
    }
  }

  async function handleClearTasks() {
    setClearing(true);
    try {
      const result = await api.tasks.clear("all");
      toast.success("已清空 " + result.removed + " 条任务记录");
    } catch (cause) {
      toast.error(getErrorMessage(cause));
    } finally {
      setClearing(false);
    }
  }

  function handleReload() {
    void reload();
    void reloadSystem();
  }

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-6xl p-4 sm:p-6">
        <PageHeader title="设置" description="下载、外观、行为与网络设置" />
        <PageSkeleton />
      </div>
    );
  }

  if (!currentForm) {
    return (
      <div className="mx-auto w-full max-w-6xl p-4 sm:p-6">
        <PageHeader title="设置" description="下载、外观、行为与网络设置" />
        <Card className="anim-fade-up">
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <p className="font-medium">设置加载失败</p>
            <p className="max-w-md text-sm text-muted-foreground">
              {error ?? "无法从服务端读取设置，请确认后端服务已启动后重试。"}
            </p>
            <Button variant="outline" onClick={handleReload}>
              <RotateCcw className="h-4 w-4" />
              重新加载
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl p-4 sm:p-6">
      <PageHeader
        title="设置"
        description="下载、外观、行为与网络设置，保存后写入服务端 data/settings.json"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={handleReload} disabled={saving}>
              <RotateCcw className="h-4 w-4" />
              重新加载
            </Button>
            <Button size="sm" onClick={() => void handleSave()} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              保存设置
            </Button>
          </>
        }
      />

      <div className="space-y-4">
        {error ? (
          <div className="anim-fade-in rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            设置加载失败：{error}
          </div>
        ) : null}

        <DownloadSettingsCard
          form={currentForm}
          onChange={updateField}
          systemInfo={systemInfo}
          systemLoading={systemLoading}
          className="anim-fade-up"
          style={revealDelay(0)}
        />
        <AppearanceSettingsCard
          form={currentForm}
          onThemeChange={handleThemeChange}
          className="anim-fade-up"
          style={revealDelay(1)}
        />
        <BehaviorSettingsCard
          form={currentForm}
          onChange={updateField}
          className="anim-fade-up"
          style={revealDelay(2)}
        />
        <DesktopSettingsCard className="anim-fade-up" style={revealDelay(3)} />
        <NetworkSettingsCard
          form={currentForm}
          onChange={updateField}
          className="anim-fade-up"
          style={revealDelay(4)}
        />
        <SystemInfoCard
          info={systemInfo}
          loading={systemLoading}
          error={systemError}
          onReload={() => void reloadSystem()}
          reloading={systemLoading}
          className="anim-fade-up"
          style={revealDelay(5)}
        />
        <DangerZoneCard
          resetting={resetting}
          clearing={clearing}
          onReset={() => void handleReset()}
          onClearTasks={() => void handleClearTasks()}
          className="anim-fade-up"
          style={revealDelay(6)}
        />

        <Card className="anim-fade-up" style={revealDelay(7)}>
          <CardContent className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              {dirty ? (
                <span className="live-dot shrink-0 text-amber-500" aria-hidden="true" />
              ) : null}
              <span>{dirty ? "有未保存的修改，点击保存后生效。" : "所有修改均已保存。"}</span>
            </p>
            <Button onClick={() => void handleSave()} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              保存设置
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
