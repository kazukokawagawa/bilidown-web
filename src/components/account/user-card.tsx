"use client";

import { CircleCheck, Crown, Loader2, LogOut, RefreshCw } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { BiliUser } from "@/lib/types";

interface UserCardProps {
  user: BiliUser;
  refreshing: boolean;
  loggingOut: boolean;
  onRefresh: () => void;
  onLogout: () => void;
}

export function UserCard({ user, refreshing, loggingOut, onRefresh, onLogout }: UserCardProps) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-4 py-6 sm:flex-row sm:items-center">
        <Avatar className="h-16 w-16 shrink-0">
          <AvatarImage src={user.face} alt={user.name} referrerPolicy="no-referrer" />
          <AvatarFallback className="text-lg">{user.name.slice(0, 1)}</AvatarFallback>
        </Avatar>

        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-lg font-semibold">{user.name}</h2>
            {user.vipStatus && user.vipStatus > 0 ? (
              <Badge className="bg-amber-500/15 font-normal text-amber-600 dark:text-amber-400">
                <Crown className="mr-1 h-3.5 w-3.5" />
                大会员
              </Badge>
            ) : null}
          </div>
          <p className="text-sm text-muted-foreground">UID：{user.mid}</p>
          <p className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
            <CircleCheck className="h-3.5 w-3.5" />
            已登录，高清清晰度按账号权限开放
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" disabled={refreshing} onClick={onRefresh}>
            {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            刷新状态
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" disabled={loggingOut}>
                {loggingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
                退出登录
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>退出登录？</AlertDialogTitle>
                <AlertDialogDescription>
                  退出后服务端保存的 Cookie 将被清除，需要重新扫码登录才能下载高清视频。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>取消</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-white hover:bg-destructive/90"
                  onClick={onLogout}
                >
                  退出登录
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  );
}
