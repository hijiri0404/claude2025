# AWS SNS & SQS ハンズオンガイド

> **対象**: AWS DevOps Professional (DOP-C02) 試験対策
> **前提知識**: AWS基礎、IAM、Lambda基礎
> **所要時間**: 約3時間

---

## 目次

1. [SNS概要](#1-sns概要)
2. [SQS概要](#2-sqs概要)
3. [ファンアウトパターン（SNS + SQS）](#3-ファンアウトパターンsns--sqs)
4. [DLQ（Dead Letter Queue）の設計](#4-dlqdead-letter-queueの設計)
5. [SQS + Lambda連携（Event Source Mapping）](#5-sqs--lambda連携event-source-mapping)
6. [メッセージ暗号化](#6-メッセージ暗号化)
7. [クロスアカウントアクセス](#7-クロスアカウントアクセス)
8. [ハンズオン演習](#8-ハンズオン演習)
9. [DOP試験対策チェックリスト](#9-dop試験対策チェックリスト)

---

## 1. SNS概要

### 1.1 Amazon SNSとは

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Amazon SNS                                    │
│               Simple Notification Service                            │
│           フルマネージド Pub/Sub メッセージングサービス               │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │                   Publisher (発行者)                           │ │
│  │                                                                │ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │ │
│  │  │ Lambda   │  │ API GW   │  │CloudWatch│  │  App     │    │ │
│  │  │          │  │          │  │ Alarm    │  │          │    │ │
│  │  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘    │ │
│  └───────┼──────────────┼──────────────┼──────────────┼──────────┘ │
│          └──────────────┼──────────────┘              │            │
│                         ▼                              │            │
│              ┌──────────────────┐                      │            │
│              │    SNS Topic     │◀─────────────────────┘            │
│              │   (トピック)      │                                   │
│              └────────┬─────────┘                                   │
│                       │                                              │
│  ┌────────────────────┼──────────────────────────────────────────┐ │
│  │          Subscriptions (サブスクリプション)                    │ │
│  │                    │                                           │ │
│  │    ┌───────┬───────┼───────┬───────┬───────┐                 │ │
│  │    ▼       ▼       ▼       ▼       ▼       ▼                 │ │
│  │ ┌──────┐┌──────┐┌──────┐┌──────┐┌──────┐┌──────┐           │ │
│  │ │ SQS  ││Lambda││ HTTP ││Email ││ SMS  ││Kinesis│           │ │
│  │ │      ││      ││HTTPS ││      ││      ││Firehose│          │ │
│  │ └──────┘└──────┘└──────┘└──────┘└──────┘└──────┘           │ │
│  └────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.2 SNSトピックの種類

| 項目 | Standard トピック | FIFO トピック |
|------|-----------------|--------------|
| **メッセージ順序** | ベストエフォート | 厳密な順序保証 |
| **重複排除** | なし | メッセージ重複排除ID |
| **スループット** | ほぼ無制限 | 300 msg/秒（バッチで3000） |
| **サブスクリプション先** | 全プロトコル | SQS FIFOのみ |
| **トピック名** | 任意 | `.fifo`サフィックス必須 |
| **料金** | $0.50/100万リクエスト | $0.50/100万リクエスト |

### 1.3 メッセージフィルタリング

```
【SNS メッセージフィルタリング】

Publisher
    │
    │  メッセージ + メッセージ属性
    │  {
    │    "order_type": "premium",
    │    "region": "ap-northeast-1"
    │  }
    │
    ▼
┌──────────────┐
│  SNS Topic   │
└──────┬───────┘
       │
       ├──────────────────┬──────────────────┐
       │                  │                  │
       ▼                  ▼                  ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ Subscription │  │ Subscription │  │ Subscription │
│              │  │              │  │              │
│ Filter:      │  │ Filter:      │  │ Filter:      │
│ order_type:  │  │ order_type:  │  │ region:      │
│  ["premium"] │  │  ["standard"]│  │  ["us-east-1"]│
│              │  │              │  │              │
│  ✅ 配信     │  │  ❌ 非配信   │  │  ❌ 非配信   │
└──────────────┘  └──────────────┘  └──────────────┘
```

### 1.4 フィルタポリシーの種類

| フィルタ方式 | 説明 | ユースケース |
|-------------|------|-------------|
| **属性ベース（デフォルト）** | メッセージ属性でフィルタ | メタデータによる振分け |
| **ペイロードベース** | メッセージ本文でフィルタ | 本文の内容に基づく振分け |

```json
// 属性ベースフィルタポリシー
{
  "order_type": ["premium"],
  "price": [{"numeric": [">=", 100]}],
  "region": [{"prefix": "ap-"}]
}

// ペイロードベースフィルタポリシー
// FilterPolicyScope = "MessageBody" を指定
{
  "order": {
    "type": ["premium"],
    "amount": [{"numeric": [">", 1000]}]
  }
}
```

### 1.5 フィルタポリシー演算子

| 演算子 | 記法 | 例 |
|--------|------|-----|
| **完全一致** | `["value"]` | `["premium"]` |
| **数値比較** | `[{"numeric": [">=", 100]}]` | 100以上 |
| **数値範囲** | `[{"numeric": [">", 0, "<=", 100]}]` | 0超100以下 |
| **前方一致** | `[{"prefix": "ap-"}]` | `ap-`で始まる |
| **後方一致** | `[{"suffix": ".com"}]` | `.com`で終わる |
| **存在チェック** | `[{"exists": true}]` | 属性が存在する |
| **否定** | `[{"anything-but": ["test"]}]` | `test`以外 |

### 1.6 DOP試験での重要ポイント

| トピック | 重要度 | 出題パターン |
|---------|--------|-------------|
| **メッセージフィルタリング** | ★★★★★ | フィルタポリシーの設計 |
| **SNS + SQS ファンアウト** | ★★★★★ | 非同期アーキテクチャ設計 |
| **Standard vs FIFO** | ★★★★☆ | ユースケースの選択 |
| **暗号化（SSE-KMS）** | ★★★★☆ | セキュリティ要件 |
| **クロスアカウント配信** | ★★★☆☆ | リソースポリシー設定 |
| **Large Message対応** | ★★★☆☆ | SNS Extended Client |

---

## 2. SQS概要

### 2.1 Amazon SQSとは

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Amazon SQS                                   │
│                  Simple Queue Service                                │
│            フルマネージド メッセージキューサービス                    │
│                                                                      │
│  Producer                    Queue                    Consumer       │
│  ┌──────┐              ┌──────────────┐             ┌──────┐       │
│  │ App  │──SendMessage─▶│              │──Receive──▶│ App  │       │
│  │      │              ││  ■ ■ ■ ■ ■  ││  Message  │      │       │
│  │      │              ││  (Messages)  ││           │      │       │
│  │      │              │└──────────────┘│──Delete──▶│      │       │
│  └──────┘              │                │  Message  └──────┘       │
│                        │                │                           │
│                        │  メッセージ保持│                           │
│                        │  1分〜14日     │                           │
│                        │  (デフォルト4日)│                           │
│                        └────────────────┘                           │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 Standard vs FIFO キュー

| 項目 | Standard キュー | FIFO キュー |
|------|----------------|------------|
| **スループット** | ほぼ無制限 | 300 msg/秒（バッチで3000） |
| **メッセージ順序** | ベストエフォート | 厳密な先入れ先出し |
| **重複配信** | At-Least-Once（重複あり） | Exactly-Once Processing |
| **重複排除** | なし | 重複排除ID / コンテンツベース |
| **キュー名** | 任意 | `.fifo`サフィックス必須 |
| **メッセージグループ** | なし | MessageGroupId で順序制御 |
| **ユースケース** | 大量処理、順序不問 | 金融取引、順序必須処理 |

```
【Standard vs FIFO の動作比較】

Standard Queue:
  送信順: A → B → C → D → E
  受信順: A → C → B → D → B → E  (順序不定、重複あり)

FIFO Queue:
  送信順: A → B → C → D → E
  受信順: A → B → C → D → E      (順序保証、重複なし)

FIFO + MessageGroupId:
  Group "order":   A1 → A2 → A3   (グループ内で順序保証)
  Group "payment": B1 → B2 → B3   (グループ間は並列処理可能)
```

### 2.3 Visibility Timeout（可視性タイムアウト）

```
【Visibility Timeout の仕組み】

時間軸 ──────────────────────────────────────────▶

Consumer A がメッセージ受信
    │
    ▼
┌───────────────────────────────┐
│   Visibility Timeout (30秒)   │
│   メッセージは他のConsumerに  │
│   見えない                    │
│                               │
│   ┌─────────────────────────┐ │
│   │ Consumer A が処理中     │ │
│   │                         │ │
│   │ ケース1: 処理完了       │ │
│   │  → DeleteMessage        │ │
│   │  → キューから削除       │ │
│   │                         │ │
│   │ ケース2: 処理失敗/超過  │ │
│   │  → タイムアウト後       │ │
│   │  → 再び可視状態に       │ │
│   │  → 他のConsumerが受信   │ │
│   └─────────────────────────┘ │
└───────────────────────────────┘

デフォルト: 30秒
最小値:     0秒
最大値:     12時間

※ 処理に時間がかかる場合:
   ChangeMessageVisibility API で延長可能
```

### 2.4 Long Polling vs Short Polling

| 項目 | Short Polling | Long Polling |
|------|--------------|-------------|
| **動作** | 即座に応答（空でも） | メッセージ到着まで待機 |
| **空レスポンス** | 頻発する | 削減される |
| **API呼出し回数** | 多い | 少ない |
| **コスト** | 高い | 低い（推奨） |
| **待機時間** | 0秒 | 1〜20秒 |
| **設定方法** | WaitTimeSeconds=0 | WaitTimeSeconds=1-20 |

```
【Short Polling vs Long Polling】

Short Polling (WaitTimeSeconds=0):
  App → SQS: "メッセージある？"    → SQS: "ない" (空レスポンス)
  App → SQS: "メッセージある？"    → SQS: "ない" (空レスポンス)
  App → SQS: "メッセージある？"    → SQS: "ある！" (メッセージ返却)
  ※ 無駄なAPI呼出しが多い = コスト増

Long Polling (WaitTimeSeconds=20):
  App → SQS: "メッセージある？最大20秒待つ"
  ... (待機中) ...
  SQS: "メッセージ来た！" (メッセージ返却)
  ※ 空レスポンス削減 = コスト最適化
```

### 2.5 SQSの重要パラメータ

| パラメータ | デフォルト | 範囲 | 説明 |
|-----------|----------|------|------|
| **MessageRetentionPeriod** | 4日 | 60秒〜14日 | メッセージ保持期間 |
| **VisibilityTimeout** | 30秒 | 0秒〜12時間 | 可視性タイムアウト |
| **DelaySeconds** | 0秒 | 0〜900秒 | 配信遅延 |
| **MaximumMessageSize** | 256KB | 1KB〜256KB | 最大メッセージサイズ |
| **ReceiveMessageWaitTimeSeconds** | 0秒 | 0〜20秒 | Long Polling待機時間 |
| **MaxReceiveCount** | - | 1〜1000 | DLQ転送閾値 |

---

## 3. ファンアウトパターン（SNS + SQS）

### 3.1 ファンアウトアーキテクチャ

```
【SNS + SQS ファンアウトパターン】

1つのイベントを複数のサービスで並列処理

                    ┌──────────────┐
                    │  Publisher   │
                    │  (注文API)   │
                    └──────┬───────┘
                           │ Publish
                           ▼
                    ┌──────────────┐
                    │  SNS Topic   │
                    │  (注文イベント)│
                    └──────┬───────┘
                           │
            ┌──────────────┼──────────────┐
            │              │              │
            ▼              ▼              ▼
     ┌──────────┐  ┌──────────┐  ┌──────────┐
     │ SQS Queue│  │ SQS Queue│  │ SQS Queue│
     │ (在庫)   │  │ (決済)   │  │ (通知)   │
     └────┬─────┘  └────┬─────┘  └────┬─────┘
          │              │              │
          ▼              ▼              ▼
     ┌──────────┐  ┌──────────┐  ┌──────────┐
     │ Lambda   │  │ Lambda   │  │ Lambda   │
     │ (在庫処理)│  │ (決済処理)│  │ (メール) │
     └──────────┘  └──────────┘  └──────────┘

メリット:
  - サービス間の疎結合
  - 個別スケーリング
  - 障害分離（1つ失敗しても他に影響なし）
  - SQSバッファによるスパイク対応
```

### 3.2 フィルタリング付きファンアウト

```
【フィルタリング付きファンアウト】

SNS Topic
    │
    ├─ Filter: {"order_type": ["premium"]}
    │  └─▶ SQS Queue (優先処理)
    │       └─▶ Lambda (高優先度ワーカー)
    │
    ├─ Filter: {"order_type": ["standard"]}
    │  └─▶ SQS Queue (通常処理)
    │       └─▶ Lambda (通常ワーカー)
    │
    └─ Filter なし (全メッセージ受信)
       └─▶ SQS Queue (分析・ログ)
            └─▶ Lambda (分析処理)
```

### 3.3 ファンアウト構成のCLI設定

```bash
# 1. SNSトピックの作成
TOPIC_ARN=$(aws sns create-topic \
  --name order-events \
  --query "TopicArn" --output text)

echo "Topic ARN: ${TOPIC_ARN}"

# 2. SQSキューの作成（在庫処理用）
INVENTORY_QUEUE_URL=$(aws sqs create-queue \
  --queue-name inventory-queue \
  --attributes '{
    "VisibilityTimeout": "60",
    "ReceiveMessageWaitTimeSeconds": "20",
    "MessageRetentionPeriod": "86400"
  }' \
  --query "QueueUrl" --output text)

INVENTORY_QUEUE_ARN=$(aws sqs get-queue-attributes \
  --queue-url ${INVENTORY_QUEUE_URL} \
  --attribute-names QueueArn \
  --query "Attributes.QueueArn" --output text)

# 3. SQSキューポリシーの設定（SNSからの配信許可）
aws sqs set-queue-attributes \
  --queue-url ${INVENTORY_QUEUE_URL} \
  --attributes '{
    "Policy": "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Principal\":{\"Service\":\"sns.amazonaws.com\"},\"Action\":\"sqs:SendMessage\",\"Resource\":\"'${INVENTORY_QUEUE_ARN}'\",\"Condition\":{\"ArnEquals\":{\"aws:SourceArn\":\"'${TOPIC_ARN}'\"}}}]}"
  }'

# 4. SNSサブスクリプションの作成（フィルタポリシー付き）
aws sns subscribe \
  --topic-arn ${TOPIC_ARN} \
  --protocol sqs \
  --notification-endpoint ${INVENTORY_QUEUE_ARN} \
  --attributes '{
    "FilterPolicy": "{\"order_type\": [\"premium\", \"standard\"]}",
    "FilterPolicyScope": "MessageAttributes",
    "RawMessageDelivery": "true"
  }'

# 5. メッセージの発行テスト
aws sns publish \
  --topic-arn ${TOPIC_ARN} \
  --message '{"order_id": "ORD-001", "item": "laptop", "quantity": 1}' \
  --message-attributes '{
    "order_type": {"DataType": "String", "StringValue": "premium"},
    "region": {"DataType": "String", "StringValue": "ap-northeast-1"}
  }'
```

### 3.4 Raw Message Delivery

| 設定 | 動作 | ユースケース |
|------|------|-------------|
| **無効（デフォルト）** | SNSメタデータでラップされる | メッセージ属性が必要な場合 |
| **有効** | メッセージ本文のみ配信 | JSON解析の簡素化 |

```json
// Raw Message Delivery: OFF（デフォルト）
{
  "Type": "Notification",
  "MessageId": "xxx",
  "TopicArn": "arn:aws:sns:...",
  "Message": "{\"order_id\": \"ORD-001\"}",  // エスケープされる
  "Timestamp": "2026-02-04T...",
  "MessageAttributes": {...}
}

// Raw Message Delivery: ON
{"order_id": "ORD-001"}  // メッセージ本文のみ
```

---

## 4. DLQ（Dead Letter Queue）の設計

### 4.1 DLQのアーキテクチャ

```
【Dead Letter Queue の仕組み】

Producer → SQS Main Queue → Consumer
                │
                │  処理失敗時:
                │  1. メッセージが再びキューに戻る
                │  2. ReceiveCount がインクリメント
                │  3. ReceiveCount > maxReceiveCount の場合
                │
                ▼
         ┌──────────────┐
         │   DLQ        │
         │  (Dead Letter│
         │   Queue)     │
         │              │
         │  処理失敗した │
         │  メッセージの │
         │  退避先       │
         └──────┬───────┘
                │
                ▼
         ┌──────────────┐
         │ 調査・再処理 │
         │              │
         │ ・手動調査   │
         │ ・自動再処理 │
         │ ・アラーム   │
         └──────────────┘
```

### 4.2 DLQ設計のベストプラクティス

```
【DLQ + 再処理パターン】

                 ┌─────────────────────────────────────────┐
                 │         正常フロー                       │
  Producer ──▶  │  Main Queue ──▶ Consumer (Lambda)       │
                 │      │                                   │
                 │      │ maxReceiveCount=3 で失敗          │
                 │      ▼                                   │
                 │  ┌──────────┐                            │
                 │  │   DLQ    │                            │
                 │  └────┬─────┘                            │
                 │       │                                  │
                 │       ├──▶ CloudWatch Alarm              │
                 │       │    (ApproximateNumberOfMessages)  │
                 │       │    → SNS → 運用チーム通知         │
                 │       │                                  │
                 │       └──▶ DLQ Redrive (再処理)          │
                 │            Main Queue に戻す             │
                 └─────────────────────────────────────────┘
```

### 4.3 DLQの設定

```bash
# 1. DLQの作成
DLQ_URL=$(aws sqs create-queue \
  --queue-name order-processing-dlq \
  --attributes '{
    "MessageRetentionPeriod": "1209600"
  }' \
  --query "QueueUrl" --output text)

DLQ_ARN=$(aws sqs get-queue-attributes \
  --queue-url ${DLQ_URL} \
  --attribute-names QueueArn \
  --query "Attributes.QueueArn" --output text)

# 2. メインキューにDLQを設定（RedrivePolicy）
aws sqs set-queue-attributes \
  --queue-url ${MAIN_QUEUE_URL} \
  --attributes '{
    "RedrivePolicy": "{\"deadLetterTargetArn\":\"'${DLQ_ARN}'\",\"maxReceiveCount\":\"3\"}"
  }'

# 3. DLQからメインキューへの再処理（Redrive）
aws sqs start-message-move-task \
  --source-arn ${DLQ_ARN} \
  --destination-arn ${MAIN_QUEUE_ARN}

# 4. 再処理タスクのステータス確認
aws sqs list-message-move-tasks \
  --source-arn ${DLQ_ARN}
```

### 4.4 SNSのDLQ

```
【SNS + SQS DLQ パターン】

SNSサブスクリプションにもDLQを設定可能

  SNS Topic
      │
      ├──▶ SQS Subscription ──（配信失敗）──▶ Subscription DLQ
      │
      └──▶ Lambda Subscription ──（配信失敗）──▶ Subscription DLQ

※ SNSの配信失敗 と SQSの処理失敗 は別のDLQ

配信失敗の原因:
  - SQSキューが存在しない
  - アクセス権限不足
  - KMS暗号化エラー
```

```bash
# SNSサブスクリプションのDLQ設定
aws sns subscribe \
  --topic-arn ${TOPIC_ARN} \
  --protocol sqs \
  --notification-endpoint ${QUEUE_ARN} \
  --attributes '{
    "RedrivePolicy": "{\"deadLetterTargetArn\": \"'${SNS_DLQ_ARN}'\"}"
  }'
```

### 4.5 DLQ監視の設定

```bash
# DLQのメッセージ数監視アラーム
aws cloudwatch put-metric-alarm \
  --alarm-name "DLQ-Messages-Alert" \
  --alarm-description "DLQにメッセージが滞留" \
  --namespace "AWS/SQS" \
  --metric-name "ApproximateNumberOfMessagesVisible" \
  --dimensions Name=QueueName,Value=order-processing-dlq \
  --statistic Sum \
  --period 300 \
  --threshold 1 \
  --comparison-operator GreaterThanOrEqualToThreshold \
  --evaluation-periods 1 \
  --alarm-actions ${SNS_ALERT_TOPIC_ARN}
```

---

## 5. SQS + Lambda連携（Event Source Mapping）

### 5.1 Event Source Mapping の仕組み

```
【SQS + Lambda Event Source Mapping】

SQS Queue
┌──────────────────────────────────┐
│  ■ ■ ■ ■ ■ ■ ■ ■ ■ ■           │
│  (キュー内メッセージ)             │
└──────────────┬───────────────────┘
               │
               │ Lambda Service が
               │ ポーリング (Long Polling)
               │
               ▼
┌──────────────────────────────────┐
│  Event Source Mapping (ESM)      │
│                                  │
│  ・SQSキューをポーリング         │
│  ・バッチでメッセージ取得        │
│  ・Lambda関数を同期呼出し        │
│  ・成功: メッセージ削除          │
│  ・失敗: Visibility Timeout後    │
│         再処理 or DLQ転送        │
│                                  │
│  設定パラメータ:                 │
│  ├─ BatchSize: 1〜10000          │
│  │  (Standard: max 10000)        │
│  │  (FIFO: max 10)               │
│  ├─ MaximumBatchingWindowInSeconds│
│  │  (0〜300秒)                   │
│  ├─ FunctionResponseTypes        │
│  │  (ReportBatchItemFailures)    │
│  └─ MaximumConcurrency           │
│     (2〜1000)                    │
└──────────────┬───────────────────┘
               │
               ▼
┌──────────────────────────────────┐
│  Lambda Function                 │
│                                  │
│  event = {                       │
│    "Records": [                  │
│      {                           │
│        "messageId": "xxx",       │
│        "body": "{...}",          │
│        "attributes": {...},      │
│        "messageAttributes": {...}│
│      }                           │
│    ]                             │
│  }                               │
└──────────────────────────────────┘
```

### 5.2 Standard Queue vs FIFO Queue の Lambda連携

| 項目 | Standard Queue | FIFO Queue |
|------|---------------|------------|
| **BatchSize** | 1〜10,000 | 1〜10 |
| **同時実行** | ESMが自動スケール | MessageGroupId数まで |
| **順序保証** | なし | MessageGroupId内で保証 |
| **部分バッチ失敗** | ReportBatchItemFailures | ReportBatchItemFailures |
| **MaximumConcurrency** | 2〜1000 | N/A（グループ数で制御） |

### 5.3 部分バッチ失敗レポート（ReportBatchItemFailures）

```
【ReportBatchItemFailures の仕組み】

バッチ処理: 10メッセージ受信
┌───┬───┬───┬───┬───┬───┬───┬───┬───┬───┐
│ 1 │ 2 │ 3 │ 4 │ 5 │ 6 │ 7 │ 8 │ 9 │10 │
│ ✅│ ✅│ ❌│ ✅│ ✅│ ❌│ ✅│ ✅│ ✅│ ✅│
└───┴───┴───┴───┴───┴───┴───┴───┴───┴───┘

WITHOUT ReportBatchItemFailures:
  → 1つでも失敗 → バッチ全体が失敗
  → 10メッセージ全てが再処理 (非効率)

WITH ReportBatchItemFailures:
  → 失敗した #3, #6 のみ報告
  → 成功した 8メッセージは削除
  → #3, #6 のみ再処理 (効率的)
```

```python
# Lambda関数: ReportBatchItemFailures 対応
def lambda_handler(event, context):
    batch_item_failures = []

    for record in event["Records"]:
        try:
            # メッセージ処理
            body = json.loads(record["body"])
            process_order(body)
        except Exception as e:
            # 失敗したメッセージIDを記録
            batch_item_failures.append({
                "itemIdentifier": record["messageId"]
            })

    return {
        "batchItemFailures": batch_item_failures
    }
```

### 5.4 Event Source Mappingの設定

```bash
# Event Source Mapping の作成
aws lambda create-event-source-mapping \
  --function-name order-processor \
  --event-source-arn ${QUEUE_ARN} \
  --batch-size 10 \
  --maximum-batching-window-in-seconds 5 \
  --function-response-types "ReportBatchItemFailures" \
  --scaling-config '{"MaximumConcurrency": 10}'

# Event Source Mapping の確認
aws lambda list-event-source-mappings \
  --function-name order-processor

# Event Source Mapping の更新
aws lambda update-event-source-mapping \
  --uuid "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" \
  --batch-size 50 \
  --maximum-batching-window-in-seconds 10

# Event Source Mapping の無効化（メンテナンス時）
aws lambda update-event-source-mapping \
  --uuid "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" \
  --enabled false
```

### 5.5 MaximumConcurrency（同時実行数制御）

```
【MaximumConcurrency の効果】

MaximumConcurrency なし:
  SQS Queue ──▶ ESM ──▶ Lambda: 最大1000同時実行
                         (他のLambda関数のクォータを圧迫)

MaximumConcurrency = 10:
  SQS Queue ──▶ ESM ──▶ Lambda: 最大10同時実行
                         (下流のDB等への負荷を制御)

※ Reserved Concurrency との違い:
  - Reserved Concurrency: Lambda関数レベルの制限
  - MaximumConcurrency: ESMレベルの制限（推奨）

  Reserved Concurrency = 0 → 関数全体が無効
  MaximumConcurrency = 2  → ESM経由のみ制限、他のトリガーは影響なし
```

---

## 6. メッセージ暗号化

### 6.1 暗号化オプション

```
【SQS メッセージ暗号化の比較】

┌─────────────────────────────────────────────────────────────────┐
│                     暗号化オプション                             │
│                                                                  │
│  ┌──────────────────────┐  ┌──────────────────────────────────┐│
│  │    SSE-SQS           │  │         SSE-KMS                  ││
│  │   (SQSマネージド)     │  │    (KMSカスタマーマネージド)      ││
│  │                      │  │                                  ││
│  │  ・AWS管理キー       │  │  ・顧客管理CMK                   ││
│  │  ・追加料金なし       │  │  ・KMS API呼出し料金あり         ││
│  │  ・設定不要          │  │  ・キーポリシーで制御             ││
│  │  ・キーローテーション │  │  ・キーローテーション可能        ││
│  │   自動              │  │  ・CloudTrailで監査              ││
│  │                      │  │  ・クロスアカウント対応           ││
│  │  推奨: 基本的な暗号化│  │  推奨: コンプライアンス要件      ││
│  └──────────────────────┘  └──────────────────────────────────┘│
│                                                                  │
│  ※ 転送中の暗号化: HTTPS (TLS) で常に暗号化済み               │
└─────────────────────────────────────────────────────────────────┘
```

### 6.2 SSE-SQS の設定

```bash
# SSE-SQS の有効化（SQSマネージドキー）
aws sqs set-queue-attributes \
  --queue-url ${QUEUE_URL} \
  --attributes '{
    "SqsManagedSseEnabled": "true"
  }'

# 確認
aws sqs get-queue-attributes \
  --queue-url ${QUEUE_URL} \
  --attribute-names SqsManagedSseEnabled
```

### 6.3 SSE-KMS の設定

```bash
# 1. KMSキーの作成
KEY_ID=$(aws kms create-key \
  --description "SQS encryption key" \
  --query "KeyMetadata.KeyId" --output text)

aws kms create-alias \
  --alias-name alias/sqs-key \
  --target-key-id ${KEY_ID}

# 2. SSE-KMS の有効化
aws sqs set-queue-attributes \
  --queue-url ${QUEUE_URL} \
  --attributes '{
    "KmsMasterKeyId": "'${KEY_ID}'",
    "KmsDataKeyReusePeriodSeconds": "300"
  }'

# ※ KmsDataKeyReusePeriodSeconds:
#    データキーの再利用期間 (60〜86400秒、デフォルト300秒)
#    長くする → KMS API呼出し削減 → コスト低下
#    短くする → セキュリティ向上
```

### 6.4 KMSキーポリシー（SNS → SQS暗号化連携）

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowSNSToEncryptMessages",
      "Effect": "Allow",
      "Principal": {
        "Service": "sns.amazonaws.com"
      },
      "Action": [
        "kms:GenerateDataKey",
        "kms:Decrypt"
      ],
      "Resource": "*",
      "Condition": {
        "ArnEquals": {
          "aws:SourceArn": "arn:aws:sns:ap-northeast-1:123456789012:order-events"
        }
      }
    },
    {
      "Sid": "AllowLambdaToDecryptMessages",
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::123456789012:role/lambda-execution-role"
      },
      "Action": [
        "kms:Decrypt"
      ],
      "Resource": "*"
    }
  ]
}
```

### 6.5 暗号化の注意点

| ポイント | 説明 |
|---------|------|
| **SNS → 暗号化SQS** | SNSサービスにKMS権限が必要 |
| **Lambda + 暗号化SQS** | Lambda実行ロールにkms:Decrypt権限が必要 |
| **KmsDataKeyReusePeriod** | 短い=安全だがコスト高、長い=コスト低だが安全性低 |
| **FIFO + SSE-KMS** | サポートされる（追加の考慮不要） |
| **CloudTrail監査** | SSE-KMSのみKMS API呼出しがCloudTrailに記録される |

---

## 7. クロスアカウントアクセス

### 7.1 クロスアカウントアーキテクチャ

```
【クロスアカウント SNS + SQS】

Account A (111111111111)             Account B (222222222222)
┌──────────────────────────┐       ┌──────────────────────────┐
│                          │       │                          │
│  ┌──────────────────┐   │       │   ┌──────────────────┐  │
│  │    SNS Topic     │───┼───────┼──▶│    SQS Queue     │  │
│  │                  │   │       │   │                  │  │
│  └──────────────────┘   │       │   └──────────────────┘  │
│                          │       │                          │
│  必要な設定:             │       │  必要な設定:             │
│  ・トピックポリシー      │       │  ・キューポリシー         │
│   (Account Bの購読許可)  │       │   (Account Aからの        │
│                          │       │    SendMessage許可)       │
└──────────────────────────┘       └──────────────────────────┘

Account C (333333333333)
┌──────────────────────────┐
│                          │
│  ┌──────────────────┐   │
│  │    SQS Queue     │   │
│  │  (同様に設定)     │   │
│  └──────────────────┘   │
└──────────────────────────┘
```

### 7.2 クロスアカウント SNS トピックポリシー

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowCrossAccountSubscription",
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::222222222222:root"
      },
      "Action": [
        "sns:Subscribe",
        "sns:Receive"
      ],
      "Resource": "arn:aws:sns:ap-northeast-1:111111111111:order-events"
    }
  ]
}
```

```bash
# SNSトピックポリシーの設定
aws sns set-topic-attributes \
  --topic-arn arn:aws:sns:ap-northeast-1:111111111111:order-events \
  --attribute-name Policy \
  --attribute-value '{
    "Version": "2012-10-17",
    "Statement": [
      {
        "Sid": "AllowCrossAccountSubscription",
        "Effect": "Allow",
        "Principal": {
          "AWS": "arn:aws:iam::222222222222:root"
        },
        "Action": ["sns:Subscribe", "sns:Receive"],
        "Resource": "arn:aws:sns:ap-northeast-1:111111111111:order-events"
      }
    ]
  }'
```

### 7.3 クロスアカウント SQS キューポリシー

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowSNSFromAccountA",
      "Effect": "Allow",
      "Principal": {
        "Service": "sns.amazonaws.com"
      },
      "Action": "sqs:SendMessage",
      "Resource": "arn:aws:sqs:ap-northeast-1:222222222222:order-queue",
      "Condition": {
        "ArnEquals": {
          "aws:SourceArn": "arn:aws:sns:ap-northeast-1:111111111111:order-events"
        }
      }
    }
  ]
}
```

```bash
# Account B で実行: キューポリシーの設定
aws sqs set-queue-attributes \
  --queue-url https://sqs.ap-northeast-1.amazonaws.com/222222222222/order-queue \
  --attributes '{
    "Policy": "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Sid\":\"AllowSNSFromAccountA\",\"Effect\":\"Allow\",\"Principal\":{\"Service\":\"sns.amazonaws.com\"},\"Action\":\"sqs:SendMessage\",\"Resource\":\"arn:aws:sqs:ap-northeast-1:222222222222:order-queue\",\"Condition\":{\"ArnEquals\":{\"aws:SourceArn\":\"arn:aws:sns:ap-northeast-1:111111111111:order-events\"}}}]}"
  }'

# Account B で実行: クロスアカウントサブスクリプション
aws sns subscribe \
  --topic-arn arn:aws:sns:ap-northeast-1:111111111111:order-events \
  --protocol sqs \
  --notification-endpoint arn:aws:sqs:ap-northeast-1:222222222222:order-queue
```

### 7.4 クロスアカウント + KMS暗号化

```
【クロスアカウント + KMS暗号化の権限設計】

Account A (SNS Topic + KMS Key)
  │
  │ 必要な権限:
  │ 1. SNSトピックポリシー → Account B の購読許可
  │ 2. KMSキーポリシー     → Account B のDecrypt許可
  │
  ▼
Account B (SQS Queue)
  │
  │ 必要な権限:
  │ 1. SQSキューポリシー   → SNSサービスのSendMessage許可
  │ 2. Lambda実行ロール    → Account A のKMSキーのDecrypt許可
  │                         → SQSキューからのReceiveMessage許可
```

```bash
# Account A: KMSキーポリシーにAccount Bを追加
aws kms put-key-policy \
  --key-id ${KEY_ID} \
  --policy-name default \
  --policy '{
    "Version": "2012-10-17",
    "Statement": [
      {
        "Sid": "AllowAccountBDecrypt",
        "Effect": "Allow",
        "Principal": {
          "AWS": "arn:aws:iam::222222222222:root"
        },
        "Action": [
          "kms:Decrypt",
          "kms:DescribeKey"
        ],
        "Resource": "*"
      }
    ]
  }'
