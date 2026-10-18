/** 浏览器端保存/分享文件的通用助手（客户端组件使用）。 */

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** 去掉最后一个扩展名（"a.b.mp4" -> "a.b"；没有扩展名时原样返回）。 */
export function fileBaseName(fileName: string): string {
  const trimmed = fileName.trim();
  const dot = trimmed.lastIndexOf(".");
  return dot > 0 ? trimmed.slice(0, dot) : trimmed;
}

/**
 * 优先用系统分享面板保存文件（手机端可“存储到文件/相册”或分享出去），
 * 不支持 Web Share 文件分享时回退为普通下载。
 * 注意：必须在用户点击手势内调用（navigator.share 需要用户激活）。
 */
export async function saveOrShareBlob(blob: Blob, fileName: string): Promise<"shared" | "downloaded"> {
  try {
    const file = new File([blob], fileName, { type: blob.type || "application/octet-stream" });
    if (typeof navigator !== "undefined" && navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: fileName });
      return "shared";
    }
  } catch (error) {
    // 用户取消分享也走下载兜底，保证文件一定能保存下来
    if (error instanceof DOMException && error.name === "AbortError") return "shared";
  }
  downloadBlob(blob, fileName);
  return "downloaded";
}
