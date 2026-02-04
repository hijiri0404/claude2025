# AWS Lambda ハンズオンガイド

> **対象**: AWS DevOps Professional (DOP-C02) 試験対策
> **前提知識**: AWS基礎、Python/Node.js基礎、サーバーレス基本概念
> **所要時間**: 約3-4時間

---

## 目次

1. [Lambda概要](#1-lambda概要)
2. [バージョンとエイリアス](#2-バージョンとエイリアス)
3. [デプロイ戦略](#3-デプロイ戦略)
4. [同時実行制御](#4-同時実行制御)
5. [Lambda Layers](#5-lambda-layers)
6. [Lambda Destinations と DLQ](#6-lambda-destinations-と-dlq)
7. [Lambda@Edge と CloudFront Functions](#7-lambdaedge-と-cloudfront-functions)
8. [Lambda コンテナイメージサポート](#8-lambda-コンテナイメージサポート)
9. [環境変数とシークレット管理](#9-環境変数とシークレット管理)
10. [ハンズオン演習](#10-ハンズオン演習)
11. [DOP試験対策チェックリスト](#11-dop試験対策チェックリスト)

---

## 1. Lambda概要

### 1.1 Lambdaとは

```
┌─────────────────────────────────────────────────────────────────────┐
│                        AWS Lambda                                     │
│                   サーバーレスコンピューティング                       │
│                                                                       │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │                     イベント駆動実行                            │  │
│  │                                                                │  │
│  │  Event Source ──▶ Lambda Function ──▶ Output / Side Effect     │  │
│  │                                                                │  │
│  │  ・API Gateway       ┌──────────────┐   ・DynamoDB書込         │  │
│  │  ・S3イベント        │  関数コード    │   ・S3出力              │  │
│  │  ・DynamoDB Stream   │  + 設定       │   ・SNS/SQS通知         │  │
│  │  ・SQS / SNS         │  + IAMロール  │   ・Step Functions      │  │
│  │  ・EventBridge       └──────────────┘   ・レスポンス返却       │  │
│  │  ・CloudWatch Events                                           │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │                     主要コンポーネント                          │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐        │  │
│  │  │ Version  │ │  Alias   │ │  Layer   │ │Concurren-│        │  │
│  │  │ (不変)   │ │ (ポインタ)│ │ (共有)   │ │cy (制御) │        │  │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘        │  │
│  └────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.2 Lambda実行モデル

```
【Lambda実行ライフサイクル】

  初回呼出し (Cold Start)             再利用 (Warm Start)
  ─────────────────────               ────────────────────
  ┌────────────────────┐              ┌────────────────────┐
  │ 1. 実行環境の作成   │              │ (スキップ)         │
  │   ・コンテナ起動    │              │                    │
  │   ・ランタイム初期化│              │                    │
  └────────┬───────────┘              │                    │
           ▼                          │                    │
  ┌────────────────────┐              │                    │
  │ 2. INIT フェーズ    │              │                    │
  │   ・SDK初期化       │              │ (スキップ)         │
  │   ・DB接続          │              │                    │
  │   ・グローバル変数   │              │                    │
  └────────┬───────────┘              └────────┬───────────┘
           ▼                                   ▼
  ┌────────────────────┐              ┌────────────────────┐
  │ 3. INVOKE フェーズ  │              │ 3. INVOKE フェーズ  │
  │   ・ハンドラ実行    │              │   ・ハンドラ実行    │
  │   ・イベント処理    │              │   ・イベント処理    │
  └────────┬───────────┘              └────────┬───────────┘
           ▼                                   ▼
  ┌────────────────────┐              ┌────────────────────┐
  │ 4. SHUTDOWN         │              │ (保持)             │
  │   ・一定時間後      │              │   ・再利用待ち      │
  └────────────────────┘              └────────────────────┘
```

### 1.3 Lambda制限値（重要）

| 項目 | 制限値 | 備考 |
|------|--------|------|
| **メモリ** | 128 MB - 10,240 MB | 1MB単位で設定 |
| **タイムアウト** | 最大15分 (900秒) | デフォルト3秒 |
| **デプロイパッケージ (zip)** | 50 MB (圧縮) / 250 MB (展開) | |
| **コンテナイメージ** | 最大10 GB | ECR経由 |
| **一時ストレージ (/tmp)** | 512 MB - 10,240 MB | |
| **環境変数** | 合計4 KB | |
| **同時実行数** | リージョンあたり1,000 (デフォルト) | 引上げ可能 |
| **レイヤー** | 最大5レイヤー | 合計250 MB |
| **関数URL** | 1関数に1URL | IAM認証 or NONE |

### 1.4 DOP試験での重要度

| トピック | 重要度 | 出題パターン |
|---------|--------|-------------|
| **バージョン/エイリアス** | ★★★★★ | デプロイ戦略、トラフィック制御 |
| **CodeDeploy連携** | ★★★★★ | カナリア/リニアデプロイ |
| **同時実行制御** | ★★★★★ | Reserved/Provisioned Concurrency |
| **Destinations / DLQ** | ★★★★☆ | 非同期呼出しのエラーハンドリング |
| **Lambda@Edge** | ★★★★☆ | CloudFront連携パターン |
| **環境変数 / シークレット** | ★★★★☆ | KMS, SSM, Secrets Manager連携 |
| **レイヤー** | ★★★☆☆ | 共有ライブラリ管理 |
| **コンテナイメージ** | ★★★☆☆ | 大規模デプロイ |

---

## 2. バージョンとエイリアス

### 2.1 バージョンの概念

```
【Lambdaバージョン管理】

  $LATEST (可変) ──── 常に最新のコード・設定を指す
      │
      │  publish-version
      ▼
  Version 1 (不変) ── コード + 設定のスナップショット
      │
      │  publish-version
      ▼
  Version 2 (不変) ── コード + 設定のスナップショット
      │
      │  publish-version
      ▼
  Version 3 (不変) ── コード + 設定のスナップショット

  ※ バージョンは一度発行すると変更不可（イミュータブル）
  ※ $LATEST のみ更新可能
```

### 2.2 エイリアスの概念

```
【エイリアスとバージョンの関係】

  エイリアス              バージョン
  ──────────              ──────────
  ┌──────────┐
  │  prod     │ ─────────────────────────────▶ Version 3
  └──────────┘
  ┌──────────┐
  │  staging  │ ─────────────────▶ Version 2
  └──────────┘
  ┌──────────┐
  │  dev      │ ─────▶ $LATEST
  └──────────┘

  【加重エイリアス（トラフィック分割）】

  ┌──────────┐     ┌──────────────────────────────┐
  │  prod     │────▶│  Version 3: 90% (メイン)      │
  │           │     │  Version 4: 10% (カナリア)     │
  └──────────┘     └──────────────────────────────┘

  ※ エイリアスは特定バージョンへのポインタ
  ※ 加重設定でトラフィックを分割可能
  ※ API Gatewayのステージ変数と連携可能
```

### 2.3 バージョン/エイリアス操作

```bash
# バージョンの発行
aws lambda publish-version \
  --function-name my-function \
  --description "Release v1.0 - initial deployment"

# バージョン一覧の確認
aws lambda list-versions-by-function \
  --function-name my-function \
  --query "Versions[*].{Version:Version,Description:Description,LastModified:LastModified}"

# エイリアスの作成
aws lambda create-alias \
  --function-name my-function \
  --name prod \
  --function-version 1 \
  --description "Production alias"

# エイリアスの更新（新バージョンへ切替）
aws lambda update-alias \
  --function-name my-function \
  --name prod \
  --function-version 2

# 加重エイリアスの設定（カナリアデプロイ）
aws lambda update-alias \
  --function-name my-function \
  --name prod \
  --function-version 1 \
  --routing-config '{"AdditionalVersionWeights": {"2": 0.1}}'
# → Version 1に90%、Version 2に10%のトラフィック

# 加重解除（全トラフィックをVersion 2へ）
aws lambda update-alias \
  --function-name my-function \
  --name prod \
  --function-version 2 \
  --routing-config '{"AdditionalVersionWeights": {}}'

# エイリアス一覧
aws lambda list-aliases \
  --function-name my-function
```

### 2.4 API GatewayとLambdaエイリアスの連携

```
【API Gateway + Lambda エイリアス連携】

  API Gateway
  ┌──────────────────────────────────────────────────┐
  │                                                    │
  │  Stage: prod                                       │
  │    Stage Variable: lambdaAlias = "prod"            │
  │    │                                               │
  │    ▼                                               │
  │  Integration:                                      │
  │    arn:aws:lambda:...:my-function:${stageVariables │
  │    .lambdaAlias}                                   │
  │                                                    │
  │  Stage: staging                                    │
  │    Stage Variable: lambdaAlias = "staging"         │
  │                                                    │
  └──────────────────────────────────────────────────┘
                    │                    │
                    ▼                    ▼
            Lambda:prod          Lambda:staging
            (Version 3)          (Version 2)
```

---

## 3. デプロイ戦略

### 3.1 CodeDeploy連携によるLambdaデプロイ

```
【CodeDeploy + Lambda デプロイフロー】

  1. 新バージョン発行
  ┌──────────┐
  │ Version 4 │ ← 新コードのバージョン
  └──────────┘

  2. CodeDeployがエイリアスのトラフィックシフトを制御
  ┌─────────────────────────────────────────────────────────────┐
  │                     CodeDeploy                               │
  │                                                              │
  │  prod エイリアス                                              │
  │  ┌──────────────────────────────────────────────────────┐   │
  │  │  開始:    Version 3 ████████████████████ 100%        │   │
  │  │                                                      │   │
  │  │  途中:    Version 3 ████████████████ 80%             │   │
  │  │           Version 4 ████ 20%                         │   │
  │  │                                                      │   │
  │  │  完了:    Version 4 ████████████████████ 100%        │   │
  │  └──────────────────────────────────────────────────────┘   │
  │                                                              │
  │  ┌──────────┐  ┌──────────┐  ┌──────────┐                 │
  │  │BeforeAllow│  │ Traffic  │  │AfterAllow │                 │
  │  │TrafficHook│  │ Shift    │  │TrafficHook│                 │
  │  │ (検証)    │  │ (段階的) │  │ (検証)    │                 │
  │  └──────────┘  └──────────┘  └──────────┘                 │
  └─────────────────────────────────────────────────────────────┘
```

### 3.2 デプロイ設定タイプ

| デプロイ設定 | 説明 | ユースケース |
|-------------|------|-------------|
| **Canary10Percent5Minutes** | 10%を5分間、その後100% | 短時間で検証したい場合 |
| **Canary10Percent10Minutes** | 10%を10分間、その後100% | 標準的なカナリア |
| **Canary10Percent15Minutes** | 10%を15分間、その後100% | 慎重なカナリア |
| **Canary10Percent30Minutes** | 10%を30分間、その後100% | 重要なサービス |
| **Linear10PercentEvery1Minute** | 毎分10%ずつ増加 | 高速リニア |
| **Linear10PercentEvery2Minutes** | 2分毎に10%ずつ増加 | 標準リニア |
| **Linear10PercentEvery3Minutes** | 3分毎に10%ずつ増加 | 慎重なリニア |
| **Linear10PercentEvery10Minutes** | 10分毎に10%ずつ増加 | 非常に慎重 |
| **AllAtOnce** | 即座に100% | テスト環境 |

```
【カナリア vs リニア】

  Canary10Percent10Minutes:
  100% ─                           ████████████████
       │                           │
       │                           │
  10%  ─  ██████████               │
       │  │         │              │
   0%  ───┤         ├──────────────┤───────────▶ 時間
          0分       10分

  Linear10PercentEvery2Minutes:
  100% ─                              ████
  90%  ─                          ████│
  80%  ─                      ████│   │
  70%  ─                  ████│   │   │
  60%  ─              ████│   │   │   │
  50%  ─          ████│   │   │   │   │
  40%  ─      ████│   │   │   │   │   │
  30%  ─  ████│   │   │   │   │   │   │
  20%  ─██│   │   │   │   │   │   │   │
  10%  ██ │   │   │   │   │   │   │   │
   0%  ──┤   │   │   │   │   │   │   │──▶ 時間
         0   2   4   6   8  10  12  14  16  18分
```

### 3.3 SAMテンプレートでのデプロイ設定

```yaml
# SAMテンプレートによるCodeDeploy連携
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31

Globals:
  Function:
    AutoPublishAlias: live  # 自動バージョン発行 + エイリアス作成

Resources:
  MyFunction:
    Type: AWS::Serverless::Function
    Properties:
      Handler: index.handler
      Runtime: python3.12
      CodeUri: ./src
      DeploymentPreference:
        Type: Canary10Percent10Minutes
        Alarms:
          - !Ref CanaryErrorsAlarm      # アラーム発火でロールバック
          - !Ref LatencyAlarm
        Hooks:
          PreTraffic: !Ref PreTrafficHook   # 事前検証Lambda
          PostTraffic: !Ref PostTrafficHook # 事後検証Lambda

  # デプロイ前の検証用Lambda
  PreTrafficHook:
    Type: AWS::Serverless::Function
    Properties:
      Handler: pre_traffic.handler
      Runtime: python3.12
      CodeUri: ./hooks
      Policies:
        - Version: "2012-10-17"
          Statement:
            - Effect: Allow
              Action: codedeploy:PutLifecycleEventHookExecutionStatus
              Resource: "*"
      Environment:
        Variables:
          TARGET_FUNCTION: !Ref MyFunction

  # CloudWatchアラーム（エラー率監視）
  CanaryErrorsAlarm:
    Type: AWS::CloudWatch::Alarm
    Properties:
      AlarmDescription: "Lambda errors during deployment"
      Namespace: AWS/Lambda
      MetricName: Errors
      Dimensions:
        - Name: FunctionName
          Value: !Ref MyFunction
      Statistic: Sum
      Period: 60
      EvaluationPeriods: 1
      Threshold: 1
      ComparisonOperator: GreaterThanOrEqualToThreshold

  LatencyAlarm:
    Type: AWS::CloudWatch::Alarm
    Properties:
      AlarmDescription: "Lambda latency during deployment"
      Namespace: AWS/Lambda
      MetricName: Duration
      Dimensions:
        - Name: FunctionName
          Value: !Ref MyFunction
      Statistic: Average
      Period: 60
      EvaluationPeriods: 1
      Threshold: 5000
      ComparisonOperator: GreaterThanThreshold
```

### 3.4 PreTrafficHookの実装例

```python
# hooks/pre_traffic.py
import boto3
import os

codedeploy = boto3.client('codedeploy')
lambda_client = boto3.client('lambda')

def handler(event, context):
    deployment_id = event['DeploymentId']
    lifecycle_event_hook_execution_id = event['LifecycleEventHookExecutionId']

    target_function = os.environ['TARGET_FUNCTION']

    try:
        # 新バージョンをテスト呼出し
        response = lambda_client.invoke(
            FunctionName=target_function,
            InvocationType='RequestResponse',
            Payload='{"test": true}'
        )

        # レスポンス検証
        status_code = response['StatusCode']
        if status_code == 200:
            status = 'Succeeded'
        else:
            status = 'Failed'

    except Exception as e:
        print(f"Validation failed: {e}")
        status = 'Failed'

    # CodeDeployに結果を報告
    codedeploy.put_lifecycle_event_hook_execution_status(
        deploymentId=deployment_id,
        lifecycleEventHookExecutionId=lifecycle_event_hook_execution_id,
        status=status
    )
```

### 3.5 CodeDeployによるロールバック

```bash
# デプロイ一覧の確認
aws deploy list-deployments \
  --application-name my-sam-app \
  --deployment-group-name MyFunctionDeploymentGroup

# デプロイ詳細の確認
aws deploy get-deployment \
  --deployment-id d-XXXXXXXXX \
  --query "deploymentInfo.{Status:status,Strategy:deploymentStyle,ErrorInfo:errorInformation}"

# 手動ロールバック（デプロイの停止）
aws deploy stop-deployment \
  --deployment-id d-XXXXXXXXX \
  --auto-rollback-enabled
```

---

## 4. 同時実行制御

### 4.1 同時実行の概念

```
【Lambda同時実行モデル】

  リージョン制限: 1,000 同時実行（デフォルト）
  ┌──────────────────────────────────────────────────────────────┐
  │                                                              │
  │  Function A                                                  │
  │  ┌─────────────────────────────┐                            │
  │  │ Reserved: 100               │ ← 他の関数と共有しない     │
  │  │  ┌───┐┌───┐┌───┐...┌───┐  │                            │
  │  │  │ 1 ││ 2 ││ 3 │   │100│  │                            │
  │  │  └───┘└───┘└───┘   └───┘  │                            │
  │  └─────────────────────────────┘                            │
  │                                                              │
  │  Function B                                                  │
  │  ┌─────────────────────────────┐                            │
  │  │ Reserved: 200               │                            │
  │  └─────────────────────────────┘                            │
  │                                                              │
  │  その他の全関数                                              │
  │  ┌─────────────────────────────┐                            │
  │  │ Unreserved: 700             │ ← 残り（100は常に確保）    │
  │  │ (1000 - 100 - 200 = 700)    │                            │
  │  │ ※ 最低100は非予約プールとして│                            │
  │  │   残す必要あり               │                            │
  │  └─────────────────────────────┘                            │
  └──────────────────────────────────────────────────────────────┘
```

### 4.2 Reserved vs Provisioned Concurrency

```
【Reserved Concurrency vs Provisioned Concurrency】

  Reserved Concurrency（予約済み同時実行数）
  ───────────────────────────────────────
  ・関数の最大同時実行数を制限
  ・他の関数からの影響を防止
  ・超過リクエストはスロットリング
  ・追加料金なし
  ・0に設定 = 関数を無効化

  ┌──────────────────────────────────────────────┐
  │  Reserved: 100                                │
  │                                               │
  │  同時リクエスト → [1][2][3]...[100] → OK      │
  │  101番目のリクエスト → 429 Throttled          │
  └──────────────────────────────────────────────┘


  Provisioned Concurrency（プロビジョニング済み同時実行数）
  ──────────────────────────────────────────────────
  ・事前に実行環境を初期化（ウォーム状態で待機）
  ・Cold Startを排除
  ・追加料金あり
  ・エイリアスまたは特定バージョンに設定

  ┌──────────────────────────────────────────────┐
  │  Provisioned: 50                              │
  │                                               │
  │  [W][W][W]...[W]  ← 50個のウォーム環境が待機  │
  │                                               │
  │  51番目～ → 通常のCold Start                  │
  └──────────────────────────────────────────────┘
```

| 項目 | Reserved Concurrency | Provisioned Concurrency |
|------|---------------------|------------------------|
| **目的** | 同時実行数の上限制限 | Cold Start排除 |
| **料金** | 無料 | 有料（ウォーム環境維持費） |
| **設定対象** | 関数レベル | エイリアス / バージョン |
| **スロットリング** | 超過分はスロットル | 超過分はCold Startで処理 |
| **ユースケース** | リソース保護、関数無効化 | レイテンシ要件、予測可能な負荷 |
| **$LATEST への設定** | 可能 | 不可（バージョン/エイリアス必須） |

### 4.3 同時実行制御のCLI操作

```bash
# Reserved Concurrencyの設定
aws lambda put-function-concurrency \
  --function-name my-function \
  --reserved-concurrent-executions 100

# Reserved Concurrencyの確認
aws lambda get-function-concurrency \
  --function-name my-function

# Reserved Concurrencyの削除（リージョンプールに戻す）
aws lambda delete-function-concurrency \
  --function-name my-function

# Provisioned Concurrencyの設定（エイリアスに対して）
aws lambda put-provisioned-concurrency-config \
  --function-name my-function \
  --qualifier prod \
  --provisioned-concurrent-executions 50

# Provisioned Concurrencyの状態確認
aws lambda get-provisioned-concurrency-config \
  --function-name my-function \
  --qualifier prod

# Provisioned Concurrencyの削除
aws lambda delete-provisioned-concurrency-config \
  --function-name my-function \
  --qualifier prod

# アカウントの同時実行制限確認
aws lambda get-account-settings \
  --query "{ConcurrentExecutions:AccountLimit.ConcurrentExecutions,UnreservedConcurrentExecutions:AccountLimit.UnreservedConcurrentExecutions}"
```

### 4.4 Application Auto ScalingによるProvisioned Concurrencyのスケーリング

```bash
# スケーラブルターゲットの登録
aws application-autoscaling register-scalable-target \
  --service-namespace lambda \
  --resource-id "function:my-function:prod" \
  --scalable-dimension "lambda:function:ProvisionedConcurrency" \
  --min-capacity 5 \
  --max-capacity 100

# ターゲット追跡スケーリングポリシーの設定
aws application-autoscaling put-scaling-policy \
  --service-namespace lambda \
  --resource-id "function:my-function:prod" \
  --scalable-dimension "lambda:function:ProvisionedConcurrency" \
  --policy-name "lambda-concurrency-scaling" \
  --policy-type TargetTrackingScaling \
  --target-tracking-scaling-policy-configuration '{
    "TargetValue": 0.7,
    "PredefinedMetricSpecification": {
      "PredefinedMetricType": "LambdaProvisionedConcurrencyUtilization"
    }
  }'
# → 利用率70%を維持するよう自動スケール

# スケジュールベースのスケーリング
aws application-autoscaling put-scheduled-action \
  --service-namespace lambda \
  --resource-id "function:my-function:prod" \
  --scalable-dimension "lambda:function:ProvisionedConcurrency" \
  --scheduled-action-name "scale-up-morning" \
  --schedule "cron(0 9 * * ? *)" \
  --scalable-target-action MinCapacity=50,MaxCapacity=200
```

---

## 5. Lambda Layers

### 5.1 Layersの概念

```
【Lambda Layers アーキテクチャ】

  ┌─────────────────────────────────────────────────────┐
  │  Lambda Function                                     │
  │  ┌──────────────────────────────┐                   │
  │  │  関数コード                    │  /var/task/       │
  │  │  (handler.py)                 │                   │
  │  └──────────────────────────────┘                   │
  │                │                                     │
  │                ▼ import                              │
  │  ┌──────────────────────────────┐                   │
  │  │  Layer 1: 共通ライブラリ      │  /opt/            │
  │  │  (requests, boto3拡張等)      │  /opt/python/     │
  │  └──────────────────────────────┘                   │
  │  ┌──────────────────────────────┐                   │
  │  │  Layer 2: 共通ユーティリティ   │  /opt/python/     │
  │  │  (logging設定, 共通処理等)     │                   │
  │  └──────────────────────────────┘                   │
  │  ┌──────────────────────────────┐                   │
  │  │  Layer 3: バイナリ            │  /opt/bin/        │
  │  │  (ffmpeg, ImageMagick等)      │                   │
  │  └──────────────────────────────┘                   │
  │                                                      │
  │  制限: 最大5レイヤー、合計展開サイズ250 MB           │
  └─────────────────────────────────────────────────────┘

  【レイヤーの共有】

  Layer v3 (共通ライブラリ)
      │
      ├──▶ Function A (prod)
      ├──▶ Function B (prod)
      ├──▶ Function C (staging)
      └──▶ 他アカウントの Function D (クロスアカウント共有)
```

### 5.2 Layerの操作

```bash
# レイヤー用ディレクトリ構造の作成（Python）
mkdir -p layer/python
pip install requests -t layer/python/
cd layer && zip -r ../my-layer.zip python/

# レイヤーの発行
aws lambda publish-layer-version \
  --layer-name common-libraries \
  --description "Shared Python libraries" \
  --zip-file fileb://my-layer.zip \
  --compatible-runtimes python3.11 python3.12 \
  --compatible-architectures x86_64 arm64

# レイヤーを関数にアタッチ
aws lambda update-function-configuration \
  --function-name my-function \
  --layers "arn:aws:lambda:ap-northeast-1:123456789012:layer:common-libraries:1"

# レイヤーの一覧
aws lambda list-layers

# レイヤーバージョンの一覧
aws lambda list-layer-versions \
  --layer-name common-libraries

# クロスアカウントでのレイヤー共有
aws lambda add-layer-version-permission \
  --layer-name common-libraries \
  --version-number 1 \
  --statement-id share-with-account \
  --principal 987654321098 \
  --action lambda:GetLayerVersion

# 組織全体への共有
aws lambda add-layer-version-permission \
  --layer-name common-libraries \
  --version-number 1 \
  --statement-id share-with-org \
  --principal "*" \
  --action lambda:GetLayerVersion \
  --organization-id o-xxxxxxxxxx
```

---

## 6. Lambda Destinations と DLQ

### 6.1 非同期呼出しのイベントフロー

```
【Lambda 非同期呼出しフロー】

  Event Source            Lambda                    後続処理
  ─────────────          ──────                    ─────────

  ┌──────────┐    ┌───────────────────────────────────────────────┐
  │ S3       │    │  内部キュー                                    │
  │ SNS      │───▶│  ┌─────┐  ┌───────────┐  ┌───────────────┐  │
  │ EventBr. │    │  │Event│──▶│  Lambda    │  │ 結果に応じた    │  │
  │ etc.     │    │  └─────┘  │  Function  │──▶│ ルーティング    │  │
  └──────────┘    │           └───────────┘  └───────┬───────┘  │
                  │                                    │          │
                  │           ┌─────────────────────────┤          │
                  │           │                         │          │
                  │           ▼                         ▼          │
                  │     ┌──────────┐            ┌──────────┐     │
                  │     │ 成功時    │            │ 失敗時    │     │
                  │     │Destination│            │Destination│     │
                  │     └──────────┘            └──────────┘     │
                  │                                               │
                  │  リトライ: 最大2回 (合計3回試行)              │
                  │  Maximum Event Age: 最大6時間                 │
                  └───────────────────────────────────────────────┘

  成功 Destination:            失敗 Destination:
  ・SQS キュー                 ・SQS キュー (DLQ代替)
  ・SNS トピック               ・SNS トピック
  ・Lambda 関数                ・Lambda 関数
  ・EventBridge バス           ・EventBridge バス
```

### 6.2 Destinations vs DLQ

| 項目 | Destinations | DLQ (Dead Letter Queue) |
|------|-------------|------------------------|
| **対応イベント** | 成功 + 失敗 | 失敗のみ |
| **送信先** | SQS, SNS, Lambda, EventBridge | SQS, SNS のみ |
| **送信情報** | リクエスト + レスポンス全体 | イベントペイロードのみ |
| **設定対象** | 関数 + 特定のqualifier | 関数レベル |
| **推奨** | 新規実装はこちら | レガシー互換 |

```
【DLQ vs Destinations の情報量の違い】

  DLQ に送信される情報:
  ┌────────────────────────────────┐
  │  元のイベントペイロードのみ     │
  │  {"key": "value", ...}        │
  └────────────────────────────────┘

  Destinations に送信される情報:
  ┌────────────────────────────────┐
  │  {                             │
  │    "version": "1.0",           │
  │    "timestamp": "...",         │
  │    "requestContext": {         │
  │      "condition": "Success",   │  ← 成功/失敗の情報
  │      "functionArn": "...",     │  ← 関数ARN
  │      "approximateInvokeCount": │  ← 試行回数
  │    },                          │
  │    "requestPayload": {...},    │  ← 元のイベント
  │    "responseContext": {        │
  │      "statusCode": 200         │  ← レスポンス情報
  │    },                          │
  │    "responsePayload": {...}    │  ← 関数の戻り値
  │  }                             │
  └────────────────────────────────┘
```

### 6.3 設定方法

```bash
# Destinationsの設定（成功時: SQS、失敗時: SNS）
aws lambda put-function-event-invoke-config \
  --function-name my-function \
  --qualifier prod \
  --maximum-retry-attempts 2 \
  --maximum-event-age-in-seconds 3600 \
  --destination-config '{
    "OnSuccess": {
      "Destination": "arn:aws:sqs:ap-northeast-1:123456789012:success-queue"
    },
    "OnFailure": {
      "Destination": "arn:aws:sns:ap-northeast-1:123456789012:failure-topic"
    }
  }'

# DLQの設定（関数レベル）
aws lambda update-function-configuration \
  --function-name my-function \
  --dead-letter-config '{
    "TargetArn": "arn:aws:sqs:ap-northeast-1:123456789012:my-dlq"
  }'

# イベント呼出し設定の確認
aws lambda get-function-event-invoke-config \
  --function-name my-function \
  --qualifier prod

# DLQ設定の確認
aws lambda get-function-configuration \
  --function-name my-function \
  --query "DeadLetterConfig"
```

### 6.4 SQSイベントソースマッピングとDLQ

```
【SQSトリガー時の失敗ハンドリング】

  ※ SQSトリガーの場合、Lambda Destinationsは使用不可
  ※ SQS側のDLQ（リドライブポリシー）を使用する

  SQS (Source Queue)
  ┌──────────────────┐
  │  maxReceiveCount  │──── 超過 ───▶ SQS DLQ
  │  = 3              │              ┌─────────────┐
  │                   │              │ 失敗メッセージ│
  │  ┌───┐  Lambda   │              │  の退避      │
  │  │msg│──▶ ✕ 失敗 │              └─────────────┘
  │  └───┘  (3回失敗) │
  └──────────────────┘

  設定:
  aws sqs set-queue-attributes \
    --queue-url QUEUE_URL \
    --attributes '{
      "RedrivePolicy": "{\"deadLetterTargetArn\":\"DLQ_ARN\",\"maxReceiveCount\":\"3\"}"
    }'
```

---

## 7. Lambda@Edge と CloudFront Functions

### 7.1 実行ポイントの比較

```
【CloudFront リクエスト/レスポンスライフサイクル】

  Client                CloudFront              Origin
    │                   Edge Location            │
    │                   ┌─────────────────┐      │
    │  ① Viewer Request │                 │      │
    │ ─────────────────▶│  CF Function    │      │
    │                   │  or             │      │
    │                   │  Lambda@Edge    │      │
    │                   │                 │      │
    │                   │  ② Origin Request│      │
    │                   │ ────────────────▶│      │
    │                   │  Lambda@Edge    │      │
    │                   │                 │      │
    │                   │  ③ Origin Response│     │
    │                   │ ◀────────────────│      │
    │                   │  Lambda@Edge    │      │
    │                   │                 │      │
    │ ④ Viewer Response │                 │      │
    │ ◀─────────────────│  CF Function    │      │
    │                   │  or             │      │
    │                   │  Lambda@Edge    │      │
    │                   └─────────────────┘      │
    │                                            │

  ①②③④ = Lambda@Edge が実行可能な4つのポイント
  ①④   = CloudFront Functions が実行可能な2つのポイント
```

### 7.2 Lambda@Edge vs CloudFront Functions

| 項目 | Lambda@Edge | CloudFront Functions |
|------|------------|---------------------|
| **実行ポイント** | 4箇所すべて | Viewer Request/Response のみ |
| **ランタイム** | Node.js, Python | JavaScript のみ |
| **実行時間** | Viewer: 5秒 / Origin: 30秒 | 1ミリ秒未満 |
| **メモリ** | 128-10,240 MB | 2 MB |
| **パッケージサイズ** | Viewer: 1 MB / Origin: 50 MB | 10 KB |
| **ネットワークアクセス** | あり | なし |
| **ファイルシステム** | /tmp 利用可 | なし |
| **リージョン** | us-east-1 で作成 | エッジで実行 |
| **料金** | Lambda料金 + リクエスト | 非常に安価 |
| **スケール** | リージョン制限あり | 毎秒数百万リクエスト |

### 7.3 ユースケース別の選択指針

| ユースケース | 推奨 | 理由 |
|-------------|------|------|
| URLリライト/リダイレクト | CloudFront Functions | 軽量、高速 |
| ヘッダー操作 | CloudFront Functions | 軽量処理 |
| A/Bテスト（Cookie振分け） | CloudFront Functions | Viewer Request |
| 認証トークン検証（単純） | CloudFront Functions | 高速応答が必要 |
| 認証トークン検証（外部API） | Lambda@Edge | ネットワーク必要 |
| 画像リサイズ | Lambda@Edge | Origin Response |
| オリジン選択 | Lambda@Edge | Origin Request |
| HTMLのSSR | Lambda@Edge | 処理時間が長い |
| Bot検出/WAF的処理 | Lambda@Edge | 複雑なロジック |

### 7.4 Lambda@Edgeの制限事項

```
【Lambda@Edge 重要な制限事項】

  ┌──────────────────────────────────────────────────────────┐
  │  1. デプロイリージョン: us-east-1 のみ                    │
  │     → CloudFrontが自動的にエッジロケーションへレプリカ     │
  │                                                          │
  │  2. 使用不可な機能:                                      │
  │     ・環境変数 ✕                                         │
  │     ・Lambda Layers ✕                                    │
  │     ・DLQ ✕                                              │
  │     ・VPC ✕                                              │
  │     ・Provisioned Concurrency ✕                          │
  │     ・EFS ✕                                              │
  │     ・コンテナイメージ ✕                                  │
  │     ・arm64アーキテクチャ ✕                               │
  │                                                          │
  │  3. バージョン番号指定が必須                               │
  │     → $LATEST やエイリアスは使用不可                       │
  │     → 必ず発行済みバージョン番号を指定                     │
  │                                                          │
  │  4. 削除制限                                              │
  │     → CloudFrontディストリビューションとの関連解除後、     │
  │       レプリカ削除完了まで待つ必要がある（数時間かかる）   │
  └──────────────────────────────────────────────────────────┘
```

### 7.5 Lambda@Edgeの設定

```bash
# Lambda@Edge用の関数作成（us-east-1必須）
aws lambda create-function \
  --region us-east-1 \
  --function-name my-edge-function \
  --runtime nodejs20.x \
  --handler index.handler \
  --role arn:aws:iam::123456789012:role/lambda-edge-role \
  --zip-file fileb://function.zip

# バージョンの発行（Lambda@Edgeは発行済みバージョン必須）
VERSION=$(aws lambda publish-version \
  --region us-east-1 \
  --function-name my-edge-function \
  --query "Version" \
  --output text)

# CloudFrontディストリビューションへの関連付け
aws cloudfront get-distribution-config \
  --id E1234567890 > /tmp/cf-config.json

# config.json を編集して LambdaFunctionAssociations を追加:
# {
#   "EventType": "viewer-request",
#   "LambdaFunctionARN": "arn:aws:lambda:us-east-1:123456789012:function:my-edge-function:1"
# }

aws cloudfront update-distribution \
  --id E1234567890 \
  --distribution-config file:///tmp/cf-config-updated.json \
  --if-match ETAG_VALUE
```

### 7.6 CloudFront Functionsの例

```javascript
// URL末尾にindex.htmlを追加するCloudFront Function
function handler(event) {
    var request = event.request;
    var uri = request.uri;

    // URIが/で終わる場合、index.htmlを追加
    if (uri.endsWith('/')) {
        request.uri += 'index.html';
    }
    // 拡張子がない場合、/index.htmlを追加
    else if (!uri.includes('.')) {
        request.uri += '/index.html';
    }

    return request;
}
```

```bash
# CloudFront Functionsの作成
aws cloudfront create-function \
  --name url-rewrite \
  --function-config '{"Comment":"URL rewrite","Runtime":"cloudfront-js-2.0"}' \
  --function-code fileb://function.js

# テスト
aws cloudfront test-function \
  --name url-rewrite \
  --if-match ETAG \
  --event-object fileb://test-event.json

# 発行
aws cloudfront publish-function \
  --name url-rewrite \
  --if-match ETAG

# ディストリビューションへの関連付け（キャッシュビヘイビアで設定）
```

---

## 8. Lambda コンテナイメージサポート

### 8.1 コンテナイメージ vs ZIP パッケージ

```
【デプロイパッケージ比較】

  ZIP パッケージ                    コンテナイメージ
  ──────────────                    ──────────────
  ┌──────────────────┐             ┌──────────────────┐
  │  最大50MB(圧縮)   │             │  最大10GB         │
  │  最大250MB(展開)  │             │                   │
  │                   │             │  ECR経由で管理    │
  │  ・S3経由         │             │                   │
  │  ・直接アップロード│             │  ・カスタムランタイム│
  │                   │             │  ・大規模依存関係  │
  │  ・Lambda Layers  │             │  ・既存CI/CD活用   │
  │   対応            │             │  ・Layers非対応   │
  └──────────────────┘             └──────────────────┘

  ユースケース:
  ZIP  → 小規模関数、標準ランタイム、Layers活用
  Image → ML推論、大規模ライブラリ、カスタムOS、既存コンテナ活用
```

### 8.2 Dockerfile例

```dockerfile
# AWS提供のベースイメージを使用
FROM public.ecr.aws/lambda/python:3.12

# 依存関係のインストール
COPY requirements.txt ${LAMBDA_TASK_ROOT}
RUN pip install -r requirements.txt

# 関数コードのコピー
COPY app.py ${LAMBDA_TASK_ROOT}

# ハンドラの指定
CMD ["app.handler"]
```

```dockerfile
# カスタムイメージの場合（Runtime Interface Clientが必要）
FROM python:3.12-slim

# Lambda Runtime Interface Client のインストール
RUN pip install awslambdaric

# アプリケーションのコピー
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY app.py .

# Lambda Runtime Interface Emulator (ローカルテスト用)
COPY --from=public.ecr.aws/lambda/python:3.12 \
  /usr/local/bin/aws-lambda-rie /usr/local/bin/aws-lambda-rie

ENTRYPOINT ["/usr/local/bin/python", "-m", "awslambdaric"]
CMD ["app.handler"]
```

### 8.3 コンテナイメージ関数のデプロイ

```bash
# ECRリポジトリの作成
aws ecr create-repository \
  --repository-name my-lambda-function \
  --image-scanning-configuration scanOnPush=true

# ECR認証
aws ecr get-login-password --region ap-northeast-1 | \
  docker login --username AWS --password-stdin \
  123456789012.dkr.ecr.ap-northeast-1.amazonaws.com

# イメージのビルド・プッシュ
docker build -t my-lambda-function .
docker tag my-lambda-function:latest \
  123456789012.dkr.ecr.ap-northeast-1.amazonaws.com/my-lambda-function:latest
docker push \
  123456789012.dkr.ecr.ap-northeast-1.amazonaws.com/my-lambda-function:latest

# コンテナイメージからLambda関数を作成
aws lambda create-function \
  --function-name my-container-function \
  --package-type Image \
  --code ImageUri=123456789012.dkr.ecr.ap-northeast-1.amazonaws.com/my-lambda-function:latest \
  --role arn:aws:iam::123456789012:role/lambda-execution-role \
  --timeout 60 \
  --memory-size 512

# コンテナイメージの更新
aws lambda update-function-code \
  --function-name my-container-function \
  --image-uri 123456789012.dkr.ecr.ap-northeast-1.amazonaws.com/my-lambda-function:v2
```

---

## 9. 環境変数とシークレット管理

### 9.1 環境変数の基本

```
【Lambda環境変数の暗号化フロー】

  設定時:
  ┌──────────────────┐      ┌──────────────────┐
  │  環境変数を設定    │─────▶│  AWS KMS で暗号化  │
  │  DB_HOST=xxx      │      │  （保存時暗号化）   │
  │  DB_PASS=yyy      │      │                    │
  └──────────────────┘      └──────────────────┘

  実行時:
  ┌──────────────────┐      ┌──────────────────┐
  │  Lambda実行環境    │◀─────│  KMS で復号        │
  │                    │      │  （自動）          │
  │  os.environ[       │      │                    │
  │    'DB_HOST'       │      │  ※ 転送時暗号化の   │
  │  ] → 'xxx'        │      │    ヘルパー使用で   │
  │                    │      │    追加保護可能     │
  └──────────────────┘      └──────────────────┘


  暗号化レベル:
  ┌────────────────────────────────────────────────────────────┐
  │  1. デフォルト: AWS管理キー (aws/lambda) で保存時暗号化     │
  │     → 追加設定不要                                         │
  │                                                            │
  │  2. CMK指定: カスタマー管理キーで保存時暗号化              │
  │     → KMSキーARNを指定                                     │
  │                                                            │
  │  3. 転送時暗号化ヘルパー: コード内でKMS復号を呼出し        │
  │     → Lambda外への漏洩リスクを低減                         │
  │     → 環境変数は暗号化された文字列のまま保持               │
  └────────────────────────────────────────────────────────────┘
```

### 9.2 環境変数の操作

```bash
# 環境変数の設定
aws lambda update-function-configuration \
  --function-name my-function \
  --environment '{
    "Variables": {
      "DB_HOST": "mydb.cluster-xxx.ap-northeast-1.rds.amazonaws.com",
      "DB_NAME": "myapp",
      "TABLE_NAME": "orders",
      "LOG_LEVEL": "INFO"
    }
  }'

# カスタマー管理キー(CMK)で暗号化
aws lambda update-function-configuration \
  --function-name my-function \
  --kms-key-arn "arn:aws:kms:ap-northeast-1:123456789012:key/12345678-1234-1234-1234-123456789012" \
  --environment '{
    "Variables": {
      "DB_HOST": "mydb.cluster-xxx.ap-northeast-1.rds.amazonaws.com",
      "SECRET_KEY": "encrypted-value-here"
    }
  }'

# 環境変数の確認
aws lambda get-function-configuration \
  --function-name my-function \
  --query "Environment.Variables"
```

### 9.3 SSM Parameter Store連携

```
【SSM Parameter Store 連携パターン】

  ┌──────────────┐                ┌────────────────────────┐
  │   Lambda      │   GetParameter │  SSM Parameter Store   │
  │   Function    │───────────────▶│                        │
  │               │                │  /myapp/prod/db_host   │
  │  INIT フェーズ│◀───────────────│  /myapp/prod/db_pass   │
  │  でキャッシュ │   復号済み値    │  (SecureString→KMS)    │
  └──────────────┘                └────────────────────────┘

  ベストプラクティス:
  ・INITフェーズ（ハンドラ外）でパラメータ取得
  ・グローバル変数にキャッシュ
  ・Lambda Powertools の Parameters ユーティリティ活用
```

```python
# SSM Parameter Store からの取得（Python）
import boto3
import os

ssm = boto3.client('ssm')

# INIT フェーズでキャッシュ（Cold Start時のみ実行）
def get_parameter(name):
    response = ssm.get_parameter(
        Name=name,
        WithDecryption=True  # SecureStringの復号
    )
    return response['Parameter']['Value']

# グローバル変数にキャッシュ
DB_HOST = get_parameter('/myapp/prod/db_host')
DB_PASSWORD = get_parameter('/myapp/prod/db_password')

def handler(event, context):
    # キャッシュ済みの値を使用
    print(f"Connecting to {DB_HOST}")
    # ...
```

### 9.4 Secrets Manager連携

```
【Secrets Manager 連携パターン】

  ┌──────────────┐                ┌────────────────────────┐
  │   Lambda      │  GetSecretValue│  Secrets Manager       │
  │   Function    │───────────────▶│                        │
  │               │                │  myapp/prod/db-creds   │
  │  (キャッシュ)  │◀───────────────│  {                     │
  │               │    JSON        │    "username": "admin", │
  │               │                │    "password": "xxx"    │
  └──────────────┘                │  }                     │
                                   │                        │
                                   │  自動ローテーション対応  │
                                   └────────────────────────┘

  vs SSM Parameter Store:
  ┌──────────────────┬────────────────────┬──────────────────────┐
  │ 項目              │ SSM Parameter Store │ Secrets Manager      │
  ├──────────────────┼────────────────────┼──────────────────────┤
  │ 料金              │ Standard: 無料      │ $0.40/シークレット/月 │
  │ 自動ローテーション │ なし                │ あり（Lambda連携）    │
  │ クロスアカウント   │ なし                │ あり（リソースポリシー）│
  │ サイズ上限         │ 8 KB               │ 64 KB                │
  │ ユースケース       │ 設定値全般          │ DB認証情報、APIキー   │
  └──────────────────┴────────────────────┴──────────────────────┘
```

```python
# Secrets Manager からの取得（Python）
import boto3
import json

secrets_client = boto3.client('secretsmanager')

# INIT フェーズでキャッシュ
def get_secret(secret_name):
    response = secrets_client.get_secret_value(SecretId=secret_name)
    return json.loads(response['SecretString'])

DB_CREDS = get_secret('myapp/prod/db-creds')

def handler(event, context):
    username = DB_CREDS['username']
    password = DB_CREDS['password']
    # DB接続処理...
```

### 9.5 Lambda Extensions によるパラメータキャッシュ

```
【AWS Parameters and Secrets Lambda Extension】

  ┌────────────────────────────────────────────────────────────────┐
  │  Lambda 実行環境                                               │
  │                                                                │
  │  ┌──────────────────┐     ┌──────────────────────────────┐   │
  │  │  関数コード        │     │  Parameters & Secrets        │   │
  │  │                    │     │  Lambda Extension            │   │
  │  │  localhost:2773    │────▶│                              │   │
  │  │  でHTTPアクセス    │     │  ・ローカルキャッシュ         │   │
  │  │                    │◀────│  ・TTLベース更新             │   │
  │  │                    │     │  ・SSM & Secrets Manager対応  │   │
  │  └──────────────────┘     └──────────┬───────────────────┘   │
  │                                       │                       │
  └───────────────────────────────────────┼───────────────────────┘
                                          │ キャッシュミス時のみ
                                          ▼
                              ┌───────────────────────┐
                              │  SSM / Secrets Manager │
                              └───────────────────────┘

  メリット:
  ・API呼出し回数の大幅削減
  ・コールドスタートへの影響最小化
  ・ランタイム非依存（HTTP経由）
```

```bash
# Lambda Extensionのレイヤー追加
aws lambda update-function-configuration \
  --function-name my-function \
  --layers "arn:aws:lambda:ap-northeast-1:133490724326:layer:AWS-Parameters-and-Secrets-Lambda-Extension:11" \
  --environment '{
    "Variables": {
      "PARAMETERS_SECRETS_EXTENSION_CACHE_ENABLED": "true",
      "PARAMETERS_SECRETS_EXTENSION_CACHE_SIZE": "1000",
      "SSM_PARAMETER_STORE_TTL": "300",
      "SECRETS_MANAGER_TTL": "300"
    }
  }'
```

---

## 10. ハンズオン演習

### 10.1 演習1: Lambda関数の作成とバージョン管理 [検証済み]

```bash
# IAMロールの作成
aws iam create-role \
  --role-name lambda-handson-role \
  --assume-role-policy-document '{
    "Version": "2012-10-17",
    "Statement": [
      {
        "Effect": "Allow",
        "Principal": {"Service": "lambda.amazonaws.com"},
        "Action": "sts:AssumeRole"
      }
    ]
  }'

# 基本ポリシーのアタッチ
aws iam attach-role-policy \
  --role-name lambda-handson-role \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole

# ロール作成後の待機（IAMの伝播待ち）
sleep 10

# Lambda関数コード作成（v1）
cat > /tmp/lambda-v1.py << 'PYEOF'
import json

def handler(event, context):
    return {
        "statusCode": 200,
        "body": json.dumps({
            "message": "Hello from v1!",
            "version": "1.0.0"
        })
    }
PYEOF

# ZIPパッケージ作成
cd /tmp && zip lambda-v1.zip lambda-v1.py

# Lambda関数の作成
ROLE_ARN=$(aws iam get-role --role-name lambda-handson-role --query "Role.Arn" --output text)

aws lambda create-function \
  --function-name handson-function \
  --runtime python3.12 \
  --handler lambda-v1.handler \
  --role ${ROLE_ARN} \
  --zip-file fileb:///tmp/lambda-v1.zip \
  --timeout 30 \
  --memory-size 256

# 関数の実行テスト
aws lambda invoke \
  --function-name handson-function \
  --payload '{"test": true}' \
  /tmp/response.json && cat /tmp/response.json

# Version 1 の発行
aws lambda publish-version \
  --function-name handson-function \
  --description "v1.0.0 - Initial release"

# v2用のコード作成
cat > /tmp/lambda-v2.py << 'PYEOF'
import json

def handler(event, context):
    return {
        "statusCode": 200,
        "body": json.dumps({
            "message": "Hello from v2!",
            "version": "2.0.0",
            "feature": "new-feature-enabled"
        })
    }
PYEOF

cd /tmp && zip lambda-v2.zip lambda-v2.py

# コードの更新
aws lambda update-function-code \
  --function-name handson-function \
  --zip-file fileb:///tmp/lambda-v2.zip

# ハンドラの更新
aws lambda update-function-configuration \
  --function-name handson-function \
  --handler lambda-v2.handler

# 更新完了の待機
aws lambda wait function-updated --function-name handson-function

# Version 2 の発行
aws lambda publish-version \
  --function-name handson-function \
  --description "v2.0.0 - New feature added"

# バージョン一覧の確認
aws lambda list-versions-by-function \
  --function-name handson-function \
  --query "Versions[*].{Version:Version,Description:Description}" \
  --output table
```

### 10.2 演習2: エイリアスと加重ルーティング [検証済み]

```bash
# prodエイリアスの作成（Version 1を指す）
aws lambda create-alias \
  --function-name handson-function \
  --name prod \
  --function-version 1 \
  --description "Production alias"

# stagingエイリアスの作成（Version 2を指す）
aws lambda create-alias \
  --function-name handson-function \
  --name staging \
  --function-version 2 \
  --description "Staging alias"

# prodエイリアスの動作確認
aws lambda invoke \
  --function-name handson-function \
  --qualifier prod \
  /tmp/prod-response.json && cat /tmp/prod-response.json

# stagingエイリアスの動作確認
aws lambda invoke \
  --function-name handson-function \
  --qualifier staging \
  /tmp/staging-response.json && cat /tmp/staging-response.json

# カナリアデプロイ: prodに10%のトラフィックをVersion 2へ
aws lambda update-alias \
  --function-name handson-function \
  --name prod \
  --function-version 1 \
  --routing-config '{"AdditionalVersionWeights": {"2": 0.1}}'

# 加重設定の確認
aws lambda get-alias \
  --function-name handson-function \
  --name prod \
  --query "{FunctionVersion:FunctionVersion,RoutingConfig:RoutingConfig}"

# 複数回呼出してトラフィック分散を確認
for i in $(seq 1 20); do
  aws lambda invoke \
    --function-name handson-function \
    --qualifier prod \
    /tmp/test-${i}.json 2>/dev/null
  VERSION=$(cat /tmp/test-${i}.json | python3 -c "import sys,json;print(json.loads(json.load(sys.stdin)['body'])['version'])")
  echo "Request ${i}: ${VERSION}"
done

# 完全切替: prodを全てVersion 2へ
aws lambda update-alias \
  --function-name handson-function \
  --name prod \
  --function-version 2 \
  --routing-config '{"AdditionalVersionWeights": {}}'
```

### 10.3 演習3: 同時実行制御の設定 [検証済み]

```bash
# アカウントの同時実行制限を確認
aws lambda get-account-settings \
  --query "{TotalConcurrentExecutions:AccountLimit.ConcurrentExecutions,UnreservedConcurrentExecutions:AccountLimit.UnreservedConcurrentExecutions}"

# Reserved Concurrencyの設定
aws lambda put-function-concurrency \
  --function-name handson-function \
  --reserved-concurrent-executions 10

# 設定の確認
aws lambda get-function-concurrency \
  --function-name handson-function

# Provisioned Concurrencyの設定（prodエイリアスに対して）
aws lambda put-provisioned-concurrency-config \
  --function-name handson-function \
  --qualifier prod \
  --provisioned-concurrent-executions 5

# プロビジョニング状態の確認（Ready になるまで待機）
aws lambda get-provisioned-concurrency-config \
  --function-name handson-function \
  --qualifier prod

# Provisioned Concurrencyの削除
aws lambda delete-provisioned-concurrency-config \
  --function-name handson-function \
  --qualifier prod

# Reserved Concurrencyの削除
aws lambda delete-function-concurrency \
  --function-name handson-function
```

### 10.4 演習4: Destinationsの設定 [検証済み]

```bash
# 成功時用SQSキューの作成
aws sqs create-queue --queue-name lambda-success-queue

# 失敗時用SQSキューの作成
aws sqs create-queue --queue-name lambda-failure-queue

# キューARNの取得
SUCCESS_QUEUE_ARN=$(aws sqs get-queue-attributes \
  --queue-url $(aws sqs get-queue-url --queue-name lambda-success-queue --query "QueueUrl" --output text) \
  --attribute-names QueueArn \
  --query "Attributes.QueueArn" --output text)

FAILURE_QUEUE_ARN=$(aws sqs get-queue-attributes \
  --queue-url $(aws sqs get-queue-url --queue-name lambda-failure-queue --query "QueueUrl" --output text) \
  --attribute-names QueueArn \
  --query "Attributes.QueueArn" --output text)

# Lambda実行ロールにSQS送信権限を追加
aws iam put-role-policy \
  --role-name lambda-handson-role \
  --policy-name sqs-send-policy \
  --policy-document "{
    \"Version\": \"2012-10-17\",
    \"Statement\": [
      {
        \"Effect\": \"Allow\",
        \"Action\": \"sqs:SendMessage\",
        \"Resource\": [\"${SUCCESS_QUEUE_ARN}\", \"${FAILURE_QUEUE_ARN}\"]
      }
    ]
  }"

# Destinationsの設定
aws lambda put-function-event-invoke-config \
  --function-name handson-function \
  --qualifier prod \
  --maximum-retry-attempts 1 \
  --maximum-event-age-in-seconds 600 \
  --destination-config "{
    \"OnSuccess\": {\"Destination\": \"${SUCCESS_QUEUE_ARN}\"},
    \"OnFailure\": {\"Destination\": \"${FAILURE_QUEUE_ARN}\"}
  }"

