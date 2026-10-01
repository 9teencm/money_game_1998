# 開發計劃書:量化基金危機模擬遊戲(LTCM 1998)

版本 1.0 · 2026-10-01 · 作者:guanbin(NKNU GenAI Lab)

本計劃書整合「時間線玩法設計」與「LLM 整合設計」兩份設計稿,寫給 Claude Code 當開發依據。專案慣例與不可違反的架構規則寫在根目錄的 `CLAUDE.md`,本檔負責規格、任務與驗收標準。

---

## 0. 如何與 Claude Code 合作

每次開一個新 session,只做一個任務編號(例如 `T2.5`)。建議流程:

1. 請 Claude Code 先讀 `CLAUDE.md` 和本檔對應段落,列出要改的檔案與測試計畫,確認後再動手(較大的任務可用 plan mode)。
2. 引擎任務先寫測試、再寫實作。
3. 完成後跑 `pnpm lint && pnpm typecheck && pnpm test && pnpm content:check`,更新 `docs/PROGRESS.md`,一個任務一個 commit。

開場提示範例:

```text
請閱讀 CLAUDE.md 與 docs/PLAN.md 第 2.5 節和任務 T2.5。
先列出你要新增或修改的檔案、要寫的測試案例,等我確認後再實作。
```

```text
T2.5 已確認。請先在 tests/engine/margin.test.ts 寫測試(含強制平倉的連鎖情境),
再實作 src/engine/margin.ts。數值參數從 content/params.json 讀取,不要寫死。
```

規格有矛盾或沒寫清楚時,請 Claude Code 停下來提問,並把問題記到第 10 節「待確認事項」。

---

## 1. 專案概述

### 1.1 目標

- 做出一款可以公開試玩的網頁遊戲:玩家扮演高槓桿量化基金的經理人,在 1998/6/1–9/30 間自由決策,讀新聞線索、撐過危機。
- 展示 GenAI 的三種用法:NPC 自由對話談判、風控長顧問、事後檢討。
- 引擎與 LLM 解耦,讓同一套引擎日後可以讓 LLM 代理人來玩(研究延伸)。

### 1.2 受眾與使用情境

對金融或量化有興趣的同學、金融課程的補充教材、作品集展示。一局在 1x 速度下約 30 分鐘,適合課堂與展場。

### 1.3 MVP 範圍

| 納入                                   | 不納入(留待 v2)                                 |
| -------------------------------------- | ----------------------------------------------- |
| 單一章節:1998/6/1–9/30                 | 其他危機章節(1987、2008、2021)                  |
| 以交易日為單位的即時時鐘,可暫停、2x/4x | 盤中逐分鐘價格                                  |
| 5 類部位、5 個核心指標、4 種結局       | 經營模擬層、序章                                |
| 手寫新聞庫 40–60 則、至少 4 條線索鏈   | LLM 生成每日新聞與傳聞                          |
| LLM:談判(2 位 NPC)、顧問問答、事後檢討 | 投資人來信、術語解說、AI 對手基金、關卡生成工具 |
| 規則式提示與三種難度                   | 多人排行榜、帳號系統                            |
| 1998 年終端機風格 UI、NAV 曲線動畫     | 3D、語音                                        |

---

## 2. 遊戲規格

> 以下所有數值都是初始提案,實際值放在 `content/params.json`,第 M6 階段再用模擬器調整。

### 2.1 時間線與時鐘

- 遊戲期間:1998-06-01(一)到 1998-09-30(三),只算美國交易日(排除週末與休市日;1998 年此區間的休市日為 7/3 與 9/7,實作時請再核對),約 85 個交易日。
- 每個交易日分三段:
  - `premarket`:釋出早報新聞;玩家可以讀新聞、排行程。
  - `intraday`:可以下單、打電話、開會;時間預算 6.5 小時。
  - `close`:引擎結算當日價差、損益、保證金;釋出收盤新聞。
- 真實時間推進:1x 時一個交易日約 20 秒(`params.clock.secondsPerDayAt1x`),可暫停、2x、4x。
- 自動暫停:重大新聞(`news.priority === "major"`)、限時事件開始、保證金追繳。
- 時鐘與真實時間的轉換只存在 UI / store 層;引擎只接收「推進一天」的指令。

### 2.2 遊戲狀態與五個指標

| 指標           | 欄位             | 定義                                            | 玩家是否可見     |
| -------------- | ---------------- | ----------------------------------------------- | ---------------- |
| 股本           | `equityUsdM`     | 基金自有資本                                    | 可見             |
| 可動用現金     | `freeCashUsdM`   | `equity − marginRequirement`,負值代表保證金不足 | 可見             |
| 槓桿倍數       | `leverage`       | `grossExposure / equity`                        | 可見             |
| 交易對手信任度 | `trust`(0–1)     | 影響保證金比例與融資條件                        | 可見(以等級顯示) |
| 系統衝擊指數   | `systemicImpact` | 累積的拋售衝擊,結局才揭曉                       | 隱藏             |

