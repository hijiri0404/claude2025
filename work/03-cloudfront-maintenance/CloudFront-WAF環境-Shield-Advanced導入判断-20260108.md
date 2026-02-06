# CloudFront + WAF既存環境でのShield Advanced導入判断ガイド

## 📅 作成日
2026-01-08 (JST)

## 🎯 前提条件
- **既存構成**: CloudFront + AWS WAF導入済み
- **バックエンド**:
  - Amazon S3（静的コンテンツ）
  - API Gateway（動的API）
- **現在の保護**: Shield Standard（自動適用）

---

## 🔍 現状分析：既に持っている保護

### ✅ **Shield Standard（無料・自動）で既に提供されているもの**
```
✅ CloudFrontへのネットワーク層（L3/L4）DDoS保護
✅ UDP反射攻撃、TCP SYNフラッド等の基本防御
✅ 99%以上のネットワーク・トランスポート層攻撃の自動緩和
```

### ✅ **AWS WAF（既存）で提供されているもの**
```
✅ アプリケーション層（L7）のカスタムルール
✅ IPアドレス、地理的位置、リクエストパターンによるフィルタリング
✅ レートベースルール（手動設定が必要）
✅ マネージドルールグループの利用
```

### ⚠️ **現状の制約・ギャップ**
```
❌ 高度なL7 DDoS攻撃への自動対応なし
❌ DDoS専門家（SRT）サポートなし
❌ DDoS起因のコスト急増保護なし
❌ リアルタイムDDoS検知・通知なし
❌ トラフィックベースライン学習・自動ルール生成なし
❌ プロアクティブなDDoS対応なし
```

---

## 🎯 Shield Advancedが必要になる具体的シナリオ

### 1️⃣ **CloudFrontトラフィック急増時のコスト保護が必要**

#### 💰 **保護対象となるコスト**
```
✅ CloudFront HTTP/HTTPSリクエスト料金
✅ CloudFrontデータ転送出力（DTO）料金
✅ Shield Advancedデータ転送出力料金
✅ Route 53 DNSクエリ料金
```

#### 📊 **コスト保護の実例**
```
通常時のCloudFront料金：
- 月間100億リクエスト → 約$100,000
- データ転送 500TB → 約$40,000
- 合計：約$140,000/月

DDoS攻撃時（攻撃トラフィックが加わった場合）：
- 月間500億リクエスト（5倍増）→ 約$500,000
- データ転送 2,500TB（5倍増）→ 約$200,000
- 合計：約$700,000/月

→ 攻撃による追加費用：約$560,000

Shield Advancedでのコスト保護：
→ サービスクレジットで攻撃起因の追加費用を補償
→ 実質的に通常時の料金レベルに抑制可能
```

#### ⚠️ **コスト保護を受けるための前提条件**
```
必須要件（攻撃前に実装済みであること）:
1. Shield Advanced保護の追加（CloudFrontディストリビューション）
2. AWS WAF Web ACLの関連付け
3. レートベースルールの実装（Blockモード）
4. DDoS Resiliencyベストプラクティスの実装

⚠️ 攻撃発生後に保護を追加しても、その攻撃のコスト保護は受けられない
⚠️ クレジット申請期限：攻撃発生月の翌15日以内
```

#### 🎯 **こんな場合に強く推奨**
```
✅ 月間CloudFront利用料が$10,000以上
✅ 大規模キャンペーン・イベント時のトラフィック急増が予想される
✅ eコマース、動画配信など大容量データ転送サービス
✅ グローバル展開でトラフィック量が大きい
✅ 過去にDDoS攻撃で料金急増の経験がある

計算式：
年間CloudFront料金 × 想定DDoS攻撃時の増加率
> Shield Advanced年間コスト（$3,000 + DTO料金）
→ 導入を強く推奨
```

---

### 2️⃣ **自動アプリケーション層（L7）DDoS緩和が必要**

#### 🤖 **Shield Advancedの自動緩和機能**

