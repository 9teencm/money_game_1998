// T1.1:content/ 底下所有 JSON 的 Zod schema。`pnpm content:check` 與日後的載入器都用這裡的定義。
import { z } from "zod";

// ---- 共用基本型別 ----

/** 日期一律 ISO `YYYY-MM-DD`(CLAUDE.md 程式碼慣例)。 */
export const isoDate = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, "日期要用 YYYY-MM-DD");
/** 比例一律 0–1 的小數。 */
export const ratio = z.number().min(0).max(1);

/** 五類部位(PLAN 2.3)。 */
export const bucketKey = z.enum(["swapSpread", "onOffRun", "equityVol", "mergerArb", "emDebt"]);
/** 交易日的三個時段(PLAN 2.1)。 */
export const slot = z.enum(["premarket", "intraday", "close"]);
/** 四種新聞管道(PLAN 2.9)。 */
export const channel = z.enum(["paper", "terminal", "rumor", "riskReport"]);
/** 三種難度(PLAN 2.10)。 */
export const difficultyKey = z.enum(["novice", "standard", "historical"]);
/** 四種結局(PLAN 2.11)。 */
export const endingGrade = z.enum(["S", "A", "B", "C"]);
/** 七個事件(PLAN 2.8)。 */
export const eventId = z.enum([
  "E_ASIA_AFTERSHOCK",
  "E_DEALER_UNWIND",
  "E_RUSSIA_DEFAULT",
  "E_INVESTOR_QUERY",
  "E_BUYER_OFFER",
  "E_CONSORTIUM",
  "E_FED_CUT",
]);

const perBucket = <T extends z.ZodType>(value: T) => z.record(bucketKey, value);

// ---- content/news/*.json(PLAN 4.1)----

export const newsSchema = z
  .object({
    id: z.string().min(1),
    releaseDate: isoDate,
    slot,
    channel,
    priority: z.enum(["major", "normal"]),
    /** 線索鏈;同一事件分多則、多管道釋出。 */
    chainId: z.string().min(1).optional(),
    /** 內部欄位,不顯示給玩家。 */
    credibility: z.enum(["fact", "rumor", "noise"]),
    headline: z.string().min(1),
    /** 鐵律 8:自行改寫的摘要,不照搬原文。 */
    body: z.string().min(1),
    affects: z
      .array(
        z.object({
          bucket: bucketKey,
          driftBp: z.number(),
          lagDays: z.number().int().min(0),
          durationDays: z.number().int().min(1),
        }),
      )
      .default([]),
    isFiction: z.boolean(),
    sourceUrl: z.url().optional(),
  })
  .refine((n) => n.isFiction || n.sourceUrl !== undefined, {
    message: "鐵律 7:isFiction 為 false 的條目必須附 sourceUrl",
    path: ["sourceUrl"],
  });

// ---- content/npcs/*.json(PLAN 4.2)----

export const npcSchema = z.object({
  id: z.string().min(1),
  /** 鐵律 9:一律用 PLAN 4.5 的化名。 */
  displayName: z.string().min(1),
  role: z.enum(["broker", "buyer", "advisor"]),
  persona: z.string().min(1),
  // ponytail:hidden 先收成數字字典,等 T4.4 談判邊界定案再依 role 拆成各自的 schema。
  hidden: z.record(z.string(), z.number()),
  unlock: z.object({
    fromDate: isoDate,
    requires: z.array(z.string()).default([]),
  }),
});

// ---- content/history/facts.json(PLAN 4.3)----

export const historyFactSchema = z.object({
  id: z.string().min(1),
  date: isoDate,
  statement: z.string().min(1),
  numbers: z.record(z.string(), z.number()).optional(),
  /** 鐵律 7:史實條目一定要有出處。 */
  sourceUrl: z.url(),
});

export const historyFileSchema = z.array(historyFactSchema);

// ---- content/params.json(PLAN 4.4)----

const threshold = z.object({ warn: z.number(), danger: z.number() });

