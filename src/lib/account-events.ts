/**
 * 账号登录态变化事件（浏览器/桌面渲染进程内共享的事件总线）。
 *
 * 页头、侧边栏等组件各自独立请求 /api/bili/nav；登录/退出后需要通知它们刷新，
 * 否则会一直显示旧的登录态（表现为“明明扫码成功了，界面还显示未登录”）。
 */
export const ACCOUNT_CHANGED_EVENT = "bilidown:account-changed";

export function notifyAccountChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(ACCOUNT_CHANGED_EVENT));
}

export function subscribeAccountChanged(handler: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(ACCOUNT_CHANGED_EVENT, handler);
  return () => window.removeEventListener(ACCOUNT_CHANGED_EVENT, handler);
}