##### **仕組み**
```
1. トラフィックベースライン確立（24時間〜30日）
   - CloudFrontへの正常トラフィックパターン学習
   - S3静的コンテンツとAPI Gatewayへのリクエスト特性分析

2. 既知のDDoS送信元IPアドレスの自動追跡
   - レートベースルールで自動制限

3. リアルタイム異常検知
   - 現在のトラフィックと履歴ベースラインの比較
   - DDoS攻撃の可能性を自動検出

4. カスタムAWS WAFルールの自動生成・適用
   - 検出された攻撃パターンに応じたルール作成
   - Shield AdvancedルールグループへのルールDeployment
   - カウントモードまたはブロックモードで動作
```

##### **既存WAF Web ACLへの統合**
```
✅ 既存のWAF Web ACLに150 WCUのShield Advancedルールグループを追加
✅ 既存ルールと競合せず並行動作
✅ 自動管理（手動介入不要）
✅ 攻撃終息後の自動クリーンアップ

⚠️ 150 WCUが追加されるため、既存WCU使用量を確認
   （WAF Web ACLの最大：1,500 WCU → Shield Advancedサブスクリプションでカバー）
```

##### **CloudFront特有の最適化**
```
✅ CloudFrontディストリビューションでの自動緩和有効化を推奨
⚠️ バックエンドALBでの自動緩和は効果が低下
   （CloudFront経由トラフィックは元のクライアント属性が保持されない可能性）

推奨構成：
CloudFront（Shield Advanced自動緩和ON）
   ↓
S3 + API Gateway（バックエンド保護）
```

#### 🎯 **こんな場合に必要**
```
✅ アプリケーション層（HTTPフラッド）攻撃のリスクが高い
✅ API Gatewayへの大量リクエストフラッドが懸念される
✅ 手動でのWAFルール調整が運用負荷になっている
✅ 攻撃時の即座対応が必要（24/7運用体制がない）
✅ 複雑な攻撃パターンへの自動適応が必要

手動WAF vs 自動緩和の比較：
- 手動：攻撃検知 → 分析 → ルール作成 → テスト → Deploy（数時間〜数日）
- 自動：攻撃検知 → 自動ルール生成・適用（数分〜数十分）
```

---

### 3️⃣ **24/7 DDoS専門家サポート（SRT）が必要**

#### 🛡️ **Shield Response Team（SRT）ができること**

##### **CloudFront + WAF環境での具体的支援**
```
✅ CloudFrontへのDDoS攻撃リアルタイム分析
✅ WAFルールの最適化支援
   - レートベースルールのしきい値調整
   - 既存ルールとShield Advancedルールの統合最適化
   - 誤検知（False Positive）の削減

✅ S3およびAPI Gateway保護戦略の助言
✅ カスタム緩和策の設計・実装
✅ 攻撃後の詳細レポート作成
✅ DDoS Resiliencyアーキテクチャレビュー
```

##### **プロアクティブエンゲージメント**
```
Route 53ヘルスチェック連携：
- CloudFront / API Gatewayのヘルスチェック設定
- 不健全状態検出時、SRTから直接連絡
- 攻撃の疑いがある場合の即座対応
- 可用性低下の最小化

⚠️ 前提条件：
- Route 53ヘルスチェック設定必須
- Business/Enterprise Supportプラン加入必須
```

#### 🎯 **こんな場合に必要**
```
✅ 社内にDDoS対応専門家がいない
✅ 24時間365日の即座対応体制が必要
✅ SLA契約でダウンタイム補償が必要
✅ 金融、eコマース等の高可用性要求サービス
✅ 攻撃時の判断を専門家に委ねたい
✅ 過去のDDoS攻撃で対応に苦慮した経験がある

コスト対効果：
- 社内DDoS対応チーム構築コスト（人件費、トレーニング、ツール）
- vs Shield Advanced年間コスト + Support Plan
→ 多くの場合、Shield Advancedの方が低コスト
```

---

### 4️⃣ **高度な可視性・モニタリングが必要**

#### 📊 **Shield Advancedで追加される可視性**