```

---

## 8. ハンズオン演習

### 8.1 演習1: SNSトピックとSQSキューの基本操作

```bash
# ===== SNS基本操作 =====

# SNSトピックの作成
TOPIC_ARN=$(aws sns create-topic \
  --name demo-topic \
  --query "TopicArn" --output text)

echo "Topic ARN: ${TOPIC_ARN}"

# トピック一覧の確認
aws sns list-topics \
  --query "Topics[].TopicArn"

# トピック属性の確認
aws sns get-topic-attributes \
  --topic-arn ${TOPIC_ARN}

# ===== SQS基本操作 =====

# SQSキューの作成
QUEUE_URL=$(aws sqs create-queue \
  --queue-name demo-queue \
  --attributes '{
    "VisibilityTimeout": "30",
    "ReceiveMessageWaitTimeSeconds": "20",
    "MessageRetentionPeriod": "86400"
  }' \
  --query "QueueUrl" --output text)

echo "Queue URL: ${QUEUE_URL}"

# キュー一覧の確認
aws sqs list-queues

# キュー属性の確認
aws sqs get-queue-attributes \
  --queue-url ${QUEUE_URL} \
  --attribute-names All
```

### 8.2 演習2: ファンアウト構成の構築

```bash
# ===== ファンアウト構成 =====

