# SESSION SUMMARY

## 2026-06-11

### 決定事項
- ゲームコンセプト: **案B「ORC SURVIVOR 〜10分間、勇者を返り討て〜」**（立場逆転サバイバー）
- 対応デバイス: **PCのみ**（WASD/矢印キー、攻撃は自動）
- アセット方針: **外部素材ゼロ**。3Dモデル・UI・SEはすべてコード生成（BGMのみ将来検討）

### 実施内容
1. `docs/SPEC.md` v0.1 作成（ルール・スキル・敵・10分タイムライン・技術仕様・スコープ）
2. `docs/PLAN.md` 作成（M0〜M4 マイルストーン）
3. Vite + TypeScript + Three.js + Vitest の基盤構築
4. コード生成3Dアセット実装（`src/assets/`）
   - `parts.ts`: プリミティブ生成ヘルパー（マテリアル共有キャッシュ付き）
   - `characters.ts`: キャラ9種 + 武器装備ビルダー
   - `props.ts`: 小物5種
5. アセットビューワー実装（`src/viewer/main.ts`）。Playwright で全モデルの見た目を検品し、オークの牙・真の勇者の髪と大剣の持ち方を修正

### 次にやること
- GitHub リポジトリ作成 + GitHub Actions → GitHub Pages デプロイ（M0 残り）
- M1 コアループ（移動・敵スポーン・自動攻撃・レベルアップ・10分タイマー）