##### **CloudFront向けメトリクス**
```
✅ DDoS攻撃の詳細分析
   - 攻撃の種類（HTTPフラッド、SlowLoris等）
   - 攻撃規模（リクエスト数、帯域幅）
   - 攻撃元の地理的分布
   - 攻撃継続時間

✅ リアルタイムメトリクス（CloudWatch統合）
   - CloudFrontリクエストパターン
   - WAFルールマッチング状況
   - Shield Advancedルールグループの動作状況

✅ 詳細レポート
   - イベントタイムライン
   - 緩和アクションの効果測定
   - トラフィック分析
```

##### **API Gateway向けインサイト**
```
✅ API Gatewayへの異常トラフィック検知
✅ エンドポイント別の攻撃パターン分析
✅ レート制限の効果測定
```

#### 🎯 **こんな場合に有用**
```
✅ セキュリティダッシュボード構築が必要
✅ コンプライアンス要件でDDoS監視ログ必須
✅ トラフィック分析による攻撃予兆検知が必要
✅ 攻撃パターンの傾向分析が必要
✅ 経営層への定期的なセキュリティレポート提出が必要
```

---

### 5️⃣ **複数リソースの統合保護が必要**

#### 🔗 **保護グループ活用**

##### **CloudFront環境での保護グループ構成例**
```
グループ1: Webアプリケーション
- CloudFront Distribution（メイン）
- Route 53 Hosted Zone
- API Gateway（バックエンド）

グループ2: APIサービス
- CloudFront Distribution（API専用）
- API Gateway（複数エンドポイント）
- Route 53 Hosted Zone（API用ドメイン）

メリット：
✅ グループ全体での攻撃検知・緩和
✅ 新規リソース追加時の自動保護グループ参加
✅ 統合的なイベント管理
```

#### 🎯 **こんな場合に有用**
```
✅ 複数のCloudFrontディストリビューション運用
✅ 複数のAPI Gatewayエンドポイント管理
✅ マイクロサービスアーキテクチャ
✅ 段階的なサービス拡張予定
```

---

## ⚖️ 判断マトリクス：CloudFront + WAF環境でのAdvanced導入

### 🔴 **高優先度（強く推奨）**

#### **ビジネス要件**
```
✅ 月間CloudFront料金が$10,000以上
✅ eコマース、決済処理等の収益直結サービス
✅ SLA契約（稼働率99.9%以上保証）
✅ グローバル展開で大規模トラフィック
✅ 大規模キャンペーン・イベントでトラフィック急増
```

#### **技術要件**
```
✅ アプリケーション層DDoS攻撃の高リスク
✅ API Gatewayへの大量リクエスト懸念
✅ 24時間365日の即座DDoS対応体制必要
✅ 社内にDDoS対応専門家不在
```

#### **コスト要件**
```
✅ DDoS攻撃時のCloudFront料金急増リスクが年間$50,000以上
✅ ダウンタイム1時間あたりの損失が$10,000以上

計算例：
年間想定損失 = 想定攻撃回数 × 平均コスト増加 + ダウンタイム損失
$50,000 = 2回/年 × $20,000 + 2時間 × $10,000

→ Shield Advanced年間コスト（約$3,000〜）を大きく上回る
```

---

### 🟡 **中優先度（検討推奨）**

#### **ビジネス要件**
```
✅ 月間CloudFront料金が$3,000〜$10,000
✅ 高トラフィックWebアプリケーション
✅ レピュテーション維持が重要なメディアサイト
✅ API提供サービス（多数の外部連携）
```

#### **技術要件**
```
✅ 過去にL7攻撃を受けた経験あり
✅ 手動WAFルール管理の運用負荷が高い
✅ トラフィックパターンが複雑で手動対応困難
✅ セキュリティ監視強化が必要
```

#### **判断基準**
```
✅ ビジネス成長フェーズ（トラフィック増加傾向）
✅ 攻撃リスクの増加傾向
✅ 競合他社への攻撃トレンド
✅ コンプライアンス要件の強化

段階的アプローチ：
Phase 1: 最重要CloudFrontディストリビューションのみ保護
Phase 2: 効果測定後、全ディストリビューションへ拡大
```

---

### 🟢 **低優先度（Shield Standard継続）**