# 1. SNSトピック
FANOUT_TOPIC_ARN=$(aws sns create-topic \
  --name fanout-demo \
  --query "TopicArn" --output text)

# 2. 複数のSQSキュー
for QUEUE_NAME in fanout-queue-a fanout-queue-b fanout-queue-c; do
  QUEUE_URL=$(aws sqs create-queue \
    --queue-name ${QUEUE_NAME} \
    --attributes '{"ReceiveMessageWaitTimeSeconds": "20"}' \
    --query "QueueUrl" --output text)

  QUEUE_ARN=$(aws sqs get-queue-attributes \
    --queue-url ${QUEUE_URL} \
    --attribute-names QueueArn \
    --query "Attributes.QueueArn" --output text)

  # キューポリシー設定
  aws sqs set-queue-attributes \
    --queue-url ${QUEUE_URL} \
    --attributes '{
      "Policy": "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Principal\":{\"Service\":\"sns.amazonaws.com\"},\"Action\":\"sqs:SendMessage\",\"Resource\":\"'${QUEUE_ARN}'\",\"Condition\":{\"ArnEquals\":{\"aws:SourceArn\":\"'${FANOUT_TOPIC_ARN}'\"}}}]}"
    }'

  # SNSサブスクリプション
  aws sns subscribe \
    --topic-arn ${FANOUT_TOPIC_ARN} \
    --protocol sqs \
    --notification-endpoint ${QUEUE_ARN}

  echo "Subscribed ${QUEUE_NAME} to topic"