開局狀態(推估,見第 10 節):股本約 4,400 usdM、總曝險使槓桿約 28 倍、`trust = 0.85`。

### 2.3 部位簿

五類部位,每類有三個屬性:規模(`exposureUsdM`)、流動性(`liquidity`,0–1)、擁擠度(`crowding`,0–1)。

| key          | 名稱             | 特性                                     |
| ------------ | ---------------- | ---------------------------------------- |
| `swapSpread` | 利率交換利差     | 規模最大,賽佛兄弟平倉時擁擠度上升        |
| `onOffRun`   | 新舊美國國債套利 | 流動性高,但 flight to quality 時利差擴大 |
| `equityVol`  | 股票波動率交易   | 8 月後波動率飆升,虧損大                  |
| `mergerArb`  | 企業合併套利     | 規模中等,與市場恐慌相關                  |
| `emDebt`     | 新興市場債券     | 規模小、流動性最差,8/17 直接重挫         |

### 2.4 市場模型

每類部位有一條「價差」序列 `spreadBp[b][t]`(單位:bp)。

- **基準路徑**:`content/scenario.json` 為每類部位定義關鍵點 `{ date, levelBp }`,中間線性內插。路徑形狀:6–7 月緩慢擴大 → 7 月交易商平倉事件加速 → 8/17 跳升 → 9/22 前持續擴大 → 9/29 後開始回落。
- **雜訊**:每日加上 `N(0, σ_b)`,`σ_b` 在 `params.market.noiseBp`,危機期間乘上 `params.market.crisisNoiseMultiplier`。亂數由帶種子的 `rng` 產生。
- **事件衝擊**:事件可以對特定部位加一次性跳升或連續數日的漂移(見 2.8)。
- **被狙擊漂移**:見 2.6。

每日損益:

```text
pnl_b(t) = − exposure_b × sens_b × (1 − hedge_b) × Δspread_b(t)
equity(t) = equity(t−1) + Σ_b pnl_b(t) − financingCost(t) − executionCosts(t) − hedgeCarry(t)
```

`sens_b` 是「每 1 bp 擴大造成的曝險比例損失」,在 `params.market.sensitivity`。

### 2.5 保證金與強制平倉

```text
marginRequirement = Σ_b exposure_b × haircut_b × (1 + trustPenalty × (1 − trust))
freeCash = equity − marginRequirement
```

- 收盤時若 `freeCash < 0`,觸發**保證金追繳**:自動暫停,玩家要在下一個交易日收盤前讓 `freeCash ≥ 0`(減碼、對沖、引資皆可)。
- 期限到仍不足,引擎依「流動性由高到低」強制平倉,成交價套用 `params.margin.forcedSaleImpactMultiplier` 倍的衝擊成本,並重新計算;若仍不足就繼續賣,直到補足或所有部位清空(**追繳螺旋**)。
- `equity ≤ 0` 時立即判定結局 C。

### 2.6 價格衝擊、擁擠與被狙擊

減碼 `q`(usdM)時的執行成本:

```text
impactCost = q × k_b × (q / (liquidity_b × depth_b)) ^ α × (1 + crowding_b) × stress(t)
```

- `stress(t)` 在 8/17 前為 1,之後依 `params.market.stressPath` 上升。
- **擁擠度**:基礎值在 scenario;`E_DEALER_UNWIND` 期間 `swapSpread`、`onOffRun` 的擁擠度上升。
- **曝光度** `revealed_b`(0–1):以下行為會提高——寫信揭露(依揭露程度)、談判時的 `disclosureLevel`、單日減碼超過 `params.snipe.largeSaleRatio × liquidity_b × depth_b`。每日依 `params.snipe.decay` 衰減。
- **被狙擊**:`revealed_b > params.snipe.threshold` 時,接下來每日在該部位加上不利漂移 `params.snipe.driftBp × revealed_b`(對手搶先交易)。
- **系統衝擊**:每筆成交累加 `impactCost × w`;強制平倉時 `w = 2`,主動減碼 `w = 1`。

### 2.7 玩家行動

行動會消耗當日 `intraday` 的時間預算(預設 6.5 小時);預算不足時排到下一個交易日。