#### **ビジネス要件**
```
✅ 月間CloudFront料金が$3,000未満
✅ 小〜中規模トラフィック（月間PV 100万未満）
✅ 内部向けサービス（VPN経由アクセス主体）
✅ 開発・テスト・検証環境
```

#### **技術要件**
```
✅ 静的コンテンツ中心（S3バックエンドのみ）
✅ 低頻度API利用（API Gateway利用少ない）
✅ シンプルなトラフィックパターン
✅ 既存WAFルールで十分な保護レベル
```

#### **判断基準**
```
✅ ダウンタイム許容度が高い
✅ コスト最適化が最優先
✅ DDoS攻撃のターゲットになる可能性が低い
✅ 短期間の実験的プロジェクト
```

---

## 🔧 CloudFront + WAF環境でのShield Advanced実装手順

### Phase 1: 導入準備（攻撃前に完了必須）

#### 1. **前提条件確認**
```bash
# Business/Enterprise Supportプラン加入確認
aws support describe-severity-levels

# 既存WAF Web ACL確認
aws wafv2 list-web-acls --scope=CLOUDFRONT --region=us-east-1

# CloudFrontディストリビューション一覧
aws cloudfront list-distributions
```

#### 2. **レートベースルール実装（コスト保護の前提条件）**
```
既存WAF Web ACLに追加：
- レートベースルール作成（Blockモード）
- しきい値設定（例：5分間で2,000リクエスト/IP）
- CloudFrontディストリビューションに関連付け

⚠️ この設定は攻撃前に完了している必要あり
```

#### 3. **Route 53ヘルスチェック設定**
```
対象：
- CloudFrontディストリビューション
- API Gateway（CloudFront経由）

設定項目：
- ヘルスチェックタイプ：HTTPS
- パス：/health or /api/health
- しきい値：連続3回失敗で不健全
- 間隔：30秒
```

---

### Phase 2: Shield Advanced有効化

#### 1. **サブスクリプション契約**
```bash
# Shield Advancedサブスクリプション作成
aws shield subscribe-to-shield-advanced

# Organizations統合請求確認（複数アカウントの場合）
aws organizations describe-organization
```

#### 2. **CloudFrontディストリビューション保護追加**
```bash
# 優先度順に保護追加
# 1. 本番CloudFront（最重要）
aws shield create-protection \
  --name "production-cloudfront-protection" \
  --resource-arn "arn:aws:cloudfront::123456789012:distribution/EDFDVBD6EXAMPLE"

# 2. API用CloudFront
aws shield create-protection \
  --name "api-cloudfront-protection" \
  --resource-arn "arn:aws:cloudfront::123456789012:distribution/E2EXAMPLE"
```

#### 3. **自動アプリケーション層DDoS緩和有効化**
```
CloudFrontディストリビューションごとに設定：
- Shield Advancedコンソール → 保護されたリソース
- 各CloudFrontディストリビューション選択
- 「自動アプリケーション層DDoS緩和」を有効化
- アクション選択：Count（観察期間）→ Block（本番適用）

推奨フロー：
1. 最初の24時間〜30日：Countモード（ベースライン確立）
2. ベースライン確立後：Blockモードへ切り替え
```

#### 4. **Route 53 Hosted Zone保護追加（オプション）**
```bash
aws shield create-protection \
  --name "route53-zone-protection" \
  --resource-arn "arn:aws:route53:::hostedzone/Z3M3LMPEXAMPLE"
```

---

### Phase 3: モニタリング・アラート設定

#### 1. **CloudWatch アラーム設定**
```
監視メトリクス：
- DDoS攻撃検出
- Shield Advancedルールグループマッチング
- CloudFrontエラー率
- API Gatewayレイテンシ

通知先：
- SNS トピック作成
- セキュリティ・運用チームへの通知
```

#### 2. **Shield Advancedダッシュボード構築**
```
含めるメトリクス：
- 保護されたリソース一覧
- DDoSイベント履歴
- 自動緩和ルール動作状況
- トラフィックベースライン比較
```

#### 3. **プロアクティブエンゲージメント設定**
```
有効化手順：
1. Route 53ヘルスチェック関連付け
2. 緊急連絡先情報登録（複数推奨）
3. エスカレーション手順文書化
4. SRTとの連携訓練（年2回推奨）
```

