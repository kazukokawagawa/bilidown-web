"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface SearchBarProps {
  defaultValue: string;
  loading?: boolean;
  onSubmit: (keyword: string) => void;
}

export function SearchBar({ defaultValue, loading, onSubmit }: SearchBarProps) {
  const [value, setValue] = useState(defaultValue);
  const [lastDefaultValue, setLastDefaultValue] = useState(defaultValue);

  // 当 URL 中的关键词变化（前进/后退、外部跳转）时同步输入框，
  // 使用「渲染期调整派生 state」模式，避免在 effect 里同步 setState。
  if (lastDefaultValue !== defaultValue) {
    setLastDefaultValue(defaultValue);
    setValue(defaultValue);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const keyword = value.trim();
    if (!keyword) {
      toast.error("请输入搜索关键词");
      return;
    }
    onSubmit(keyword);
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <div className="group relative flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground transition-transform duration-200 group-focus-within:scale-110 group-focus-within:text-foreground" />
        <Input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="搜索视频、UP主"
          aria-label="搜索关键词"
          className="h-11 pl-9 transition-[color,box-shadow,border-color] duration-200"
          autoComplete="off"
          spellCheck={false}
        />
      </div>
      <Button type="submit" className="h-11" disabled={loading}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
        搜索
      </Button>
    </form>
  );
}