| 行動         | 參數                                    | 耗時(小時) | 效果                                                                                               |
| ------------ | --------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------- |
| `reduce`     | 部位、金額                              | 0.5        | 降低曝險、釋出保證金、產生衝擊成本與曝光                                                           |
| `hedge`      | 部位、比例(0–0.8)                       | 0.5        | 降低該部位敏感度;有一次性成本與每日持有成本;危機中避險效果打折(`params.hedge.crisisEffectiveness`) |
| `letter`     | 揭露程度:`minimal` / `partial` / `full` | 1          | 影響投資人信任與引資成功率;`partial`、`full` 會提高曝光度                                          |
| `callBroker` | 交易商 NPC                              | 1          | 開啟談判,可爭取較低保證金比例或延長期限                                                            |
| `callBuyer`  | 收購方 NPC                              | 1.5        | 開啟引資談判;可能觸發限時提案                                                                      |
| `callReserve`    | —                                       | 2          | 聯絡儲備理事會;9/18 後才可用;提高紓困事件提前發生的機率                                           |
| `wait`       | —                                       | —          | 不做事,等待收盤                                                                                    |

MVP 中 `letter` 用三種預設揭露程度;v2 才改成 LLM 寫信與判讀玩家回覆。

### 2.8 事件

| id                  | 時間                         | 觸發條件                                                      | 效果                                                     |
| ------------------- | ---------------------------- | ------------------------------------------------------------- | -------------------------------------------------------- |
| `E_ASIA_AFTERSHOCK` | 6 月起                       | 固定                                                          | `emDebt`、`equityVol` 小幅漂移;相關新聞鏈                |
| `E_DEALER_UNWIND`   | 7 月                         | 固定                                                          | `swapSpread`、`onOffRun` 擁擠度上升、價差擴大            |
| `E_RUSSIA_DEFAULT`  | 1998-08-17                   | 固定                                                          | `emDebt` 跳升;所有部位價差擴大、流動性下降;`stress` 上升 |
| `E_INVESTOR_QUERY`  | 1998-09-02                   | 玩家尚未寫信時                                                | 投資人要求說明,自動暫停,玩家選擇揭露程度                 |
| `E_BUYER_OFFER`     | 9 月                         | 玩家打過 `callBuyer` 且股本低於門檻                           | 限時提案(1x 下 90 秒真實時間),條款由 NPC 人設決定        |
| `E_CONSORTIUM`      | 1998-09-23(`callReserve` 可提前) | 股本低於 `params.events.consortiumEquityThreshold` 且尚未解決 | 銀行團注資 3,625 usdM 換 90% 股權;接受 → 結局 B          |
| `E_FED_CUT`         | 1998-09-29                   | 固定                                                          | 價差基準路徑開始回落(收斂回報)                           |

### 2.9 新聞與線索

- 四種管道:`paper`(早報)、`terminal`(盤中快訊)、`rumor`(同業電話)、`riskReport`(每週五的內部風控報告,由引擎依狀態產生)。
- 每則新聞只標示管道與來源,不標示真假;內部欄位 `credibility` 為 `fact` / `rumor` / `noise`。
- `affects` 欄位描述新聞對價差的影響,引擎依此在指定延遲後施加漂移(rumor 為 false 時不施加)。
- 線索鏈 `chainId`:同一事件分多則、多管道釋出。MVP 至少 4 條:亞洲餘波、交易商平倉、俄羅斯財政、融資收緊。
- `isFiction: false` 的條目必須有 `sourceUrl`;所有文字自行改寫。

### 2.10 提示系統與難度

三層提示:

1. **警示燈**(永遠開啟):槓桿、可動用現金、擁擠度,依 `params.hints.thresholds` 顯示綠/黃/紅。
2. **顧問主動提醒**(規則式,非 LLM):指標越線或某條線索鏈的關鍵新聞釋出時,顯示 `content/fallback/advisor-nudges.json` 中對應的一句話。只點方向,不給答案。
3. **主動求助**(LLM):見 3.1。

| 難度         | 顧問主動提醒 | 主動求助次數 | 新聞影響標示         |
| ------------ | ------------ | ------------ | -------------------- |
| `novice`     | 頻繁         | 5            | 自動標出影響哪些部位 |
| `standard`   | 只在關鍵時刻 | 2            | 不標示               |
| `historical` | 關閉         | 0            | 不標示               |

### 2.11 結局判定與評分

| 結局       | 條件                                                                             | 保留股權 |
| ---------- | -------------------------------------------------------------------------------- | -------- |
| C 失控違約 | `equity ≤ 0`,或強制平倉後仍無法補足保證金                                        | 0%       |
| B 歷史結局 | 接受 `E_CONSORTIUM`                                                              | 10%      |
| A 體面引資 | 接受收購方提案且保留股權 > 10%;或未引資撐到 9/30,但 `systemicImpact` 超過 S 門檻 | 依提案   |
| S 自救成功 | 未引資撐到 9/30,且 `systemicImpact ≤ params.endings.sImpactThreshold`            | 100%     |

