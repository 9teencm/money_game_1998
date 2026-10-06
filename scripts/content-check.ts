// T1.1:用 src/content/schemas.ts 驗證 content/ 底下所有 JSON。
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import * as S from "../src/content/schemas";

const ROOT = "content";

/** `dir: true` 代表整個資料夾的每支 .json 各驗一次,否則驗單一檔案。 */
const targets: { path: string; schema: z.ZodType; dir?: boolean }[] = [
  { path: "params.json", schema: S.paramsSchema },
  { path: "scenario.json", schema: S.scenarioSchema },
  { path: "spoilers.json", schema: S.spoilersSchema },
  { path: "history/facts.json", schema: S.historyFileSchema },
  { path: "fallback/advisor-nudges.json", schema: S.advisorNudgesSchema },
  { path: "fallback/negotiation.json", schema: S.negotiationFallbackSchema },
  { path: "fallback/debrief.json", schema: S.debriefFallbackSchema },
  { path: "news", schema: S.newsSchema, dir: true },
  { path: "npcs", schema: S.npcSchema, dir: true },
];

const errors: string[] = [];
const news: S.News[] = [];
let checked = 0;

const check = (file: string, schema: z.ZodType): unknown => {
  checked += 1;
  let data: unknown;
  try {
    // Windows 的編輯器常留 BOM,JSON.parse 會直接爆掉。
    data = JSON.parse(readFileSync(file, "utf8").replace(/^﻿/, ""));
  } catch (e) {
    errors.push(`${file}: JSON 解析失敗 — ${(e as Error).message}`);
    return undefined;
  }
  const result = schema.safeParse(data);
  if (!result.success) {
    for (const i of result.error.issues) {
      errors.push(`${file}: ${i.path.join(".") || "(root)"} — ${i.message}`);
    }
    return undefined;
  }
  return result.data;
};

for (const t of targets) {
  const full = join(ROOT, t.path);
  if (!existsSync(full)) continue;
  if (!t.dir) {
    check(full, t.schema);
    continue;
  }
  for (const name of readdirSync(full).filter((n) => n.endsWith(".json"))) {
    const parsed = check(join(full, name), t.schema);
    if (parsed && t.path === "news") news.push(parsed as S.News);
  }
}

// ---- 跨檔案檢查 ----

const seen = new Set<string>();
for (const n of news) {
  if (seen.has(n.id)) errors.push(`news: id 重複 — ${n.id}`);
  seen.add(n.id);
}

// T1.3 驗收:每條線索鏈至少 3 則、跨 2 種以上管道。
const chains = new Map<string, S.News[]>();
for (const n of news) {
  if (n.chainId) chains.set(n.chainId, [...(chains.get(n.chainId) ?? []), n]);
}
for (const [id, items] of chains) {
  if (items.length < 3) errors.push(`線索鏈 ${id}:只有 ${items.length} 則,至少要 3 則`);
  const channels = new Set(items.map((n) => n.channel));
  if (channels.size < 2) errors.push(`線索鏈 ${id}:只用了 ${[...channels]},至少要跨 2 種管道`);
}

if (errors.length) {
  console.error(`content:check 失敗(${checked} 支檔案,${errors.length} 個問題):`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  process.exitCode = 1;
} else if (checked === 0) {
  console.log("content:check — content/ 還沒有檔案可驗證(等 T1.2)");
} else {
  console.log(`content:check 通過:${checked} 支檔案、${chains.size} 條線索鏈。`);
}