done

# 3. メッセージ発行
aws sns publish \
  --topic-arn ${FANOUT_TOPIC_ARN} \
  --message '{"event": "order_created", "order_id": "ORD-001"}'

# 4. 各キューでメッセージ受信確認
for QUEUE_NAME in fanout-queue-a fanout-queue-b fanout-queue-c; do
  QUEUE_URL=$(aws sqs get-queue-url \
    --queue-name ${QUEUE_NAME} \
    --query "QueueUrl" --output text)

  echo "=== ${QUEUE_NAME} ==="
  aws sqs receive-message \
    --queue-url ${QUEUE_URL} \
    --max-number-of-messages 1 \
    --wait-time-seconds 5
done
```

### 8.3 演習3: DLQ設定と再処理

```bash
# ===== DLQ構成 =====

# 1. DLQの作成
DLQ_URL=$(aws sqs create-queue \
  --queue-name demo-dlq \
  --attributes '{"MessageRetentionPeriod": "1209600"}' \
  --query "QueueUrl" --output text)

DLQ_ARN=$(aws sqs get-queue-attributes \
  --queue-url ${DLQ_URL} \
  --attribute-names QueueArn \
  --query "Attributes.QueueArn" --output text)

# 2. メインキューにRedrivePolicy設定
MAIN_QUEUE_URL=$(aws sqs create-queue \
  --queue-name demo-main-queue \
  --attributes '{
    "VisibilityTimeout": "5",
    "RedrivePolicy": "{\"deadLetterTargetArn\":\"'${DLQ_ARN}'\",\"maxReceiveCount\":\"3\"}"
  }' \
  --query "QueueUrl" --output text)

