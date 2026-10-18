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
import { api } from "@/lib/api-client";
import type { BiliUser } from "@/lib/types";

export function AppHeader() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [user, setUser] = useState<BiliUser | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const isDesktop = useIsDesktop();

  useEffect(() => {
    let cancelled = false;
    api.bili
      .nav()
      .then((nav) => {
        if (!cancelled) setUser(nav.isLogin && nav.user ? nav.user : null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const keyword = query.trim();
    if (!keyword) return;
    router.push("/search?keyword=" + encodeURIComponent(keyword));
  }

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur sm:px-6">
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

      <form onSubmit={handleSubmit} className="relative w-full max-w-md">
        <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索 B 站视频 / UP主"
          className="pl-9"
        />
      </form>

      <div className="ml-auto flex items-center gap-2">
        {isDesktop ? (
          <Badge variant="outline" className="hidden gap-1 sm:flex">
            <Laptop className="h-3 w-3" />
            本地版
          </Badge>
        ) : null}
        <ThemeToggle />
        <Link href="/account" className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-accent">
          <Avatar className="h-7 w-7">
            {user ? <AvatarImage src={user.face} alt={user.name} referrerPolicy="no-referrer" /> : null}
            <AvatarFallback>
              <UserRound className="h-4 w-4" />
            </AvatarFallback>
          </Avatar>
          <span className="hidden max-w-24 truncate text-sm text-muted-foreground sm:block">
            {user ? user.name : "未登录"}
          </span>
        </Link>
      </div>
    </header>
  );
}
