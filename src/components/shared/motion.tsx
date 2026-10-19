/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useRef, useState, type CSSProperties, type ImgHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/** 当前用户是否开启了「减少动态效果」。 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(REDUCED_MOTION_QUERY);
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return reduced;
}

/**
 * 列表错峰入场：把返回值传给带 anim-fade-up / anim-scale-in 的元素的 style。
 * 例如：<li className="anim-fade-up" style={revealDelay(index)} />
 */
export function revealDelay(index: number, step = 45, max = 14): CSSProperties {
  const safeIndex = Math.max(0, Math.min(index, max));
  return { animationDelay: `${safeIndex * step}ms` };
}

interface AnimatedNumberProps {
  value: number;
  duration?: number;
  className?: string;
}

/** 数字滚动：用于统计数字、计数徽标等小整数，数值变化时平滑过渡。 */
export function AnimatedNumber({ value, duration = 650, className }: AnimatedNumberProps) {
  const reduced = useReducedMotion();
  const [display, setDisplay] = useState(value);
  const displayRef = useRef(value);

  useEffect(() => {
    const from = displayRef.current;
    const to = value;
    if (reduced || from === to) {
      displayRef.current = to;
      setDisplay(to);
      return;
    }

    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      // easeOutCubic：结尾更柔和，避免数字「急停」
      const eased = 1 - Math.pow(1 - progress, 3);
      const next = Math.round(from + (to - from) * eased);
      displayRef.current = next;
      setDisplay(next);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration, reduced]);

  return <span className={cn("tabular-nums", className)}>{display}</span>;
}

interface FadeInImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> {
  src?: string | null;
  alt: string;
}

/**
 * 图片淡入：加载完成后从模糊/微放大过渡到清晰，
 * 配合外层 bg-muted 容器可避免 B 站封面加载时「白块闪现」。
 */
export function FadeInImage({ src, alt, className, onLoad, onError, ...props }: FadeInImageProps) {
  // 记录「已加载完成的图片地址」，src 变化时自然回到未加载态，避免在 effect 里同步 setState
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const ref = useRef<HTMLImageElement | null>(null);
  const loaded = Boolean(src) && loadedSrc === src;

  // 浏览器缓存命中时 onLoad 可能早于 React 绑定事件，挂载后主动检查一次
  useEffect(() => {
    const node = ref.current;
    if (!node || !src || !node.complete) return;
    const frame = requestAnimationFrame(() => setLoadedSrc(src));
    return () => cancelAnimationFrame(frame);
  }, [src]);

  if (!src) return null;

  return (
    <img
      {...props}
      ref={ref}
      src={src}
      alt={alt}
      onLoad={(event) => {
        setLoadedSrc(src);
        onLoad?.(event);
      }}
      onError={(event) => {
        // 加载失败也结束淡入，避免图片一直停在透明态
        setLoadedSrc(src);
        onError?.(event);
      }}
      className={cn(
        // Tailwind v4 的 scale-* 使用独立 scale 属性，所以 transition 里要显式带上 scale
        "transition-[opacity,transform,filter,scale] duration-700 ease-out",
        loaded ? "scale-100 opacity-100 blur-0" : "scale-[1.03] opacity-0 blur-md",
        className,
      )}
    />
  );
}