# 3. テストメッセージ送信
aws sqs send-message \
  --queue-url ${MAIN_QUEUE_URL} \
  --message-body '{"test": "dlq-demo"}'

# 4. 3回受信して削除しない（DLQへの転送をテスト）
for i in 1 2 3; do
  echo "=== Receive attempt ${i} ==="
  aws sqs receive-message \
    --queue-url ${MAIN_QUEUE_URL} \
    --wait-time-seconds 10
  sleep 6  # VisibilityTimeout (5秒) を超えて待機
done

# 5. DLQにメッセージが到着したか確認
echo "=== DLQ Messages ==="
aws sqs get-queue-attributes \
  --queue-url ${DLQ_URL} \
  --attribute-names ApproximateNumberOfMessagesVisible

# 6. DLQからメインキューへ再処理
MAIN_QUEUE_ARN=$(aws sqs get-queue-attributes \
  --queue-url ${MAIN_QUEUE_URL} \
  --attribute-names QueueArn \
  --query "Attributes.QueueArn" --output text)

aws sqs start-message-move-task \
  --source-arn ${DLQ_ARN} \
  --destination-arn ${MAIN_QUEUE_ARN}
```

### 8.4 演習4: メッセージフィルタリング

```bash
# ===== メッセージフィルタリング =====