---

### Phase 4: 運用・最適化

#### 1. **定期レビュー（月次）**
```
確認項目：
□ DDoSイベント発生有無
□ 誤検知（False Positive）の有無
□ 自動緩和ルールの効果
□ CloudFront/API Gatewayトラフィックパターン変化
□ WCU使用量（150 WCU + 既存ルール）
```

#### 2. **ベストプラクティス実装確認**
```
□ CloudFrontオリジンアクセス制限（S3バケットポリシー）
□ API Gatewayスロットリング設定
□ WAFレートベースルールのしきい値最適化
□ CloudFront地理的制限（必要に応じて）
□ HTTPS通信の強制
```

#### 3. **コスト最適化**
```
□ CloudFront料金分析（通常時 vs 攻撃時想定）
□ Shield Advanced DTO使用量モニタリング
□ 不要な保護リソースの削減
□ Organizations統合請求の活用
```

---

## 💰 コスト試算：CloudFront + WAF環境

### **Shield Advanced導入コスト**

#### **基本料金**
```
月額サブスクリプション：$3,000
年額：$36,000

※ Organizations統合請求で全アカウント・リソースカバー
```

#### **データ転送料金（DTO）**
```
最初の10TB：$0.60/GB
次の40TB：$0.40/GB
50TB超：$0.15/GB

月間500TBの場合：
10TB × $0.60 = $6,000
40TB × $0.40 = $16,000
450TB × $0.15 = $67,500
合計：$89,500/月
```

#### **WAF統合（Shield Advancedサブスクリプションに含まれる）**
```
✅ Web ACL（Protection Pack）：含まれる
✅ ルールコスト：含まれる
✅ 最大1,500 WCUまで：含まれる
✅ 月間500億リクエストまで：含まれる
✅ Layer 7 Anti-DDoSマネージドルールグループ：含まれる

追加料金（含まれない）：
❌ Bot Control：$10/月 + $1/100万リクエスト
❌ CAPTCHA：$0.40/1,000チャレンジ
❌ 1,500 WCU超過分：$1/月/WCU
❌ 500億リクエスト超過分：従量課金
```

---

### **コスト対効果シミュレーション**

#### **シナリオ1: 中規模eコマースサイト**
```
【現状】
- 月間CloudFront料金：$5,000
- 月間データ転送：50TB
- 年間合計：$60,000

【DDoS攻撃時（想定）】
- トラフィック3倍増
- 月間CloudFront料金：$15,000
- 攻撃による追加費用：$10,000/回
- 年間想定攻撃：2回
- 年間攻撃コスト：$20,000

【Shield Advanced導入】
- 年間サブスクリプション：$36,000
- 年間DTO（50TB/月）：約$18,000
- 年間合計：$54,000

【コスト保護適用後】
- 攻撃時の追加費用：サービスクレジットで相殺
- 実質コスト増：$54,000（Shield Advancedのみ）

【ROI分析】
- 導入コスト：$54,000/年
- 保護される潜在コスト：$20,000/年（攻撃費用）
- その他メリット：
  * ダウンタイム回避（収益損失防止）
  * レピュテーション保護
  * 運用負荷軽減（自動緩和）
  * SRTサポート

→ 攻撃頻度・規模によってはROI+
```

#### **シナリオ2: 大規模動画配信サービス**
```
【現状】
- 月間CloudFront料金：$50,000
- 月間データ転送：500TB
- 年間合計：$600,000

【DDoS攻撃時（想定）】
- トラフィック5倍増
- 月間CloudFront料金：$250,000
- 攻撃による追加費用：$200,000/回
- 年間想定攻撃：3回
- 年間攻撃コスト：$600,000

【Shield Advanced導入】
- 年間サブスクリプション：$36,000
- 年間DTO（500TB/月）：約$1,074,000
- 年間合計：$1,110,000

【コスト保護適用後】
- 攻撃時の追加費用：サービスクレジットで相殺
- 実質コスト増：$1,110,000（Shield Advancedのみ）

【ROI分析】
- 導入コスト：$1,110,000/年
- 保護される潜在コスト：$600,000/年（攻撃費用）
- その他メリット：
  * ダウンタイム回避（大規模収益損失防止）
  * ブランド価値保護
  * 自動緩和による即座対応
  * 24/7 SRTサポート

→ DTOコストが高額だが、大規模攻撃時の保護価値は高い
→ ビジネスインパクト（収益損失、ブランド価値）次第で導入判断
```

