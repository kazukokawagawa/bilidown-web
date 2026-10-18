"use client";

import { useState } from "react";
import { ArrowLeftRight, ArrowRight } from "lucide-react";
import { CopyButton } from "@/components/shared/copy-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { avToBv, bvToAv, parseAvInput } from "./bv-av";

export function BvAvConverter() {
  const [bv, setBv] = useState("");
  const [bvResult, setBvResult] = useState<number | null>(null);
  const [bvError, setBvError] = useState<string | null>(null);

  const [av, setAv] = useState("");
  const [avResult, setAvResult] = useState<string | null>(null);
  const [avError, setAvError] = useState<string | null>(null);

  function handleBvToAv() {
    const aid = bvToAv(bv);
    if (aid === null) {
      setBvResult(null);
      setBvError("BV 号格式不正确，请输入形如 BV1xx411c7mD 的 BV 号");
      return;
    }
    setBvError(null);
    setBvResult(aid);
  }

  function handleAvToBv() {
    const aid = parseAvInput(av);
    if (aid === null) {
      setAvResult(null);
      setAvError("AV 号格式不正确，请输入正整数或形如 av170001 的 AV 号");
      return;
    }
    const bvid = avToBv(aid);
    if (!bvid) {
      setAvResult(null);
      setAvError("AV 号超出可转换范围");
      return;
    }
    setAvError(null);
    setAvResult(bvid);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ArrowLeftRight className="h-4 w-4" />
          BV ⇄ AV 互转
        </CardTitle>
        <CardDescription>纯客户端算法转换，不会请求服务端</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3 rounded-lg border p-4">
          <p className="text-sm font-medium">BV 号 → AV 号</p>
          <div className="space-y-2">
            <Label htmlFor="bv-input">BV 号</Label>
            <Input
              id="bv-input"
              value={bv}
              onChange={(event) => setBv(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") handleBvToAv();
              }}
              placeholder="BV1xx411c7mD"
              className="font-mono"
              autoComplete="off"
            />
          </div>
          <Button onClick={handleBvToAv} className="w-full sm:w-auto">
            转换
            <ArrowRight className="h-4 w-4" />
          </Button>
          {bvError ? <p className="text-sm text-destructive">{bvError}</p> : null}
          {bvResult !== null ? (
            <div className="flex items-center justify-between gap-2 rounded-md bg-muted/50 px-3 py-2">
              <div>
                <p className="text-xs text-muted-foreground">AV 号</p>
                <p className="font-mono text-lg font-semibold">av{bvResult}</p>
              </div>
              <CopyButton value={String(bvResult)} label="复制" />
            </div>
          ) : null}
        </div>

        <div className="space-y-3 rounded-lg border p-4">
          <p className="text-sm font-medium">AV 号 → BV 号</p>
          <div className="space-y-2">
            <Label htmlFor="av-input">AV 号</Label>
            <Input
              id="av-input"
              value={av}
              onChange={(event) => setAv(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") handleAvToBv();
              }}
              placeholder="170001 或 av170001"
              className="font-mono"
              autoComplete="off"
            />
          </div>
          <Button onClick={handleAvToBv} className="w-full sm:w-auto">
            转换
            <ArrowRight className="h-4 w-4" />
          </Button>
          {avError ? <p className="text-sm text-destructive">{avError}</p> : null}
          {avResult ? (
            <div className="flex items-center justify-between gap-2 rounded-md bg-muted/50 px-3 py-2">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">BV 号</p>
                <p className="truncate font-mono text-lg font-semibold">{avResult}</p>
              </div>
              <CopyButton value={avResult} label="复制" />
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
