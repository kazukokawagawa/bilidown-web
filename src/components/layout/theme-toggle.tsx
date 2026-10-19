"use client";

import { flushSync } from "react-dom";
import { Laptop, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type DocumentWithViewTransition = Document & {
  startViewTransition?: (update: () => void) => { ready: Promise<void> };
};

const THEME_OPTIONS = [
  { value: "light", label: "浅色", icon: Sun },
  { value: "dark", label: "深色", icon: Moon },
  { value: "system", label: "跟随系统", icon: Laptop },
] as const;

export function ThemeToggle() {
  const { setTheme } = useTheme();

  /**
   * 切换主题时用 View Transition 做「从点击位置扩散」的圆形揭示；
   * 不支持该 API 或用户偏好减少动态效果时，退化为直接切换。
   */
  function changeTheme(next: (typeof THEME_OPTIONS)[number]["value"], event?: React.MouseEvent) {
    const doc = document as DocumentWithViewTransition;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!doc.startViewTransition || !event || reducedMotion) {
      setTheme(next);
      return;
    }

    const x = event.clientX;
    const y = event.clientY;
    const radius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y),
    );

    const transition = doc.startViewTransition(() => {
      flushSync(() => setTheme(next));
    });

    transition.ready
      .then(() => {
        document.documentElement.animate(
          {
            clipPath: [
              `circle(0px at ${x}px ${y}px)`,
              `circle(${radius}px at ${x}px ${y}px)`,
            ],
          },
          {
            duration: 480,
            easing: "cubic-bezier(0.22, 1, 0.36, 1)",
            pseudoElement: "::view-transition-new(root)",
          } as KeyframeAnimationOptions,
        );
      })
      .catch(() => undefined);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="切换主题" className="group">
          <Sun className="h-4 w-4 scale-100 rotate-0 transition-all duration-300 group-hover:rotate-45 dark:scale-0 dark:-rotate-90" />
          <Moon className="absolute h-4 w-4 scale-0 rotate-90 transition-all duration-300 dark:scale-100 dark:rotate-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {THEME_OPTIONS.map((option) => {
          const Icon = option.icon;
          return (
            <DropdownMenuItem
              key={option.value}
              onClick={(event) => changeTheme(option.value, event)}
              className="group/item"
            >
              <Icon className="h-4 w-4 transition-transform duration-200 group-hover/item:scale-110" />
              {option.label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