# 1. トピック作成
FILTER_TOPIC_ARN=$(aws sns create-topic \
  --name filter-demo \
  --query "TopicArn" --output text)

# 2. Premium用キュー
PREMIUM_QUEUE_URL=$(aws sqs create-queue \
  --queue-name premium-orders \
  --query "QueueUrl" --output text)

PREMIUM_QUEUE_ARN=$(aws sqs get-queue-attributes \
  --queue-url ${PREMIUM_QUEUE_URL} \
  --attribute-names QueueArn \
  --query "Attributes.QueueArn" --output text)

# キューポリシー設定（省略: 演習2と同様）

# Premium用サブスクリプション（フィルタ付き）
aws sns subscribe \
  --topic-arn ${FILTER_TOPIC_ARN} \
  --protocol sqs \
  --notification-endpoint ${PREMIUM_QUEUE_ARN} \
  --attributes '{
    "FilterPolicy": "{\"order_type\": [\"premium\"]}",
    "FilterPolicyScope": "MessageAttributes"
  }'

# 3. Standard用キュー（同様に作成・サブスクライブ）

# 4. テスト: Premiumメッセージ発行
aws sns publish \
  --topic-arn ${FILTER_TOPIC_ARN} \
  --message '{"order": "premium order"}' \
  --message-attributes '{
    "order_type": {"DataType": "String", "StringValue": "premium"}
  }'

# 5. テスト: Standardメッセージ発行
aws sns publish \
  --topic-arn ${FILTER_TOPIC_ARN} \
  --message '{"order": "standard order"}' \
  --message-attributes '{
    "order_type": {"DataType": "String", "StringValue": "standard"}
  }'

# 6. Premium用キューを確認（premiumメッセージのみ受信）
aws sqs receive-message \
  --queue-url ${PREMIUM_QUEUE_URL} \
  --wait-time-seconds 5
```

### 8.5 演習5: FIFO キューの操作

```bash
# ===== FIFO キュー =====

# 1. FIFOキュー作成
FIFO_QUEUE_URL=$(aws sqs create-queue \
  --queue-name demo-queue.fifo \
  --attributes '{
    "FifoQueue": "true",
    "ContentBasedDeduplication": "true",
    "VisibilityTimeout": "30"
  }' \
  --query "QueueUrl" --output text)

# 2. メッセージ送信（MessageGroupId必須）
for i in 1 2 3 4 5; do
  aws sqs send-message \
    --queue-url ${FIFO_QUEUE_URL} \
    --message-body "{\"sequence\": ${i}, \"data\": \"message-${i}\"}" \
    --message-group-id "order-group-1"

  echo "Sent message ${i}"
done

# 3. 順序保証された受信
for i in 1 2 3 4 5; do
  RESULT=$(aws sqs receive-message \
    --queue-url ${FIFO_QUEUE_URL} \
    --max-number-of-messages 1 \
    --wait-time-seconds 5)

  echo "Received: $(echo ${RESULT} | jq -r '.Messages[0].Body')"

  RECEIPT=$(echo ${RESULT} | jq -r '.Messages[0].ReceiptHandle')
  aws sqs delete-message \
    --queue-url ${FIFO_QUEUE_URL} \
    --receipt-handle ${RECEIPT}