```text
score = finalEquityUsdM × retainedEquityPct − λ × systemicImpact
```

結局畫面要有:等級、玩家股本曲線與史實錨點對照、每個關鍵時機「你的選擇 vs LTCM 當時的選擇」、事後檢討、資料來源;非史實結果標示「模擬推演」。

### 2.12 校準目標(史實數字)

史實路線劇本(見 T2.10)跑出來的結果應落在這些數字附近:

| 指標         | 史實值                                    | 測試容許範圍         | 來源                   |
| ------------ | ----------------------------------------- | -------------------- | ---------------------- |
| 6 月單月報酬 | −10.14%                                   | −6% 到 −14%          | Wikipedia              |
| 8 月單月報酬 | 約 −44%                                   | −35% 到 −50%         | Fed History、Wikipedia |
| 9/1 股本     | 約 2,300 usdM                             | 1,900–2,700          | Wikipedia              |
| 9/22 股本    | 9/25 約 400 usdM(9/23 已紓困)             | 低於 consortium 門檻 | Wikipedia              |
| 虧損組成     | 利率交換約 1,600、股票波動率約 1,300 usdM | 兩者為前兩大虧損來源 | Wikipedia              |
| 紓困         | 3,625 usdM 換 90% 股權                    | 固定值               | Fed History            |

---

## 3. LLM 整合規格

### 3.1 MVP 功能

| 功能           | Route                     | 觸發                            | 輸出 schema       |
| -------------- | ------------------------- | ------------------------------- | ----------------- |
| 自由對話談判   | `POST /api/llm/negotiate` | 玩家在通話視窗送出訊息          | `NegotiationTurn` |
| 風控長顧問問答 | `POST /api/llm/advisor`   | 玩家按「問顧問」,受難度次數限制 | `AdvisorAnswer`   |
| 事後檢討       | `POST /api/llm/debrief`   | 結局畫面載入時                  | `Debrief`         |

MVP 的兩位談判 NPC:

- **收購方**(`npc_buyer`):願意注資換股權,有底線(最多出資、最少要的股權)、耐心(最多回合)、期限。
- **交易商**(`npc_broker`):決定保證金比例與追繳寬限期,關心你的部位是否透明。

### 3.2 Provider 介面

```ts
// src/llm/provider.ts
export interface LLMRequest {
  system: string;
  messages: { role: "user" | "assistant"; content: string }[];
  maxTokens: number;
  temperature?: number;
}
export interface LLMResponse {
  text: string;
  usage?: { inputTokens: number; outputTokens: number };
}
export interface LLMProvider {
  complete(req: LLMRequest): Promise<LLMResponse>;
}
```

實作:`AnthropicProvider`(預設,模型由 `LLM_MODEL` 指定)、`MockProvider`(讀 `tests/llm/fixtures/`,CI 使用)。日後可加 OpenAI 相容的 provider。

### 3.3 上下文組裝與時間鎖

`src/llm/context.ts` 是唯一組裝上下文的地方:

- 只放 `releaseDate <= state.date` 的新聞、事件、玩家行動紀錄。
- 注入遊戲內日期(「今天是 1998 年 X 月 X 日」)與 NPC 人設卡。
- 角色、基金、銀行全部用化名(見 4.5);真實名稱只允許出現在 debrief。
- 單次上下文上限 `params.llm.maxContextItems` 則新聞,超過時取最近與最相關的。

### 3.4 輸出 Schema(Zod)

```ts
// src/llm/schemas.ts
export const NegotiationTurn = z.object({
  reply: z.string().max(300), // NPC 角色口吻的回話
  playerIntent: z.enum([
    "request_capital",
    "request_margin_relief",
    "disclose",
    "conceal",
    "threaten",
    "small_talk",
    "accept",
    "decline",
    "other",
  ]),
  disclosureLevel: z.number().min(0).max(1), // 玩家這輪透露了多少部位資訊
  counterOffer: z
    .object({
      capitalUsdM: z.number().nonnegative(),
      equityPct: z.number().min(0).max(100), // 對方要求的股權比例
      marginHaircutDelta: z.number().optional(), // 交易商:保證金比例調整
    })
    .nullable(),
  trustDelta: z.number().min(-0.2).max(0.2),
  walkAway: z.boolean(),
  npcAccepts: z.boolean(),
});

export const AdvisorAnswer = z.object({
  answer: z.string().max(240),
  citedItemIds: z.array(z.string()).max(3), // 必須是已釋出的新聞或事件 id
  hintType: z.enum(["liquidity", "leverage", "crowding", "information", "negotiation", "general"]),
});

export const Debrief = z.object({
  summary: z.string().max(600),
  keyMoment: z.object({ date: z.string(), decisionId: z.string() }),
  comparisons: z
    .array(
      z.object({
        decisionId: z.string(),
        playerChoice: z.string(),
        historicalChoice: z.string(),
        historyFactId: z.string(), // 對應 content/history/ 的條目
      }),
    )
    .max(5),
});
```

