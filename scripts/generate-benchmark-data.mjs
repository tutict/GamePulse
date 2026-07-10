import { createWriteStream } from "node:fs";
import { once } from "node:events";
import process from "node:process";

const count = Number(process.argv[2] ?? 1_000_000);
const output = process.argv[3] ?? "gamepulse-benchmark.ndjson";
const stream = createWriteStream(output, { encoding: "utf8" });
const platforms = ["steam", "reddit", "bilibili", "nga", "taptap", "heybox"];
const messages = [
  "更新后帧率下降，战斗时会卡顿",
  "角色手感不错，但养成材料太少",
  "活动奖励太少，准备退坑",
  "新版本闪退，进入副本后黑屏",
  "剧情和音乐都很好，希望增加内容"
];
const startedAt = Date.now();
for (let index = 0; index < count; index += 1) {
  const row = {
    platform: platforms[index % platforms.length],
    externalId: `bench-${index}`,
    body: messages[index % messages.length],
    postedAt: new Date(Date.UTC(2026, 0, 1) + index * 1000).toISOString(),
    upvotes: index % 500,
    replies: index % 30
  };
  if (!stream.write(`${JSON.stringify(row)}\n`)) await once(stream, "drain");
}
stream.end();
await once(stream, "finish");
console.log(JSON.stringify({ rows: count, output, durationMs: Date.now() - startedAt }));