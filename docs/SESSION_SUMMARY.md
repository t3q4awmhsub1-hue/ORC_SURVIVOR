# SESSION SUMMARY

## 2026-06-11 (2) — v1.0 公開

### 結果
**ORC SURVIVOR v1.0 を公開**: https://t3q4awmhsub1-hue.github.io/ORC_SURVIVOR/
（PLAN.md の M0〜M4 のうち、未完了は「GitHub Actions パイプライン」1項目のみ）

### 実施内容
1. **M1+M2 ゲームロジック**（`src/game/` — Three.js非依存の純粋TS）
   - GameWorld: 移動/敵AI/武器6種/パッシブ6種/敵7種/ボス/スポーンタイムライン/レベルアップ/勝敗
   - 空間分割グリッド・オブジェクトプール・シード可能PRNG（決定性テスト済み）
   - テスト51件（grid/rng/config/upgrades/world/sim）
2. **M3 描画と音**（`src/render/`, `src/audio/`）
   - キャラモデルを頂点カラーにベイク→種類ごとInstancedMesh（敵300体で0.35ms/frame実測）
   - パーティクル・衝撃波リング・扇形・光柱・被弾フラッシュ・画面シェイク・ダメージ数字
   - Web AudioプロシージャルSE 14種 + 16ステップシーケンサBGM（5:00とボス戦で転調）
3. **M4 バズ導線**
   - リザルト共有カード（Canvas 1200x630）+ X共有/画像保存/コピー、称号システム、OGP画像
   - 自動プレイシミュレーションでバランス調整: 近接武器の自動照準化、遠隔敵の安全圏除去など。
     回避AIで最長9:54到達。閾値を回帰テスト化（min≥3:30 / mean≥5:00 / best≥8:00）
4. **公開**: gh-pagesブランチ + Pages（legacy配信）。本番URLでゲーム動作・性能をPlaywright検証済み

### 技術メモ
- Playwrightでの検証時、ブラウザウィンドウが隠れているとrAFが1fpsに絞られる
  → `window.__game.bench()`（同期実行ベンチ）で性能計測する
- リザルトの`workflow`スコープ問題: OAuthトークンに`workflow`スコープがないと
  `.github/workflows/*` を含むコミットはpush拒否される。ワークフローコミットは履歴からrebaseで除去済み。
  deploy.yml のコピーは `%TEMP%\orc-deploy.yml` に保存してある

### 残タスク
- [ ] `gh auth refresh -h github.com -s workflow` をユーザーが実行
      → deploy.yml を復元・コミット・push → Pages のソースを GitHub Actions に切替
