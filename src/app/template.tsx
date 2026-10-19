"use client";

/**
 * 路由模板：每次客户端导航时该组件会重新挂载，
 * 借此触发整页的入场动画（见 globals.css 的 .page-enter）。
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
