"use client";

import { useMemo, useState } from "react";
import { Braces } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

const SAMPLE_TEXT =
  "视频 BV1xx411c7mD 的播放量是 123456，另一个视频 BV1fx411c7Z8 的播放量是 654321。";
const SAMPLE_PATTERN = "BV1[1-9A-HJ-NP-Za-km-z]{9}";
const FLAG_OPTIONS = ["g", "i", "m", "s", "u", "y"] as const;
const MAX_MATCHES = 200;

interface RegexMatch {
  index: number;
  text: string;
  groups: string[];
  namedGroups: Record<string, string> | null;
}

interface RegexResult {
  matches: RegexMatch[];
  error: string | null;
  truncated: boolean;
}

interface HighlightSegment {
  text: string;
  match: boolean;
}

function collectMatches(text: string, pattern: string, flags: string): RegexResult {
  if (!pattern) return { matches: [], error: null, truncated: false };

  let regex: RegExp;
  try {
    regex = new RegExp(pattern, flags.includes("g") ? flags : flags + "g");
  } catch (cause) {
    return {
      matches: [],
      error: cause instanceof Error ? cause.message : "正则表达式无效",
      truncated: false,
    };
  }

  const matches: RegexMatch[] = [];
  let match: RegExpExecArray | null = regex.exec(text);
  while (match !== null) {
    matches.push({
      index: match.index,
      text: match[0],
      groups: match.slice(1),
      namedGroups: match.groups ? { ...match.groups } : null,
    });
    if (match[0] === "") regex.lastIndex += 1;
    if (matches.length >= MAX_MATCHES) return { matches, error: null, truncated: true };
    match = regex.exec(text);
  }

  return { matches, error: null, truncated: false };
}

function buildSegments(text: string, matches: RegexMatch[]): HighlightSegment[] {
  const segments: HighlightSegment[] = [];
  let cursor = 0;
  for (const item of matches) {
    if (item.index < cursor) continue;
    if (item.index > cursor) segments.push({ text: text.slice(cursor, item.index), match: false });
    if (item.text) segments.push({ text: item.text, match: true });
    cursor = item.index + item.text.length;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), match: false });
  return segments;
}

export function RegexTester() {
  const [text, setText] = useState(SAMPLE_TEXT);
  const [pattern, setPattern] = useState(SAMPLE_PATTERN);
  const [flags, setFlags] = useState("g");
  const [highlight, setHighlight] = useState(true);

  const result = useMemo(() => collectMatches(text, pattern, flags), [text, pattern, flags]);
  const segments = useMemo(
    () => (highlight && !result.error ? buildSegments(text, result.matches) : []),
    [highlight, result.error, result.matches, text],
  );

  function toggleFlag(flag: string) {
    setFlags((previous) =>
      previous.includes(flag) ? previous.replace(flag, "") : previous + flag,
    );
  }

  function applySample() {
    setText(SAMPLE_TEXT);
    setPattern(SAMPLE_PATTERN);
    setFlags("g");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Braces className="h-4 w-4" />
          正则测试
        </CardTitle>
        <CardDescription>测试正则表达式，查看匹配数量、匹配内容与捕获分组</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="regex-text">测试文本</Label>
          <Textarea
            id="regex-text"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="在此粘贴需要匹配的文本"
            className="min-h-28 font-mono text-sm"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
          <div className="space-y-2">
            <Label htmlFor="regex-pattern">正则表达式</Label>
            <Input
              id="regex-pattern"
              value={pattern}
              onChange={(event) => setPattern(event.target.value)}
              placeholder="例如：BV1[1-9A-HJ-NP-Za-km-z]{9}"
              className="font-mono"
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <Label>Flags</Label>
            <Input
              value={flags}
              onChange={(event) => setFlags(event.target.value.replace(/[^gimsuy]/g, ""))}
              placeholder="gimsuy"
              className="font-mono"
              autoComplete="off"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {FLAG_OPTIONS.map((flag) => (
            <Button
              key={flag}
              type="button"
              size="sm"
              variant={flags.includes(flag) ? "default" : "outline"}
              className="h-7 w-7 p-0 font-mono"
              onClick={() => toggleFlag(flag)}
              title={"切换 " + flag + " flag"}
            >
              {flag}
            </Button>
          ))}
          <div className="ml-auto flex items-center gap-2">
            <Label htmlFor="regex-highlight" className="cursor-pointer text-xs text-muted-foreground">
              高亮匹配
            </Label>
            <Switch id="regex-highlight" checked={highlight} onCheckedChange={setHighlight} />
            <Button variant="ghost" size="sm" onClick={applySample}>
              使用示例
            </Button>
          </div>
        </div>

        {result.error ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            正则表达式错误：{result.error}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            共 {result.matches.length} 个匹配
            {result.truncated ? "（仅展示前 " + MAX_MATCHES + " 个）" : ""}
          </p>
        )}

        {highlight && segments.length > 0 ? (
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">高亮预览</p>
            <pre className="max-h-60 overflow-auto rounded-md border bg-muted/30 p-3 text-sm whitespace-pre-wrap break-words">
              {segments.map((segment, index) =>
                segment.match ? (
                  <mark
                    key={index}
                    className="rounded bg-amber-300/70 px-0.5 text-foreground dark:bg-amber-500/50"
                  >
                    {segment.text}
                  </mark>
                ) : (
                  <span key={index}>{segment.text}</span>
                ),
              )}
            </pre>
          </div>
        ) : null}

        {result.matches.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">匹配列表</p>
            <div className="max-h-72 space-y-2 overflow-auto rounded-md border p-2">
              {result.matches.map((item, index) => (
                <div key={index} className="rounded-md bg-muted/40 px-3 py-2 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="font-mono text-xs">
                      #{index + 1}
                    </Badge>
                    <span className="text-xs text-muted-foreground">位置 {item.index}</span>
                    <code className="break-all font-mono">{item.text || "(空匹配)"}</code>
                  </div>
                  {item.groups.length > 0 ? (
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {item.groups.map((group, groupIndex) => (
                        <Badge key={groupIndex} variant="secondary" className="font-mono text-xs font-normal">
                          {"$" + (groupIndex + 1)}：{group || "(空)"}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                  {item.namedGroups ? (
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {Object.entries(item.namedGroups).map(([name, value]) => (
                        <Badge key={name} variant="secondary" className="font-mono text-xs font-normal">
                          {name}：{value || "(空)"}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