# 設定の確認
aws lambda get-function-event-invoke-config \
  --function-name handson-function \
  --qualifier prod

# 非同期呼出しのテスト（InvocationType=Event）
aws lambda invoke \
  --function-name handson-function \
  --qualifier prod \
  --invocation-type Event \
  --payload '{"test": "async-invocation"}' \
  /tmp/async-response.json

# 数秒待ってからSQSキューを確認
sleep 5
SUCCESS_QUEUE_URL=$(aws sqs get-queue-url --queue-name lambda-success-queue --query "QueueUrl" --output text)
aws sqs receive-message \
  --queue-url ${SUCCESS_QUEUE_URL} \
  --max-number-of-messages 1
```

### 10.5 演習5: 環境変数とSSMパラメータ [検証済み]

```bash
# SSMパラメータの作成
aws ssm put-parameter \
  --name "/handson/lambda/db_host" \
  --type "String" \
  --value "mydb.example.com"

aws ssm put-parameter \
  --name "/handson/lambda/db_password" \
  --type "SecureString" \
  --value "super-secret-password-123"

# Lambda実行ロールにSSM読取権限を追加
aws iam put-role-policy \
  --role-name lambda-handson-role \
  --policy-name ssm-read-policy \
  --policy-document '{
    "Version": "2012-10-17",
    "Statement": [
      {
        "Effect": "Allow",
        "Action": [
          "ssm:GetParameter",
          "ssm:GetParameters"
        ],
        "Resource": "arn:aws:ssm:*:*:parameter/handson/lambda/*"
      },
      {
        "Effect": "Allow",
        "Action": "kms:Decrypt",
        "Resource": "*"
      }
    ]
  }'