done
```

### 8.6 クリーンアップ

```bash
# ===== クリーンアップ =====

# SNSトピック削除
aws sns delete-topic --topic-arn ${TOPIC_ARN}
aws sns delete-topic --topic-arn ${FANOUT_TOPIC_ARN}
aws sns delete-topic --topic-arn ${FILTER_TOPIC_ARN}

# SQSキュー削除
for QUEUE_NAME in demo-queue demo-main-queue demo-dlq \
  fanout-queue-a fanout-queue-b fanout-queue-c \
  premium-orders demo-queue.fifo; do

  QUEUE_URL=$(aws sqs get-queue-url \
    --queue-name ${QUEUE_NAME} \
    --query "QueueUrl" --output text 2>/dev/null)

  if [ -n "${QUEUE_URL}" ]; then
    aws sqs delete-queue --queue-url ${QUEUE_URL}
    echo "Deleted: ${QUEUE_NAME}"
  fi
done

# Event Source Mapping削除
aws lambda list-event-source-mappings \
  --function-name order-processor \
  --query "EventSourceMappings[].UUID" --output text | \
  xargs -I {} aws lambda delete-event-source-mapping --uuid {}
```

---

## 9. DOP試験対策チェックリスト

### 基本理解

- [ ] SNSのStandard TopicとFIFO Topicの違いを説明できる
- [ ] SQSのStandard QueueとFIFO Queueの違いを説明できる
- [ ] Visibility Timeoutの動作と適切な設定値を理解している
- [ ] Long PollingとShort Pollingの違いとコスト影響を知っている

<details>
<summary>模範解答を見る</summary>

**SNS Standard vs FIFO**:
| 項目 | Standard | FIFO |
|------|---------|------|
| 順序 | ベストエフォート | 厳密保証 |
| 重複 | あり得る | 重複排除 |
| サブスクリプション先 | 全プロトコル | SQS FIFOのみ |
| スループット | ほぼ無制限 | 300 msg/秒 |

**SQS Standard vs FIFO**:
- Standard: At-Least-Once配信、順序不定、ほぼ無制限スループット
- FIFO: Exactly-Once処理、順序保証、300 msg/秒（バッチ3000）

**Visibility Timeout**:
- メッセージ処理中に他のConsumerから見えなくする時間
- デフォルト30秒、最大12時間
- Lambda連携時: Lambda関数のタイムアウト x 6 が推奨
- `ChangeMessageVisibility` APIで動的に延長可能

**Long Polling**:
- `ReceiveMessageWaitTimeSeconds` = 1〜20秒
- 空レスポンスを削減し、APIコストを最適化
- 本番環境ではLong Polling（20秒）を推奨
</details>

### メッセージフィルタリングとファンアウト

- [ ] SNSメッセージフィルタリングの属性ベースとペイロードベースを使い分けできる
- [ ] フィルタポリシーの演算子（完全一致、数値比較、前方一致等）を書ける
- [ ] SNS + SQSファンアウトパターンのメリットと設計を説明できる
- [ ] Raw Message Deliveryの効果を理解している

<details>
<summary>模範解答を見る</summary>

**フィルタリング方式**:
- **属性ベース（デフォルト）**: `FilterPolicyScope = "MessageAttributes"` - メッセージ属性でフィルタ
- **ペイロードベース**: `FilterPolicyScope = "MessageBody"` - メッセージ本文でフィルタ

**フィルタポリシー例**:
```json
{
  "order_type": ["premium"],           // 完全一致
  "price": [{"numeric": [">=", 100]}], // 数値比較
  "region": [{"prefix": "ap-"}],       // 前方一致
  "status": [{"anything-but": ["cancelled"]}] // 否定
}
```

**ファンアウトのメリット**:
1. サービス間の疎結合化
2. 各Consumerの独立したスケーリング
3. 障害分離（1つの失敗が他に影響しない）
4. SQSバッファによる負荷平準化
5. フィルタリングによるメッセージの選択的配信

**Raw Message Delivery**:
- ON: メッセージ本文のみ配信（JSONパース簡素化）
- OFF: SNSメタデータ付きでラップ（MessageId, TopicArn等を含む）
- SQS, HTTP/HTTPSサブスクリプションで有効
</details>

### DLQと障害処理

- [ ] SQSのDLQ（RedrivePolicy）を設定できる
- [ ] SNSサブスクリプションのDLQとSQS処理のDLQの違いを説明できる
- [ ] DLQからの再処理（Message Move Task）を実行できる
- [ ] DLQの監視アラームを設定できる

<details>
<summary>模範解答を見る</summary>

**RedrivePolicy設定**:
```json
{
  "deadLetterTargetArn": "arn:aws:sqs:...:my-dlq",
  "maxReceiveCount": "3"
}
```
- maxReceiveCount回受信されて削除されなかったメッセージがDLQへ転送

**SNS DLQ vs SQS DLQ**:
| 項目 | SNS DLQ | SQS DLQ |
|------|---------|---------|
| 対象 | サブスクリプション配信失敗 | メッセージ処理失敗 |
| 原因 | エンドポイント到達不可 | Consumer処理エラー |
| 設定箇所 | SNS Subscription | SQS Queue |
| トリガー | 配信リトライ上限超過 | maxReceiveCount超過 |

**再処理（Redrive）**:
```bash
aws sqs start-message-move-task \
  --source-arn ${DLQ_ARN} \
  --destination-arn ${MAIN_QUEUE_ARN}
