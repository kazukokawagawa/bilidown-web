"use client";

import { CircleCheck, Loader2, QrCode, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useQrLogin } from "@/hooks/use-account";
import { cn } from "@/lib/utils";

interface LoginDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 登录成功后的回调（刷新账号信息） */
  onLoggedIn: () => void;
}

export function LoginDialog({ open, onOpenChange, onLoggedIn }: LoginDialogProps) {
  const { status, image, message, refresh } = useQrLogin(open, (user) => {
    toast.success("登录成功" + (user && user.name ? "：" + user.name : ""));
    onLoggedIn();
    onOpenChange(false);
  });

  const statusText =
    status === "loading"
      ? "正在生成二维码…"
      : status === "waiting"
        ? "等待扫码…"
        : status === "scanned"
          ? "已扫码，请在手机上确认登录"
          : status === "expired"
            ? "二维码已过期，请刷新后重试"
            : status === "confirmed"
              ? "登录成功"
              : status === "error"
                ? message ?? "二维码加载失败"
                : "等待扫码…";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>扫码登录 B 站</DialogTitle>
          <DialogDescription>打开哔哩哔哩手机客户端，使用右上角「扫一扫」扫描二维码</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-3 py-2">
          <div className="flex h-56 w-56 items-center justify-center rounded-xl border bg-muted/30 p-2">
            {status === "loading" ? (
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            ) : status === "confirmed" ? (
              <div className="text-center">
                <CircleCheck className="mx-auto h-10 w-10 text-emerald-500" />
                <p className="mt-2 text-sm font-medium">登录成功</p>
              </div>
            ) : image ? (
              // 二维码为服务端返回的 data:image/png;base64 图片
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={image}
                alt="B站登录二维码"
                referrerPolicy="no-referrer"
                className="h-full w-full object-contain"
              />
            ) : (
              <div className="flex flex-col items-center gap-2 px-4 text-center text-sm text-muted-foreground">
                <QrCode className="h-10 w-10" />
                <span>{message ?? "二维码暂不可用，请稍后刷新"}</span>
              </div>
            )}
          </div>

          <p
            className={cn(
              "text-center text-sm",
              status === "scanned" || status === "confirmed"
                ? "text-emerald-600 dark:text-emerald-400"
                : status === "error"
                  ? "text-destructive"
                  : "text-muted-foreground",
            )}
          >
            {statusText}
          </p>
          {status === "waiting" || status === "scanned" ? (
            <p className="text-xs text-muted-foreground">二维码 3 分钟内有效，请及时扫码</p>
          ) : null}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
          <Button variant="outline" onClick={refresh} disabled={status === "loading"}>
            <RefreshCw className="h-4 w-4" />
            刷新二维码
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
