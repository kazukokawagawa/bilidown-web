"use client";

import { ExternalLink } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { formatCount, stripHtml } from "@/lib/format";
import type { SearchUserItem } from "@/lib/types";

export function UserResultCard({ item }: { item: SearchUserItem }) {
  const name = stripHtml(item.name);
  const href = "https://space.bilibili.com/" + String(item.mid);

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="group block h-full focus-visible:outline-none"
      title={"在新窗口打开 " + name + " 的 B 站空间"}
    >
      <Card className="h-full gap-0 p-4 transition-shadow group-hover:shadow-md group-focus-visible:ring-2 group-focus-visible:ring-ring">
        <div className="flex items-start gap-3">
          <Avatar className="h-14 w-14 shrink-0">
            <AvatarImage src={item.face} alt={name} referrerPolicy="no-referrer" />
            <AvatarFallback>{name.slice(0, 1)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-center gap-2">
              <p className="min-w-0 truncate font-medium">{name || "未知 UP主"}</p>
              <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </div>
            <p className="text-xs text-muted-foreground">
              粉丝 {formatCount(item.fans)} · 投稿 {formatCount(item.videos)}
            </p>
            <p className="line-clamp-2 text-xs text-muted-foreground">{item.sign || "这个人很神秘，什么都没有写"}</p>
          </div>
        </div>
      </Card>
    </a>
  );
}
