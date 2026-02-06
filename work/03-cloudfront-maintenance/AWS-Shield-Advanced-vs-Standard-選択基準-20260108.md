# AWS Shield Advanced vs Standard - 選択基準と判断ガイド

## 📅 作成日
2026-01-08 (JST)

## 🎯 概要
AWS ShieldのStandardとAdvancedの違いを理解し、適切なプランを選択するための判断基準を整理。

## ❓ 質問
AWS Shield でAdvanceとStandardを利用する場合、どのようなときにAdvancedが必要か？

---

## 📊 Shield Standard vs Advanced 比較

### **Shield Standard（無料・自動提供）**
- **提供形態**: すべてのAWSユーザーに自動適用（追加料金なし）
- **保護範囲**: レイヤー3/4（ネットワーク・トランスポート層）
- **保護対象攻撃**:
  - UDP反射攻撃
  - TCP SYNフラッド
  - その他の一般的なネットワーク層DDoS攻撃
- **機能**: 基本的な検知・緩和機能

### **Shield Advanced（有料サブスクリプション）**
- **提供形態**: 月額サブスクリプション + データ転送量課金
- **保護範囲**: レイヤー3/4 + レイヤー7（アプリケーション層）
- **追加機能**: 高度な検知、自動緩和、専門家サポート、コスト保護

---

## 🎯 Shield Advancedが必要になる主要シナリオ

### 1️⃣ **可用性保証が必要（SLA要件）**
```
✅ ユーザーに対して一定の可用性を保証している
✅ ダウンタイムが直接的なビジネス損失につながる
✅ ミッションクリティカルなアプリケーション
✅ 99.9%以上の稼働率が求められる

例：
- 金融サービス（オンラインバンキング、決済システム）
- eコマースプラットフォーム
- SaaS（B2B契約でSLA保証）
- 医療システム、緊急サービス
```

### 2️⃣ **迅速な専門家サポートが必要**
```
✅ DDoS攻撃時に専門家（SRT: Shield Response Team）への即座アクセス
✅ 24時間365日の緊急対応体制が必要
✅ カスタム緩和策の作成・管理サポートが必要
✅ 経験豊富な専門家との協働が重要

⚠️ 前提条件：
Business Support Plan または Enterprise Support Plan への加入必須
```

**SRT（Shield Response Team）ができること**:
- DDoS攻撃のリアルタイム分析
- カスタム緩和策の設計・実装
- AWS WAFルールの最適化支援
- 攻撃後の詳細レポート作成

### 3️⃣ **プロアクティブな監視・通知が必要**
```
✅ DDoS攻撃の早期検知と自動通知
✅ Route 53ヘルスチェック連携による高度な検知
✅ セキュリティ・運用チームへの自動エスカレーション
✅ プロアクティブエンゲージメント（SRTからの直接連絡）

メリット：
- 偽陽性の削減
- より迅速な検知・緩和
- リソース不健全時の自動対応
```

**プロアクティブエンゲージメント**:
- Route 53ヘルスチェックが不健全になった際、SRTから直接連絡
- 可用性への影響を最小化
- 攻撃の疑いがある場合の即座対応

### 4️⃣ **コスト予測性の確保**
```
✅ DDoS攻撃時のAWS料金急増リスクの軽減
✅ Shield Advancedサービスクレジットによるコスト保護
✅ データ転送費用のスパイク対策

保護対象：
- Shield Advancedデータ転送出力（DTO）使用料のスパイク
- DDoS攻撃に起因するAWS請求額の増加
- サービスクレジット形式での費用補填
```

### 5️⃣ **レイヤー7（アプリケーション層）の高度な保護**
```
✅ Webリクエストフラッド攻撃への対策
✅ AWS WAFとの自動統合（標準機能が無料に）
✅ 自動アプリケーション層DDoS緩和
✅ レート制限の自動適用
✅ 既知のDDoS送信元からのリクエスト自動ブロック

保護対象攻撃例：
- HTTPフラッド
- SlowLoris攻撃
- DNS Query Flood
- アプリケーション固有の脆弱性を狙った攻撃
```

**自動アプリケーション層DDoS緩和**:
- Shield Advancedが自動的にAWS WAFルールを生成・管理
- カウントまたはブロックモードの選択可能
- 150 WCUを使用するルールグループを自動追加

### 6️⃣ **詳細な可視化・分析が必要**
```
✅ リアルタイムメトリクスとレポート
✅ CloudWatch統合による高度な監視
✅ DDoSイベントの詳細分析
✅ 攻撃パターンの可視化
✅ トラフィック異常の早期発見

提供される情報：
- 攻撃の種類と規模
- 攻撃元の地理的分布
- 緩和アクションの効果
- タイムライン分析
```

