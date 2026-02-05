# Amazon EventBridge ハンズオンガイド

> **対象**: AWS DevOps Professional (DOP-C02) 試験対策
> **前提知識**: AWS基礎、IAM、Lambda、SNS、CloudWatch
> **所要時間**: 約3時間

---

## 目次

1. [EventBridge概要](#1-eventbridge概要)
2. [イベントバスとルール](#2-イベントバスとルール)
3. [イベントパターン](#3-イベントパターン)
4. [スケジュール](#4-スケジュール)
5. [クロスアカウント・クロスリージョン](#5-クロスアカウントクロスリージョン)
6. [EventBridge Pipes](#6-eventbridge-pipes)
7. [スキーマレジストリ](#7-スキーマレジストリ)
8. [自動修復パターン集](#8-自動修復パターン集)
9. [ハンズオン演習](#9-ハンズオン演習)
10. [DOP試験対策チェックリスト](#10-dop試験対策チェックリスト)

---

## 1. EventBridge概要

### 1.1 EventBridgeとは

```
┌─────────────────────────────────────────────────────────────────────┐
│                      Amazon EventBridge                             │
│             サーバーレスイベントバスサービス                         │
│                                                                     │
│  ┌───────────────────┐  ┌───────────────┐  ┌───────────────────┐   │
│  │  イベントソース    │  │  イベントバス  │  │  ターゲット       │   │
│  │                   │  │               │  │                   │   │
│  │ ┌─────────────┐   │  │  ┌─────────┐  │  │ ┌─────────────┐   │   │
│  │ │ AWSサービス │   │  │  │ ルール  │  │  │ │  Lambda     │   │   │
│  │ │ (100+)      │──▶│  │  │         │──│──│▶│  SQS/SNS   │   │   │
│  │ └─────────────┘   │  │  │ パターン │  │  │ │  Step Func  │   │   │
│  │ ┌─────────────┐   │  │  │ マッチ  │  │  │ │  ECS Task   │   │   │
│  │ │ カスタムアプリ│   │  │  └─────────┘  │  │ │  API Gateway│   │   │
│  │ │ PutEvents   │──▶│  │  ┌─────────┐  │  │ │  CodePipeline│  │   │
│  │ └─────────────┘   │  │  │ ルール  │  │  │ │  SSM RunCmd │   │   │
│  │ ┌─────────────┐   │  │  │         │──│──│▶│  Kinesis    │   │   │
│  │ │ SaaS連携    │   │  │  │ パターン │  │  │ │  CloudWatch │   │   │
│  │ │ (Zendesk等) │──▶│  │  │ マッチ  │  │  │ │  別アカウント│  │   │
│  │ └─────────────┘   │  │  └─────────┘  │  │ └─────────────┘   │   │
│  └───────────────────┘  └───────────────┘  └───────────────────┘   │
│                                                                     │
│  1ルールにつき最大5ターゲット                                       │
│  イベントは最大256KBまで                                            │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.2 DOP試験での重要ポイント

| トピック | 重要度 | 出題パターン |
|---------|--------|-------------|
| **自動修復パターン** | ★★★★★ | AWSイベント → Lambda/SSM で修復 |
| **クロスアカウント配信** | ★★★★★ | マルチアカウント環境のイベント集約 |
| **スケジュール式** | ★★★★★ | cron/rate式による定期実行 |
| **イベントパターン** | ★★★★★ | パターンマッチングの構文 |
| **ターゲット種類** | ★★★★☆ | 適切なターゲット選択 |
| **EventBridge Pipes** | ★★★★☆ | Point-to-Pointのイベント処理 |
| **入力トランスフォーマー** | ★★★☆☆ | イベントデータの変換 |
| **DLQ/リトライ** | ★★★★☆ | 配信失敗時の処理 |

### 1.3 CloudWatch Events との関係

```
CloudWatch Events (旧) → EventBridge (新)

- EventBridge は CloudWatch Events の後継
- 同じ基盤を使用（API互換性あり）
- EventBridge の追加機能:
  ・カスタムイベントバス
  ・SaaS統合
  ・スキーマレジストリ
  ・EventBridge Pipes
  ・クロスアカウント配信の強化
```

---

## 2. イベントバスとルール

### 2.1 イベントバスの種類

```
┌─────────────────────────────────────────────────────────────────────┐
│                     イベントバスの種類                               │
│                                                                     │
│  ┌──────────────────┐                                              │
│  │ default           │ AWSサービスイベントはここに配信              │
│  │ (デフォルト)       │ 全アカウントに1つ、削除不可                 │
│  └──────────────────┘                                              │
│                                                                     │
│  ┌──────────────────┐                                              │
│  │ カスタム           │ PutEvents APIでカスタムイベントを送信       │
│  │ イベントバス       │ アプリケーション固有のイベントを分離         │
│  └──────────────────┘                                              │
│                                                                     │
│  ┌──────────────────┐                                              │
│  │ SaaSパートナー     │ Zendesk, Datadog, PagerDuty等からの         │
│  │ イベントバス       │ イベントを受信                              │
│  └──────────────────┘                                              │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 ルールの構成要素

```
┌─────────────────────────────────────────────────────────────────────┐
│                         EventBridge ルール                          │
│                                                                     │
│  ┌─────────────────────┐                                           │
│  │ イベントパターン     │ どのイベントにマッチするか                │
│  │ (Event Pattern)     │ OR                                        │
│  │ スケジュール式       │ cron/rate式で定期実行                     │
│  └──────────┬──────────┘                                           │
│             │                                                      │
│  ┌──────────▼──────────┐                                           │
│  │ 入力トランスフォーマー│ イベントデータの変換（任意）              │
│  │ (Input Transformer) │ ターゲットに渡すデータをカスタマイズ       │
│  └──────────┬──────────┘                                           │
│             │                                                      │
│  ┌──────────▼──────────┐                                           │
│  │ ターゲット (1〜5)    │ イベント配信先                            │
│  │ (Targets)           │ Lambda, SQS, SNS, Step Functions等        │
│  └──────────┬──────────┘                                           │
│             │                                                      │
│  ┌──────────▼──────────┐                                           │
│  │ DLQ (任意)           │ 配信失敗時の退避先（SQSキュー）          │
│  │ リトライポリシー     │ 最大24時間、185回リトライ                │
│  └─────────────────────┘                                           │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.3 ターゲットの種類

| カテゴリ | ターゲット | 典型的な用途 |
|---------|----------|-------------|
| コンピュート | Lambda関数 | 自動修復、データ変換 |
| コンピュート | ECSタスク | コンテナベースの処理 |
| コンピュート | Step Functions | ワークフロー起動 |
| メッセージング | SQS キュー | 非同期処理のバッファリング |
| メッセージング | SNS トピック | 通知、ファンアウト |
| メッセージング | Kinesis ストリーム | ストリーミング処理 |
| 管理 | SSM Run Command | EC2インスタンス操作 |
| 管理 | SSM Automation | 自動修復ランブック |
| 開発 | CodePipeline | パイプライン起動 |
| 開発 | CodeBuild | ビルド起動 |
| API | API Gateway | HTTP API呼び出し |
| イベント | 別アカウントのイベントバス | クロスアカウント配信 |

---

## 3. イベントパターン

### 3.1 基本構文

```json
{
  "source": ["aws.ec2"],
  "detail-type": ["EC2 Instance State-change Notification"],
  "detail": {
    "state": ["stopped", "terminated"]
  }
}
```

**マッチングルール**:
- 指定したフィールドのみ評価（指定していないフィールドはワイルドカード）
- 値は配列で指定 → OR条件
- 複数フィールドの指定 → AND条件

### 3.2 高度なパターンマッチング

```json
// 数値比較
{
  "detail": {
    "count": [{ "numeric": [">", 100] }]
  }
}

// プレフィックスマッチ
{
  "detail": {
    "instance-id": [{ "prefix": "i-0" }]
  }
}

// サフィックスマッチ
{
  "detail": {
    "filename": [{ "suffix": ".png" }]
  }
}

// anything-but（否定）
{
  "detail": {
    "state": [{ "anything-but": ["running"] }]
  }
}

// exists（フィールド存在チェック）
{
  "detail": {
    "error-code": [{ "exists": true }]
  }
}

// ワイルドカード
{
  "detail": {
    "instance-id": [{ "wildcard": "i-0*abc" }]
  }
}
```

### 3.3 DOP頻出イベントパターン

```json
// GuardDuty Finding（高重大度）
{
  "source": ["aws.guardduty"],
  "detail-type": ["GuardDuty Finding"],
  "detail": {
    "severity": [{ "numeric": [">=", 7] }]
  }
}

// Config Compliance変更
{
  "source": ["aws.config"],
  "detail-type": ["Config Rules Compliance Change"],
  "detail": {
    "newEvaluationResult": {
      "complianceType": ["NON_COMPLIANT"]
    }
  }
}

// CloudTrail API呼び出し
{
  "source": ["aws.ec2"],
  "detail-type": ["AWS API Call via CloudTrail"],
  "detail": {
    "eventName": ["AuthorizeSecurityGroupIngress"],
    "requestParameters": {
      "ipPermissions": {
        "items": {
          "ipRanges": {
            "items": {
              "cidrIp": ["0.0.0.0/0"]
            }
          }
        }
      }
    }
  }
}

// CodePipeline 実行状態変更
{
  "source": ["aws.codepipeline"],
  "detail-type": ["CodePipeline Pipeline Execution State Change"],
  "detail": {
    "state": ["FAILED"]
  }
}

// Health イベント
{
  "source": ["aws.health"],
  "detail-type": ["AWS Health Event"],
  "detail": {
    "service": ["EC2"],
    "eventTypeCategory": ["scheduledChange"]
  }
}
```

---

## 4. スケジュール

### 4.1 スケジュール式

```
【rate式】
rate(value unit)
  rate(1 minute)     → 1分ごと
  rate(5 minutes)    → 5分ごと
  rate(1 hour)       → 1時間ごと
  rate(1 day)        → 1日ごと

  ※ 値が1の場合は単数形（minute, hour, day）

【cron式】
cron(分 時 日 月 曜日 年)
  cron(0 9 * * ? *)       → 毎日 09:00 UTC
  cron(0 0 1 * ? *)       → 毎月1日 00:00 UTC
  cron(0/15 * * * ? *)    → 15分ごと
  cron(0 9 ? * MON-FRI *) → 平日 09:00 UTC

  フィールド: 分(0-59) 時(0-23) 日(1-31) 月(1-12) 曜日(SUN-SAT/1-7) 年
  ※ 日と曜日は排他的（一方を?にする）
```

### 4.2 EventBridge Scheduler（独立サービス）

```
【EventBridge Scheduler vs EventBridge Rules】

┌────────────────────┬──────────────────┬──────────────────────┐
│                    │ EventBridge Rules│ EventBridge Scheduler│
├────────────────────┼──────────────────┼──────────────────────┤
│ ワンタイム実行      │ ×               │ ○（at式）           │
│ タイムゾーン指定    │ × (UTC固定)     │ ○                  │
│ フレキシブル時間枠  │ ×               │ ○                  │
│ リトライ設定        │ 固定             │ カスタマイズ可能     │
│ ターゲット数        │ 最大5            │ 1                   │
│ 最大スケジュール数  │ 300/バス         │ 100万               │
│ イベントパターン    │ ○               │ ×                  │
└────────────────────┴──────────────────┴──────────────────────┘
```

---

## 5. クロスアカウント・クロスリージョン

### 5.1 クロスアカウントイベント配信

```
【マルチアカウントイベント集約パターン】

Account A (メンバー)     Account B (メンバー)
┌──────────────────┐    ┌──────────────────┐
│ default bus       │    │ default bus       │
│ ┌──────────────┐ │    │ ┌──────────────┐ │
│ │ ルール        │ │    │ │ ルール        │ │
│ │ Target:      │ │    │ │ Target:      │ │
│ │ 集約アカウント│ │    │ │ 集約アカウント│ │
│ │ のイベントバス│ │    │ │ のイベントバス│ │
│ └──────────────┘ │    │ └──────────────┘ │
└────────┬─────────┘    └────────┬─────────┘
         │                       │
         └───────────┬───────────┘
                     ▼
         Account C (集約/セキュリティ)
         ┌──────────────────────────┐
         │ カスタムイベントバス       │
         │ ┌──────────────────────┐ │
         │ │ リソースベースポリシー │ │
         │ │ Account A, B を許可  │ │
         │ └──────────────────────┘ │
         │ ┌──────────────────────┐ │
         │ │ ルール → Lambda      │ │
         │ │ ルール → SNS         │ │
         │ │ ルール → Step Func   │ │
         │ └──────────────────────┘ │
         └──────────────────────────┘

設定手順:
1. 集約アカウント: イベントバスのリソースポリシーでメンバーを許可
2. メンバーアカウント: ルールのターゲットに集約アカウントのイベントバスARNを指定
```

### 5.2 クロスリージョンイベント配信

```
【クロスリージョン構成】

ap-northeast-1 (東京)              us-east-1 (バージニア)
┌──────────────────────┐          ┌──────────────────────┐
│ default bus           │          │ default bus           │
│ ┌──────────────────┐ │          │ ┌──────────────────┐ │
│ │ ルール            │ │          │ │ ルール            │ │
│ │ Target:          │ │─────────▶│ │ Target: Lambda   │ │
│ │ us-east-1の      │ │          │ └──────────────────┘ │
│ │ default bus      │ │          └──────────────────────┘
│ └──────────────────┘ │
└──────────────────────┘

※ クロスリージョン配信は default bus 間のみ対応
```

### 5.3 イベントバスのリソースベースポリシー

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowAccountA",
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::111111111111:root"
      },
      "Action": "events:PutEvents",
      "Resource": "arn:aws:events:ap-northeast-1:999999999999:event-bus/security-events"
    },
    {
      "Sid": "AllowOrgAccounts",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "events:PutEvents",
      "Resource": "arn:aws:events:ap-northeast-1:999999999999:event-bus/security-events",
      "Condition": {
        "StringEquals": {
          "aws:PrincipalOrgID": "o-1234567890"
        }
      }
    }
  ]
}
```

---

## 6. EventBridge Pipes

### 6.1 Pipesの概要

```
【EventBridge Pipes アーキテクチャ】

┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│ ソース   │───▶│フィルタ  │───▶│エンリッチ│───▶│ ターゲット│
│ (Source) │    │(Filter)  │    │ メント   │    │ (Target) │
│          │    │ (任意)   │    │(Enrichment)│  │          │
│ SQS      │    │          │    │ (任意)   │    │ Lambda   │
│ Kinesis  │    │ イベント │    │          │    │ SQS      │
│ DynamoDB │    │ パターン │    │ Lambda   │    │ SNS      │
│ Kafka    │    │ で絞込   │    │ API GW   │    │ Step Func│
│ MQ       │    │          │    │ Step Func│    │ Kinesis  │
│          │    │          │    │          │    │ EventBus │
└──────────┘    └──────────┘    └──────────┘    └──────────┘

  Point-to-Point の統合（1ソース→1ターゲット）
  EventBridge Rules との違い:
  - Pipes: ストリーミングソース対応、バッチ処理、エンリッチメント
  - Rules: パターンマッチング、複数ターゲット、スケジュール
```

### 6.2 Pipesのソースとターゲット

```
ソース（プル型）:
- Amazon SQS
- Amazon Kinesis Data Streams
- Amazon DynamoDB Streams
- Amazon MSK / Self-managed Kafka
- Amazon MQ

ターゲット:
- Lambda, Step Functions, API Gateway
- SQS, SNS, Kinesis, EventBridge
- ECS Task, Batch Job
- CloudWatch Log Group
- Redshift, SageMaker Pipeline
```

---

## 7. スキーマレジストリ

### 7.1 概要

```
【スキーマレジストリ】

┌─────────────────────────────────────────────────────┐
│                                                     │
│  ┌───────────────┐     ┌───────────────────────┐   │
│  │ イベントバス   │────▶│ スキーマレジストリ     │   │
│  │               │     │                       │   │
│  │ イベント発生  │     │ ・自動検出             │   │
│  └───────────────┘     │ ・OpenAPI 3.0形式      │   │
│                        │ ・バージョン管理        │   │
│                        │ ・コード生成            │   │
│                        │   (Java, Python,       │   │
│                        │    TypeScript, Go)      │   │
│                        └───────────────────────┘   │
│                                                     │
│  ※ スキーマ検出を有効化するとイベント構造を自動記録 │
│  ※ 検出したスキーマからコードバインディング生成可能 │
└─────────────────────────────────────────────────────┘
```

---

## 8. 自動修復パターン集

### 8.1 セキュリティグループ自動修復

```
【SGの0.0.0.0/0ルール自動削除】

CloudTrail                EventBridge              Lambda
┌──────────────┐    ┌───────────────────┐    ┌──────────────┐
│ Authorize    │    │ パターン:          │    │ revoke-      │
│ SecurityGroup│───▶│ source: aws.ec2    │───▶│ security-    │
│ Ingress      │    │ detail:            │    │ group-ingress│
│              │    │   cidrIp: 0.0.0.0/0│   │              │
└──────────────┘    └───────────────────┘    └──────────────┘
```

### 8.2 非暗号化EBSボリューム検出

```
【非暗号化EBS自動検出・通知】

CloudTrail                EventBridge              SNS
┌──────────────┐    ┌───────────────────┐    ┌──────────────┐
│ CreateVolume │    │ パターン:          │    │ 管理者通知   │
│              │───▶│ source: aws.ec2    │───▶│ メール送信   │
│ encrypted:   │    │ detail:            │    │              │
│   false      │    │   encrypted: false │    └──────────────┘
└──────────────┘    └───────────────────┘
```

### 8.3 IAMアクセスキーローテーション通知

```
【90日以上のアクセスキー検出】

Config Rule              EventBridge              Lambda
┌──────────────┐    ┌───────────────────┐    ┌──────────────┐
│ access-keys- │    │ パターン:          │    │ SNS通知      │
│ rotated      │───▶│ source: aws.config │───▶│ +            │
│ NON_COMPLIANT│    │ compliance:        │    │ キー無効化   │
│              │    │  NON_COMPLIANT     │    │ (任意)       │
└──────────────┘    └───────────────────┘    └──────────────┘
```

### 8.4 EC2インスタンス停止時の自動復旧

```
【EC2自動復旧】

EC2                      EventBridge              SSM Automation
┌──────────────┐    ┌───────────────────┐    ┌──────────────┐
│ Instance     │    │ パターン:          │    │ AWS-         │
│ State Change │───▶│ state: stopped     │───▶│ StartEC2     │
│ → stopped    │    │ タグフィルタ:      │    │ Instance     │
│              │    │ AutoRestart=true   │    │              │
└──────────────┘    └───────────────────┘    └──────────────┘
```

### 8.5 パイプライン失敗通知

```
【CodePipeline失敗時の自動通知】

CodePipeline             EventBridge              SNS + Lambda
┌──────────────┐    ┌───────────────────┐    ┌──────────────┐
│ Pipeline     │    │ パターン:          │    │ Slack通知    │
│ Execution    │───▶│ source:            │───▶│ メール通知   │
│ State:FAILED │    │  aws.codepipeline  │    │ チケット作成 │
│              │    │ state: FAILED      │    │              │
└──────────────┘    └───────────────────┘    └──────────────┘
```

---

## 9. ハンズオン演習

### 演習1: イベントルールの作成（EC2状態変更）

```bash
# 1. Lambda関数用のIAMロール作成（省略 - 既存ロール使用可）

# 2. イベントルールの作成
aws events put-rule \
  --name "ec2-state-change-rule" \
  --event-pattern '{
    "source": ["aws.ec2"],
    "detail-type": ["EC2 Instance State-change Notification"],
    "detail": {
      "state": ["stopped", "terminated"]
    }
  }' \
  --state ENABLED \
  --description "EC2インスタンスの停止・終了を検知"

# 3. ルールの確認
aws events describe-rule \
  --name "ec2-state-change-rule"

# 4. ルール一覧の確認
aws events list-rules \
  --query 'Rules[].{Name:Name,State:State,EventPattern:EventPattern}'
```

### 演習2: スケジュールルールの作成

```bash
# 1. 5分ごとの定期実行ルール
aws events put-rule \
  --name "every-5-minutes" \
  --schedule-expression "rate(5 minutes)" \
  --state ENABLED \
  --description "5分ごとに実行"

# 2. cron式（平日9:00 UTC）
aws events put-rule \
  --name "weekday-morning" \
  --schedule-expression "cron(0 9 ? * MON-FRI *)" \
  --state ENABLED \
  --description "平日朝9時UTC実行"

# 3. ルールの一時停止
aws events disable-rule --name "every-5-minutes"

# 4. ルールの再開
aws events enable-rule --name "every-5-minutes"
```

### 演習3: ターゲットの設定

```bash
# SNSトピック作成
TOPIC_ARN=$(aws sns create-topic \
  --name "ec2-alerts" \
  --query 'TopicArn' \
  --output text)

# ターゲットの追加（SNS）
aws events put-targets \
  --rule "ec2-state-change-rule" \
  --targets '[{
    "Id": "sns-target",
    "Arn": "'${TOPIC_ARN}'"
  }]'

# 入力トランスフォーマーを使ったターゲット
aws events put-targets \
  --rule "ec2-state-change-rule" \
  --targets '[{
    "Id": "sns-formatted",
    "Arn": "'${TOPIC_ARN}'",
    "InputTransformer": {
      "InputPathsMap": {
        "instance": "$.detail.instance-id",
        "state": "$.detail.state",
        "time": "$.time"
      },
      "InputTemplate": "\"EC2 Instance <instance> changed to <state> at <time>\""
    }
  }]'

# ターゲット一覧の確認
aws events list-targets-by-rule \
  --rule "ec2-state-change-rule"
```

### 演習4: カスタムイベントバス

```bash
# 1. カスタムイベントバスの作成
aws events create-event-bus \
  --name "app-events"

# 2. カスタムイベントの送信
aws events put-events \
  --entries '[{
    "Source": "myapp.orders",
    "DetailType": "Order Placed",
    "Detail": "{\"orderId\": \"12345\", \"amount\": 99.99, \"customer\": \"user@example.com\"}",
    "EventBusName": "app-events"
  }]'

# 3. カスタムバス用のルール作成
aws events put-rule \
  --name "order-placed-rule" \
  --event-bus-name "app-events" \
  --event-pattern '{
    "source": ["myapp.orders"],
    "detail-type": ["Order Placed"],
    "detail": {
      "amount": [{"numeric": [">", 50]}]
    }
  }' \
  --state ENABLED

# 4. イベントバス一覧の確認
aws events list-event-buses

# 5. クリーンアップ
aws events remove-targets --rule "order-placed-rule" --event-bus-name "app-events" --ids "sns-target"
aws events delete-rule --name "order-placed-rule" --event-bus-name "app-events"
aws events delete-event-bus --name "app-events"
```

### 演習5: イベントバスのリソースポリシー（クロスアカウント）

```bash
# 集約アカウント側: イベントバスのポリシー設定
aws events put-permission \
  --event-bus-name "security-events" \
  --action "events:PutEvents" \
  --principal "111111111111" \
  --statement-id "AllowAccountA"

# Organizations全体を許可する場合
aws events put-permission \
  --event-bus-name "security-events" \
  --action "events:PutEvents" \
  --principal "*" \
  --statement-id "AllowOrg" \
  --condition '{
    "Type": "StringEquals",
    "Key": "aws:PrincipalOrgID",
    "Value": "o-1234567890"
  }'

# ポリシーの確認
aws events describe-event-bus \
  --name "security-events" \
  --query 'Policy'

# 権限の削除
aws events remove-permission \
  --event-bus-name "security-events" \
  --statement-id "AllowAccountA"
```

### 演習6: DLQ設定とリトライ

```bash
# DLQ用のSQSキュー作成
DLQ_ARN=$(aws sqs create-queue \
  --queue-name "eventbridge-dlq" \
  --query 'QueueUrl' \
  --output text)

DLQ_ARN=$(aws sqs get-queue-attributes \
  --queue-url ${DLQ_ARN} \
  --attribute-names QueueArn \
  --query 'Attributes.QueueArn' \
  --output text)

# ターゲットにDLQとリトライポリシーを設定
aws events put-targets \
  --rule "ec2-state-change-rule" \
  --targets '[{
    "Id": "lambda-with-dlq",
    "Arn": "arn:aws:lambda:ap-northeast-1:123456789012:function:my-handler",
    "DeadLetterConfig": {
      "Arn": "'${DLQ_ARN}'"
    },
    "RetryPolicy": {
      "MaximumRetryAttempts": 3,
      "MaximumEventAgeInSeconds": 3600
    }
  }]'
```

### 演習7: EventBridge Scheduler

```bash
# 1. ワンタイムスケジュール（1回限り）
aws scheduler create-schedule \
  --name "one-time-task" \
  --schedule-expression "at(2026-02-10T09:00:00)" \
  --schedule-expression-timezone "Asia/Tokyo" \
  --flexible-time-window '{"Mode": "OFF"}' \
  --target '{
    "Arn": "arn:aws:lambda:ap-northeast-1:123456789012:function:my-task",
    "RoleArn": "arn:aws:iam::123456789012:role/SchedulerRole"
  }'

# 2. 定期スケジュール（日本時間で毎日9:00）
aws scheduler create-schedule \
  --name "daily-report" \
  --schedule-expression "cron(0 9 * * ? *)" \
  --schedule-expression-timezone "Asia/Tokyo" \
  --flexible-time-window '{"Mode": "FLEXIBLE", "MaximumWindowInMinutes": 15}' \
  --target '{
    "Arn": "arn:aws:lambda:ap-northeast-1:123456789012:function:daily-report",
    "RoleArn": "arn:aws:iam::123456789012:role/SchedulerRole"
  }'

# 3. スケジュール一覧
aws scheduler list-schedules \
  --query 'Schedules[].{Name:Name,State:State,Expression:ScheduleExpression}'

# 4. 削除
aws scheduler delete-schedule --name "one-time-task"
```

### クリーンアップ

```bash
# ルール削除（ターゲット削除が先）
aws events remove-targets --rule "ec2-state-change-rule" --ids "sns-target" "sns-formatted" "lambda-with-dlq"
aws events delete-rule --name "ec2-state-change-rule"
aws events remove-targets --rule "every-5-minutes" --ids <target-id>
aws events delete-rule --name "every-5-minutes"
aws events delete-rule --name "weekday-morning"

# SNSトピック削除
aws sns delete-topic --topic-arn ${TOPIC_ARN}

# SQSキュー削除
aws sqs delete-queue --queue-url <queue-url>
```

---

## 10. DOP試験対策チェックリスト

### Q1: 自動修復パターン
**Q: セキュリティグループに0.0.0.0/0のインバウンドルールが追加された場合、自動的に削除する仕組みを構築するには？**

<details><summary>模範解答</summary>

EventBridgeルールでCloudTrailイベント（AuthorizeSecurityGroupIngress）をキャプチャし、イベントパターンでcidrIp: 0.0.0.0/0を条件にする。ターゲットにLambda関数を設定し、revoke-security-group-ingressを実行する。代替としてAWS Config + 自動修復（SSM Automation）も利用可能。Config方式はコンプライアンス準拠の記録も残る。

</details>

### Q2: クロスアカウントイベント集約
**Q: Organizations内の全アカウントのGuardDuty Findingを1つのセキュリティアカウントに集約するには？**

<details><summary>模範解答</summary>

セキュリティアカウントにカスタムイベントバスを作成し、リソースベースポリシーでaws:PrincipalOrgID条件を使用してOrganizations全体からのPutEventsを許可する。各メンバーアカウントでEventBridgeルールを作成し、GuardDuty Findingイベントをターゲットとしてセキュリティアカウントのイベントバスに送信する。セキュリティアカウント側で受信イベントに対するルールを作成し、Lambda/SNS/Step Functionsで対応処理を行う。

</details>

### Q3: EventBridge vs SNS
**Q: EventBridgeとSNSの使い分けは？**

<details><summary>模範解答</summary>

EventBridge: AWSサービスイベントのルーティング、コンテンツベースフィルタリング（イベントパターン）、スケジュール実行、複雑なイベント処理に適する。SNS: シンプルなPub/Sub、ファンアウト（多数のサブスクライバー）、モバイルプッシュ、SMS/メール通知に適する。EventBridgeは1ルール5ターゲットだが、SNSは1トピックに数百万サブスクリプション。AWSサービスからの直接イベント（EC2状態変更等）はEventBridge一択。

</details>

### Q4: DLQとリトライ
**Q: EventBridgeターゲットへの配信が失敗した場合の動作は？**

<details><summary>模範解答</summary>

デフォルトではEventBridgeはバックオフ付きで最大24時間（185回）リトライする。リトライポリシーでMaximumRetryAttempts（0-185）とMaximumEventAgeInSeconds（60-86400）をカスタマイズ可能。全リトライ失敗後、DLQ（SQSキュー）を設定していればそこにイベントが格納される。DLQ未設定の場合はイベントが失われる。DLQには元イベント+エラー情報が含まれ、後で再処理が可能。

</details>

### Q5: EventBridge Pipes
**Q: EventBridge PipesとEventBridge Rulesの違い・使い分けは？**

<details><summary>模範解答</summary>

Pipes: Point-to-Point統合。1ソース→フィルタリング→エンリッチメント→1ターゲット。ストリーミングソース（SQS, Kinesis, DynamoDB Streams, Kafka）からのプル型処理に最適。バッチウィンドウやバッチサイズの制御が可能。Rules: イベントパターンマッチング。1ルール→最大5ターゲット。プッシュ型。スケジュール実行可能。AWSサービスイベント（EC2状態変更等）のルーティングに最適。両者は補完的で、Pipesはストリーミング統合、Rulesはイベント駆動ルーティングに使い分ける。

</details>

### Q6: 入力トランスフォーマー
**Q: EventBridgeルールで、イベントデータをターゲットに渡す前にカスタマイズするには？**

<details><summary>模範解答</summary>

入力トランスフォーマー（Input Transformer）を使用する。InputPathsMapでイベントJSONからフィールドを抽出し変数に割り当て、InputTemplateで出力フォーマットを定義する。例: EC2インスタンスIDと状態を抽出して通知メッセージを整形する。定数値の埋め込みやJSONへの変換も可能。ターゲットごとに異なるトランスフォーマーを設定できるため、同じイベントから異なる形式のデータを複数ターゲットに配信できる。

</details>

### Q7: スケジュール
**Q: EventBridgeで「毎日日本時間の朝9時」に処理を実行したい場合、どのように設定するか？**

<details><summary>模範解答</summary>

2つの方法がある。①EventBridge Rules: cron式をUTCで設定。日本時間9:00 = UTC 0:00なので`cron(0 0 ? * * *)`。ただしサマータイムのない日本では問題ないが、UTCオフセットのあるタイムゾーンでは注意が必要。②EventBridge Scheduler: タイムゾーンを直接指定できる。`cron(0 9 * * ? *)`と`--schedule-expression-timezone "Asia/Tokyo"`を組み合わせる。タイムゾーンが重要な場合はSchedulerが推奨。

</details>

### Q8: イベントパターンの高度なマッチング
**Q: EventBridgeイベントパターンで「特定の値以外」「数値の範囲」をマッチさせるには？**

<details><summary>模範解答</summary>

否定: `anything-but`演算子を使用。例: `{"state": [{"anything-but": ["running"]}]}`でrunning以外の状態にマッチ。数値範囲: `numeric`演算子を使用。例: `{"severity": [{"numeric": [">=", 7, "<=", 10]}]}`で重大度7-10にマッチ。他にもprefix（前方一致）、suffix（後方一致）、exists（フィールド存在チェック）、wildcard（ワイルドカード）が利用可能。これらを組み合わせることで複雑なフィルタリングが可能。

</details>