# 環境変数の設定
aws lambda update-function-configuration \
  --function-name handson-function \
  --environment '{
    "Variables": {
      "PARAM_PREFIX": "/handson/lambda",
      "LOG_LEVEL": "DEBUG"
    }
  }'

# 環境変数の確認
aws lambda get-function-configuration \
  --function-name handson-function \
  --query "Environment.Variables"
```

### 10.6 クリーンアップ

```bash
# Destinations設定の削除
aws lambda delete-function-event-invoke-config \
  --function-name handson-function \
  --qualifier prod

# エイリアスの削除
aws lambda delete-alias --function-name handson-function --name prod
aws lambda delete-alias --function-name handson-function --name staging

# Lambda関数の削除
aws lambda delete-function --function-name handson-function

# SQSキューの削除
aws sqs delete-queue --queue-url $(aws sqs get-queue-url --queue-name lambda-success-queue --query "QueueUrl" --output text)
aws sqs delete-queue --queue-url $(aws sqs get-queue-url --queue-name lambda-failure-queue --query "QueueUrl" --output text)

# SSMパラメータの削除
aws ssm delete-parameter --name "/handson/lambda/db_host"
aws ssm delete-parameter --name "/handson/lambda/db_password"

# IAMポリシーの削除
aws iam delete-role-policy --role-name lambda-handson-role --policy-name sqs-send-policy
aws iam delete-role-policy --role-name lambda-handson-role --policy-name ssm-read-policy
aws iam detach-role-policy --role-name lambda-handson-role --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
aws iam delete-role --role-name lambda-handson-role
```

---

## 11. DOP試験対策チェックリスト

### バージョン/エイリアス

- [ ] $LATESTとバージョンの違いを説明できる
- [ ] エイリアスの用途と加重ルーティングの仕組みを理解している
- [ ] API Gatewayステージ変数とLambdaエイリアスの連携を設定できる

<details>
<summary>📝 模範解答を見る</summary>

**$LATEST vs バージョン**:
- $LATEST: 常に最新のコード/設定を指す可変ポインタ。開発用
- バージョン: publish-versionで作成される不変のスナップショット。本番用
- バージョンは一度発行すると変更不可（イミュータブル）

**エイリアスと加重ルーティング**:
- エイリアスは特定バージョンを指す名前付きポインタ（例: prod → Version 3）
- AdditionalVersionWeightsで2つのバージョン間のトラフィック分割が可能
- カナリアデプロイに活用: メインバージョン90% + 新バージョン10%

**API Gateway連携**:
- ステージ変数 `lambdaAlias` に "prod" や "staging" を設定
- Integration URIで `${stageVariables.lambdaAlias}` を参照
- ステージごとに異なるLambdaバージョンへルーティング
</details>

### デプロイ戦略（CodeDeploy連携）

- [ ] SAMのAutoPublishAliasとDeploymentPreferenceを設定できる
- [ ] カナリアとリニアの違いとデプロイ設定名を暗記している
- [ ] PreTraffic/PostTrafficフックの仕組みとロールバック条件を理解している

<details>
<summary>📝 模範解答を見る</summary>

**SAM DeploymentPreference**:
```yaml
DeploymentPreference:
  Type: Canary10Percent10Minutes  # デプロイ設定
  Alarms:
    - !Ref ErrorAlarm            # ロールバックトリガー
  Hooks:
    PreTraffic: !Ref PreHook     # 事前検証Lambda
    PostTraffic: !Ref PostHook   # 事後検証Lambda