---

## 💡 保護対象リソースの判断基準

以下の**いずれか**に該当するリソースは、Shield Advanced保護を検討：

### ✅ **必須検討リソース**
```
1. インターネット向けに外部ユーザーにサービス提供
   - 公開Webアプリケーション
   - APIエンドポイント
   - コンテンツ配信

2. インターネットに露出している重要アプリケーションの一部
   - 意図的に公開していなくても露出しているリソース
   - ミッションクリティカルなシステムコンポーネント

3. AWS WAF Web ACLで保護されているリソース
   - すでにWAFで保護 = 重要リソースの可能性が高い
```

### 📦 **対象AWSサービス**
- ✅ Amazon CloudFront ディストリビューション
- ✅ Application Load Balancer (ALB)
- ✅ Network Load Balancer (NLB)
- ✅ Elastic IP Address（EC2インスタンス）
- ✅ Amazon Route 53 Hosted Zones
- ✅ AWS Global Accelerator 標準アクセラレータ

---

## 💰 コスト面での考慮事項

### **Shield Advancedサブスクリプションに含まれるもの**

#### AWS WAF標準機能（保護リソース分）
```
✅ Web ACL（Protection Pack）コスト
✅ ルールコスト
✅ 基本価格（100万リクエストあたり）
✅ 最大1,500 WCUまでのリクエスト検査
✅ デフォルトボディサイズまでの検査
✅ 月間500億リクエストまで
✅ Layer 7 Anti-DDoS マネージドルールグループへのアクセス
```

#### 自動アプリケーション層DDoS緩和
- 150 WCUのルールグループを自動追加
- これらのWCUはWeb ACLの使用量にカウント

### **追加料金が発生するもの（Shield Advancedでカバーされない）**
```
❌ AWS WAFのBot Control機能
❌ CAPTCHAアクション
❌ 1,500 WCU超過分
❌ デフォルトサイズ超過のリクエストボディ検査
❌ Shield Advanced非保護リソースのAWS WAF使用
❌ 月間500億リクエスト超過分
```

### **組織での最適化（コスト削減策）**

#### AWS Organizationsの統合請求
```
✅ 統合請求ファミリー内の複数アカウント：1つのサブスクリプション料金
✅ 組織がすべてのアカウントとリソースを所有していることが条件
✅ Organizations非加入アカウントは個別請求

例：
- 本番アカウント：Shield Advanced契約
- 開発アカウント：同じ統合請求 → 追加料金なし
- ステージングアカウント：同じ統合請求 → 追加料金なし
```

#### 複数組織での最適化
```
すべて自社所有の場合：
→ アカウントマネージャーまたはAWS Supportに連絡
→ 1つ以外の組織のShield Advanced契約費用免除を依頼可能
```

### **請求の仕組み（AWS Channel Reseller以外）**
- AWS Organizationsメンバー：支払者アカウントへ請求（支払者アカウント自体の契約有無は無関係）
- 統合請求ファミリー内の複数契約：1つの料金で全カバー

---

## 🔴🟡🟢 判断マトリクス：こんな時にAdvancedを検討

### 🔴 **高優先度（強く推奨）**
```
✅ 金融サービス（オンラインバンキング、証券取引、決済処理）
✅ eコマースプラットフォーム（EC販売、マーケットプレイス）
✅ SLA契約があるB2B SaaSサービス
✅ 24時間365日の可用性が必須のインフラ
✅ ダウンタイム1分あたり数百万円の損失が見込まれる
✅ 顧客データ保護が最重要（医療、個人情報取扱）
✅ 公共サービス、緊急通報システム

判断基準：
- 年間想定損失額 > Shield Advanced年間コスト
- レピュテーション損失が致命的
- 法規制・コンプライアンス要件
```

### 🟡 **中優先度（検討推奨）**
```
✅ 高トラフィックのWebアプリケーション（月間PV 1,000万以上）
✅ レピュテーション維持が重要なメディアサイト
✅ レイヤー7攻撃の懸念がある（過去に攻撃を受けた経験）
✅ API提供サービス（多数の外部連携）
✅ グローバル展開しているサービス
✅ ピークトラフィック時の安定性が重要（キャンペーン、イベント）

判断基準：
- ビジネス成長フェーズ
- 攻撃リスクの増加傾向
- 競合他社の攻撃トレンド
```

