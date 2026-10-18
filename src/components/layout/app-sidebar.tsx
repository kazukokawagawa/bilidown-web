"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { CircleCheck, CircleX, DownloadCloud } from "lucide-react";
import { NAV_ITEMS } from "@/components/layout/nav-items";
import { subscribeAccountChanged } from "@/lib/account-events";
import { api } from "@/lib/api-client";
import type { BiliUser, SystemInfo } from "@/lib/types";
import { cn } from "@/lib/utils";

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

export function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const [system, setSystem] = useState<SystemInfo | null>(null);
  const [user, setUser] = useState<BiliUser | null>(null);

  useEffect(() => {
    let cancelled = false;
    const loadUser = () => {
      api.bili
        .nav()
        .then((nav) => {
          if (!cancelled) setUser(nav.isLogin && nav.user ? nav.user : null);
        })
        .catch(() => undefined);
    };

    api.system
      .info()
      .then((info) => {
        if (!cancelled) setSystem(info);
      })
      .catch(() => undefined);
    loadUser();
    const unsubscribe = subscribeAccountChanged(loadUser);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return (
    <div className="flex h-full flex-col gap-6 p-4">
      <Link href="/" className="flex items-center gap-2 px-2" onClick={onNavigate}>
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <DownloadCloud className="h-5 w-5" />
        </div>
        <div className="leading-tight">
          <p className="text-sm font-semibold">bilidown</p>
          <p className="text-xs text-muted-foreground">B站视频下载器</p>
        </div>
      </Link>

      <nav className="flex flex-1 flex-col gap-1">
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-secondary font-medium text-secondary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="space-y-2 rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          {system === null ? (
            <span>系统状态检测中…</span>
          ) : (
            <>
              {system.ffmpeg.available ? (
                <CircleCheck className="h-3.5 w-3.5 text-emerald-500" />
              ) : (
                <CircleX className="h-3.5 w-3.5 text-red-500" />
              )}
              <span>ffmpeg {system.ffmpeg.available ? "可用" : "不可用"}</span>
            </>
          )}
        </div>
        <div className="truncate">
          {user ? "已登录：" + user.name : "未登录 B 站账号"}
        </div>
      </div>
    </div>
  );
}

export function AppSidebar() {
  return (
    <aside className="sticky top-0 hidden h-svh w-60 shrink-0 border-r bg-sidebar md:block">
      <SidebarContent />
    </aside>
  );
}