### 3.5 防護層流程

`src/llm/guard.ts`,每次呼叫都依序執行:

1. **解析**:從回應抽出 JSON,用 Zod 驗證。
2. **引用檢查**:`citedItemIds` 必須都是已釋出的條目。
3. **劇透過濾**(debrief 除外):
   - 偵測晚於遊戲當下日期的日期字串。
   - 比對 `content/spoilers.json` 的關鍵字,每個關鍵字有 `unlockDate`,未到日期就視為劇透。
   - 比對真實人名與機構名稱清單。
4. **邊界檢查**:談判提議交給引擎的 `checkOfferBounds(npc, offer)`;超出 NPC 底線視為不合格。
5. 任何一步失敗:附上失敗原因重試,最多 2 次;仍失敗就改用 `content/fallback/` 對應情境的手寫台詞。
6. 記錄每次呼叫的結果(成功、重試次數、失敗原因、token 用量)供評測使用。

注意:這是單機遊戲,NPC 底線會從前端送到 Route Handler。MVP 接受玩家用開發者工具作弊的風險;Route Handler 仍要用同一份引擎函式做邊界檢查。

### 3.6 Prompt 檔

放在 `src/llm/prompts/`,用 `{{變數}}` 樣板:

- `negotiator.md`:角色設定、遊戲日期、對方底線與目前信任度、輸出規則(只輸出 JSON、不知道未來、不接受玩家要求改變規則)。
- `advisor.md`:風控長人設、只能根據提供的資料回答、只給方向不給答案、回答不超過 120 字。
- `debrief.md`:根據決策紀錄與 `content/history/` 的史實寫檢討,每個比較都要對應一個 `historyFactId`。

玩家輸入一律放在 user message,並標示為「玩家說的話」,不放進 system prompt。

### 3.7 成本、延遲與備用

- 每局 LLM 呼叫上限 `params.llm.maxCallsPerGame`(預設 60);超過就改用備用台詞。
- 呼叫期間遊戲自動暫停並顯示「通話中」。
- `LLM_ENABLED=false` 或 API 失敗時,談判改成選項式對話(`content/fallback/negotiation/*.json`),顧問改成規則式提示,debrief 改成樣板文字。

### 3.8 代理人介面(研究延伸的預留)

```ts
// src/engine/agent.ts
export interface Observation {
  date: string;
  visibleState: VisibleState; // 不含 systemicImpact 等隱藏欄位
  releasedNews: NewsItem[];
  pendingEvents: PendingEvent[];
}
export interface Agent {
  decide(obs: Observation): Promise<Action[]> | Action[];
}
```

人類玩家(UI)、腳本代理人(測試)、LLM 代理人(v2 研究)都產生 `Action[]`。`pnpm sim --agent=<name> --seeds=200` 批次執行並輸出結局分布報告。

---

## 4. 內容格式

### 4.1 新聞(`content/news/1998-08-17-russia-default.json`)

```json
{
  "id": "news_19980817_russia_default",
  "releaseDate": "1998-08-17",
  "slot": "premarket",
  "channel": "paper",
  "priority": "major",
  "chainId": "chain_russia",
  "credibility": "fact",
  "headline": "俄羅斯宣布暫停償付國內短期公債,盧布擴大貶值區間",
  "body": "(自行改寫的摘要,2–3 句)",
  "affects": [
    { "bucket": "emDebt", "driftBp": 250, "lagDays": 0, "durationDays": 3 },
    { "bucket": "swapSpread", "driftBp": 12, "lagDays": 1, "durationDays": 10 }
  ],
  "isFiction": false,
  "sourceUrl": "https://en.wikipedia.org/wiki/1998_Russian_financial_crisis"
}
```

`headline` 與 `body` 為示意,實際文字與數值要在 M1 考據後填寫;`sourceUrl` 也要換成實際核對過的頁面。

### 4.2 NPC 人設卡(`content/npcs/npc_buyer.json`)

```json
{
  "id": "npc_buyer",
  "displayName": "梅瑞頓資本",
  "role": "buyer",
  "persona": "說話直接、重視速度與控制權,不喜歡冗長的解釋。",
  "hidden": {
    "maxCapitalUsdM": 4000,
    "minEquityPct": 60,
    "patienceTurns": 6,
    "deadlineSecondsAt1x": 90
  },
  "unlock": { "fromDate": "1998-09-01", "requires": ["callBuyer"] }
}
```