```
- コンソールからも実行可能
- 部分的な再処理（MaxNumberOfMessagesPerSecond指定可）

**DLQ監視**:
- メトリクス: `ApproximateNumberOfMessagesVisible`
- 閾値: 1以上でアラーム
- アクション: SNS通知 → 運用チームへ
</details>

### SQS + Lambda連携

- [ ] Event Source Mappingの仕組みとパラメータを理解している
- [ ] ReportBatchItemFailuresの実装方法を知っている
- [ ] MaximumConcurrencyとReserved Concurrencyの違いを説明できる
- [ ] Standard Queue / FIFO Queue それぞれのLambda連携の特徴を知っている

<details>
<summary>模範解答を見る</summary>

**Event Source Mapping (ESM)**:
- Lambda ServiceがSQSキューをLong Polling
- メッセージをバッチでLambda関数に渡す
- 成功時: メッセージを自動削除
- 失敗時: Visibility Timeout後に再処理

**主要パラメータ**:
| パラメータ | Standard | FIFO |
|-----------|---------|------|
| BatchSize | 1-10000 | 1-10 |
| MaxBatchingWindow | 0-300秒 | 0-300秒 |
| MaximumConcurrency | 2-1000 | N/A |

**ReportBatchItemFailures**:
```python
return {
    "batchItemFailures": [
        {"itemIdentifier": "failed-message-id"}
    ]
}
```
- 失敗メッセージのみ再処理（バッチ全体の再処理を防止）
- `FunctionResponseTypes` に `ReportBatchItemFailures` を指定

**MaximumConcurrency vs Reserved Concurrency**:
| 項目 | MaximumConcurrency | Reserved Concurrency |
|------|-------------------|---------------------|
| 対象 | ESMのみ | 関数全体 |
| 他のトリガー | 影響なし | 制限される |
| 0設定 | 不可(最小2) | 関数無効化 |
| 推奨 | ESM制御に使用 | 全体的な制限に使用 |

**FIFO Queue + Lambda**:
- MessageGroupIdごとに1つのLambda実行
- 同じグループは直列処理、異なるグループは並列処理
- BatchSize は最大10
</details>

### セキュリティ

- [ ] SSE-SQSとSSE-KMSの違いを説明できる
- [ ] SNS→暗号化SQSの権限設計ができる
- [ ] クロスアカウントのトピックポリシー/キューポリシーを設定できる
- [ ] クロスアカウント + KMS暗号化の権限設計を理解している

<details>
<summary>模範解答を見る</summary>

**SSE-SQS vs SSE-KMS**:
| 項目 | SSE-SQS | SSE-KMS |
|------|---------|---------|
| キー管理 | AWS管理 | 顧客管理CMK |
| 追加料金 | なし | KMS API呼出し課金 |
| キーポリシー | 不要 | 設定可能 |
| CloudTrail | なし | 監査可能 |
| クロスアカウント | 制限あり | 対応 |
| コンプライアンス | 基本暗号化 | 高度な要件対応 |

**SNS → 暗号化SQS**:
1. KMSキーポリシーでSNSサービスに`kms:GenerateDataKey`, `kms:Decrypt`を許可
2. SQSキューポリシーでSNSからの`sqs:SendMessage`を許可
3. Lambda実行ロールに`kms:Decrypt`を許可

**クロスアカウント権限設計**:
```
Account A (Publisher):
  - SNSトピックポリシー: Account BのSubscribe/Receive許可

Account B (Subscriber):
  - SQSキューポリシー: SNSサービスのSendMessage許可
  - Condition: aws:SourceArn でトピックARNを指定
```

**クロスアカウント + KMS**:
- Account AのKMSキーポリシーにAccount BのDecrypt権限を追加
- Account BのLambda実行ロールにAccount AのKMSキーのDecrypt権限を付与
- KmsDataKeyReusePeriodSeconds でコスト最適化（長くするとKMS API呼出し削減）
</details>

### 試験頻出シナリオ

- [ ] 「メッセージの順序保証が必要」→ FIFO Queue + MessageGroupId
- [ ] 「1つのイベントを複数サービスで処理」→ SNS + SQS ファンアウト
- [ ] 「処理失敗メッセージの調査」→ DLQ + CloudWatch アラーム
- [ ] 「Lambda処理のスパイク制御」→ SQSバッファ + MaximumConcurrency
- [ ] 「メッセージの選択的配信」→ SNSフィルタポリシー
- [ ] 「コンプライアンス要件の暗号化」→ SSE-KMS + CloudTrail監査

<details>
<summary>模範解答を見る</summary>

**シナリオ1: 注文処理システム**
- 要件: 注文イベントを在庫、決済、通知の3サービスで処理
- 解答: SNS Topic → 3つのSQS Queue → 各Lambda
- ポイント: ファンアウトパターン、障害分離、個別DLQ

**シナリオ2: 金融取引処理**
- 要件: 取引の順序保証、重複排除
- 解答: SNS FIFO Topic → SQS FIFO Queue → Lambda
- ポイント: MessageGroupId（口座ID等）、ContentBasedDeduplication

**シナリオ3: マイクロサービス間の非同期通信**
- 要件: サービス間の疎結合、スパイク耐性
- 解答: SNS + SQS + Lambda、MaximumConcurrency設定
- ポイント: SQSバッファでバックプレッシャー制御

**シナリオ4: マルチアカウント環境のイベント配信**
- 要件: 中央アカウントから各環境アカウントへイベント配信
- 解答: クロスアカウントSNS + SQS + KMS暗号化
- ポイント: トピックポリシー、キューポリシー、KMSキーポリシーの3層設定

**シナリオ5: 処理失敗の自動検知と復旧**
- 要件: 失敗メッセージの検知、通知、再処理
- 解答: DLQ + CloudWatchアラーム + SNS通知 + Message Move Task
- ポイント: maxReceiveCount適切な値、DLQ保持期間14日

**シナリオ6: コスト最適化**
- 要件: メッセージング基盤のコスト削減
- 解答:
  - Long Polling（WaitTimeSeconds=20）で空レスポンス削減
  - BatchSize増加でAPI呼出し削減
  - KmsDataKeyReusePeriodSeconds延長でKMS呼出し削減
  - フィルタリングで不要なメッセージ配信を防止
</details>

---

## 付録: よく使うCLIコマンド

```bash
# ===== SNS =====

# トピック管理
aws sns create-topic --name TOPIC_NAME
aws sns delete-topic --topic-arn TOPIC_ARN
aws sns list-topics
aws sns get-topic-attributes --topic-arn TOPIC_ARN
aws sns set-topic-attributes --topic-arn TOPIC_ARN --attribute-name ATTR --attribute-value VALUE

# サブスクリプション管理
aws sns subscribe --topic-arn TOPIC_ARN --protocol PROTOCOL --notification-endpoint ENDPOINT
aws sns unsubscribe --subscription-arn SUB_ARN
aws sns list-subscriptions-by-topic --topic-arn TOPIC_ARN

# メッセージ発行
aws sns publish --topic-arn TOPIC_ARN --message MESSAGE
aws sns publish --topic-arn TOPIC_ARN --message MESSAGE --message-attributes '{...}'

# ===== SQS =====

# キュー管理
aws sqs create-queue --queue-name QUEUE_NAME --attributes '{...}'
aws sqs delete-queue --queue-url QUEUE_URL
aws sqs list-queues
aws sqs get-queue-url --queue-name QUEUE_NAME
aws sqs get-queue-attributes --queue-url QUEUE_URL --attribute-names All
aws sqs set-queue-attributes --queue-url QUEUE_URL --attributes '{...}'

# メッセージ操作
aws sqs send-message --queue-url QUEUE_URL --message-body BODY
aws sqs send-message-batch --queue-url QUEUE_URL --entries '[...]'
aws sqs receive-message --queue-url QUEUE_URL --max-number-of-messages N --wait-time-seconds N
aws sqs delete-message --queue-url QUEUE_URL --receipt-handle HANDLE
aws sqs purge-queue --queue-url QUEUE_URL

# DLQ再処理
aws sqs start-message-move-task --source-arn DLQ_ARN --destination-arn MAIN_QUEUE_ARN
aws sqs list-message-move-tasks --source-arn DLQ_ARN

# ===== Lambda Event Source Mapping =====
aws lambda create-event-source-mapping --function-name FUNC --event-source-arn QUEUE_ARN --batch-size N
aws lambda list-event-source-mappings --function-name FUNC
aws lambda update-event-source-mapping --uuid UUID --batch-size N
aws lambda delete-event-source-mapping --uuid UUID
```

---

**作成日**: 2026-02-04
**最終更新**: 2026-02-04
**検証環境**: AWS ap-northeast-1 リージョン
