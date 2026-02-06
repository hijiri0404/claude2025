# AWS Step Functions ハンズオンガイド

> **対象**: AWS DevOps Professional (DOP-C02) 試験対策
> **前提知識**: AWS基礎、JSON、Lambda基本操作
> **所要時間**: 約3-4時間

---

## 目次

1. [Step Functions概要](#1-step-functions概要)
2. [Amazon States Language (ASL)](#2-amazon-states-language-asl)
3. [ステートタイプ](#3-ステートタイプ)
4. [エラーハンドリング](#4-エラーハンドリング)
5. [サービス統合パターン](#5-サービス統合パターン)
6. [サービス連携](#6-サービス連携)
7. [入出力処理](#7-入出力処理)
8. [ハンズオン演習](#8-ハンズオン演習)
9. [DOP試験対策チェックリスト](#9-dop試験対策チェックリスト)

---

## 1. Step Functions概要

### 1.1 Step Functionsとは

```
┌─────────────────────────────────────────────────────────────────────┐
│                       AWS Step Functions                             │
│                  サーバーレスオーケストレーション                       │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │                   ステートマシン (State Machine)                │ │
│  │                                                                │ │
│  │  ┌──────────┐    ┌──────────┐    ┌──────────┐                │ │
│  │  │  State   │───▶│  State   │───▶│  State   │                │ │
│  │  │ (Lambda) │    │ (Choice) │    │  (ECS)   │                │ │
│  │  └──────────┘    └────┬─────┘    └──────────┘                │ │
│  │                       │                                        │ │
│  │                       ▼                                        │ │
│  │                  ┌──────────┐                                  │ │
│  │                  │  State   │                                  │ │
│  │                  │  (SNS)   │                                  │ │
│  │                  └──────────┘                                  │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │                      主要機能                                  │ │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐        │ │
│  │  │ ワーク   │ │ エラー   │ │ 並列     │ │ サービス │        │ │
│  │  │ フロー   │ │ ハンドリ │ │ 処理     │ │ 統合     │        │ │
│  │  │ 可視化   │ │ ング     │ │          │ │ 200+     │        │ │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘        │ │
│  └────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.2 Standard vs Express ワークフロー

```
【ワークフロータイプの選択】

┌─────────────────────────────────┐  ┌─────────────────────────────────┐
│      Standard Workflow          │  │      Express Workflow           │
│                                 │  │                                 │
│  最大実行時間: 1年              │  │  最大実行時間: 5分              │
│  実行セマンティクス: Exactly-once│  │  非同期: At-least-once          │
│  課金: 状態遷移数               │  │  同期:   At-most-once           │
│  実行履歴: API/コンソールで確認  │  │  課金: 実行数+時間+メモリ       │
│                                 │  │  実行履歴: CloudWatch Logs      │
│  ┌───────────────────────────┐ │  │                                 │
│  │ サポート統合パターン:     │ │  │  ┌───────────────────────────┐ │
│  │ ・Request Response       │ │  │  │ サポート統合パターン:     │ │
│  │ ・Run a Job (.sync)      │ │  │  │ ・Request Response のみ   │ │
│  │ ・Wait for Callback      │ │  │  │                           │ │
│  │ ・Distributed Map        │ │  │  │ ※ .sync, .waitForTask     │ │
│  │ ・Activities             │ │  │  │   Token は非サポート      │ │
│  └───────────────────────────┘ │  │  └───────────────────────────┘ │
└─────────────────────────────────┘  └─────────────────────────────────┘

【重要】ワークフロータイプは作成後に変更不可
```

| 比較項目 | Standard | Express (非同期) | Express (同期) |
|---------|----------|-----------------|---------------|
| **最大実行時間** | 1年 | 5分 | 5分 |
| **実行セマンティクス** | Exactly-once | At-least-once | At-most-once |
| **実行開始レート** | 2,000/秒 | 100,000/秒 | - |
| **状態遷移レート** | 4,000/秒/アカウント | 制限なし | 制限なし |
| **実行履歴** | API + コンソール (90日) | CloudWatch Logs | CloudWatch Logs |
| **課金単位** | 状態遷移数 | 実行数 + 時間 + メモリ | 実行数 + 時間 + メモリ |
| **.sync統合** | サポート | 非サポート | 非サポート |
| **Callback統合** | サポート | 非サポート | 非サポート |
| **Distributed Map** | サポート | 非サポート | 非サポート |
| **Activities** | サポート | 非サポート | 非サポート |
| **ユースケース** | 長時間処理、監査要件 | 高頻度イベント処理 | マイクロサービス連携 |

### 1.3 同期/非同期 Express ワークフロー

```
【非同期 Express Workflow】

  クライアント ──StartExecution──▶ Step Functions
       │                              │
       │◀── executionArn (即座に返却)   │
       │                              ▼
       │                         ワークフロー実行
       │                              │
       └──CloudWatch Logs で確認──────┘

【同期 Express Workflow】

  API Gateway ──StartSyncExecution──▶ Step Functions
       │                                  │
       │          (実行完了まで待機)         │
       │                                  ▼
       │                            ワークフロー実行
       │                                  │
       │◀── 実行結果 (output) ────────────┘

  ※ 同期呼出しの開始元: API Gateway, Lambda, StartSyncExecution API
```

### 1.4 DOP試験での重要度

| トピック | 重要度 | 主な出題内容 |
|---------|--------|-------------|
| **Standard vs Express** | ★★★★★ | ワークフロー選択判断 |
| **エラーハンドリング** | ★★★★★ | Retry/Catch戦略 |
| **サービス統合パターン** | ★★★★★ | .sync/.waitForTaskToken |
| **ASL構文** | ★★★★☆ | ステート定義、入出力 |
| **EventBridge連携** | ★★★★☆ | イベント駆動オーケストレーション |
| **Lambda/ECS統合** | ★★★★☆ | タスク実行パターン |
| **Distributed Map** | ★★★☆☆ | 大規模並列処理 |
| **X-Ray連携** | ★★★☆☆ | 分散トレーシング |

### 1.5 料金体系

```
【Step Functions 料金構成】

┌─────────────────────────────────────────────────────────────┐
│ Standard Workflow                                            │
│ ├─ 状態遷移: $0.025 / 1,000 遷移                           │
│ ├─ 無料枠: 4,000 遷移/月                                   │
│ └─ 注意: Retryも状態遷移としてカウント                       │
├─────────────────────────────────────────────────────────────┤
│ Express Workflow                                             │
│ ├─ リクエスト: $1.00 / 100万リクエスト                      │
│ ├─ 時間 (64MB): $0.0000010417 / 100ms                      │
│ ├─ 追加メモリ: メモリ量に比例して増加                        │
│ └─ 無料枠: リクエスト・時間ともに提供あり                    │
└─────────────────────────────────────────────────────────────┘

【コスト最適化ポイント】
・高頻度短時間処理 → Express Workflow が有利
・長時間/少遷移の処理 → Standard Workflow が有利
・Express内のネスト実行でStandard→Expressの組み合わせも可能
```

---

## 2. Amazon States Language (ASL)

### 2.1 ASLの基本構造

```json
{
  "Comment": "ステートマシンの説明",
  "StartAt": "FirstState",
  "TimeoutSeconds": 3600,
  "Version": "1.0",
  "States": {
    "FirstState": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:ap-northeast-1:123456789012:function:MyFunction",
      "Next": "SecondState"
    },
    "SecondState": {
      "Type": "Succeed"
    }
  }
}
```

### 2.2 トップレベルフィールド

| フィールド | 必須 | 説明 |
|-----------|------|------|
| **Comment** | 任意 | ステートマシンの説明文 |
| **StartAt** | 必須 | 最初に実行するステート名 |
| **States** | 必須 | ステートの定義オブジェクト |
| **TimeoutSeconds** | 任意 | 実行全体のタイムアウト秒数 |
| **Version** | 任意 | ASLバージョン（現在 "1.0"） |

### 2.3 共通ステートフィールド

| フィールド | 説明 | 対象ステート |
|-----------|------|-------------|
| **Type** | ステートタイプ（必須） | 全ステート |
| **Comment** | ステートの説明 | 全ステート |
| **Next** | 次のステート名 | End以外 |
| **End** | 最終ステートフラグ（true） | Nextの代替 |
| **InputPath** | 入力フィルタ（JSONPath） | Task, Parallel, Map, Pass, Wait, Choice |
| **OutputPath** | 出力フィルタ（JSONPath） | Task, Parallel, Map, Pass, Wait, Choice |
| **ResultPath** | 結果の配置先（JSONPath） | Task, Parallel, Map, Pass |
| **ResultSelector** | 結果の整形 | Task, Parallel, Map |

### 2.4 ファイル拡張子と命名規則

```bash
# ASL定義ファイルの推奨拡張子
my-workflow.asl.json     # JSON形式
my-workflow.asl.yaml     # YAML形式（CloudFormation等で利用）

# CLI でバリデーション（Workflow Studioにアップロードしても可）
aws stepfunctions create-state-machine \
  --name "test-validation" \
  --definition file://my-workflow.asl.json \
  --role-arn arn:aws:iam::123456789012:role/StepFunctionsRole \
  --dry-run  # ※ dry-runオプションは未提供、テスト実行で検証
```

---

## 3. ステートタイプ

### 3.1 ステートタイプ一覧

```
【ステートタイプの全体像】

┌─────────────────────────────────────────────────────────────────┐
│                    ASL State Types (8種類)                       │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  フロー制御系                                            │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐              │  │
│  │  │  Choice  │  │   Wait   │  │   Pass   │              │  │
│  │  │ 条件分岐  │  │  待機    │  │ パススルー│              │  │
│  │  └──────────┘  └──────────┘  └──────────┘              │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  処理実行系                                              │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐              │  │
│  │  │   Task   │  │ Parallel │  │   Map    │              │  │
│  │  │ タスク実行│  │  並列実行 │  │ 反復処理  │              │  │
│  │  └──────────┘  └──────────┘  └──────────┘              │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  終端系                                                  │  │
│  │  ┌──────────┐  ┌──────────┐                              │  │
│  │  │ Succeed  │  │   Fail   │                              │  │
│  │  │ 正常終了  │  │ 異常終了  │                              │  │
│  │  └──────────┘  └──────────┘                              │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Task ステート

タスクステートは**単一の作業単位**を実行する。AWS サービス呼び出しや Activity の実行に使用する。

```json
{
  "ProcessOrder": {
    "Type": "Task",
    "Resource": "arn:aws:states:::lambda:invoke",
    "Parameters": {
      "FunctionName": "arn:aws:lambda:ap-northeast-1:123456789012:function:ProcessOrder",
      "Payload": {
        "orderId.$": "$.orderId",
        "amount.$": "$.amount"
      }
    },
    "ResultPath": "$.processResult",
    "ResultSelector": {
      "statusCode.$": "$.Payload.statusCode",
      "body.$": "$.Payload.body"
    },
    "TimeoutSeconds": 300,
    "HeartbeatSeconds": 60,
    "Retry": [
      {
        "ErrorEquals": ["Lambda.ServiceException", "Lambda.SdkClientException"],
        "IntervalSeconds": 2,
        "MaxAttempts": 3,
        "BackoffRate": 2.0
      }
    ],
    "Catch": [
      {
        "ErrorEquals": ["States.ALL"],
        "Next": "HandleError"
      }
    ],
    "Next": "NextStep"
  }
}
```

**Task ステートの重要フィールド**:

| フィールド | 説明 | DOP重要度 |
|-----------|------|----------|
| **Resource** | 呼び出すリソースのARN | ★★★★★ |
| **Parameters** | サービスAPIへのパラメータ | ★★★★★ |
| **TimeoutSeconds** | タスクタイムアウト | ★★★★☆ |
| **HeartbeatSeconds** | ハートビート間隔 | ★★★★☆ |
| **Retry** | リトライ設定 | ★★★★★ |
| **Catch** | エラーキャッチ設定 | ★★★★★ |
| **ResultSelector** | 結果の選択・整形 | ★★★☆☆ |
| **Credentials** | クロスアカウント実行のIAMロール | ★★★☆☆ |

### 3.3 Choice ステート

条件分岐ロジックを実装する。ルールに基づいて次のステートを決定する。

```json
{
  "CheckOrderStatus": {
    "Type": "Choice",
    "Choices": [
      {
        "Variable": "$.orderStatus",
        "StringEquals": "APPROVED",
        "Next": "ProcessPayment"
      },
      {
        "Variable": "$.orderAmount",
        "NumericGreaterThan": 10000,
        "Next": "RequireApproval"
      },
      {
        "And": [
          {
            "Variable": "$.customerType",
            "StringEquals": "PREMIUM"
          },
          {
            "Variable": "$.orderAmount",
            "NumericGreaterThan": 5000
          }
        ],
        "Next": "PremiumProcessing"
      }
    ],
    "Default": "StandardProcessing"
  }
}
```

**比較演算子**:

| 演算子 | 説明 | 例 |
|--------|------|-----|
| **StringEquals** | 文字列一致 | `"StringEquals": "ACTIVE"` |
| **StringLessThan** | 文字列辞書順比較 | `"StringLessThan": "M"` |
| **StringMatches** | ワイルドカード一致 | `"StringMatches": "*.json"` |
| **NumericEquals** | 数値一致 | `"NumericEquals": 100` |
| **NumericGreaterThan** | 数値大なり | `"NumericGreaterThan": 0` |
| **BooleanEquals** | 真偽値一致 | `"BooleanEquals": true` |
| **TimestampEquals** | タイムスタンプ一致 | `"TimestampEquals": "2026-01-01T00:00:00Z"` |
| **IsPresent** | フィールド存在確認 | `"IsPresent": true` |
| **IsNull** | null確認 | `"IsNull": false` |
| **IsString** | 型チェック | `"IsString": true` |

**論理演算子**: `And`, `Or`, `Not` でルールを組み合わせ可能

### 3.4 Wait ステート

指定した時間だけ待機する。絶対時間指定と相対時間指定が可能。

```json
{
  "WaitFixedTime": {
    "Type": "Wait",
    "Seconds": 60,
    "Next": "CheckStatus"
  }
}
```

```json
{
  "WaitUntilTimestamp": {
    "Type": "Wait",
    "Timestamp": "2026-03-01T12:00:00Z",
    "Next": "ProcessScheduledTask"
  }
}
```

```json
{
  "WaitDynamic": {
    "Type": "Wait",
    "SecondsPath": "$.waitDuration",
    "Next": "ContinueProcessing"
  }
}
```

| 指定方法 | フィールド | 説明 |
|---------|-----------|------|
| **固定秒数** | Seconds | 指定秒数だけ待機 |
| **固定時刻** | Timestamp | 指定時刻まで待機 (ISO 8601) |
| **動的秒数** | SecondsPath | 入力から秒数を動的に取得 |
| **動的時刻** | TimestampPath | 入力からタイムスタンプを動的に取得 |

### 3.5 Parallel ステート

複数のブランチを**並列**に実行する。全ブランチの完了を待ち、結果を配列として出力する。

```json
{
  "ParallelProcessing": {
    "Type": "Parallel",
    "Branches": [
      {
        "StartAt": "ProcessImages",
        "States": {
          "ProcessImages": {
            "Type": "Task",
            "Resource": "arn:aws:states:::lambda:invoke",
            "Parameters": {
              "FunctionName": "ProcessImages",
              "Payload.$": "$"
            },
            "End": true
          }
        }
      },
      {
        "StartAt": "ProcessMetadata",
        "States": {
          "ProcessMetadata": {
            "Type": "Task",
            "Resource": "arn:aws:states:::lambda:invoke",
            "Parameters": {
              "FunctionName": "ProcessMetadata",
              "Payload.$": "$"
            },
            "End": true
          }
        }
      }
    ],
    "ResultPath": "$.parallelResults",
    "Next": "MergeResults"
  }
}
```

```
【Parallel ステートの動作】

                    ┌─ Branch 0 ──▶ ProcessImages ──┐
  入力 ──▶ Parallel─┤                                ├──▶ 結果配列 ──▶ Next
                    └─ Branch 1 ──▶ ProcessMetadata ─┘

  出力例: [
    { "imageResult": "..." },     // Branch 0 の結果
    { "metadataResult": "..." }   // Branch 1 の結果
  ]

  ※ いずれかのブランチが未キャッチエラーで失敗すると
    他のブランチも中断される
```

### 3.6 Map ステート

配列データの各要素に対して**反復処理**を実行する。Inline Map と Distributed Map の2種類がある。

```json
{
  "ProcessItems": {
    "Type": "Map",
    "ItemsPath": "$.orderItems",
    "MaxConcurrency": 10,
    "ItemProcessor": {
      "ProcessorConfig": {
        "Mode": "INLINE"
      },
      "StartAt": "ProcessItem",
      "States": {
        "ProcessItem": {
          "Type": "Task",
          "Resource": "arn:aws:states:::lambda:invoke",
          "Parameters": {
            "FunctionName": "ProcessOrderItem",
            "Payload.$": "$"
          },
          "End": true
        }
      }
    },
    "ResultPath": "$.processedItems",
    "Next": "Aggregate"
  }
}
```

| 比較項目 | Inline Map | Distributed Map |
|---------|-----------|----------------|
| **最大並行数** | 40 | 10,000 |
| **入力ソース** | ステート入力 (JSON配列) | S3, JSON配列 |
| **項目数上限** | 制限なし（ペイロードサイズ内） | 数百万件 |
| **結果出力先** | ステート出力 | S3 |
| **ワークフロータイプ** | Standard/Express | Standard のみ |
| **子ワークフロー** | インライン | インライン or 子実行 |
| **失敗しきい値** | なし | ToleratedFailurePercentage |

### 3.7 Pass ステート

入力をそのまま（または変換して）出力に渡す。デバッグやデータ加工に使用。

```json
{
  "SetDefaults": {
    "Type": "Pass",
    "Result": {
      "status": "PENDING",
      "retryCount": 0,
      "timestamp": "2026-01-01T00:00:00Z"
    },
    "ResultPath": "$.defaults",
    "Next": "ProcessOrder"
  }
}
```

```json
{
  "TransformData": {
    "Type": "Pass",
    "Parameters": {
      "orderId.$": "$.detail.orderId",
      "customerName.$": "$.detail.customer.name",
      "totalAmount.$": "$.detail.items[0].price"
    },
    "Next": "ValidateOrder"
  }
}
```

### 3.8 Succeed / Fail ステート

```json
{
  "OrderComplete": {
    "Type": "Succeed"
  }
}
```

```json
{
  "OrderFailed": {
    "Type": "Fail",
    "Error": "OrderProcessingError",
    "Cause": "Payment validation failed: insufficient funds"
  }
}
```

| ステート | 用途 | 特徴 |
|---------|------|------|
| **Succeed** | 正常終了 | Next/End フィールド不要。Choiceの分岐先に便利 |
| **Fail** | 異常終了 | Error（エラー名）と Cause（原因説明）を指定可能 |

---

## 4. エラーハンドリング

### 4.1 エラーハンドリングの全体像

```
【エラー発生時の処理フロー】

  Task/Parallel/Map ステートでエラー発生
          │
          ▼
  ┌─── Retry 定義あり？ ───┐
  │ Yes                     │ No
  ▼                         ▼
  Retryポリシー評価    ┌─── Catch 定義あり？ ───┐
  │                    │ Yes                     │ No
  ├── 成功 → 次へ      ▼                         ▼
  │                 Catchルール評価          実行全体が失敗
  └── 全リトライ失敗    │
          │            ├── マッチ → Next先へ遷移
          ▼            │
    Catch 定義あり？    └── マッチなし → 実行失敗
    │ Yes    │ No
    ▼        ▼
  Catch評価  実行失敗

【重要】RetryとCatchの両方がある場合、先にRetryが評価される
```

### 4.2 組み込みエラー名

| エラー名 | 説明 | DOP重要度 |
|---------|------|----------|
| **States.ALL** | 全エラーのワイルドカード（※1） | ★★★★★ |
| **States.TaskFailed** | タスク失敗のワイルドカード（※2） | ★★★★★ |
| **States.Timeout** | タイムアウト | ★★★★★ |
| **States.HeartbeatTimeout** | ハートビートタイムアウト | ★★★★☆ |
| **States.Permissions** | 権限不足 | ★★★☆☆ |
| **States.DataLimitExceeded** | ペイロードサイズ超過（※3） | ★★★★☆ |
| **States.Runtime** | 実行時エラー（※4） | ★★★☆☆ |
| **States.ItemReaderFailed** | Mapの入力読取失敗 | ★★☆☆☆ |
| **States.ResultWriterFailed** | Mapの結果書込失敗 | ★★☆☆☆ |

> **※1**: `States.DataLimitExceeded` と `States.Runtime` はキャッチ**できない**
> **※2**: `States.Timeout` を除く全タスクエラーにマッチ
> **※3**: ペイロード上限は 256KB（Standard/Express共通）
> **※4**: InputPath/OutputPath のnullアクセス等。リトライ・キャッチ不可

### 4.3 Retry (リトライ)

```json
{
  "CallExternalAPI": {
    "Type": "Task",
    "Resource": "arn:aws:states:::lambda:invoke",
    "Parameters": {
      "FunctionName": "CallExternalAPI",
      "Payload.$": "$"
    },
    "Retry": [
      {
        "ErrorEquals": ["States.Timeout"],
        "IntervalSeconds": 5,
        "MaxAttempts": 2,
        "BackoffRate": 2.0,
        "MaxDelaySeconds": 30
      },
      {
        "ErrorEquals": ["Lambda.ServiceException", "Lambda.SdkClientException"],
        "IntervalSeconds": 2,
        "MaxAttempts": 6,
        "BackoffRate": 2.0,
        "JitterStrategy": "FULL"
      },
      {
        "ErrorEquals": ["States.ALL"],
        "IntervalSeconds": 1,
        "MaxAttempts": 3,
        "BackoffRate": 1.5
      }
    ],
    "Next": "SuccessStep"
  }
}
```

**Retry フィールド詳細**:

| フィールド | 必須 | デフォルト | 説明 |
|-----------|------|----------|------|
| **ErrorEquals** | 必須 | - | マッチするエラー名の配列 |
| **IntervalSeconds** | 任意 | 1 | 初回リトライまでの待機秒数 |
| **MaxAttempts** | 任意 | 3 | 最大リトライ回数（0=リトライなし） |
| **BackoffRate** | 任意 | 2.0 | 待機時間の増加倍率 |
| **MaxDelaySeconds** | 任意 | なし | 最大待機秒数の上限 |
| **JitterStrategy** | 任意 | NONE | ジッター戦略（"FULL" or "NONE"） |

```
【BackoffRate による待機時間の計算】

IntervalSeconds=3, BackoffRate=2.0, MaxAttempts=4 の場合:

  エラー発生 → [3秒待機] → リトライ1回目
             → [6秒待機] → リトライ2回目
             → [12秒待機] → リトライ3回目
             → [24秒待機] → リトライ4回目 → 全リトライ失敗

  計算式: 待機時間 = IntervalSeconds * (BackoffRate ^ リトライ回数)

【JitterStrategy="FULL" の場合】
  待機時間 = random(0, IntervalSeconds * BackoffRate^n)
  → 同時リトライによるサンダリングハード問題を回避
```

### 4.4 Catch (キャッチ) とフォールバック

```json
{
  "ProcessPayment": {
    "Type": "Task",
    "Resource": "arn:aws:states:::lambda:invoke",
    "Parameters": {
      "FunctionName": "ProcessPayment",
      "Payload.$": "$"
    },
    "Retry": [
      {
        "ErrorEquals": ["States.TaskFailed"],
        "IntervalSeconds": 3,
        "MaxAttempts": 2,
        "BackoffRate": 1.5
      }
    ],
    "Catch": [
      {
        "ErrorEquals": ["PaymentDeclinedException"],
        "ResultPath": "$.errorInfo",
        "Next": "NotifyCustomer"
      },
      {
        "ErrorEquals": ["States.Timeout"],
        "ResultPath": "$.errorInfo",
        "Next": "EscalateToSupport"
      },
      {
        "ErrorEquals": ["States.ALL"],
        "ResultPath": "$.errorInfo",
        "Next": "HandleUnexpectedError"
      }
    ],
    "Next": "ConfirmPayment"
  }
}
```

**Catch フィールド詳細**:

| フィールド | 必須 | 説明 |
|-----------|------|------|
| **ErrorEquals** | 必須 | マッチするエラー名の配列 |
| **Next** | 必須 | 遷移先のステート名 |
| **ResultPath** | 任意 | エラー出力の配置先。`$.errorInfo` のように指定すると入力を保持しつつエラー情報を追加 |

```
【Catch のエラー出力構造】

エラーキャッチ時に次のステートに渡されるオブジェクト:
{
  "Error": "PaymentDeclinedException",
  "Cause": "Card declined: insufficient funds"
}

ResultPath="$.errorInfo" の場合の遷移先への入力:
{
  "orderId": "12345",           // 元の入力を保持
  "amount": 5000,               // 元の入力を保持
  "errorInfo": {                // エラー情報が追加
    "Error": "PaymentDeclinedException",
    "Cause": "Card declined: insufficient funds"
  }
}
```

### 4.5 エラーハンドリングのベストプラクティス

```
【推奨パターン】

1. Lambda呼び出しでは必ずトランジェントエラーをリトライ:
   "ErrorEquals": ["Lambda.ServiceException",
                   "Lambda.SdkClientException",
                   "Lambda.TooManyRequestsException"]

2. States.ALL は常にリトライ/キャッチの最後に配置

3. Catch で ResultPath を指定して元の入力を保持

4. 重要な処理は TimeoutSeconds を設定してハング防止

5. HeartbeatSeconds でロングランタスクの生存確認

6. JitterStrategy="FULL" で同時リトライのスパイク防止
```

---

## 5. サービス統合パターン

### 5.1 3つの統合パターン

```
【サービス統合パターン比較】

(1) Request Response（デフォルト）
    Step Functions ──API呼出し──▶ サービス
         │◀── HTTPレスポンス ────┘
         │
         ▼ (即座に次のステートへ)

(2) Run a Job (.sync)
    Step Functions ──API呼出し──▶ サービス
         │                        │ (ジョブ実行中...)
         │    (Step Functions が   │
         │     完了をポーリング)    │
         │◀── ジョブ完了通知 ─────┘
         │
         ▼ (ジョブ完了後に次のステートへ)

(3) Wait for Callback (.waitForTaskToken)
    Step Functions ──Task Token送信──▶ サービス/外部プロセス
         │                              │
         │     (Step Functions 停止)      │ (人間の承認等)
         │                              │
         │◀── SendTaskSuccess/Failure ──┘
         │
         ▼ (コールバック受信後に次のステートへ)
```

### 5.2 Request Response

最もシンプルなパターン。API呼び出し後、HTTPレスポンスを受信したら即座に次のステートに遷移する。

```json
{
  "PublishToSNS": {
    "Type": "Task",
    "Resource": "arn:aws:states:::sns:publish",
    "Parameters": {
      "TopicArn": "arn:aws:sns:ap-northeast-1:123456789012:OrderNotification",
      "Message": {
        "orderId.$": "$.orderId",
        "status": "PROCESSING"
      }
    },
    "Next": "ContinueProcessing"
  }
}
```

**対応**: Standard Workflow + Express Workflow

### 5.3 Run a Job (.sync)

ジョブの完了を待ってから次のステートに遷移する。Resource ARN に `.sync` を付与する。

```json
{
  "RunBatchJob": {
    "Type": "Task",
    "Resource": "arn:aws:states:::batch:submitJob.sync",
    "Parameters": {
      "JobDefinition": "arn:aws:batch:ap-northeast-1:123456789012:job-definition/myJob",
      "JobName": "data-processing",
      "JobQueue": "arn:aws:batch:ap-northeast-1:123456789012:job-queue/highPriority"
    },
    "Next": "ProcessResults"
  }
}
```

```json
{
  "RunECSTask": {
    "Type": "Task",
    "Resource": "arn:aws:states:::ecs:runTask.sync",
    "Parameters": {
      "LaunchType": "FARGATE",
      "Cluster": "arn:aws:ecs:ap-northeast-1:123456789012:cluster/MyCluster",
      "TaskDefinition": "arn:aws:ecs:ap-northeast-1:123456789012:task-definition/MyTask:1",
      "NetworkConfiguration": {
        "AwsvpcConfiguration": {
          "Subnets": ["subnet-12345"],
          "AssignPublicIp": "ENABLED"
        }
      }
    },
    "Next": "CheckResults"
  }
}
```

**対応**: Standard Workflow のみ

**主要な .sync 対応サービス**:

| サービス | リソースURI |
|---------|-----------|
| **ECS/Fargate** | `arn:aws:states:::ecs:runTask.sync` |
| **AWS Batch** | `arn:aws:states:::batch:submitJob.sync` |
| **Glue** | `arn:aws:states:::glue:startJobRun.sync` |
| **SageMaker** | `arn:aws:states:::sagemaker:createTrainingJob.sync` |
| **CodeBuild** | `arn:aws:states:::codebuild:startBuild.sync` |
| **EMR** | `arn:aws:states:::elasticmapreduce:addStep.sync` |
| **Step Functions** | `arn:aws:states:::states:startExecution.sync:2` |
| **Athena** | `arn:aws:states:::athena:startQueryExecution.sync` |

### 5.4 Wait for Callback (.waitForTaskToken)

外部プロセスからのコールバックを待つ。人間の承認フローやサードパーティ連携に使用する。

```json
{
  "WaitForHumanApproval": {
    "Type": "Task",
    "Resource": "arn:aws:states:::sqs:sendMessage.waitForTaskToken",
    "Parameters": {
      "QueueUrl": "https://sqs.ap-northeast-1.amazonaws.com/123456789012/approval-queue",
      "MessageBody": {
        "taskToken.$": "$$.Task.Token",
        "orderId.$": "$.orderId",
        "amount.$": "$.amount",
        "message": "承認が必要です"
      }
    },
    "HeartbeatSeconds": 3600,
    "TimeoutSeconds": 86400,
    "Next": "ProcessApprovedOrder"
  }
}
```

```
【Callback パターンのフロー】

  Step Functions                    SQS                    承認者
       │                            │                       │
       │── SendMessage ────────────▶│                       │
       │   (TaskToken含む)           │                       │
       │                            │── メッセージ配信 ─────▶│
       │   (一時停止・待機)           │                       │
       │                            │                       │── 承認
       │                            │                       │
       │◀──────── SendTaskSuccess ──────────────────────────┘
       │          (TaskToken + 結果)
       ▼
    次のステートへ

  ※ タイムアウト前に SendTaskSuccess/SendTaskFailure を呼ぶ必要あり
  ※ HeartbeatSeconds を設定してプロセスの生存確認も可能
```

**コールバック完了API**:

```bash
# 成功時
aws stepfunctions send-task-success \
  --task-token "TASK_TOKEN_VALUE" \
  --task-output '{"approved": true, "approver": "admin@example.com"}'

# 失敗時
aws stepfunctions send-task-failure \
  --task-token "TASK_TOKEN_VALUE" \
  --error "ApprovalDenied" \
  --cause "Manager denied the request"

# ハートビート送信
aws stepfunctions send-task-heartbeat \
  --task-token "TASK_TOKEN_VALUE"
```

**対応**: Standard Workflow のみ

**主要な .waitForTaskToken 対応サービス**:

| サービス | リソースURI |
|---------|-----------|
| **Lambda** | `arn:aws:states:::lambda:invoke.waitForTaskToken` |
| **SQS** | `arn:aws:states:::sqs:sendMessage.waitForTaskToken` |
| **SNS** | `arn:aws:states:::sns:publish.waitForTaskToken` |
| **ECS/Fargate** | `arn:aws:states:::ecs:runTask.waitForTaskToken` |
| **EventBridge** | `arn:aws:states:::events:putEvents.waitForTaskToken` |
| **Step Functions** | `arn:aws:states:::states:startExecution.waitForTaskToken` |

### 5.5 統合パターンの選択フロー

```
【統合パターン選択チャート】

  タスクの完了を待つ必要がある？
  │
  ├── No → Request Response (デフォルト)
  │        例: SNS通知、DynamoDB書込み
  │
  └── Yes → 完了はAWSサービス内で判断できる？
            │
            ├── Yes → Run a Job (.sync)
            │         例: Batch, ECS, Glue, CodeBuild
            │
            └── No → Wait for Callback (.waitForTaskToken)
                     例: 人間の承認、外部API、レガシーシステム
```

---

## 6. サービス連携

### 6.1 Step Functions + Lambda

```
【Lambda統合アーキテクチャ】

  ┌──────────────────────────────────────────────┐
  │            Step Functions State Machine        │
  │                                                │
  │  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
  │  │ Validate │─▶│ Process  │─▶│ Notify   │   │
  │  │ (Lambda) │  │ (Lambda) │  │ (Lambda) │   │
  │  └──────────┘  └──────────┘  └──────────┘   │
  │       │              │             │          │
  └───────┼──────────────┼─────────────┼──────────┘
          ▼              ▼             ▼
    ┌──────────┐  ┌──────────┐  ┌──────────┐
    │ Lambda   │  │ Lambda   │  │ Lambda   │
    │ Function │  │ Function │  │ Function │
    │ Validate │  │ Process  │  │ Notify   │
    └──────────┘  └──────────┘  └──────────┘
```

**Lambda呼び出しの2パターン**:

```json
// パターン1: 最適化統合 (推奨)
{
  "InvokeLambda": {
    "Type": "Task",
    "Resource": "arn:aws:states:::lambda:invoke",
    "Parameters": {
      "FunctionName": "arn:aws:lambda:ap-northeast-1:123456789012:function:MyFunc",
      "Payload.$": "$"
    },
    "Next": "NextState"
  }
}

// パターン2: レガシー統合 (Lambda ARN直接指定)
{
  "InvokeLambdaLegacy": {
    "Type": "Task",
    "Resource": "arn:aws:lambda:ap-northeast-1:123456789012:function:MyFunc",
    "Next": "NextState"
  }
}
```

> **DOP試験ポイント**: レガシー統合ではLambda関数ARNを直接Resourceに指定する。最適化統合では `arn:aws:states:::lambda:invoke` を使い、Parameters で関数名とペイロードを渡す。最適化統合が推奨される。

### 6.2 Step Functions + EventBridge

```
【EventBridge連携パターン】

パターン1: EventBridgeからStep Functions起動
  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
  │ イベントソース │───▶│ EventBridge  │───▶│Step Functions│
  │ (S3, EC2等)   │    │    Rule      │    │  実行開始    │
  └──────────────┘    └──────────────┘    └──────────────┘

パターン2: Step FunctionsからEventBridgeへイベント送信
  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
  │Step Functions│───▶│ EventBridge  │───▶│  ターゲット   │
  │  Task State  │    │   PutEvents  │    │(Lambda, SQS等)│
  └──────────────┘    └──────────────┘    └──────────────┘

パターン3: Step Functions + EventBridge + Callback
  Step Functions ──PutEvents (TaskToken)──▶ EventBridge
       │                                       │
       │ (待機)                                  ▼
       │                                   Lambda等で処理
       │                                       │
       │◀──── SendTaskSuccess (TaskToken) ─────┘
```

**EventBridgeルールでStep Functions起動**:

```json
{
  "source": ["aws.s3"],
  "detail-type": ["Object Created"],
  "detail": {
    "bucket": { "name": ["my-data-bucket"] },
    "object": { "key": [{ "prefix": "input/" }] }
  }
}
```

**Step FunctionsからEventBridgeへイベント送信**:

```json
{
  "SendCustomEvent": {
    "Type": "Task",
    "Resource": "arn:aws:states:::events:putEvents",
    "Parameters": {
      "Entries": [
        {
          "Source": "custom.orderService",
          "DetailType": "OrderCompleted",
          "Detail": {
            "orderId.$": "$.orderId",
            "status": "COMPLETED"
          },
          "EventBusName": "default"
        }
      ]
    },
    "Next": "Done"
  }
}
```

### 6.3 Step Functions + ECS/Fargate

```
【ECS統合パターン】

  Step Functions ── ecs:runTask.sync ──▶ ECS Cluster
       │                                    │
       │     (.sync でタスク完了を待機)       │
       │                                    ▼
       │                              ┌──────────┐
       │                              │ Fargate  │
       │                              │  Task    │
       │                              └────┬─────┘
       │                                   │
       │◀── タスク完了（成功/失敗）──────────┘
       │
       ▼
    次のステートへ
```

```json
{
  "RunDataProcessing": {
    "Type": "Task",
    "Resource": "arn:aws:states:::ecs:runTask.sync",
    "Parameters": {
      "LaunchType": "FARGATE",
      "Cluster": "arn:aws:ecs:ap-northeast-1:123456789012:cluster/ProcessingCluster",
      "TaskDefinition": "arn:aws:ecs:ap-northeast-1:123456789012:task-definition/DataProcessor:3",
      "NetworkConfiguration": {
        "AwsvpcConfiguration": {
          "Subnets": ["subnet-aaa", "subnet-bbb"],
          "SecurityGroups": ["sg-12345"],
          "AssignPublicIp": "DISABLED"
        }
      },
      "Overrides": {
        "ContainerOverrides": [
          {
            "Name": "data-processor",
            "Environment": [
              {
                "Name": "INPUT_BUCKET",
                "Value.$": "$.inputBucket"
              },
              {
                "Name": "OUTPUT_BUCKET",
                "Value.$": "$.outputBucket"
              }
            ]
          }
        ]
      }
    },
    "Retry": [
      {
        "ErrorEquals": ["States.TaskFailed"],
        "IntervalSeconds": 30,
        "MaxAttempts": 2,
        "BackoffRate": 2.0
      }
    ],
    "Next": "VerifyOutput"
  }
}
```

### 6.4 Step Functions + その他のサービス連携

| 連携サービス | 主なユースケース | 統合パターン |
|-------------|----------------|-------------|
| **DynamoDB** | 状態管理、データ読み書き | Request Response |
| **SQS** | メッセージキューイング、承認フロー | Request Response, Callback |
| **SNS** | 通知、ファンアウト | Request Response, Callback |
| **Glue** | ETLジョブ | Run a Job (.sync) |
| **CodeBuild** | ビルド実行 | Run a Job (.sync) |
| **Batch** | バッチ処理 | Run a Job (.sync) |
| **SageMaker** | ML学習/推論 | Run a Job (.sync) |
| **API Gateway** | REST API呼び出し | Request Response |
| **Bedrock** | 生成AI呼び出し | Request Response, Run a Job (.sync) |

---

## 7. 入出力処理

### 7.1 入出力処理の流れ

```
【ステートの入出力処理パイプライン (JSONPath)】

  ステートへの入力
       │
       ▼
  ┌─────────────┐
  │  InputPath   │  入力のフィルタリング（不要部分の除外）
  └──────┬──────┘
         │
         ▼
  ┌─────────────┐
  │  Parameters  │  タスクAPIへのパラメータ構築
  └──────┬──────┘
         │
         ▼
    [タスク実行]
         │
         ▼
  ┌─────────────────┐
  │ ResultSelector   │  タスク結果の選択・整形
  └───────┬─────────┘
          │
          ▼
  ┌─────────────┐
  │  ResultPath  │  結果を入力のどこに配置するか
  └──────┬──────┘
         │
         ▼
  ┌─────────────┐
  │  OutputPath  │  出力のフィルタリング
  └──────┬──────┘
         │
         ▼
  次のステートへの出力
```

### 7.2 各フィルターの動作例

```json
// 入力データ
{
  "orderId": "ORD-001",
  "customer": {
    "name": "田中太郎",
    "email": "tanaka@example.com"
  },
  "items": [
    {"product": "Widget", "price": 1000},
    {"product": "Gadget", "price": 2000}
  ],
  "metadata": {"source": "web", "timestamp": "2026-01-01"}
}
```

```json
{
  "ProcessOrder": {
    "Type": "Task",
    "InputPath": "$.customer",
    "Resource": "arn:aws:states:::lambda:invoke",
    "Parameters": {
      "FunctionName": "NotifyCustomer",
      "Payload": {
        "customerName.$": "$.name",
        "customerEmail.$": "$.email"
      }
    },
    "ResultSelector": {
      "notificationId.$": "$.Payload.id",
      "status.$": "$.Payload.status"
    },
    "ResultPath": "$.notification",
    "OutputPath": "$",
    "Next": "Done"
  }
}
```

### 7.3 Context オブジェクト

ステートマシンの実行コンテキスト情報にアクセスできる。`$$` プレフィックスで参照する。

```json
{
  "LogExecution": {
    "Type": "Pass",
    "Parameters": {
      "executionId.$": "$$.Execution.Id",
      "executionName.$": "$$.Execution.Name",
      "stateMachineName.$": "$$.StateMachine.Name",
      "stateName.$": "$$.State.Name",
      "taskToken.$": "$$.Task.Token",
      "startTime.$": "$$.Execution.StartTime"
    },
    "Next": "Process"
  }
}
```

| Context フィールド | 説明 |
|-------------------|------|
| `$$.Execution.Id` | 実行ARN |
| `$$.Execution.Name` | 実行名 |
| `$$.Execution.StartTime` | 実行開始時刻 |
| `$$.StateMachine.Id` | ステートマシンARN |
| `$$.StateMachine.Name` | ステートマシン名 |
| `$$.State.Name` | 現在のステート名 |
| `$$.State.EnteredTime` | ステート開始時刻 |
| `$$.Task.Token` | タスクトークン (Callback用) |
| `$$.Map.Item.Index` | Mapの現在インデックス |
| `$$.Map.Item.Value` | Mapの現在の値 |

---

## 8. ハンズオン演習

### 8.1 演習1: ステートマシンの作成と実行

```bash
# 1. IAMロールの作成
aws iam create-role \
  --role-name StepFunctionsHandsOnRole \
  --assume-role-policy-document '{
    "Version": "2012-10-17",
    "Statement": [
      {
        "Effect": "Allow",
        "Principal": {
          "Service": "states.amazonaws.com"
        },
        "Action": "sts:AssumeRole"
      }
    ]
  }'

# 2. 基本ポリシーのアタッチ
aws iam attach-role-policy \
  --role-name StepFunctionsHandsOnRole \
  --policy-arn arn:aws:iam::aws:policy/CloudWatchLogsFullAccess

# 3. ロールARN取得
ROLE_ARN=$(aws iam get-role \
  --role-name StepFunctionsHandsOnRole \
  --query 'Role.Arn' --output text)
echo "Role ARN: ${ROLE_ARN}"
```

### 8.2 演習2: シンプルなステートマシンの作成

```bash
# 1. ASL定義ファイル作成
cat > /tmp/simple-workflow.asl.json << 'EOF'
{
  "Comment": "シンプルなPass/Waitステートマシン",
  "StartAt": "SetInitialValues",
  "States": {
    "SetInitialValues": {
      "Type": "Pass",
      "Result": {
        "status": "PROCESSING",
        "timestamp": "2026-02-04T00:00:00Z"
      },
      "ResultPath": "$.processInfo",
      "Next": "WaitForProcessing"
    },
    "WaitForProcessing": {
      "Type": "Wait",
      "Seconds": 5,
      "Next": "CheckStatus"
    },
    "CheckStatus": {
      "Type": "Choice",
      "Choices": [
        {
          "Variable": "$.processInfo.status",
          "StringEquals": "PROCESSING",
          "Next": "MarkComplete"
        }
      ],
      "Default": "ProcessFailed"
    },
    "MarkComplete": {
      "Type": "Pass",
      "Result": "COMPLETED",
      "ResultPath": "$.processInfo.status",
      "Next": "SuccessState"
    },
    "ProcessFailed": {
      "Type": "Fail",
      "Error": "ProcessingError",
      "Cause": "Unexpected status value"
    },
    "SuccessState": {
      "Type": "Succeed"
    }
  }
}
EOF

# 2. ステートマシン作成
ROLE_ARN=$(aws iam get-role \
  --role-name StepFunctionsHandsOnRole \
  --query 'Role.Arn' --output text)

STATE_MACHINE_ARN=$(aws stepfunctions create-state-machine \
  --name "HandsOn-SimpleWorkflow" \
  --definition file:///tmp/simple-workflow.asl.json \
  --role-arn ${ROLE_ARN} \
  --type STANDARD \
  --query 'stateMachineArn' --output text)

echo "State Machine ARN: ${STATE_MACHINE_ARN}"

# 3. 実行開始
EXECUTION_ARN=$(aws stepfunctions start-execution \
  --state-machine-arn ${STATE_MACHINE_ARN} \
  --name "test-execution-$(date +%s)" \
  --input '{"orderId": "ORD-001", "amount": 5000}' \
  --query 'executionArn' --output text)

echo "Execution ARN: ${EXECUTION_ARN}"

# 4. 実行結果確認
sleep 10
aws stepfunctions describe-execution \
  --execution-arn ${EXECUTION_ARN} \
  --query '{Status: status, Input: input, Output: output}'
```

**期待される出力**:
```json
{
    "Status": "SUCCEEDED",
    "Input": "{\"orderId\": \"ORD-001\", \"amount\": 5000}",
    "Output": "{\"orderId\":\"ORD-001\",\"amount\":5000,\"processInfo\":{\"status\":\"COMPLETED\",\"timestamp\":\"2026-02-04T00:00:00Z\"}}"
}
```

### 8.3 演習3: エラーハンドリング付きワークフロー

```bash
# 1. エラーハンドリング付きASL定義
cat > /tmp/error-handling-workflow.asl.json << 'EOF'
{
  "Comment": "エラーハンドリングのデモ",
  "StartAt": "ProcessData",
  "States": {
    "ProcessData": {
      "Type": "Pass",
      "Result": {
        "data": "sample",
        "shouldFail": true
      },
      "Next": "CheckForError"
    },
    "CheckForError": {
      "Type": "Choice",
      "Choices": [
        {
          "Variable": "$.shouldFail",
          "BooleanEquals": true,
          "Next": "SimulateError"
        }
      ],
      "Default": "ProcessSuccess"
    },
    "SimulateError": {
      "Type": "Fail",
      "Error": "SimulatedError",
      "Cause": "This is a simulated error for testing"
    },
    "ProcessSuccess": {
      "Type": "Succeed"
    }
  }
}
EOF

# 2. ステートマシン作成
ERROR_SM_ARN=$(aws stepfunctions create-state-machine \
  --name "HandsOn-ErrorHandling" \
  --definition file:///tmp/error-handling-workflow.asl.json \
  --role-arn ${ROLE_ARN} \
  --type STANDARD \
  --query 'stateMachineArn' --output text)

# 3. 実行
ERROR_EXEC_ARN=$(aws stepfunctions start-execution \
  --state-machine-arn ${ERROR_SM_ARN} \
  --name "error-test-$(date +%s)" \
  --input '{}' \
  --query 'executionArn' --output text)

# 4. 実行履歴確認
sleep 5
aws stepfunctions get-execution-history \
  --execution-arn ${ERROR_EXEC_ARN} \
  --query 'events[?type==`ExecutionFailed`]'
```

### 8.4 演習4: Parallelステートの実行

```bash
# 1. Parallel ワークフロー定義
cat > /tmp/parallel-workflow.asl.json << 'EOF'
{
  "Comment": "並列処理デモ",
  "StartAt": "ParallelProcessing",
  "States": {
    "ParallelProcessing": {
      "Type": "Parallel",
      "Branches": [
        {
          "StartAt": "Branch1-SetData",
          "States": {
            "Branch1-SetData": {
              "Type": "Pass",
              "Result": {"branch": "1", "result": "Image processing done"},
              "End": true
            }
          }
        },
        {
          "StartAt": "Branch2-SetData",
          "States": {
            "Branch2-SetData": {
              "Type": "Pass",
              "Result": {"branch": "2", "result": "Metadata extraction done"},
              "End": true
            }
          }
        },
        {
          "StartAt": "Branch3-Wait",
          "States": {
            "Branch3-Wait": {
              "Type": "Wait",
              "Seconds": 3,
              "Next": "Branch3-SetData"
            },
            "Branch3-SetData": {
              "Type": "Pass",
              "Result": {"branch": "3", "result": "Validation complete"},
              "End": true
            }
          }
        }
      ],
      "ResultPath": "$.parallelOutput",
      "Next": "MergeResults"
    },
    "MergeResults": {
      "Type": "Pass",
      "Parameters": {
        "originalInput.$": "$.orderId",
        "results.$": "$.parallelOutput"
      },
      "End": true
    }
  }
}
EOF

# 2. 作成と実行
PARALLEL_SM_ARN=$(aws stepfunctions create-state-machine \
  --name "HandsOn-Parallel" \
  --definition file:///tmp/parallel-workflow.asl.json \
  --role-arn ${ROLE_ARN} \
  --type STANDARD \
  --query 'stateMachineArn' --output text)

PARALLEL_EXEC_ARN=$(aws stepfunctions start-execution \
  --state-machine-arn ${PARALLEL_SM_ARN} \
  --name "parallel-test-$(date +%s)" \
  --input '{"orderId": "ORD-002"}' \
  --query 'executionArn' --output text)

# 3. 結果確認
sleep 10
aws stepfunctions describe-execution \
  --execution-arn ${PARALLEL_EXEC_ARN} \
  --query '{Status: status, Output: output}'
```

### 8.5 演習5: ステートマシンの管理操作

```bash
# ステートマシン一覧取得
aws stepfunctions list-state-machines \
  --query 'stateMachines[?contains(name, `HandsOn`)].[name, stateMachineArn, type]' \
  --output table

# ステートマシン定義取得
aws stepfunctions describe-state-machine \
  --state-machine-arn ${STATE_MACHINE_ARN} \
  --query '{Name: name, Type: type, CreationDate: creationDate}'

# 実行一覧取得
aws stepfunctions list-executions \
  --state-machine-arn ${STATE_MACHINE_ARN} \
  --query 'executions[].[name, status, startDate]' \
  --output table

# 実行履歴取得（イベント詳細）
aws stepfunctions get-execution-history \
  --execution-arn ${EXECUTION_ARN} \
  --query 'events[].[id, type, timestamp]' \
  --output table

# ステートマシン更新
aws stepfunctions update-state-machine \
  --state-machine-arn ${STATE_MACHINE_ARN} \
  --definition file:///tmp/simple-workflow.asl.json

# ロギング設定（CloudWatch Logs）
LOG_GROUP_ARN=$(aws logs create-log-group \
  --log-group-name "/aws/stepfunctions/HandsOn-SimpleWorkflow" 2>/dev/null; \
  aws logs describe-log-groups \
  --log-group-name-prefix "/aws/stepfunctions/HandsOn-SimpleWorkflow" \
  --query 'logGroups[0].arn' --output text)

aws stepfunctions update-state-machine \
  --state-machine-arn ${STATE_MACHINE_ARN} \
  --logging-configuration '{
    "level": "ALL",
    "includeExecutionData": true,
    "destinations": [
      {
        "cloudWatchLogsLogGroup": {
          "logGroupArn": "'${LOG_GROUP_ARN}'"
        }
      }
    ]
  }'

# X-Ray トレーシング有効化
aws stepfunctions update-state-machine \
  --state-machine-arn ${STATE_MACHINE_ARN} \
  --tracing-configuration enabled=true
```

### 8.6 演習6: Express ワークフロー

```bash
# 1. Express ワークフロー作成
cat > /tmp/express-workflow.asl.json << 'EOF'
{
  "Comment": "Express Workflow デモ - 高速データ変換",
  "StartAt": "TransformInput",
  "States": {
    "TransformInput": {
      "Type": "Pass",
      "Parameters": {
        "transformedData": {
          "id.$": "$.eventId",
          "processedAt.$": "$$.Execution.StartTime",
          "source": "express-workflow"
        }
      },
      "Next": "ValidateData"
    },
    "ValidateData": {
      "Type": "Choice",
      "Choices": [
        {
          "Variable": "$.transformedData.id",
          "IsPresent": true,
          "Next": "DataValid"
        }
      ],
      "Default": "DataInvalid"
    },
    "DataValid": {
      "Type": "Succeed"
    },
    "DataInvalid": {
      "Type": "Fail",
      "Error": "ValidationError",
      "Cause": "Missing required field: eventId"
    }
  }
}
EOF

# 2. ログ用のCloudWatch Logsグループ作成（Express Workflow では必須推奨）
aws logs create-log-group \
  --log-group-name "/aws/stepfunctions/HandsOn-Express" 2>/dev/null

EXPRESS_LOG_ARN=$(aws logs describe-log-groups \
  --log-group-name-prefix "/aws/stepfunctions/HandsOn-Express" \
  --query 'logGroups[0].arn' --output text)

# 3. Express ステートマシン作成
EXPRESS_SM_ARN=$(aws stepfunctions create-state-machine \
  --name "HandsOn-Express" \
  --definition file:///tmp/express-workflow.asl.json \
  --role-arn ${ROLE_ARN} \
  --type EXPRESS \
  --logging-configuration '{
    "level": "ALL",
    "includeExecutionData": true,
    "destinations": [
      {
        "cloudWatchLogsLogGroup": {
          "logGroupArn": "'${EXPRESS_LOG_ARN}'"
        }
      }
    ]
  }' \
  --query 'stateMachineArn' --output text)

echo "Express State Machine ARN: ${EXPRESS_SM_ARN}"

# 4. 同期実行 (StartSyncExecution)
aws stepfunctions start-sync-execution \
  --state-machine-arn ${EXPRESS_SM_ARN} \
  --name "express-sync-$(date +%s)" \
  --input '{"eventId": "EVT-001", "data": "test"}'

# 5. 非同期実行 (StartExecution)
aws stepfunctions start-execution \
  --state-machine-arn ${EXPRESS_SM_ARN} \
  --input '{"eventId": "EVT-002", "data": "async-test"}'

# 注意: 非同期Express実行の結果はCloudWatch Logsで確認
```

### 8.7 演習7: クリーンアップ

```bash
# ステートマシン削除
for SM_NAME in HandsOn-SimpleWorkflow HandsOn-ErrorHandling HandsOn-Parallel HandsOn-Express; do
  SM_ARN=$(aws stepfunctions list-state-machines \
    --query "stateMachines[?name=='${SM_NAME}'].stateMachineArn" \
    --output text)
  if [ -n "${SM_ARN}" ] && [ "${SM_ARN}" != "None" ]; then
    echo "Deleting: ${SM_NAME}"
    aws stepfunctions delete-state-machine --state-machine-arn ${SM_ARN}
  fi
done

# ロググループ削除
aws logs delete-log-group --log-group-name "/aws/stepfunctions/HandsOn-SimpleWorkflow" 2>/dev/null
aws logs delete-log-group --log-group-name "/aws/stepfunctions/HandsOn-Express" 2>/dev/null

# IAMロール削除
aws iam detach-role-policy \
  --role-name StepFunctionsHandsOnRole \
  --policy-arn arn:aws:iam::aws:policy/CloudWatchLogsFullAccess

aws iam delete-role --role-name StepFunctionsHandsOnRole

echo "クリーンアップ完了"
```

---

## 9. DOP試験対策チェックリスト

### ワークフロータイプの選択

- [ ] Standard と Express の違い（最大実行時間、セマンティクス、課金）を説明できる
- [ ] ワークフロータイプが作成後に変更不可であることを知っている
- [ ] Expressの同期/非同期の違いと呼び出し元の制約を理解している

<details>
<summary>模範解答を見る</summary>

**Standard vs Express**:
- Standard: 最大1年、Exactly-once、状態遷移数課金、全統合パターン対応
- Express: 最大5分、At-least-once(非同期)/At-most-once(同期)、実行数+時間+メモリ課金
- ワークフロータイプは**作成後に変更不可**。変更する場合は新しいステートマシンを作成

**Express同期/非同期**:
- 非同期 (StartExecution): 即座に戻る。結果はCloudWatch Logsで確認
- 同期 (StartSyncExecution): 完了まで待機。API Gateway, Lambda, CLIから呼び出し可能
- コンソールからの同期実行は60秒でタイムアウト（CLI/SDKなら5分）

**選択基準**:
- 非冪等な処理（決済等） → Standard (Exactly-once)
- 高頻度イベント処理、冪等な処理 → Express
- .sync / .waitForTaskToken が必要 → Standard
</details>

### ASLとステートタイプ

- [ ] 8つのステートタイプの名前と用途を全て挙げられる
- [ ] Choice ステートの比較演算子と論理演算子を理解している
- [ ] Parallel ステートの出力形式（配列）を知っている
- [ ] Inline Map と Distributed Map の違いを説明できる

<details>
<summary>模範解答を見る</summary>

**8つのステートタイプ**:
1. **Task**: AWSサービスやActivityの実行
2. **Choice**: 条件分岐（Nextフィールドではなく、Choicesで遷移先を決定）
3. **Wait**: 固定/動的な待機
4. **Parallel**: 複数ブランチの並列実行
5. **Map**: 配列要素の反復処理
6. **Pass**: データの受け渡し/変換（デバッグにも有用）
7. **Succeed**: 正常終了
8. **Fail**: 異常終了（Error, Cause を指定可能）

**Parallel出力**: 各ブランチの結果が**配列**として出力される。Branch 0が[0]、Branch 1が[1]

**Inline Map vs Distributed Map**:
- Inline Map: 最大並行40、ステート入力のJSON配列を処理、Standard/Express両対応
- Distributed Map: 最大並行10,000、S3からの入力可、結果をS3に出力、Standard のみ
</details>

### エラーハンドリング

- [ ] Retry と Catch の評価順序を理解している
- [ ] States.ALL と States.TaskFailed の違いを説明できる
- [ ] States.DataLimitExceeded と States.Runtime が States.ALL でキャッチできないことを知っている
- [ ] BackoffRate と JitterStrategy の計算方法を理解している
- [ ] Lambda呼び出しで推奨されるリトライエラー名を知っている

<details>
<summary>模範解答を見る</summary>

**Retry/Catch評価順序**:
1. まず Retry 配列を上から順に評価
2. 全リトライが失敗した場合に Catch 配列を上から順に評価
3. Catchもマッチしなければ実行全体が失敗

**States.ALL vs States.TaskFailed**:
- States.ALL: 全エラーのワイルドカード。ただし States.DataLimitExceeded と States.Runtime は**キャッチ不可**
- States.TaskFailed: States.Timeout を**除く**全タスクエラーにマッチ
- 両方とも配列の**最後**に配置する必要がある

**キャッチ不可エラー**:
- States.DataLimitExceeded: ペイロード256KB超過（ターミナルエラー）
- States.Runtime: InputPath/OutputPathのnullアクセス等の実行時エラー

**BackoffRate計算**:
- 待機時間 = IntervalSeconds x (BackoffRate ^ リトライ回数)
- JitterStrategy="FULL": 待機時間 = random(0, 計算値)

**Lambda推奨リトライ**:
```json
"ErrorEquals": [
  "Lambda.ServiceException",
  "Lambda.SdkClientException",
  "Lambda.TooManyRequestsException"
]
```
</details>

### サービス統合パターン

- [ ] 3つの統合パターン（Request Response, .sync, .waitForTaskToken）の違いを説明できる
- [ ] Express Workflow で使用できない統合パターンを知っている
- [ ] .waitForTaskToken でのTask Token の渡し方（Context Object）を知っている
- [ ] SendTaskSuccess / SendTaskFailure / SendTaskHeartbeat APIの用途を説明できる

<details>
<summary>模範解答を見る</summary>

**3つの統合パターン**:
1. **Request Response**: APIを呼んでHTTPレスポンスを受け取ったら即座に次へ
2. **Run a Job (.sync)**: ジョブ完了までポーリングして待機（EventBridge + ポーリング）
3. **Wait for Callback (.waitForTaskToken)**: 外部からのコールバックを待機（最大1年）

**Express Workflowの制限**:
- Express は **Request Response のみ**サポート
- .sync と .waitForTaskToken は **Standard のみ**

**Task Token の受け渡し**:
- Context Object `$$.Task.Token` で取得
- SQS/SNS/Lambda等のパラメータに含めて送信
- 例: `"taskToken.$": "$$.Task.Token"`

**コールバックAPI**:
- `SendTaskSuccess`: タスク成功。task-token と task-output を指定
- `SendTaskFailure`: タスク失敗。task-token, error, cause を指定
- `SendTaskHeartbeat`: 生存確認。HeartbeatSeconds以内に送信しないとタイムアウト
</details>

### サービス連携

- [ ] EventBridgeルールでStep Functions実行を起動する方法を知っている
- [ ] Lambda統合の最適化パターン（arn:aws:states:::lambda:invoke）を理解している
- [ ] ECS統合で.syncを使いタスク完了を待機するパターンを実装できる
- [ ] Step Functionsのネスト実行（子ワークフロー呼出し）パターンを知っている

<details>
<summary>模範解答を見る</summary>

**EventBridge連携**:
- EventBridgeルールのターゲットにStep Functionsを指定して自動起動
- Step FunctionsからEventBridgeへ `events:putEvents` でイベント送信も可能
- .waitForTaskToken と組み合わせたコールバックパターンも可能

**Lambda統合**:
- 最適化統合: `Resource: "arn:aws:states:::lambda:invoke"` + Parameters
- レガシー統合: `Resource: "arn:aws:lambda:REGION:ACCOUNT:function:NAME"` (直接ARN)
- 最適化統合が推奨。バージョン/エイリアスの指定、非同期呼出しにも対応

**ECS .sync統合**:
- `arn:aws:states:::ecs:runTask.sync` でタスク完了まで待機
- NetworkConfiguration, Overrides (環境変数のオーバーライド) が重要パラメータ
- タスクが失敗してもStep Functions側でRetry/Catchで処理可能

**ネスト実行**:
- `arn:aws:states:::states:startExecution.sync:2` で子ワークフロー完了を待機
- 親: Standard, 子: Standard or Express のパターンが可能
- Express内でStandard→Expressの階層化によるコスト最適化
</details>

### 運用・監視

- [ ] CloudWatch Logsへのログ出力設定方法を知っている
- [ ] X-Rayトレーシングの有効化方法を知っている
- [ ] ペイロードサイズ上限（256KB）を超える場合の対処法を知っている
- [ ] 実行がスタック（ハング）した場合の対処法を知っている

<details>
<summary>模範解答を見る</summary>

**CloudWatch Logs設定**:
- Standard: 任意（デバッグ時に有用）
- Express: 実行履歴確認に**必須**（APIで直接取得できないため）
- ログレベル: ALL, ERROR, FATAL, OFF
- `includeExecutionData: true` で入出力データも記録

**X-Ray トレーシング**:
```bash
aws stepfunctions update-state-machine \
  --state-machine-arn $ARN \
  --tracing-configuration enabled=true
```
- サービスマップでボトルネック特定
- Lambda等の下流サービスもアクティブトレーシングを有効化推奨

**ペイロードサイズ超過対策**:
- S3に大きなデータを保存し、ARN/キーのみをペイロードで受け渡し
- ResultSelectorで不要なデータを除外
- Distributed Mapを使用してS3入出力

**ハング対策**:
- Task に TimeoutSeconds を**必ず**設定
- HeartbeatSeconds でロングランタスクを監視
- EventBridgeでTIMED_OUTイベントを検知して通知/リカバリ
- StopExecution APIで強制停止も可能
</details>

### DOP頻出シナリオ

- [ ] 人間の承認フローの実装方法を説明できる
- [ ] Standard/Express の使い分けシナリオを判断できる
- [ ] CI/CDパイプラインにStep Functionsを組み込むパターンを知っている
- [ ] マルチアカウント環境でのStep Functions実行パターンを理解している

<details>
<summary>模範解答を見る</summary>

**人間の承認フロー**:
1. `.waitForTaskToken` でSQS/SNSにTask Tokenを含むメッセージ送信
2. 承認者がメッセージを受信し、承認/却下を判断
3. `SendTaskSuccess` (承認) or `SendTaskFailure` (却下) を呼び出し
4. TimeoutSecondsで承認期限を設定（超過時は自動失敗）

**Standard/Express使い分けシナリオ**:
- オーダー処理、決済 → Standard（Exactly-once、非冪等）
- IoTデータ加工、ストリーム処理 → Express（高頻度、冪等）
- マイクロサービスAPI → Express同期（API Gateway経由）
- ETLパイプライン → Standard（.syncでGlue/Batch完了待ち）

**CI/CDパイプライン連携**:
- CodePipelineのアクションとしてStep Functions実行を起動
- Step Functions内でCodeBuild (.sync)、ECS (.sync) を順次/並列実行
- EventBridgeでStep Functions完了イベントを検知して次のパイプラインステップへ

**マルチアカウント**:
- Task ステートの `Credentials` フィールドでクロスアカウントIAMロールを指定
- `.sync` のクロスアカウント呼出しではポーリングのみ（EventBridge連携なし）
</details>

---

**作成日**: 2026-02-04
**最終更新**: 2026-02-04
**検証環境**: AWS ap-northeast-1 リージョン