### 🟢 **低優先度（Shield Standard継続）**
```
✅ 内部向けアプリケーション（VPN経由アクセスのみ）
✅ 開発・テスト・検証環境
✅ 小規模・低トラフィックサービス（月間PV 100万未満）
✅ 短期間の実験的プロジェクト
✅ 静的コンテンツのみのWebサイト（情報提供のみ）
✅ ダウンタイム許容度が高いサービス

判断基準：
- ビジネスへの影響が限定的
- Standard保護で十分な脅威レベル
- コスト最適化が最優先
```

---

## 🛡️ Shield Advanced機能詳細

### 1. AWS WAF統合
- **自動統合**: Shield Advanced保護リソースのWAF機能が無料
- **ルール管理**: SRTによるカスタムルール作成支援
- **マネージドルール**: Layer 7 Anti-DDoSルールグループへのアクセス

### 2. 自動アプリケーション層DDoS緩和
- **自動検知**: レイヤー7攻撃の自動検出
- **自動対応**: AWS WAFルールの自動生成・適用
- **モード選択**: カウントモード（観察）/ ブロックモード（防御）
- **レート制限**: 既知のDDoS送信元への自動レート制限

### 3. ヘルスベース検知
- **Route 53連携**: ヘルスチェックによる高精度検知
- **偽陽性削減**: アプリケーション状態を考慮した検知
- **迅速な対応**: 不健全状態の即座検出と緩和
- **対象外**: Route 53 Hosted Zonesは使用不可

### 4. 保護グループ
- **論理的グループ化**: 複数リソースをグループとして保護
- **強化された検知**: グループ全体での攻撃検知・緩和
- **自動メンバーシップ**: 新規保護リソースの自動追加
- **柔軟性**: 1リソースが複数グループに所属可能

### 5. 可視性の向上
- **リアルタイムメトリクス**: 攻撃の詳細情報をリアルタイム表示
- **詳細レポート**: イベント分析レポート
- **CloudWatch統合**: メトリクス・アラームの活用
- **API/コンソール**: 複数の方法でアクセス可能

### 6. AWS Firewall Manager統合
- **一元管理**: 複数アカウントの保護を集中管理
- **自動適用**: 新規アカウント・リソースへの自動保護
- **WAFルールデプロイ**: 統一ルールの一括適用
- **追加料金なし**: Shield Advanced顧客向け無料

### 7. Shield Response Team（SRT）
- **24/7サポート**: 攻撃時の専門家支援
- **経験豊富**: AWS、Amazon.comでの実績
- **カスタム緩和**: 個別要件に応じた対策作成
- **前提条件**: Business/Enterprise Supportプラン必須

### 8. プロアクティブエンゲージメント
- **直接連絡**: SRTからの能動的な連絡
- **迅速対応**: 可用性低下の早期対処
- **条件**: ヘルスベース検知の有効化が必須
- **対象リソース**: Route 53 Hosted Zones以外

### 9. コスト保護
- **サービスクレジット**: DDoS起因の請求増加への補償
- **DTO保護**: データ転送出力料金のスパイクカバー
- **申請ベース**: 攻撃後にクレジット申請

---

## ⚠️ 注意事項・制約

### Shield Advancedでカバーされないもの
```
❌ 非保護リソースのAWS WAF使用料
❌ Bot Control機能の追加料金
❌ CAPTCHA アクションの使用料
❌ 1,500 WCU超過分
❌ デフォルトサイズ超のリクエストボディ検査
❌ 月間500億リクエスト超過分
```

### SRT利用の前提条件
```
⚠️ Business Support Plan または Enterprise Support Plan への加入必須
⚠️ プロアクティブエンゲージメントにはRoute 53ヘルスチェック設定が必須
⚠️ Hosted Zonesではヘルスベース検知利用不可
```

### 組織・請求の制約
```
⚠️ 統合請求の恩恵は組織がすべてのアカウント・リソースを所有している場合のみ
⚠️ AWS Channel Reseller は別途アカウントチームへ相談必要
⚠️ 複数組織での費用免除は手動申請が必要
```

---

## 📋 判断フローチャート

```
質問1: SLA契約や可用性保証が必要？
  YES → Shield Advanced推奨
  NO  → 質問2へ

質問2: 24/7専門家サポートが必要？
  YES → Shield Advanced推奨
  NO  → 質問3へ

質問3: レイヤー7攻撃のリスクがある？
  YES → Shield Advanced推奨
  NO  → 質問4へ

質問4: ダウンタイムによる損失が年間Shield Advancedコストを超える？
  YES → Shield Advanced推奨
  NO  → 質問5へ

質問5: 高トラフィック（月間PV 1,000万以上）？
  YES → Shield Advanced検討
  NO  → Shield Standard継続

※すべてNOの場合でも、将来的なリスク増加を考慮して定期的に再評価推奨
```