```

**カナリア vs リニア**:
- カナリア: 小%のトラフィックを一定時間送信→問題なければ100%切替
  - 例: Canary10Percent10Minutes = 10%で10分間→100%
- リニア: 一定間隔で均等にトラフィックを増加
  - 例: Linear10PercentEvery2Minutes = 2分ごとに10%ずつ増加→20分で100%
- AllAtOnce: 即座に100%切替（テスト用）

**ロールバック条件**:
1. CloudWatchアラームが発火（Alarms設定）
2. PreTrafficフックがFailed を返す
3. PostTrafficフックがFailed を返す
4. 手動でデプロイを停止

**フックの実装**:
- CodeDeployの `put_lifecycle_event_hook_execution_status` APIで結果を報告
- status = 'Succeeded' or 'Failed'
</details>

### 同時実行制御

- [ ] Reserved ConcurrencyとProvisioned Concurrencyの違いを説明できる
- [ ] Provisioned ConcurrencyのAuto Scalingを設定できる
- [ ] スロットリングが発生した場合の挙動を理解している

<details>
<summary>📝 模範解答を見る</summary>

**Reserved vs Provisioned**:
| 項目 | Reserved | Provisioned |
|------|----------|-------------|
| 目的 | 最大同時実行数の制限 | Cold Start排除 |
| 料金 | 無料 | 有料 |
| 設定先 | 関数レベル | エイリアス/バージョン |
| 超過時 | スロットリング(429) | Cold Startで処理 |

**スロットリングの挙動**:
- 同期呼出し: 429 TooManyRequestsException
- 非同期呼出し: 内部キューにリトライ（最大6時間保持）
- SQSトリガー: メッセージがキューに戻る（可視性タイムアウト後に再処理）

**Provisioned ConcurrencyのAuto Scaling**:
- Application Auto Scalingを使用
- ターゲット追跡: LambdaProvisionedConcurrencyUtilization メトリクス
- スケジュール: 時間帯に応じた事前スケーリング

**注意点**:
- Reserved Concurrency = 0に設定すると関数を無効化できる
- Provisioned Concurrencyは$LATESTには設定不可
- リージョン全体で最低100の非予約同時実行数を確保する必要がある
</details>

### Destinations / DLQ

- [ ] DestinationsとDLQの違いを説明できる
- [ ] SQSトリガーの場合のエラーハンドリングを理解している
- [ ] 非同期呼出しのリトライ動作を説明できる

<details>
<summary>📝 模範解答を見る</summary>

**Destinations vs DLQ**:
- Destinations: 成功 + 失敗の両方に対応。SQS/SNS/Lambda/EventBridgeに送信可能。リクエスト + レスポンス情報を含む。推奨
- DLQ: 失敗のみ対応。SQS/SNSのみ。元のイベントペイロードのみ。レガシー

**SQSトリガー時のエラーハンドリング**:
- Lambda Destinationsは使用不可
- SQS側のリドライブポリシー（DLQ）を使用
- maxReceiveCount回失敗後にDLQへ移動
- バッチ処理の場合: 部分的バッチ応答（ReportBatchItemFailures）で成功分のみ削除可能

**非同期呼出しのリトライ**:
- デフォルト: 最大2回リトライ（合計3回試行）
- Maximum Event Age: 最大6時間（デフォルト6時間）
- リトライ間隔: 1分→2分（指数バックオフ）
- `put-function-event-invoke-config` でカスタマイズ可能
</details>

### Lambda@Edge / CloudFront Functions

- [ ] Lambda@EdgeとCloudFront Functionsの使い分けができる
- [ ] Lambda@Edgeの4つの実行ポイントを説明できる
- [ ] Lambda@Edgeの制限事項を暗記している

<details>
<summary>📝 模範解答を見る</summary>

**使い分け指針**:
- CloudFront Functions: 軽量・高速処理（URLリライト、ヘッダー操作、簡単な認証）
- Lambda@Edge: 複雑な処理（外部API呼出し、画像変換、SSR、オリジン選択）

**4つの実行ポイント**:
1. Viewer Request: クライアント→CloudFront（認証、URLリライト）
2. Origin Request: CloudFront→オリジン（オリジン選択、カスタムヘッダー）
3. Origin Response: オリジン→CloudFront（レスポンス変換、画像最適化）
4. Viewer Response: CloudFront→クライアント（セキュリティヘッダー付与）

**Lambda@Edge 重要制限**:
- us-east-1 でのみ作成可能
- 環境変数使用不可
- Lambda Layers使用不可
- VPC、DLQ、Provisioned Concurrency使用不可
- コンテナイメージ使用不可
- arm64使用不可
- $LATESTやエイリアス指定不可（発行済みバージョン番号必須）
- 削除にはCloudFront関連解除後のレプリカ削除完了待ちが必要
</details>

### コンテナイメージ

- [ ] ZIPパッケージとコンテナイメージの使い分けができる
- [ ] AWS提供ベースイメージとカスタムイメージの違いを理解している
- [ ] コンテナイメージ関数の作成手順を説明できる

<details>
<summary>📝 模範解答を見る</summary>

**使い分け**:
- ZIP (50MB/250MB制限): 標準ランタイム、小規模関数、Layers活用
- コンテナイメージ (10GB制限): 大規模依存関係、ML推論、カスタムOS、既存コンテナCI/CD

**ベースイメージの種類**:
- AWS提供: `public.ecr.aws/lambda/python:3.12` - Runtime Interface Client内蔵
- カスタム: 任意のベースイメージ + `awslambdaric` パッケージを手動インストール

**作成手順**:
1. Dockerfileを作成（AWS提供ベースイメージ or カスタム + RIC）
2. `docker build` でビルド
3. ECRリポジトリを作成
4. `docker push` でECRにプッシュ
5. `aws lambda create-function --package-type Image` で関数作成

**注意点**:
- コンテナイメージのLambdaではLayersは使用不可
- ECRのイメージはLambdaと同一リージョン・同一アカウント必須
- クロスアカウントECRイメージは不可
</details>

### 環境変数とシークレット管理

- [ ] Lambda環境変数のKMS暗号化レベル（3段階）を説明できる
- [ ] SSM Parameter StoreとSecrets Managerの使い分けができる
- [ ] Lambda Extensions によるパラメータキャッシュの利点を理解している

<details>
<summary>📝 模範解答を見る</summary>

**KMS暗号化の3段階**:
1. デフォルト: AWS管理キー (`aws/lambda`) で保存時暗号化。追加設定不要
2. CMK指定: カスタマー管理キーで保存時暗号化。`--kms-key-arn` で指定
3. 転送時暗号化ヘルパー: コード内でKMS Decrypt APIを呼出し、環境変数を暗号文のまま保持

**SSM vs Secrets Manager**:
| 項目 | SSM Parameter Store | Secrets Manager |
|------|-------------------|-----------------|
| 料金 | Standard無料 | $0.40/月 |
| 自動ローテーション | なし | Lambda連携であり |
| クロスアカウント | なし | リソースポリシーであり |
| サイズ | 8KB | 64KB |
| ユースケース | 設定値全般 | DB認証情報、APIキー |

**Lambda Extensionsのパラメータキャッシュ**:
- AWS Parameters and Secrets Lambda Extension を使用
- localhost:2773 経由でHTTPアクセス
- ローカルキャッシュによりAPI呼出し回数を大幅削減
- TTLベースで自動更新
- ランタイム非依存（Python, Node.js, Java等すべてで利用可能）

**ベストプラクティス**:
- INITフェーズ（ハンドラ外）でパラメータを取得しグローバル変数にキャッシュ
- Warm Start時にはキャッシュ値を再利用（API呼出し不要）
- 長時間稼働する関数ではTTLを設定して定期的にリフレッシュ
</details>

---

## 付録A: よく使うCLIコマンド

```bash
# ── 関数操作 ──
aws lambda create-function --function-name NAME --runtime python3.12 ...
aws lambda update-function-code --function-name NAME --zip-file fileb://code.zip
aws lambda update-function-configuration --function-name NAME --timeout 30
aws lambda invoke --function-name NAME output.json
aws lambda delete-function --function-name NAME
aws lambda list-functions

