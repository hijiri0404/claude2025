# AWS S3レプリケーション監視・留意事項ガイド

## 概要
AWS S3レプリケーションの包括的な監視項目と運用上の留意事項をまとめたガイドです。同一アカウント内およびクロスアカウントでのレプリケーション監視について詳しく解説します。

## 📊 主要監視項目（CloudWatch メトリクス）

### 必須監視メトリクス

| メトリクス名 | 説明 | パブリッシュリージョン | 対象オブジェクト |
|-------------|------|---------------------|-----------------|
| **Bytes Pending Replication** | レプリケーション待ちのデータ量（バイト） | 宛先リージョン | 新規オブジェクト（CRR/SRR） |
| **Replication Latency** | レプリケーションの最大遅延時間（秒） | 宛先リージョン | 新規オブジェクト（CRR/SRR） |
| **Operations Pending Replication** | レプリケーション待ちのオペレーション数 | 宛先リージョン | 新規オブジェクト（CRR/SRR） |
| **Operations Failed Replication** | レプリケーション失敗オペレーション数 | ソースリージョン | 新規・既存オブジェクト |

### 📈 メトリクス設定要件

#### 有効化方法
- **自動有効化**: S3 Replication Time Control (S3 RTC) 有効時
- **手動有効化**: レプリケーションルール作成・編集時に独立設定可能

#### 課金・タイミング
- **課金**: CloudWatch カスタムメトリクス料金適用
- **レポート開始**: S3 RTC有効後15分で開始
- **配信方式**: ベストエフォート配信

#### メトリクス設定例（AWS CLI）
```json
{
    "Rules": [
        {
            "Status": "Enabled",
            "Filter": {
                "Prefix": "Tax"
            },
            "Destination": {
                "Bucket": "arn:aws:s3:::destination-bucket",
                "Metrics": {
                    "Status": "Enabled"
                }
            },
            "Priority": 1
        }
    ],
    "Role": "IAM-Role-ARN"
}
```

## 🚨 イベント通知監視

### 必須イベント通知設定

| イベントタイプ | 説明 | 対象 |
|---------------|------|------|
| `s3:Replication:OperationFailedReplication` | レプリケーション失敗通知 | レプリケーション対象オブジェクト |
| `s3:Replication:OperationMissedThreshold` | S3 RTC 15分閾値超過通知 | S3 RTC使用時 |
| `s3:Replication:OperationReplicatedAfterThreshold` | 閾値後レプリケーション完了通知 | S3 RTC使用時 |
| `s3:Replication:OperationNotTracked` | ライブレプリケーション追跡停止通知 | CRR/SRR対象オブジェクト |

### 配信先オプション
- **Amazon SQS**: キューベースの非同期処理
- **Amazon SNS**: 通知・アラート配信
- **AWS Lambda**: 自動化された対応処理

### イベント通知設定要件
```bash
# 前提条件
1. S3 Replication metrics の有効化
2. 適切なIAM権限設定
3. 配信先サービスの事前設定
```

## ⚠️ 主要な失敗理由と対処法

| 失敗理由コード | 原因 | 対処法 |
|---------------|------|--------|
| `AssumeRoleNotPermitted` | IAMロール権限不足 | レプリケーション設定のIAMロール権限確認・修正 |
| `DstBucketNotFound` | 宛先バケット存在しない | 宛先バケット存在確認・作成 |
| `DstBucketUnversioned` | 宛先バケットのバージョニング無効 | 宛先バケットでバージョニング有効化 |
| `DstKmsKeyNotFound` | KMS キー存在しない | KMS キー設定確認・修正 |
| `DstKmsKeyInvalidState` | KMS キー無効状態 | KMS キー状態確認・有効化 |
| `DstBucketObjectLockConfigMissing` | Object Lock設定不一致 | 宛先バケットでObject Lock有効化 |
| `DstDelObjNotPermitted` | 削除マーカーレプリケーション権限不足 | `s3:ReplicateDelete` 権限追加 |
| `DstMultipartCompleteNotPermitted` | マルチパートアップロード完了権限不足 | `s3:ReplicateObject` 権限確認 |

## 🔧 設定要件・前提条件

### 必須要件
- **バージョニング**: ソース・宛先両バケットで有効化必須
- **リージョン有効化**: ソース・宛先両リージョンがアカウントで有効
- **IAM権限**: レプリケーション用IAMロールの適切な権限設定
- **Object Lock**: ソースで有効な場合、宛先でも有効化必要

### Object Lock環境での追加要件
```bash
# 必要な追加権限
s3:GetObjectRetention
s3:GetObjectLegalHold

# 注意: s3:Get* 権限があれば要件を満たす
```

### クロスアカウント追加要件
- **権限付与**: 宛先バケットオーナーがソースバケットオーナーに権限付与
- **Requester Pays制限**: 宛先バケットはRequester Pays設定不可
- **両方向の権限管理**: 双方向でのバケットポリシー設定

## 🎯 クロスアカウント監視の責任分界

### メトリクス監視の責任分界

| メトリクス | パブリッシュリージョン | 監視責任アカウント |
|-----------|----------------------|-------------------|
| **Bytes Pending Replication** | 宛先リージョン | **宛先アカウント** |
| **Replication Latency** | 宛先リージョン | **宛先アカウント** |
| **Operations Pending Replication** | 宛先リージョン | **宛先アカウント** |
| **Operations Failed Replication** | ソースリージョン | **ソースアカウント** |