export const paramsSchema = z.object({
  clock: z.object({
    secondsPerDayAt1x: z.number().positive(),
    intradayBudgetHours: z.number().positive(),
  }),
  market: z.object({
    /** 每 1 bp 擴大造成的曝險比例損失。 */
    sensitivity: perBucket(z.number()),
    noiseBp: perBucket(z.number().nonnegative()),
    crisisNoiseMultiplier: z.number().positive(),
    /** 壓力係數路徑,中間線性內插。 */
    stressPath: z.array(z.object({ date: isoDate, stress: z.number().positive() })).min(1),
    financingRateAnnual: z.number().nonnegative(),
    /** impactCost = q × k × (q / (liquidity × depth))^alpha × (1 + crowding) × stress。 */
    impact: z.object({
      k: perBucket(z.number().nonnegative()),
      depthUsdM: perBucket(z.number().positive()),
      alpha: z.number().positive(),
    }),
  }),
  margin: z.object({
    haircut: perBucket(ratio),
    trustPenalty: z.number().nonnegative(),
    forcedSaleImpactMultiplier: z.number().min(1),
    /** 追繳後要補足的寬限交易日數。 */
    curePeriodDays: z.number().int().min(1),
  }),
  snipe: z.object({
    largeSaleRatio: ratio,
    decay: ratio,
    threshold: ratio,
    driftBp: z.number(),
  }),
  hedge: z.object({
    maxRatio: ratio,
    upfrontCostRate: z.number().nonnegative(),
    dailyCarryRate: z.number().nonnegative(),
    crisisEffectiveness: ratio,
  }),
  events: z.object({
    consortiumEquityThreshold: z.number(),
    buyerOfferEquityThreshold: z.number(),
    offerDeadlineSecondsAt1x: z.number().positive(),
  }),
  hints: z.object({
    thresholds: z.object({
      leverage: threshold,
      freeCashUsdM: threshold,
      crowding: threshold,
    }),
  }),
  endings: z.object({
    sImpactThreshold: z.number().nonnegative(),
    /** score = finalEquityUsdM × retainedEquityPct − λ × systemicImpact。 */
    scoreLambda: z.number().nonnegative(),
  }),
  llm: z.object({
    maxContextItems: z.number().int().positive(),
    maxCallsPerRun: z.number().int().positive(),
  }),
  difficulty: z.record(
    difficultyKey,
    z.object({
      advisorNudges: z.enum(["frequent", "keyMoments", "off"]),
      helpCount: z.number().int().min(0),
      showAffects: z.boolean(),
    }),
  ),
});

// ---- content/scenario.json(PLAN 4.4)----

const isWeekend = (d: string) => [0, 6].includes(new Date(`${d}T00:00:00Z`).getUTCDay());

export const scenarioSchema = z
  .object({
    startDate: isoDate,
    endDate: isoDate,
    /** 只放美國交易日,排除週末與休市日(PLAN 2.1)。 */
    tradingDays: z.array(isoDate).min(1),
    initial: z.object({
      equityUsdM: z.number().positive(),
      trust: ratio,
      positions: perBucket(
        z.object({
          exposureUsdM: z.number().nonnegative(),
          liquidity: ratio,
          crowding: ratio,
        }),
      ),
    }),
    /** 基準路徑關鍵點,中間線性內插(PLAN 2.4)。 */
    baselinePaths: perBucket(z.array(z.object({ date: isoDate, levelBp: z.number() })).min(2)),
    events: z.array(z.object({ id: eventId, date: isoDate })),
  })
  .superRefine((s, ctx) => {
    const path = ["tradingDays"];
    const weekend = s.tradingDays.filter(isWeekend);
    if (weekend.length) {
      ctx.addIssue({ code: "custom", path, message: `週末不是交易日:${weekend.join(", ")}` });
    }
    if (!s.tradingDays.every((d, i) => i === 0 || s.tradingDays[i - 1] < d)) {
      ctx.addIssue({ code: "custom", path, message: "交易日要由早到晚排序且不重複" });
    }
    const out = s.tradingDays.filter((d) => d < s.startDate || d > s.endDate);
    if (out.length) {
      ctx.addIssue({ code: "custom", path, message: `超出遊戲期間:${out.join(", ")}` });
    }
  });

// ---- content/spoilers.json(PLAN 4.4)----

export const spoilersSchema = z.array(
  z.object({
    term: z.string().min(1),
    /** null 代表整局都不准出現。debrief 不受劇透過濾,所以 appliesTo 沒有這個選項。 */
    unlockDate: isoDate.nullable(),
    appliesTo: z.array(z.enum(["advisor", "negotiator"])).min(1),
  }),
);

// ---- content/fallback/(PLAN 2.10、3.7)----

export const advisorNudgesSchema = z.array(
  z.object({
    id: z.string().min(1),
    /** 觸發條件 id,由 T5.2 的提示規則對應。 */
    trigger: z.string().min(1),
    text: z.string().min(1).max(120),
  }),
);

// ponytail:備用台詞先只保證「失敗時有話可說」,等 T3.7 的選項式對話定稿再加分支結構。
export const negotiationFallbackSchema = z.array(
  z.object({
    npcId: z.string().min(1),
    lines: z.array(z.string().min(1)).min(1),
  }),
);

export const debriefFallbackSchema = z.array(
  z.object({
    ending: endingGrade,
    text: z.string().min(1),
  }),
);

export type News = z.infer<typeof newsSchema>;
export type Npc = z.infer<typeof npcSchema>;
export type HistoryFact = z.infer<typeof historyFactSchema>;
export type Params = z.infer<typeof paramsSchema>;
export type Scenario = z.infer<typeof scenarioSchema>;
