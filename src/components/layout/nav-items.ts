import type { LucideIcon } from "lucide-react";
import { Download, Home, Search, Settings, User, Wrench } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  description: string;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "首页", icon: Home, description: "解析视频并下载" },
  { href: "/search", label: "搜索", icon: Search, description: "搜索 B 站视频与用户" },
  { href: "/downloads", label: "下载", icon: Download, description: "查看下载任务" },
  { href: "/account", label: "账号", icon: User, description: "扫码登录 B 站账号" },
  { href: "/settings", label: "设置", icon: Settings, description: "下载与外观设置" },
  { href: "/tools", label: "工具", icon: Wrench, description: "链接解析等实用工具" },
];