---

## 🎯 実装チェックリスト

### Shield Advanced導入時
- [ ] Business/Enterprise Supportプラン加入確認
- [ ] 保護対象リソースの洗い出し
- [ ] Route 53ヘルスチェック設定（プロアクティブエンゲージメント用）
- [ ] AWS Organizations統合請求設定確認
- [ ] AWS WAF Web ACL準備
- [ ] CloudWatch アラーム設定
- [ ] SNS通知先設定
- [ ] SRT連絡先情報登録
- [ ] コスト保護申請プロセス確認

### 定期的なレビュー項目
- [ ] 保護対象リソースの見直し（四半期ごと）
- [ ] DDoSイベント履歴の分析
- [ ] コスト効果分析（年1回）
- [ ] ヘルスチェック設定の妥当性確認
- [ ] 自動緩和設定の最適化
- [ ] 保護グループの再編成
- [ ] SRT連絡訓練（年2回推奨）

---

## 📚 参考リンク

### AWS公式ドキュメント
- [AWS Shield Overview](https://docs.aws.amazon.com/waf/latest/developerguide/ddos-overview.html)
- [Shield Advanced Overview](https://docs.aws.amazon.com/waf/latest/developerguide/ddos-advanced-summary.html)
- [Shield Advanced Capabilities](https://docs.aws.amazon.com/waf/latest/developerguide/ddos-advanced-summary-capabilities.html)
- [Deciding on Shield Advanced](https://docs.aws.amazon.com/waf/latest/developerguide/ddos-advanced-summary-deciding.html)
- [Protected Resource List](https://docs.aws.amazon.com/waf/latest/developerguide/ddos-advanced-summary-protected-resources.html)

### 料金情報
- [AWS Shield Pricing](https://aws.amazon.com/shield/pricing/)
- [AWS WAF Pricing](https://aws.amazon.com/waf/pricing/)
- [AWS Firewall Manager Pricing](https://aws.amazon.com/firewall-manager/pricing/)

### サポート情報
- [AWS Business Support Plan](https://aws.amazon.com/premiumsupport/business-support/)
- [AWS Enterprise Support Plan](https://aws.amazon.com/premiumsupport/enterprise-support/)

---

## 💭 考察・推奨事項

### コスト対効果の視点
```
年間想定損失額の試算例：
- ダウンタイム1時間あたりの損失：X万円
- 年間想定攻撃回数：Y回
- 1回あたりの平均ダウンタイム：Z時間

→ 年間想定損失 = X × Y × Z

これがShield Advanced年間コスト（サブスクリプション + DTO）を
大きく上回る場合は導入を強く推奨
```

### 段階的導入アプローチ
```
Phase 1: 最重要リソースのみ保護
  - 本番環境のフロントエンド（CloudFront, ALB）
  - 公開APIエンドポイント

Phase 2: 保護範囲の拡大
  - Elastic IP
  - Route 53 Hosted Zones
  - Global Accelerator

Phase 3: 自動化・最適化
  - Firewall Managerでの一元管理
  - 保護グループの活用
  - 自動アプリケーション層緩和の有効化
```

### モニタリング戦略
```
1. 通常時のベースライン確立
   - 正常トラフィックパターンの把握
   - メトリクスの基準値設定

2. 異常検知の自動化
   - CloudWatch アラーム設定
   - SNS通知の最適化
   - 運用チームへのエスカレーションフロー

3. 定期的な訓練
   - SRTとの連携訓練
   - インシデント対応プロセスの確認
   - ランブックの更新
```

---

## ✅ まとめ

### Standard vs Advanced 選択の核心
```
Shield Standard：
→ すべてのAWSユーザーの基本保護
→ コスト重視、低〜中リスク環境

Shield Advanced：
→ ミッションクリティカルなアプリケーション
→ 可用性保証、専門家サポート、コスト保護が必要
→ 高度なレイヤー7保護が必須
```

### 最終判断のポイント
**「ダウンタイムのビジネスインパクト」が最大の判断基準**

- インパクト大 → Shield Advanced
- インパクト中 → ケースバイケース（段階的導入検討）
- インパクト小 → Shield Standard

**定期的な再評価が重要**（ビジネス成長、脅威環境の変化に応じて）