### 推奨監視戦略

#### ソースアカウント（レプリケーション元）
```bash
監視対象:
✅ Operations Failed Replication メトリクス
✅ レプリケーション設定とIAMロール
✅ ソースバケットのアクセス権限
✅ 失敗イベント通知設定
```

#### 宛先アカウント（レプリケーション先）
```bash
監視対象:
✅ Bytes Pending Replication メトリクス
✅ Replication Latency メトリクス
✅ Operations Pending Replication メトリクス
✅ 宛先バケット設定（バージョニング、Object Lock等）
✅ ストレージ使用量監視
```

## 💰 コスト監視ポイント

### 課金対象項目
1. **レプリケーション メトリクス**: CloudWatch カスタムメトリクス料金
2. **データ転送**: クロスリージョン転送料金（CRR）
3. **ストレージ**: 宛先バケットの重複ストレージ料金
4. **リクエスト**: レプリケーション操作のAPIリクエスト料金

### コスト最適化戦略
- **S3 Storage Lens活用**: レプリケーション設定の一元的可視化
- **宛先リージョン選択**: 転送コスト最適化のためのリージョン戦略
- **ライフサイクルポリシー連携**: 効率的なオブジェクト管理
- **課金アラート設定**: CloudWatch Billing Alarms による予算管理

## 🔍 トラブルシューティングアプローチ

### 段階的診断手順
1. **メトリクス確認**: CloudWatchでレプリケーション状況確認
2. **イベント通知確認**: 失敗通知とfailureReason分析
3. **権限確認**: IAMロール・バケットポリシー検証
4. **設定確認**: バージョニング・Object Lock・KMS設定
5. **ネットワーク確認**: リージョン間接続・VPCエンドポイント

### S3 Storage Lens活用
- **一元管理**: レプリケーション設定の統合可視化
- **ダッシュボード**: ルール数とメトリクス状況表示
- **高度分析**: Advanced metricsによる詳細パフォーマンス分析

## 📋 実装推奨事項

### 監視設定ベストプラクティス
1. **全ルールでメトリクス有効化**: レプリケーションルール作成時に必須設定
2. **CloudWatch アラーム設定**: 閾値ベースの自動通知システム
3. **統合イベント通知**: 失敗時の即座通知と自動対応
4. **包括的ログ記録**: ServerAccessLogs・CloudTrailでの操作追跡

### 運用時チェックポイント
```bash
日常監視項目:
□ レプリケーション遅延の定期確認
□ 失敗オペレーションの根本原因分析
□ コスト上昇パターンの監視
□ ライフサイクルポリシーとの整合性確認

週次・月次確認:
□ IAMロール権限の定期レビュー
□ レプリケーション設定の最適化
□ ストレージクラス最適化の検討
□ 災害復旧計画との整合性確認
```

### 高度な監視設定例

#### CloudWatch Dashboard設定
```json
{
  "widgets": [
    {
      "type": "metric",
      "properties": {
        "metrics": [
          ["AWS/S3", "BytesPendingReplication", "DestinationBucket", "destination-bucket", "RuleId", "rule-1"],
          [".", "ReplicationLatency", ".", ".", ".", "."],
          [".", "OperationsPendingReplication", ".", ".", ".", "."],
          [".", "OperationsFailedReplication", "SourceBucket", "source-bucket", ".", "."]
        ],
        "period": 300,
        "stat": "Average",
        "region": "us-east-1",
        "title": "S3 Replication Metrics"
      }
    }
  ]
}
```

#### CloudWatch Alarm設定例
```bash
# レプリケーション遅延アラーム
aws cloudwatch put-metric-alarm \
  --alarm-name "S3-Replication-High-Latency" \
  --alarm-description "S3 replication latency exceeds threshold" \
  --metric-name ReplicationLatency \
  --namespace AWS/S3 \
  --statistic Maximum \
  --period 300 \
  --threshold 900 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 2

# レプリケーション失敗アラーム
aws cloudwatch put-metric-alarm \
  --alarm-name "S3-Replication-Failures" \
  --alarm-description "S3 replication failures detected" \
  --metric-name OperationsFailedReplication \
  --namespace AWS/S3 \
  --statistic Sum \
  --period 300 \
  --threshold 1 \
  --comparison-operator GreaterThanOrEqualToThreshold \
  --evaluation-periods 1
```

## 📚 関連ドキュメント・参考資料

### AWS公式ドキュメント
- [Using S3 Replication metrics](https://docs.aws.amazon.com/AmazonS3/latest/userguide/repl-metrics.html)
- [Receiving replication failure events with Amazon S3 Event Notifications](https://docs.aws.amazon.com/AmazonS3/latest/userguide/replication-metrics-events.html)
- [Requirements and considerations for replication](https://docs.aws.amazon.com/AmazonS3/latest/userguide/replication-requirements.html)
- [Configuring replication for buckets in different accounts](https://docs.aws.amazon.com/AmazonS3/latest/userguide/replication-walkthrough-2.html)

### 追加リソース
- AWS Well-Architected Framework - Reliability Pillar
- CloudWatch Pricing Calculator
- S3 Storage Classes and Lifecycle Management Guide

---

**作成日**: 2025-10-16  
**更新履歴**: 初版作成 - AWS S3レプリケーション監視ガイド  
**対象**: AWS S3レプリケーション運用担当者、インフラエンジニア