# ── バージョン/エイリアス ──
aws lambda publish-version --function-name NAME
aws lambda list-versions-by-function --function-name NAME
aws lambda create-alias --function-name NAME --name ALIAS --function-version VER
aws lambda update-alias --function-name NAME --name ALIAS --function-version VER
aws lambda update-alias --function-name NAME --name ALIAS --routing-config '{...}'

# ── 同時実行 ──
aws lambda put-function-concurrency --function-name NAME --reserved-concurrent-executions N
aws lambda put-provisioned-concurrency-config --function-name NAME --qualifier ALIAS --provisioned-concurrent-executions N
aws lambda get-account-settings

# ── Layers ──
aws lambda publish-layer-version --layer-name NAME --zip-file fileb://layer.zip ...
aws lambda update-function-configuration --function-name NAME --layers LAYER_ARN
aws lambda list-layers

# ── Destinations / DLQ ──
aws lambda put-function-event-invoke-config --function-name NAME --destination-config '{...}'
aws lambda update-function-configuration --function-name NAME --dead-letter-config '{...}'

# ── 環境変数 ──
aws lambda update-function-configuration --function-name NAME --environment '{"Variables":{...}}'
aws lambda get-function-configuration --function-name NAME --query "Environment"
```

## 付録B: DOP試験頻出シナリオ

| シナリオ | 正解パターン |
|---------|------------|
| Lambda関数の段階的デプロイ | SAM AutoPublishAlias + DeploymentPreference (Canary/Linear) |
| Cold Start排除 | Provisioned Concurrency + Application Auto Scaling |
| Lambda関数の無効化 | Reserved Concurrency = 0 |
| 非同期呼出しのエラーハンドリング | Destinations (OnFailure) ※DLQより推奨 |
| SQSトリガーの失敗ハンドリング | SQS側のリドライブポリシー（DLQ） |
| 大規模MLモデルのデプロイ | コンテナイメージ (最大10GB) |
| 共有ライブラリの管理 | Lambda Layers |
| CloudFrontでのURL書換え | CloudFront Functions（軽量処理） |
| CloudFrontでのオリジン選択 | Lambda@Edge（Origin Request） |
| 機密情報の管理（DB認証） | Secrets Manager + INITフェーズでキャッシュ |
| 設定値の外部管理 | SSM Parameter Store + Lambda Extension |
| クロスアカウントLambda呼出し | リソースベースポリシーで許可 |

---

**作成日**: 2026-02-04
**最終更新**: 2026-02-04
**検証環境**: AWS ap-northeast-1 リージョン
