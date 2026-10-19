"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { CircleCheck, CircleX, DownloadCloud } from "lucide-react";
import { NAV_ITEMS } from "@/components/layout/nav-items";
import { revealDelay } from "@/components/shared/motion";
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
  const navRef = useRef<HTMLElement | null>(null);
  const linkRefs = useRef<Array<HTMLAnchorElement | null>>([]);
  // 当前导航项的测量结果：用于渲染会平滑滑动的激活指示块
  const [indicator, setIndicator] = useState<{ top: number; height: number } | null>(null);

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

  // 测量激活项位置；路由变化时指示块会从上一项滑动到新项
  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const update = () => {
      const activeIndex = NAV_ITEMS.findIndex((item) => isActive(pathname, item.href));
      const activeLink = activeIndex >= 0 ? linkRefs.current[activeIndex] : null;
      if (!activeLink) {
        setIndicator(null);
        return;
      }
      setIndicator({ top: activeLink.offsetTop, height: activeLink.offsetHeight });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(nav);
    return () => observer.disconnect();
  }, [pathname]);

  return (
    <div className="flex h-full flex-col gap-6 p-4">
      <Link href="/" className="group anim-fade-up flex items-center gap-2 px-2" onClick={onNavigate}>
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-transform duration-300 ease-out group-hover:-rotate-6 group-hover:scale-105">
          <DownloadCloud className="h-5 w-5" />
        </div>
        <div className="leading-tight">
          <p className="text-sm font-semibold">bilidown</p>
          <p className="text-xs text-muted-foreground">B站视频下载器</p>
        </div>
      </Link>

      <nav ref={navRef} className="relative flex flex-1 flex-col gap-1">
        {indicator ? (
          <span
            aria-hidden="true"
            className="sidebar-nav-indicator"
            style={{ height: indicator.height, transform: `translateY(${indicator.top}px)` }}
          />
        ) : null}
        {NAV_ITEMS.map((item, index) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              ref={(node) => {
                linkRefs.current[index] = node;
              }}
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group anim-fade-up relative z-10 flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors duration-200",
                active
                  ? "font-medium text-secondary-foreground"
                  : "text-muted-foreground hover:bg-accent/60 hover:text-accent-foreground",
              )}
              style={revealDelay(index, 40)}
            >
              <Icon
                className={cn(
                  "h-4 w-4 shrink-0 transition-transform duration-300 ease-out",
                  active ? "scale-110" : "group-hover:-rotate-3 group-hover:scale-110",
                )}
              />
              <span
                className={cn(
                  "transition-transform duration-300 ease-out",
                  active ? "translate-x-0.5" : "group-hover:translate-x-0.5",
                )}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="anim-fade-up space-y-2 rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground" style={revealDelay(7, 40)}>
        <div key={system === null ? "loading" : "ready"} className="anim-fade-in flex items-center gap-1.5">
          {system === null ? (
            <>
              <span className="live-dot" aria-hidden="true" />
              <span>系统状态检测中…</span>
            </>
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
        <div key={user ? "user" : "guest"} className="anim-fade-in truncate">
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