---

## ⚠️ CloudFront + WAF環境での注意事項

### **自動緩和の制約**

#### 1. **ベースライン確立期間**
```
⚠️ 24時間〜30日の学習期間が必要
⚠️ この期間は自動緩和の精度が低い可能性
⚠️ トラフィックパターン変化時は再学習が必要

推奨対策：
- 新サービスローンチ前にShield Advanced有効化
- 十分な学習期間を確保してから本番トラフィック
- 初期はCountモードで誤検知を監視
```

#### 2. **複数リソース保護時の制約**
```
⚠️ 複数リソースを1つのWeb ACLで保護する場合、
   自動緩和は全リソースに影響しないルールのみ適用

例：
CloudFront Distribution A（静的コンテンツ）
CloudFront Distribution B（動的API）
→ 同一Web ACLで保護

Distribution Bへの攻撃時：
- Distribution Aに影響するルールは適用されない
- 緩和効果が限定的になる可能性

推奨対策：
- リソースごとに個別のWeb ACL作成
- または保護グループで論理分離
```

#### 3. **バックエンドALB経由の制約**
```
⚠️ CloudFront → ALB構成の場合、ALB側の自動緩和効果が低下
⚠️ CloudFrontがクライアント属性を保持しない可能性

推奨対策：
- CloudFront側で自動緩和を有効化
- ALB側は個別のWAFルールで補完
```

---

### **コスト保護の制約**

#### 1. **事前設定必須**
```
⚠️ 攻撃前にShield Advanced保護追加必須
⚠️ 攻撃前にレートベースルール（Block）実装必須
⚠️ 攻撃前にDDoS Resiliencyベストプラクティス実装必須

→ 攻撃発生後の対応では保護されない
```

#### 2. **クレジット申請期限**
```
⚠️ 攻撃発生月の翌15日以内に申請必須
⚠️ 遅延すると申請不可

推奨対策：
- 攻撃検知時の即座報告フロー確立
- クレジット申請手順の文書化
- 担当者不在時のバックアップ体制
```

#### 3. **対象外コスト**
```
❌ Shield Advanced非保護リソースの料金
❌ Bot Control追加料金
❌ CAPTCHA追加料金
❌ 1,500 WCU超過分
❌ 500億リクエスト超過分

→ 完全なコスト保護ではないことに注意
```

---

## 📋 導入判断チェックリスト

### **ビジネス要件**
```
□ 月間CloudFront料金が$10,000以上
□ SLA契約（稼働率保証）がある
□ eコマース、決済等の収益直結サービス
□ ダウンタイム1時間あたりの損失が$10,000以上
□ グローバル展開で大規模トラフィック
□ 大規模キャンペーン・イベントでトラフィック急増予定
□ レピュテーション損失が致命的
□ 過去にDDoS攻撃を受けた経験がある
```

### **技術要件**
```
□ アプリケーション層DDoS攻撃のリスクが高い
□ API Gatewayへの大量リクエスト懸念
□ 手動WAFルール管理が運用負荷
□ 24時間365日の即座DDoS対応体制が必要
□ 社内にDDoS対応専門家がいない
□ 複雑な攻撃パターンへの自動適応が必要
□ トラフィックパターンが複雑
```

### **組織要件**
```
□ Business/Enterprise Supportプラン加入可能
□ セキュリティ予算が確保されている
□ 経営層のDDoS対策への理解・支持
□ セキュリティインシデント対応体制がある
□ コンプライアンスでDDoS対策が必須
```

### **前提条件（導入前に準備）**
```
□ AWS WAF Web ACL設定済み
□ レートベースルール実装済み（Blockモード）
□ Route 53ヘルスチェック設定可能
□ DDoS Resiliencyベストプラクティス実装済み
□ CloudFrontオリジンアクセス制限設定済み
□ API Gatewayスロットリング設定済み
```

