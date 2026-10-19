"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Laptop, Menu, Search, UserRound } from "lucide-react";
import { SidebarContent } from "@/components/layout/app-sidebar";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useIsDesktop } from "@/hooks/use-desktop";
import { subscribeAccountChanged } from "@/lib/account-events";
import { api } from "@/lib/api-client";
import type { BiliUser } from "@/lib/types";
import { cn } from "@/lib/utils";

export function AppHeader() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [user, setUser] = useState<BiliUser | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const isDesktop = useIsDesktop();

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
    loadUser();
    const unsubscribe = subscribeAccountChanged(loadUser);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  // 页面滚动后给顶栏加一层阴影，让「悬浮层」的层次更明确
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const keyword = query.trim();
    if (!keyword) return;
    router.push("/search?keyword=" + encodeURIComponent(keyword));
  }

  return (
    <header
      className={cn(
        "sticky top-0 z-30 flex h-14 items-center gap-3 border-b px-4 backdrop-blur transition-[background-color,box-shadow] duration-300 sm:px-6",
        scrolled
          ? "border-border bg-background/95 shadow-[0_10px_30px_-24px_rgba(0,0,0,0.55)]"
          : "border-border/70 bg-background/80",
      )}
    >
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="md:hidden" aria-label="打开菜单">
            <Menu className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-64 p-0">
          <SheetTitle className="sr-only">导航菜单</SheetTitle>
          <SidebarContent onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <form onSubmit={handleSubmit} className="group relative w-full max-w-md">
        <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground transition-all duration-200 group-focus-within:scale-110 group-focus-within:text-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索 B 站视频 / UP主"
          className="pl-9 transition-shadow duration-200"
        />
      </form>

      <div className="ml-auto flex items-center gap-2">
        {isDesktop ? (
          <Badge variant="outline" className="anim-fade-in hidden gap-1 sm:flex">
            <Laptop className="h-3 w-3" />
            本地版
          </Badge>
        ) : null}
        <ThemeToggle />
        <Link
          href="/account"
          className="group flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors duration-200 hover:bg-accent"
        >
          <Avatar className="h-7 w-7 transition-transform duration-200 group-hover:scale-105">
            {user ? <AvatarImage src={user.face} alt={user.name} referrerPolicy="no-referrer" /> : null}
            <AvatarFallback>
              <UserRound className="h-4 w-4" />
            </AvatarFallback>
          </Avatar>
          <span
            key={user ? "user" : "guest"}
            className="anim-fade-in hidden max-w-24 truncate text-sm text-muted-foreground transition-colors duration-200 group-hover:text-foreground sm:block"
          >
            {user ? user.name : "未登录"}
          </span>
        </Link>
      </div>
    </header>
  );
}