### 4.3 史實條目(`content/history/facts.json`)

每筆 `{ id, date, statement, numbers?, sourceUrl }`,例如紓困協議、8 月虧損、9/1 股本。結局畫面與 debrief 只能引用這裡的史實。

### 4.4 其他檔案

- `content/params.json`:第 2 節所有可調參數,依模組分區(`clock`、`market`、`margin`、`snipe`、`hedge`、`events`、`hints`、`endings`、`llm`、`difficulty`)。
- `content/scenario.json`:開局狀態、交易日曆、各部位基準路徑關鍵點、固定事件。
- `content/spoilers.json`:`[{ term, unlockDate, appliesTo: ["advisor", "negotiator"] }]`。
- `content/fallback/`:談判選項式對話、顧問提醒句、debrief 樣板。

### 4.5 化名表

鐵律 9 的化名定案(2026-10-02)。風格為西式音譯;下表之外不得在遊戲內出現任何真實機構或人名,真實名稱只允許出現在結局畫面的「史實對照」與資料來源。

| 遊戲內角色          | 化名                                    | 對應史實(僅供作者參考,不得進遊戲)   |
| ------------------- | --------------------------------------- | -------------------------------------- |
| 玩家的基金          | 凱斯隆資本管理 Kesslon Capital Management | LTCM                                   |
| 7 月平倉引爆者      | 賽佛兄弟 Seaver Brothers                | 某大型交易商的自營部位平倉             |
| 交易商 `npc_broker` | 凱德瑞證券 Caldrey Securities           | 主要經紀商                             |
| 收購方 `npc_buyer`  | 梅瑞頓資本 Merriton Capital             | 1998 年 9 月的收購提案方               |
| 風控長顧問          | 凡恩 Vane                               | 虛構                                   |
| 銀行團              | 十四家交易商銀行團                      | 1998-09-23 的銀行團                    |
| 央行                | 儲備理事會                              | 聯準會 / 紐約聯邦準備銀行              |

查證結果:凱斯隆、凱德瑞、梅瑞頓查無同名金融機構。原先考慮的「德溫特 Derwent」撞到 Derwent Capital Markets 與 Derwent London、「蘭斯福 Lansford」與 Lunsford Capital 音近,兩者皆已棄用。日後新增角色一律先查過再寫進 content。

---

## 5. UI 規格

畫面流程:標題與難度選擇 → 開場簡報(交代背景:槓桿已在高檔、角色為化名、靈感來自真實事件)→ 主畫面 → 通話視窗 → 結局畫面。

主畫面配置(桌機優先,寬度 ≥ 1280px):

- **頂列**:遊戲日期與時段、暫停 / 1x / 2x / 4x、股本、槓桿、可動用現金、三顆警示燈。
- **左欄**:新聞面板,分頁切換早報 / 快訊 / 傳聞 / 風控報告;未讀標記。
- **中欄**:NAV 曲線(lightweight-charts)與部位表(曝險、價差、流動性、擁擠度、當日損益)。
- **右欄**:行動面板(顯示剩餘時間預算;大單送出前預估衝擊成本)、電話與信件匣。
- **底列**:風控長的一句話提示。

視覺風格:1998 年交易終端機——深色背景、琥珀色與綠色等寬字、細微的 CRT 掃描線。動畫:數字跳動、大幅變動閃爍、警示燈脈動;支援 `prefers-reduced-motion` 並提供關閉動畫的開關。色彩對比需符合 WCAG AA。

存檔:`localStorage` 存一份自動存檔(讀寫都包 try/catch,失敗時不影響遊戲)。

---

## 6. 測試策略

| 層級         | 內容                                                                                                                        | 工具                  |
| ------------ | --------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| 引擎單元測試 | 價差內插、損益、保證金、強制平倉螺旋、衝擊成本、曝光與被狙擊、事件觸發、結局判定                                            | Vitest                |
| 決定性測試   | 同一個 seed 與行動序列跑兩次,狀態完全相同                                                                                   | Vitest                |
| 黃金劇本測試 | `historical` 腳本(不減碼、9/2 揭露、接受紓困)→ 結局 B,且符合 2.12 校準範圍;`earlyDeleverage` 腳本(7 月底前減碼 40%)→ S 或 A | Vitest + sim runner   |
| 內容驗證     | 所有 content 檔通過 Zod;`isFiction:false` 必有 `sourceUrl`;新聞日期在遊戲期間內                                             | `pnpm content:check`  |
| LLM 防護層   | 用 mock 產生不合格輸出(壞 JSON、超出底線、劇透、引用未釋出條目),確認都被擋下並走備用台詞                                    | Vitest + MockProvider |
| LLM 評測     | 注入攻擊集 ≥ 30 則、劇透探測集 ≥ 30 則、角色一致性多輪腳本 ≥ 10 段                                                          | `pnpm eval:llm`       |
| 冒煙測試     | 開始遊戲 → 推進 5 天 → 減碼 → 4x 跑到結局                                                                                   | Playwright            |