---

## 🎯 結論：CloudFront + WAF環境での導入推奨

### **強く推奨（即座導入検討）**
```
以下の「すべて」に該当する場合：
✅ 月間CloudFront料金 ≥ $10,000
✅ SLA契約または高可用性要求あり
✅ DDoS攻撃時の潜在損失 > Shield Advanced年間コスト

OR

以下の「いずれか」に該当する場合：
✅ eコマース、決済等の収益直結サービス
✅ 過去にDDoS攻撃で深刻な影響を受けた
✅ 社内DDoS対応体制が整っていない
```

### **検討推奨（段階的導入検討）**
```
以下の「複数」に該当する場合：
✅ 月間CloudFront料金：$3,000〜$10,000
✅ ビジネス成長フェーズ（トラフィック増加傾向）
✅ アプリケーション層攻撃のリスク認識
✅ 手動WAF管理の運用負荷が高い
✅ セキュリティ強化の経営方針

推奨アプローチ：
Phase 1: 最重要CloudFrontディストリビューションのみ保護
Phase 2: 3ヶ月の効果測定
Phase 3: 全ディストリビューションへ展開判断
```

### **慎重判断（現状維持またはコスト優先）**
```
以下の「すべて」に該当する場合：
✅ 月間CloudFront料金 < $3,000
✅ 小〜中規模トラフィック
✅ 静的コンテンツ中心（S3バックエンドのみ）
✅ DDoS攻撃のターゲットになる可能性が低い
✅ コスト最適化が最優先

推奨：
- Shield Standard + 既存WAFで継続
- 定期的なリスク評価（四半期ごと）
- ビジネス成長に応じた再検討
```

---

## 📚 参考リンク

### AWS公式ドキュメント
- [Automating application layer DDoS mitigation](https://docs.aws.amazon.com/waf/latest/developerguide/ddos-automatic-app-layer-response.html)
- [Requesting a credit after an attack](https://docs.aws.amazon.com/waf/latest/developerguide/ddos-request-service-credit.html)
- [Using AWS WAF with CloudFront](https://docs.aws.amazon.com/waf/latest/developerguide/cloudfront-features.html)
- [Shield Advanced Overview](https://docs.aws.amazon.com/waf/latest/developerguide/ddos-advanced-summary.html)

### ベストプラクティス
- [AWS Best Practices for DDoS Resiliency](https://docs.aws.amazon.com/whitepapers/latest/aws-best-practices-ddos-resiliency)
- [Guidelines for Implementing AWS WAF](https://docs.aws.amazon.com/whitepapers/latest/guidelines-for-implementing-aws-waf)

### 料金情報
- [AWS Shield Pricing](https://aws.amazon.com/shield/pricing/)
- [AWS WAF Pricing](https://aws.amazon.com/waf/pricing/)
- [CloudFront Pricing](https://aws.amazon.com/cloudfront/pricing/)

---

## 💡 次のアクション

### 導入決定した場合
```
1. Business/Enterprise Supportプラン加入確認
2. レートベースルール実装（Blockモード）
3. Route 53ヘルスチェック設定
4. Shield Advancedサブスクリプション契約
5. CloudFrontディストリビューション保護追加
6. 自動アプリケーション層DDoS緩和有効化（Countモード）
7. 24時間〜30日のベースライン確立期間
8. Blockモードへ切り替え
9. プロアクティブエンゲージメント設定
10. 定期レビュー体制確立
```

### 検討継続する場合
```
1. 詳細コスト試算（現状 vs 攻撃時 vs Shield Advanced）
2. 想定DDoS攻撃シナリオ作成
3. ビジネスインパクト評価
4. 社内稟議・予算確保
5. パイロット導入計画策定
```

### 現状維持する場合
```
1. 既存WAFルールの最適化
2. CloudFront設定のセキュリティ強化
3. API Gatewayスロットリング強化
4. DDoS攻撃監視体制確立
5. 四半期ごとのリスク再評価
```
