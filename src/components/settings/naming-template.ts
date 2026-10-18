export interface NamingPlaceholder {
  key: string;
  label: string;
  sample: string;
}

/** 与 docs/blueprint.md §4 保持一致的文件命名占位符 */
export const NAMING_PLACEHOLDERS: NamingPlaceholder[] = [
  { key: "{title}", label: "视频标题", sample: "【示例】B站视频标题" },
  { key: "{part}", label: "分P标题", sample: "P1 分P标题" },
  { key: "{bvid}", label: "BV 号", sample: "BV1xx411c7mD" },
  { key: "{quality}", label: "清晰度", sample: "1080P 高清" },
  { key: "{up}", label: "UP 主", sample: "示例UP主" },
  { key: "{cid}", label: "CID", sample: "123456789" },
  { key: "{page}", label: "分P序号", sample: "1" },
];

/** 去掉 Windows/macOS/Linux 文件名非法字符，并限制长度 */
export function sanitizeFileName(name: string): string {
  const cleaned = name
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/[. ]+$/g, "")
    .trim();
  return cleaned.slice(0, 180) || "未命名视频";
}

/** 用示例数据渲染命名模板预览 */
export function renderNamingTemplate(template: string): string {
  let result = template.trim() || "{title}";
  for (const placeholder of NAMING_PLACEHOLDERS) {
    result = result.split(placeholder.key).join(placeholder.sample);
  }
  return sanitizeFileName(result);
}