LLM 評測目標:JSON 有效率(含重試)≥ 98%;超出底線的提議被接受 0 次;過濾後劇透外洩 0 次。

---

## 7. 里程碑與任務

時程以 16 週計,自 2026-10-05 起(學期實際起訖日待確認)。

| 里程碑                    | 週次    | 日期                            |
| ------------------------- | ------- | ------------------------------- |
| M0 專案骨架               | W1      | 10/05–10/11                     |
| M1 內容 schema 與資料考據 | W1–W3   | 10/05–10/25                     |
| M2 引擎核心               | W4–W6   | 10/26–11/15                     |
| M3 UI 與可玩版本          | W7–W9   | 11/16–12/06                     |
| M4 LLM 整合               | W10–W11 | 12/07–12/20                     |
| M5 結局、提示、難度       | W12–W13 | 12/21–2027/01/03                |
| M6 平衡與打磨             | W14     | 2027/01/04–01/10                |
| M7 部署與發表             | W15–W16 | 2027/01/11–01/24(1/11 部署上線) |

### M0 專案骨架

- **T0.1** 建立 Next.js + TypeScript(strict)+ pnpm 專案,加入 Tailwind、ESLint、Prettier、Vitest、Playwright;`package.json` 加上 `CLAUDE.md` 列出的 scripts。
- **T0.2** 建立目錄結構與空模組,新增 `docs/PROGRESS.md`(列出本檔所有任務的勾選清單)。
- **T0.3** GitHub Actions:lint、typecheck、test、content:check。
- 驗收:CI 綠燈;`pnpm dev` 顯示佔位畫面。

### M1 內容 schema 與資料考據

- **T1.1** 在 `src/content/schemas.ts` 定義新聞、NPC、史實、params、scenario、fallback、spoilers 的 Zod schema,並實作 `pnpm content:check`。
- **T1.2** 建立範例資料:10 則新聞、2 張 NPC 人設卡、史實條目(第 11 節的來源)、`params.json` 預設值、`scenario.json`(含 1998/6/1–9/30 交易日曆)。
- **T1.3**(以人工為主,Claude Code 協助格式化與檢查)完成 40–60 則新聞、4 條線索鏈、5 類部位的基準路徑關鍵點。
- 驗收:`content:check` 通過;每條線索鏈至少 3 則、跨 2 種以上管道。

### M2 引擎核心

- **T2.1** `types.ts`、`rng.ts`(帶種子)、從 scenario 建立初始狀態。
- **T2.2** `advanceDay(state, actions, rng)`:三個時段、時間預算與行動排程。
- **T2.3** 市場模型:基準路徑內插、雜訊、事件與新聞漂移。
- **T2.4** 損益、股本、槓桿、融資成本。
- **T2.5** 保證金、追繳、強制平倉螺旋。
- **T2.6** 衝擊成本、擁擠度、曝光度與被狙擊、系統衝擊累計。
- **T2.7** 行動:`reduce`、`hedge`、`letter`、`callBroker`、`callBuyer`、`callReserve`、`wait`(談判結果先用固定規則,M4 再接 LLM)。
- **T2.8** 事件:第 2.8 節七個事件與限時事件的倒數狀態。
- **T2.9** 結局判定與評分。
- **T2.10** `Agent` 介面、`pnpm sim` 批次執行器、`historical` 與 `earlyDeleverage` 兩個腳本代理人。
- 驗收:第 6 節的引擎單元、決定性、黃金劇本測試全部通過。

### M3 UI 與可玩版本

- **T3.1** Zustand store 接引擎;真實時間時鐘、暫停與速度切換、自動暫停規則。
- **T3.2** 主畫面版面與終端機主題。
- **T3.3** 新聞面板(四種管道、未讀、自動暫停時跳出重大新聞)。
- **T3.4** NAV 曲線、部位表、警示燈。
- **T3.5** 行動面板:時間預算、大單衝擊預估與確認。
- **T3.6** 標題、難度選擇、開場簡報、自動存檔。
- **T3.7** 簡版結局畫面;談判先用選項式備用對話。
- 驗收:可以從 6/1 玩到結局;Playwright 冒煙測試通過;找 3 位同學試玩並記錄回饋。

### M4 LLM 整合

