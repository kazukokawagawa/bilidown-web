"use client";

import { useState } from "react";
import { Film, QrCode, ShieldCheck, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/page-header";
import { PageSkeleton } from "@/components/shared/loading";
import { revealDelay } from "@/components/shared/motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAccount } from "@/hooks/use-account";
import { getErrorMessage } from "@/lib/api-client";
import { LoginDialog } from "./login-dialog";
import { UserCard } from "./user-card";

const BENEFITS = [
  {
    icon: Film,
    title: "高清画质",
    description: "登录后可按账号权限下载 1080P、1080P+ 及更高清晰度。",
  },
  {
    icon: Sparkles,
    title: "大会员清晰度",
    description: "大会员账号可获取 4K、HDR、杜比视界等会员清晰度。",
  },
  {
    icon: ShieldCheck,
    title: "Cookie 安全存储",
    description: "Cookie 仅保存在服务端设置文件，不写入浏览器，也不会上传到第三方。",
  },
];

export function AccountView() {
  const { user, loggedIn, loading, error, refresh, logout } = useAccount();
  const [loginOpen, setLoginOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await refresh();
      toast.success("账号状态已刷新");
    } catch (cause) {
      toast.error(getErrorMessage(cause));
    } finally {
      setRefreshing(false);
    }
  }

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await logout();
      toast.success("已退出登录");
    } catch (cause) {
      toast.error(getErrorMessage(cause));
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl p-4 sm:p-6">
      <PageHeader title="账号" description="扫码登录 B 站账号，解锁高清清晰度下载" />

      {loading ? (
        <PageSkeleton />
      ) : (
        <div className="space-y-6">
          {loggedIn && user ? (
            <UserCard
              user={user}
              refreshing={refreshing}
              loggingOut={loggingOut}
              onRefresh={() => void handleRefresh()}
              onLogout={() => void handleLogout()}
            />
          ) : (
            <Card className="anim-fade-up">
              <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <QrCode className="h-8 w-8" />
                </div>
                <div className="max-w-md space-y-1">
                  <h2 className="text-lg font-semibold">登录 B 站账号</h2>
                  <p className="text-sm text-muted-foreground">
                    使用哔哩哔哩手机客户端扫码登录。登录态保存在服务端，仅用于请求 B 站接口与下载视频。
                  </p>
                </div>
                <Button onClick={() => setLoginOpen(true)}>
                  <QrCode className="h-4 w-4" />
                  扫码登录
                </Button>
                {error ? (
                  <p className="text-xs text-destructive">登录状态检测失败：{error}</p>
                ) : null}
              </CardContent>
            </Card>
          )}

          <div className="grid gap-4 sm:grid-cols-3">
            {BENEFITS.map((benefit, index) => {
              const Icon = benefit.icon;
              return (
                // 入场放 wrapper、hover 放卡片：两层职责分离，互不覆盖
                <div key={benefit.title} className="anim-fade-up h-full" style={revealDelay(index)}>
                  <Card className="group hover-lift h-full">
                    <CardHeader className="gap-2">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Icon className="wiggle-on-hover h-4 w-4" />
                      </div>
                      <CardTitle className="text-base">{benefit.title}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground">{benefit.description}</p>
                    </CardContent>
                  </Card>
                </div>
              );
            })}
          </div>

          <Card className="anim-fade-up">
            <CardContent className="flex gap-3 py-4 text-sm text-muted-foreground">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                安全提示：扫码登录由 B 站官方接口完成，本项目不会获取你的账号密码。退出登录后服务端会清除本地保存的
                Cookie；如使用公共电脑，请在使用完毕后及时退出。
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      <LoginDialog
        open={loginOpen}
        onOpenChange={setLoginOpen}
        onLoggedIn={() => void refresh()}
      />
    </div>
  );
}
