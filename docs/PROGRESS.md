# 開發進度

對應 `docs/PLAN.md` 第 7 節。每完成一項就在這裡打勾,並補上完成日期與備註。

任務完成的標準:`pnpm lint && pnpm typecheck && pnpm test && pnpm content:check` 全部通過。

## M0 專案骨架(W1,10/05–10/11)

- [x] **T0.1** 建立 Next.js + TypeScript(strict)+ pnpm 專案,加入 Tailwind、ESLint、Prettier、Vitest、Playwright;`package.json` 加上 `CLAUDE.md` 列出的 scripts。<br>2026-10-01 · Next 16.3.7 / React 19 / pnpm 12.8.1;`content:check`、`eval:llm` 先放佔位腳本;ESLint 另加規則擋住引擎 import React/Next。
- [x] **T0.2** 建立目錄結構與空模組,新增 `docs/PROGRESS.md`(列出本檔所有任務的勾選清單)。<br>2026-10-01 · `src/engine`、`src/llm`、`src/content` 放 `export {}` 佔位模組,每支檔頭註明由哪個任務填實作。
- [x] **T0.3** GitHub Actions:lint、typecheck、test、content:check。<br>2026-10-01 · `.github/workflows/ci.yml`,單一 job;pnpm 版本由 `package.json` 的 `packageManager` 決定。
- [x] **驗收**:CI 綠燈;`pnpm dev` 顯示佔位畫面。<br>2026-10-01 · remote 為 `9teencm/money_game_1998`。首跑紅燈:`LayoutProps` 由 Next 產生在 gitignore 掉的 `.next/types/`,CI 乾淨 checkout 找不到 → `typecheck` 改成 `next typegen && tsc --noEmit`。

**M0 完成。** 踩到的坑記在這裡,之後遇到同類問題可對照:本機跑得過不代表 CI 跑得過,差別通常是 gitignore 掉的產生檔。驗證方式是刪掉 `.next` 再跑一次。

## M1 內容 schema 與資料考據(W1–W3,10/05–10/25)

- [ ] **T1.1** 在 `src/content/schemas.ts` 定義新聞、NPC、史實、params、scenario、fallback、spoilers 的 Zod schema,並實作 `pnpm content:check`。
- [ ] **T1.2** 建立範例資料:10 則新聞、2 張 NPC 人設卡、史實條目、`params.json` 預設值、`scenario.json`(含 1998/6/1–9/30 交易日曆)。
- [ ] **T1.3** 完成 40–60 則新聞、4 條線索鏈、5 類部位的基準路徑關鍵點(以人工為主)。
- [ ] **驗收**:`content:check` 通過;每條線索鏈至少 3 則、跨 2 種以上管道。

## M2 引擎核心(W4–W6,10/26–11/15)

- [ ] **T2.1** `types.ts`、`rng.ts`(帶種子)、從 scenario 建立初始狀態。
- [ ] **T2.2** `advanceDay(state, actions, rng)`:三個時段、時間預算與行動排程。
- [ ] **T2.3** 市場模型:基準路徑內插、雜訊、事件與新聞漂移。
- [ ] **T2.4** 損益、股本、槓桿、融資成本。
- [ ] **T2.5** 保證金、追繳、強制平倉螺旋。
- [ ] **T2.6** 衝擊成本、擁擠度、曝光度與被狙擊、系統衝擊累計。
- [ ] **T2.7** 行動:`reduce`、`hedge`、`letter`、`callBroker`、`callBuyer`、`callReserve`、`wait`。
- [ ] **T2.8** 事件:PLAN 2.8 的七個事件與限時事件倒數狀態。
- [ ] **T2.9** 結局判定與評分。
- [ ] **T2.10** `Agent` 介面、`pnpm sim` 批次執行器、`historical` 與 `earlyDeleverage` 兩個腳本代理人。
- [ ] **驗收**:引擎單元、決定性、黃金劇本測試全部通過(PLAN 第 6 節)。

## M3 UI 與可玩版本(W7–W9,11/16–12/06)

- [ ] **T3.1** Zustand store 接引擎;真實時間時鐘、暫停與速度切換、自動暫停規則。
- [ ] **T3.2** 主畫面版面與終端機主題。
- [ ] **T3.3** 新聞面板(四種管道、未讀、自動暫停時跳出重大新聞)。
- [ ] **T3.4** NAV 曲線、部位表、警示燈。
- [ ] **T3.5** 行動面板:時間預算、大單衝擊預估與確認。
- [ ] **T3.6** 標題、難度選擇、開場簡報、自動存檔。
- [ ] **T3.7** 簡版結局畫面;談判先用選項式備用對話。
- [ ] **驗收**:可以從 6/1 玩到結局;Playwright 冒煙測試通過;3 位同學試玩回饋。

## M4 LLM 整合(W10–W11,12/07–12/20)

- [ ] **T4.1** Provider 介面、`AnthropicProvider`、`MockProvider`、環境變數、每局呼叫上限。
- [ ] **T4.2** `context.ts` 與時間鎖;測試確認未來條目不會進入上下文。
- [ ] **T4.3** `guard.ts` 防護層全流程與測試。
- [ ] **T4.4** 談判 Route 與通話視窗(對話、倒數、接受 / 拒絕),兩位 NPC。
- [ ] **T4.5** 顧問 Route 與 UI,次數依難度限制。
- [ ] **T4.6** Debrief Route(可引用真實名稱與史實,附出處)。
- [ ] **T4.7** 評測資料集與 `pnpm eval:llm` 報告。
- [ ] **驗收**:`LLM_ENABLED=false` 時可完整玩完;有金鑰時達到 PLAN 第 6 節的評測目標。

## M5 結局、提示、難度(W12–W13,12/21–2027/01/03)

- [ ] **T5.1** 完整結局畫面:等級、曲線對照、決策對照、debrief、資料來源、「模擬推演」標示。
- [ ] **T5.2** 提示系統:警示燈門檻、與線索鏈連動的顧問主動提醒、三種難度設定。
- [ ] **T5.3** 決策紀錄匯出(JSON)。
- [ ] **驗收**:四種結局都能被腳本代理人觸發;切換難度會改變提示行為與求助次數。

## M6 平衡與打磨(W14,2027/01/04–01/10)

- [ ] **T6.1** 用 `pnpm sim` 對每個腳本跑 200 個 seed,調整 `params.json`,輸出結局分布報告。
- [ ] **T6.2** 依試玩回饋修正;無障礙(減少動畫、對比)與效能檢查。
- [ ] **驗收**:`historical` 腳本 80% 以上落在 B 或 C;`earlyDeleverage` 腳本 60% 以上落在 S 或 A。

## M7 部署與發表(W15–W16,2027/01/11–01/24)

- [ ] **T7.1** Vercel 部署、環境變數、每局呼叫上限與錯誤時改用備用台詞。
- [ ] **T7.2** 展示模式(固定 seed、預設 4x);錄製 demo 影片或 GIF。
- [ ] **T7.3** README 與系統說明;期末簡報素材(人工)。
- [ ] **驗收**:公開網址可以完整玩一局;拔掉 API key 也能玩完。