- **T4.1** Provider 介面、`AnthropicProvider`、`MockProvider`、環境變數、每局呼叫上限。
- **T4.2** `context.ts` 與時間鎖;測試確認未來條目不會進入上下文。
- **T4.3** `guard.ts` 防護層全流程與測試。
- **T4.4** 談判 Route 與通話視窗(對話、倒數、接受 / 拒絕),兩位 NPC。
- **T4.5** 顧問 Route 與 UI,次數依難度限制。
- **T4.6** Debrief Route(可引用真實名稱與史實,附出處)。
- **T4.7** 評測資料集與 `pnpm eval:llm` 報告。
- 驗收:`LLM_ENABLED=false` 時可完整玩完;有金鑰時達到第 6 節的評測目標。

### M5 結局、提示、難度

- **T5.1** 完整結局畫面:等級、曲線對照、決策對照、debrief、資料來源、「模擬推演」標示。
- **T5.2** 提示系統:警示燈門檻、與線索鏈連動的顧問主動提醒、三種難度設定。
- **T5.3** 決策紀錄匯出(JSON),供 debrief 與研究使用。
- 驗收:四種結局都能被腳本代理人觸發;切換難度會改變提示行為與求助次數。

### M6 平衡與打磨

- **T6.1** 用 `pnpm sim` 對每個腳本跑 200 個 seed,調整 `params.json`,輸出結局分布報告。
- **T6.2** 依試玩回饋修正;無障礙(減少動畫、對比)與效能檢查。
- 驗收:`historical` 腳本 80% 以上的 seed 落在 B 或 C;`earlyDeleverage` 腳本 60% 以上落在 S 或 A。

### M7 部署與發表

- **T7.1** Vercel 部署、環境變數、每局呼叫上限與錯誤時改用備用台詞。
- **T7.2** 展示模式(固定 seed、預設 4x);錄製 demo 影片或 GIF。
- **T7.3** README 與系統說明;期末簡報素材(人工)。
- 驗收:公開網址可以完整玩一局;拔掉 API key 也能玩完。

---

## 8. 環境變數與部署

| 變數                     | 說明                              |
| ------------------------ | --------------------------------- |
| `LLM_ENABLED`            | `true` / `false`,預設 `false`     |
| `LLM_PROVIDER`           | `anthropic` / `mock`              |
| `ANTHROPIC_API_KEY`      | 只放在伺服器端(Vercel 環境變數)   |
| `LLM_MODEL`              | 模型名稱,依當時可用的模型設定     |
| `LLM_MAX_CALLS_PER_GAME` | 覆蓋 `params.llm.maxCallsPerGame` |

部署到 Vercel;Route Handler 加簡單的速率限制,避免公開網址被濫用。

---

## 9. 風險與對策

| 風險                   | 對策                                                 |
| ---------------------- | ---------------------------------------------------- |
| 新聞考據耗時           | M1 給 3 週;先完成 4 條主線,其餘以虛構花絮補足並標示  |
| 數值平衡難調           | 參數全部外部化;用 sim runner 批次調整,而不是只靠手玩 |
| 模型知道真實結局而劇透 | 化名、時間鎖、劇透過濾、評測集;見 3.3、3.5           |
| 玩家用話術操縱 NPC     | 結構化輸出、引擎邊界檢查;見 3.5                      |
| API 成本或斷線         | 每局上限、快取、備用台詞;見 3.7                      |
| 範圍膨脹               | 第 1.3 節以外的功能一律記到待確認事項,不直接實作     |

---

## 10. 待確認事項

1. 6/1 開局數值(股本約 4,400 usdM、槓桿約 28 倍)是從年初約 4,700 usdM 與 5 月 −6.42% 推估的,需要再核對。
2. 「未引資撐到 9/30 但系統衝擊過高」評為 A,是否合適?
3. ~~基金、角色、銀行的化名(需確認不與真實機構同名)。~~ 2026-10-02 定案,見 4.5。
4. LLM 供應商、模型與每月預算上限。
5. 學期實際起訖日(時程目前假設 2026-10-05 開始)。
6. 收購方提案的觸發條件與條款範圍。
7. 1998 年 6–9 月的美國休市日與 Fed 9/29 降息需補上出處。

---

## 11. 參考資料

- [Long-Term Capital Management — Wikipedia](https://en.wikipedia.org/wiki/Long-Term_Capital_Management)
- [Near Failure of Long-Term Capital Management — Federal Reserve History](https://www.federalreservehistory.org/essays/ltcm-near-failure)
- [LTCM: 25 Years On — Net Interest](https://www.netinterest.co/p/ltcm-25-years-on)
- [東京股神 STONKS-9800 — Steam](https://store.steampowered.com/app/1539140/STONKS9800_Stock_Market_Simulator/?l=tchinese)(玩法參考)
- [TradingView lightweight-charts](https://github.com/tradingview/lightweight-charts)(Apache-2.0)
