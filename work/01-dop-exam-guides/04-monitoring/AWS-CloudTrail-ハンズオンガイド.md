# AWS CloudTrail ハンズオンガイド

> **対象**: AWS DevOps Professional (DOP-C02) 試験対策
> **前提知識**: AWS基礎、IAM、S3
> **所要時間**: 約2時間

---

## 目次

1. [CloudTrail概要](#1-cloudtrail概要)
2. [証跡（Trail）の設定](#2-証跡trailの設定)
3. [イベントの種類](#3-イベントの種類)
4. [ログファイル整合性検証](#4-ログファイル整合性検証)
5. [CloudTrail Insights](#5-cloudtrail-insights)
6. [Organizations統合](#6-organizations統合)
7. [CloudTrail Lake](#7-cloudtrail-lake)
8. [ハンズオン演習](#8-ハンズオン演習)
9. [DOP試験対策チェックリスト](#9-dop試験対策チェックリスト)

---

## 1. CloudTrail概要

### 1.1 CloudTrailとは

```
┌─────────────────────────────────────────────────────────────────────┐
│                         AWS CloudTrail                                │
│                    API監査・ガバナンスサービス                        │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │                    記録対象                                    │ │
│  │                                                                │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │ │
│  │  │  Management  │  │    Data      │  │   Insights   │        │ │
│  │  │   Events     │  │   Events    │  │    Events    │        │ │
│  │  │              │  │              │  │              │        │ │
│  │  │ API呼出し    │  │ S3/Lambda等 │  │ 異常検知    │        │ │
│  │  │ コンソール   │  │ のデータ操作│  │             │        │ │
│  │  │ サインイン   │  │              │  │              │        │ │
│  │  └──────────────┘  └──────────────┘  └──────────────┘        │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                              │                                      │
│                              ▼                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │                    配信先                                      │ │
│  │                                                                │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │ │
│  │  │     S3       │  │  CloudWatch  │  │  CloudTrail  │        │ │
│  │  │   Bucket     │  │    Logs      │  │    Lake      │        │ │
│  │  └──────────────┘  └──────────────┘  └──────────────┘        │ │
│  └────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.2 DOP試験での重要ポイント

| トピック | 重要度 | 出題パターン |
|---------|--------|-------------|
| **ログファイル整合性検証** | ★★★★★ | 改ざん検知の仕組み |
| **Organizations統合** | ★★★★★ | 組織証跡の設定 |
| **イベント種類の区別** | ★★★★☆ | Management vs Data |
| **Insights** | ★★★★☆ | 異常API検知 |
| **CloudTrail Lake** | ★★★☆☆ | SQLベースのクエリ |
| **EventBridge連携** | ★★★★☆ | リアルタイム応答 |

---

## 2. 証跡（Trail）の設定

### 2.1 証跡の種類

| 種類 | 説明 | 対象 |
|------|------|------|
| **シングルリージョン証跡** | 1リージョンのみ | レガシー |
| **マルチリージョン証跡** | 全リージョン | 推奨 |
| **組織証跡** | 組織全体 | Organizations使用時 |

### 2.2 証跡の作成

```bash
# マルチリージョン証跡の作成
aws cloudtrail create-trail \
  --name my-org-trail \
  --s3-bucket-name cloudtrail-logs-123456789012 \
  --is-multi-region-trail \
  --include-global-service-events \
  --enable-log-file-validation \
  --cloud-watch-logs-log-group-arn "arn:aws:logs:ap-northeast-1:123456789012:log-group:CloudTrail:*" \
  --cloud-watch-logs-role-arn "arn:aws:iam::123456789012:role/CloudTrailToCloudWatchLogs"

# 証跡の開始
aws cloudtrail start-logging --name my-org-trail

# 証跡のステータス確認
aws cloudtrail get-trail-status --name my-org-trail

# 証跡の詳細確認
aws cloudtrail describe-trails --trail-name-list my-org-trail
```

### 2.3 S3バケットポリシー

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AWSCloudTrailAclCheck",
      "Effect": "Allow",
      "Principal": {
        "Service": "cloudtrail.amazonaws.com"
      },
      "Action": "s3:GetBucketAcl",
      "Resource": "arn:aws:s3:::cloudtrail-logs-123456789012"
    },
    {
      "Sid": "AWSCloudTrailWrite",
      "Effect": "Allow",
      "Principal": {
        "Service": "cloudtrail.amazonaws.com"
      },
      "Action": "s3:PutObject",
      "Resource": "arn:aws:s3:::cloudtrail-logs-123456789012/AWSLogs/*",
      "Condition": {
        "StringEquals": {
          "s3:x-amz-acl": "bucket-owner-full-control"
        }
      }
    }
  ]
}
```

---

## 3. イベントの種類

### 3.1 Management Events（管理イベント）

```
【Management Events の例】

コントロールプレーン操作 = 管理イベント

 ├─ EC2: RunInstances, TerminateInstances, CreateSecurityGroup
 ├─ IAM: CreateUser, AttachRolePolicy, CreateRole
 ├─ S3:  CreateBucket, PutBucketPolicy, DeleteBucket
 ├─ RDS: CreateDBInstance, ModifyDBInstance
 └─ CloudFormation: CreateStack, UpdateStack, DeleteStack

読み取り専用 vs 書き込み:
 ├─ Read:  DescribeInstances, ListBuckets, GetObject(管理API)
 └─ Write: RunInstances, CreateBucket, PutBucketPolicy
```

### 3.2 Data Events（データイベント）

```
【Data Events の例】

データプレーン操作 = データイベント（追加料金・任意設定）

 ├─ S3:     GetObject, PutObject, DeleteObject
 ├─ Lambda: Invoke
 ├─ DynamoDB: GetItem, PutItem, DeleteItem, BatchGetItem
 └─ EBS:    PutSnapshotBlock, GetSnapshotBlock

※ 大量に発生するため、選択的に有効化
※ 料金: $0.10/100,000イベント
```

### 3.3 Insights Events

```
【CloudTrail Insights】

通常のAPI呼出しパターン                 異常検出
┌─────────────────────────┐           ┌─────────────────────┐
│ API Call Volume          │           │ Insight Event       │
│                          │           │                     │
│  ┌──────────────────┐   │           │ "異常なAPI呼出し    │
│  │    ___           │   │  ──────▶ │  パターンを検出"    │
│  │   /   \___       │   │           │                     │
│  │  /        \___   │   │           │ StartTime: ...      │
│  │ /             \  │   │           │ EndTime: ...        │
│  └──────────────────┘   │           │ Baseline: 10/hr     │
│  Normal: 10 calls/hr    │           │ Actual: 100/hr      │
│  Anomaly: 100 calls/hr  │           └─────────────────────┘
└─────────────────────────┘
```

### 3.4 イベントセレクタ

```bash
# データイベントの記録設定（S3特定バケット）
aws cloudtrail put-event-selectors \
  --trail-name my-trail \
  --event-selectors '[
    {
      "ReadWriteType": "All",
      "IncludeManagementEvents": true,
      "DataResources": [
        {
          "Type": "AWS::S3::Object",
          "Values": ["arn:aws:s3:::my-important-bucket/"]
        }
      ]
    }
  ]'

# 高度なイベントセレクタ（推奨）
aws cloudtrail put-event-selectors \
  --trail-name my-trail \
  --advanced-event-selectors '[
    {
      "Name": "S3DataEvents",
      "FieldSelectors": [
        {"Field": "eventCategory", "Equals": ["Data"]},
        {"Field": "resources.type", "Equals": ["AWS::S3::Object"]},
        {"Field": "resources.ARN", "StartsWith": ["arn:aws:s3:::my-important-bucket/"]}
      ]
    }
  ]'
```

---

## 4. ログファイル整合性検証

### 4.1 仕組み

```
【ログファイル整合性検証の仕組み】

毎時: ログファイル配信
┌────────────┐  ┌────────────┐  ┌────────────┐
│ Log File 1 │  │ Log File 2 │  │ Log File 3 │
│ (SHA-256)  │  │ (SHA-256)  │  │ (SHA-256)  │
└──────┬─────┘  └──────┬─────┘  └──────┬─────┘
       │               │               │
       └───────────────┼───────────────┘
                       │
                       ▼
              ┌────────────────┐
              │  Digest File   │  ← 毎時作成
              │  (ダイジェスト) │
              │                │
              │ ・前回ダイジェスト│
              │   のハッシュ    │
              │ ・各ログファイル │
              │   のハッシュ    │
              │ ・署名          │
              └────────────────┘
                    │
         ┌─────────┘
         │
         ▼
  チェーン構造（改ざん検知）
  Digest 1 → Digest 2 → Digest 3 → ...
  (前回のハッシュを含むため、1つでも改ざんすると検出可能)
```

### 4.2 検証の実行

```bash
# ログファイル整合性の検証
aws cloudtrail validate-logs \
  --trail-arn arn:aws:cloudtrail:ap-northeast-1:123456789012:trail/my-trail \
  --start-time "2026-02-01T00:00:00Z" \
  --end-time "2026-02-04T00:00:00Z"

# 検証結果の例
# Results requested for 2026-02-01T00:00:00Z to 2026-02-04T00:00:00Z
# Results found for 2026-02-01T00:00:00Z to 2026-02-04T00:00:00Z:
# 72/72 digest files valid
# 1440/1440 log files valid
```

---

## 5. CloudTrail Insights

### 5.1 Insightsの有効化

```bash
# Insightsの有効化
aws cloudtrail put-insight-selectors \
  --trail-name my-trail \
  --insight-selectors '[
    {"InsightType": "ApiCallRateInsight"},
    {"InsightType": "ApiErrorRateInsight"}
  ]'
```

### 5.2 Insights イベントの種類

| タイプ | 検出内容 | 例 |
|--------|---------|-----|
| **ApiCallRateInsight** | API呼出し頻度の異常 | 大量のRunInstances |
| **ApiErrorRateInsight** | APIエラー率の異常 | 大量のAccessDenied |

### 5.3 Insights + EventBridge

```json
// CloudTrail Insights イベントパターン
{
  "source": ["aws.cloudtrail"],
  "detail-type": ["AWS API Call via CloudTrail"],
  "detail": {
    "insightDetails": {
      "state": ["Start"]
    }
  }
}
```

---

## 6. Organizations統合

### 6.1 組織証跡

```
【組織証跡のアーキテクチャ】

┌─────────────────────────────────────────────────────────────┐
│                    Management Account                        │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              Organization Trail                       │  │
│  │              (全アカウント・全リージョン)              │  │
│  └──────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
         │              │              │
         ▼              ▼              ▼
   ┌──────────┐   ┌──────────┐   ┌──────────┐
   │Account A │   │Account B │   │Account C │
   │(自動収集)│   │(自動収集)│   │(自動収集)│
   └──────────┘   └──────────┘   └──────────┘
         │              │              │
         └──────────────┼──────────────┘
                        │
                        ▼
              ┌─────────────────┐
              │   S3 Bucket     │
              │  (集約ログ)     │
              │                 │
              │  /AWSLogs/      │
              │    org-id/      │
              │      acct-a/    │
              │      acct-b/    │
              │      acct-c/    │
              └─────────────────┘
```

### 6.2 組織証跡の作成

```bash
# 組織証跡の作成
aws cloudtrail create-trail \
  --name org-trail \
  --s3-bucket-name org-cloudtrail-logs \
  --is-organization-trail \
  --is-multi-region-trail \
  --enable-log-file-validation

aws cloudtrail start-logging --name org-trail
```

---

## 7. CloudTrail Lake

### 7.1 CloudTrail Lakeとは

```
【CloudTrail Lake アーキテクチャ】

CloudTrail Events
      │
      ▼
┌──────────────────────────────────────────┐
│            CloudTrail Lake               │
│                                          │
│  ┌────────────────────────────────────┐ │
│  │         Event Data Store           │ │
│  │                                    │ │
│  │  ┌────────┐  ┌────────┐          │ │
│  │  │ Events │  │ Events │  ...     │ │
│  │  └────────┘  └────────┘          │ │
│  │                                    │ │
│  │  保持期間: 7年 or カスタム        │ │
│  └────────────────────────────────────┘ │
│                                          │
│  ┌────────────────────────────────────┐ │
│  │         SQL Query Engine           │ │
│  │                                    │ │
│  │  SELECT eventName, COUNT(*)        │ │
│  │  FROM event_data_store             │ │
│  │  WHERE eventTime > '2026-02-01'    │ │
│  │  GROUP BY eventName                │ │
│  │  ORDER BY COUNT(*) DESC            │ │
│  └────────────────────────────────────┘ │
└──────────────────────────────────────────┘
```

### 7.2 CloudTrail Lake クエリ例

```sql
-- 最もAPI呼出しの多いユーザー
SELECT userIdentity.arn, COUNT(*) as apiCallCount
FROM event_data_store_id
WHERE eventTime > '2026-02-01 00:00:00'
  AND eventTime < '2026-02-04 00:00:00'
GROUP BY userIdentity.arn
ORDER BY apiCallCount DESC
LIMIT 10

-- IAMポリシー変更の監査
SELECT eventTime, eventName, userIdentity.arn,
       requestParameters
FROM event_data_store_id
WHERE eventSource = 'iam.amazonaws.com'
  AND eventName LIKE '%Policy%'
ORDER BY eventTime DESC

-- セキュリティグループ変更の検出
SELECT eventTime, eventName, userIdentity.arn,
       sourceIPAddress, requestParameters
FROM event_data_store_id
WHERE eventSource = 'ec2.amazonaws.com'
  AND eventName IN ('AuthorizeSecurityGroupIngress',
                    'RevokeSecurityGroupIngress',
                    'AuthorizeSecurityGroupEgress')
ORDER BY eventTime DESC

-- ルートユーザーの使用検出
SELECT eventTime, eventName, sourceIPAddress
FROM event_data_store_id
WHERE userIdentity.type = 'Root'
ORDER BY eventTime DESC
```

---

## 8. ハンズオン演習

### 8.1 演習1: 証跡の確認

```bash
# 既存の証跡一覧
aws cloudtrail describe-trails

# 証跡のステータス確認
aws cloudtrail get-trail-status \
  --name $(aws cloudtrail describe-trails --query "trailList[0].TrailARN" --output text)

# 直近のイベント検索
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=EventName,AttributeValue=CreateBucket \
  --max-results 5
```

### 8.2 演習2: イベント検索

```bash
# 特定ユーザーのAPI呼出し検索
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=Username,AttributeValue=admin \
  --start-time "2026-02-03T00:00:00Z" \
  --end-time "2026-02-04T00:00:00Z" \
  --max-results 10

# リソース別の検索
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=ResourceType,AttributeValue=AWS::S3::Bucket \
  --max-results 5

# イベント詳細の確認
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=EventName,AttributeValue=ConsoleLogin \
  --max-results 3 \
  --query "Events[].{Time:EventTime,User:Username,Event:EventName}"
```

### 8.3 演習3: CloudWatch Logs連携

```bash
# CloudWatch Logsのメトリクスフィルター（ルートログイン検出）
aws logs put-metric-filter \
  --log-group-name CloudTrail \
  --filter-name RootAccountUsage \
  --filter-pattern '{ $.userIdentity.type = "Root" && $.userIdentity.invokedBy NOT EXISTS && $.eventType != "AwsServiceEvent" }' \
  --metric-transformations \
    metricName=RootAccountUsageCount,metricNamespace=CloudTrailMetrics,metricValue=1

# セキュリティグループ変更検出
aws logs put-metric-filter \
  --log-group-name CloudTrail \
  --filter-name SecurityGroupChanges \
  --filter-pattern '{ ($.eventName = "AuthorizeSecurityGroupIngress") || ($.eventName = "AuthorizeSecurityGroupEgress") || ($.eventName = "RevokeSecurityGroupIngress") || ($.eventName = "RevokeSecurityGroupEgress") || ($.eventName = "CreateSecurityGroup") || ($.eventName = "DeleteSecurityGroup") }' \
  --metric-transformations \
    metricName=SecurityGroupEventCount,metricNamespace=CloudTrailMetrics,metricValue=1
```

### 8.4 クリーンアップ

```bash
# テスト用リソースのクリーンアップ
aws logs delete-metric-filter \
  --log-group-name CloudTrail \
  --filter-name RootAccountUsage

aws logs delete-metric-filter \
  --log-group-name CloudTrail \
  --filter-name SecurityGroupChanges
```

---

## 9. DOP試験対策チェックリスト

### 基本理解

- [ ] CloudTrailの3種類のイベントを区別できる
- [ ] Management EventsとData Eventsの違いを理解している
- [ ] 証跡の種類（シングル/マルチリージョン/組織）を使い分けできる

<details>
<summary>📝 模範解答を見る</summary>

**3種類のイベント**:
1. **Management Events**: コントロールプレーン（CreateBucket, RunInstances等）
2. **Data Events**: データプレーン（GetObject, Invoke等）- 追加料金
3. **Insights Events**: 異常パターン検出

**Management vs Data**:
| 項目 | Management | Data |
|------|-----------|------|
| デフォルト記録 | はい | いいえ |
| 追加料金 | 最初の証跡無料 | $0.10/100K |
| 量 | 少〜中 | 大量 |
| 例 | CreateBucket | GetObject |

**証跡の使い分け**:
- シングルリージョン: 非推奨（レガシー）
- マルチリージョン: 個別アカウント向け
- 組織証跡: Organizations使用時（全アカウント一括）
</details>

### セキュリティ・コンプライアンス

- [ ] ログファイル整合性検証の仕組みを説明できる
- [ ] CloudTrail + CloudWatch Logsのメトリクスフィルターを設定できる
- [ ] セキュリティインシデント検出パターンを実装できる

<details>
<summary>📝 模範解答を見る</summary>

**ログファイル整合性検証**:
- ダイジェストファイル（毎時生成）がチェーン構造を形成
- SHA-256ハッシュ + RSA署名
- `validate-logs`コマンドで検証
- ダイジェストファイル自体もS3に保存

**主要なメトリクスフィルターパターン**:
```
ルートログイン: { $.userIdentity.type = "Root" ... }
IAM変更: { $.eventSource = "iam.amazonaws.com" && $.eventName = "Create*" ... }
SG変更: { $.eventName = "AuthorizeSecurityGroupIngress" ... }
NACLs変更: { $.eventName = "CreateNetworkAcl*" ... }
VPC変更: { $.eventName = "CreateVpc" ... }
```

**セキュリティインシデント対応フロー**:
1. CloudTrail → CloudWatch Logs
2. メトリクスフィルター → アラーム
3. SNS → セキュリティチーム通知
4. Lambda → 自動隔離（SGルール変更等）
</details>

### 分析と運用

- [ ] CloudTrail Lakeのクエリを作成できる
- [ ] Insightsの有効化と活用方法を知っている
- [ ] 組織証跡の設定と権限設計ができる

<details>
<summary>📝 模範解答を見る</summary>

**CloudTrail Lake**:
- SQLでイベントを直接クエリ
- S3 + Athenaより簡単（ただしコスト高め）
- 保持期間: 7年間（デフォルト）
- ユースケース: コンプライアンス監査、インシデント調査

**Insights活用**:
- ApiCallRateInsight: API呼出し頻度の異常検知
- ApiErrorRateInsight: エラー率の異常検知
- EventBridge連携で自動通知可能

**組織証跡の権限設計**:
- Management Accountで組織証跡を作成
- S3バケットは Log Archive アカウントに配置
- バケットポリシーで組織全体からの書き込みを許可
- メンバーアカウントからは証跡の変更不可
</details>

---

## 付録: よく使うCLIコマンド

```bash
# 証跡管理
aws cloudtrail create-trail --name NAME --s3-bucket-name BUCKET ...
aws cloudtrail start-logging --name NAME
aws cloudtrail stop-logging --name NAME
aws cloudtrail describe-trails
aws cloudtrail get-trail-status --name NAME

# イベント検索
aws cloudtrail lookup-events --lookup-attributes AttributeKey=EventName,AttributeValue=VALUE
aws cloudtrail lookup-events --lookup-attributes AttributeKey=Username,AttributeValue=VALUE

# 整合性検証
aws cloudtrail validate-logs --trail-arn ARN --start-time TIME --end-time TIME

# Insights
aws cloudtrail put-insight-selectors --trail-name NAME --insight-selectors '[...]'

# イベントセレクタ
aws cloudtrail get-event-selectors --trail-name NAME
aws cloudtrail put-event-selectors --trail-name NAME --event-selectors '[...]'
```

---

**作成日**: 2026-02-04
**最終更新**: 2026-02-04
**検証環境**: AWS ap-northeast-1 リージョン
