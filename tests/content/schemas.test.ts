// T1.1:只測 schema 裡「會自己算一下」的規則,欄位型別交給 Zod 自己負責。
import { describe, expect, it } from "vitest";
import { newsSchema, scenarioSchema } from "@/src/content/schemas";

const news = {
  id: "news_19980817_russia_default",
  releaseDate: "1998-08-17",
  slot: "premarket",
  channel: "paper",
  priority: "major",
  credibility: "fact",
  headline: "標題",
  body: "自行改寫的摘要。",
  isFiction: false,
  sourceUrl: "https://example.com/a",
};

const scenario = {
  startDate: "1998-06-01",
  endDate: "1998-09-30",
  tradingDays: ["1998-06-01", "1998-06-02", "1998-06-03"],
  initial: {
    equityUsdM: 4400,
    trust: 0.85,
    positions: Object.fromEntries(
      ["swapSpread", "onOffRun", "equityVol", "mergerArb", "emDebt"].map((b) => [
        b,
        { exposureUsdM: 1000, liquidity: 0.5, crowding: 0.5 },
      ]),
    ),
  },
  baselinePaths: Object.fromEntries(
    ["swapSpread", "onOffRun", "equityVol", "mergerArb", "emDebt"].map((b) => [
      b,
      [
        { date: "1998-06-01", levelBp: 10 },
        { date: "1998-09-30", levelBp: 40 },
      ],
    ]),
  ),
  events: [{ id: "E_RUSSIA_DEFAULT", date: "1998-08-17" }],
};

describe("newsSchema", () => {
  it("接受完整的史實新聞", () => {
    expect(newsSchema.parse(news).affects).toEqual([]);
  });

  it("鐵律 7:isFiction 為 false 卻沒有 sourceUrl 要擋下來", () => {
    const { sourceUrl: _drop, ...noSource } = news;
    expect(newsSchema.safeParse(noSource).success).toBe(false);
    expect(newsSchema.safeParse({ ...noSource, isFiction: true }).success).toBe(true);
  });
});

describe("scenarioSchema", () => {
  it("接受合法的開局設定", () => {
    expect(scenarioSchema.parse(scenario).tradingDays).toHaveLength(3);
  });

  it("擋下週末、亂序、超出遊戲期間的交易日", () => {
    // 1998-06-06 是星期六
    expect(scenarioSchema.safeParse({ ...scenario, tradingDays: ["1998-06-06"] }).success).toBe(
      false,
    );
    const unsorted = ["1998-06-03", "1998-06-01", "1998-06-02"];
    expect(scenarioSchema.safeParse({ ...scenario, tradingDays: unsorted }).success).toBe(false);
    expect(scenarioSchema.safeParse({ ...scenario, tradingDays: ["1998-05-29"] }).success).toBe(
      false,
    );
  });

  it("五類部位少一類就擋下來", () => {
    const { emDebt: _drop, ...four } = scenario.initial.positions;
    const broken = { ...scenario, initial: { ...scenario.initial, positions: four } };
    expect(scenarioSchema.safeParse(broken).success).toBe(false);
  });
});
