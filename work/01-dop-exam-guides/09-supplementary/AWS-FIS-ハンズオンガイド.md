# AWS Fault Injection Simulator (FIS) ハンズオンガイド

> **対象**: AWS DevOps Professional (DOP-C02) 試験対策
> **前提知識**: AWS基礎、EC2、ECS、RDS、CloudWatch
> **所要時間**: 約2.5時間

---

## 目次

1. [FIS概要とカオスエンジニアリング](#1-fis概要とカオスエンジニアリング)
2. [実験テンプレートの構成](#2-実験テンプレートの構成)
3. [アクションカタログ](#3-アクションカタログ)
4. [ターゲット設定](#4-ターゲット設定)
5. [停止条件（ガードレール）](#5-停止条件ガードレール)
6. [AWSサービスとの統合](#6-awsサービスとの統合)
7. [GameDayと運用レジリエンス](#7-gamedayと運用レジリエンス)
8. [ハンズオン演習](#8-ハンズオン演習)
9. [DOP試験対策チェックリスト](#9-dop試験対策チェックリスト)

---

## 1. FIS概要とカオスエンジニアリング

### 1.1 FISとは

```
┌─────────────────────────────────────────────────────────────────────┐
│                 AWS Fault Injection Simulator (FIS)                  │
│            マネージドカオスエンジニアリングサービス                   │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                    実験ワークフロー                             │  │
│  │                                                               │  │
│  │  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐ │  │
│  │  │ 定常状態 │   │ 仮説設定 │   │ 実験実行 │   │ 結果分析 │ │  │
│  │  │ 把握     │──▶│          │──▶│          │──▶│          │ │  │
│  │  │          │   │ 「○○が  │   │ 障害注入 │   │ 仮説検証 │ │  │
│  │  │ メトリクス│   │  起きても│   │ モニタリング│  │ 改善点   │ │  │
│  │  │ 正常値   │   │  復旧する│   │ 停止条件 │   │ 特定     │ │  │
│  │  │ 確認     │   │  はず」  │   │ 監視     │   │          │ │  │
│  │  └──────────┘   └──────────┘   └──────────┘   └──────────┘ │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  カオスエンジニアリングの5原則:                                     │
│  1. 定常状態の仮説を立てる                                         │
│  2. 実世界のイベントを反映する                                     │
│  3. 本番環境で実験する                                             │
│  4. 継続的に実験を自動化する                                       │
│  5. 爆発半径（Blast Radius）を最小化する                           │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.2 DOP試験での重要ポイント

| トピック | 重要度 | 出題パターン |
|---------|--------|-------------|
| **実験テンプレート構成** | ★★★★★ | アクション、ターゲット、停止条件 |
| **停止条件** | ★★★★★ | CloudWatchアラームによる自動停止 |
| **爆発半径の制御** | ★★★★★ | タグ/パーセンテージによるターゲット絞込 |
| **EC2障害注入** | ★★★★☆ | インスタンス停止/終了/リブート |
| **ネットワーク障害** | ★★★★☆ | レイテンシ追加、接続断 |
| **RDSフェイルオーバー** | ★★★★☆ | Multi-AZフェイルオーバーテスト |
| **IAMロール** | ★★★★☆ | FIS実行に必要な権限 |
| **GameDay** | ★★★☆☆ | 組織的なレジリエンステスト |

---

## 2. 実験テンプレートの構成

### 2.1 テンプレート構造

```
┌─────────────────────────────────────────────────────────────────────┐
│                    FIS 実験テンプレート                               │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ 説明 (Description)                                            │  │
│  │ 実験の目的と期待される結果                                    │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ アクション (Actions)                                          │  │
│  │                                                               │  │
│  │ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐            │  │
│  │ │ Action 1    │ │ Action 2    │ │ Action 3    │            │  │
│  │ │ EC2停止     │─▶│ 待機(5分)   │─▶│ EC2起動     │            │  │
│  │ │             │ │             │ │             │            │  │
│  │ │ startAfter: │ │ startAfter: │ │ startAfter: │            │  │
│  │ │ (なし=即時) │ │ Action1     │ │ Action2     │            │  │
│  │ └─────────────┘ └─────────────┘ └─────────────┘            │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ ターゲット (Targets)                                          │  │
│  │                                                               │  │
│  │ ・リソースタグ: {"Environment": "Test"}                       │  │
│  │ ・リソースARN: 直接指定                                      │  │
│  │ ・リソースフィルタ: 状態、AZ等                                │  │
│  │ ・選択モード: ALL / COUNT(n) / PERCENT(n%)                    │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ 停止条件 (Stop Conditions)                                    │  │
│  │                                                               │  │
│  │ ・CloudWatchアラーム（ALARM状態で実験停止）                   │  │
│  │ ・複数アラーム設定可能                                       │  │
│  │ ・ガードレールとして機能                                     │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ IAMロール (Role ARN)                                          │  │
│  │                                                               │  │
│  │ FISがリソースを操作するための実行ロール                       │  │
│  │ → 必要なアクション権限 + fis:* 権限                          │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 アクションの実行順序

```
【並列・直列実行の制御】

■ 直列実行（startAfter指定）:
  Action1 ──▶ Action2 ──▶ Action3

■ 並列実行（startAfter未指定/同一開始点）:
  ┌── Action1
  ├── Action2  （同時開始）
  └── Action3

■ 混合パターン:
  Action1 ──▶ Action2
              Action3  （Action1完了後にAction2とAction3が並列）

  startAfter設定:
  Action2.startAfter = ["Action1"]
  Action3.startAfter = ["Action1"]
```

---

## 3. アクションカタログ

### 3.1 EC2アクション

| アクション | 説明 | ユースケース |
|-----------|------|-------------|
| `aws:ec2:stop-instances` | インスタンス停止 | AZ障害シミュレーション |
| `aws:ec2:terminate-instances` | インスタンス終了 | Auto Scaling復旧テスト |
| `aws:ec2:reboot-instances` | インスタンス再起動 | 再起動耐性テスト |
| `aws:ec2:send-spot-instance-interruptions` | スポット中断通知 | スポット中断ハンドリングテスト |

### 3.2 ECS/EKSアクション

| アクション | 説明 | ユースケース |
|-----------|------|-------------|
| `aws:ecs:stop-task` | タスク停止 | タスク再起動テスト |
| `aws:ecs:drain-container-instances` | コンテナインスタンスドレイン | メンテナンスシミュレーション |
| `aws:eks:terminate-nodegroup-instances` | ノード終了 | ノード障害テスト |

### 3.3 RDSアクション

| アクション | 説明 | ユースケース |
|-----------|------|-------------|
| `aws:rds:failover-db-cluster` | クラスターフェイルオーバー | Multi-AZ/Aurora DR テスト |
| `aws:rds:reboot-db-instances` | インスタンス再起動 | 再起動影響テスト |

### 3.4 ネットワークアクション

| アクション | 説明 | ユースケース |
|-----------|------|-------------|
| `aws:network:disrupt-connectivity` | 接続中断 | AZ間/インターネット接続断テスト |
| `aws:network:route-table-disrupt-cross-region-connectivity` | クロスリージョン接続断 | リージョン間障害テスト |

### 3.5 SSMアクション

| アクション | 説明 | ユースケース |
|-----------|------|-------------|
| `aws:ssm:send-command` | SSMコマンド実行 | CPU負荷、メモリ圧迫、プロセス停止等 |
| `aws:ssm:start-automation-execution` | SSM Automation実行 | 複雑な障害シナリオ |

### 3.6 その他のアクション

| アクション | 説明 |
|-----------|------|
| `aws:fis:wait` | 指定時間待機 |
| `aws:fis:inject-api-internal-error` | AWS API内部エラー注入 |
| `aws:fis:inject-api-throttle-error` | AWS APIスロットリング注入 |
| `aws:fis:inject-api-unavailable-error` | AWS APIサービス利用不可注入 |

---

## 4. ターゲット設定

### 4.1 ターゲット選択方法

```
【ターゲット選択の階層】

1. リソースタイプの指定
   例: aws:ec2:instance, aws:ecs:task, aws:rds:db-cluster

2. リソースの絞り込み
   ┌──────────────────────────────────────────────┐
   │ 方法A: タグによる選択                         │
   │   {"Environment": "Test", "Team": "Alpha"}   │
   │                                              │
   │ 方法B: ARN直接指定                            │
   │   ["arn:aws:ec2:...:instance/i-1234"]        │
   │                                              │
   │ 方法C: フィルタ                               │
   │   - AZ: ap-northeast-1a                      │
   │   - 状態: running                            │
   │   - VPC: vpc-xxxx                            │
   └──────────────────────────────────────────────┘

3. 選択モード（爆発半径の制御）
   ┌──────────────────────────────────────────────┐
   │ ALL       : 全リソースが対象                  │
   │ COUNT(n)  : ランダムにn個選択                 │
   │ PERCENT(n): ランダムにn%選択                  │
   └──────────────────────────────────────────────┘
```

### 4.2 爆発半径の制御パターン

```
【段階的な爆発半径拡大】

Phase 1: 開発環境
  ターゲット: Tag=Environment:Dev, 選択: ALL
  → 開発環境全体で検証

Phase 2: ステージング（限定的）
  ターゲット: Tag=Environment:Staging, 選択: PERCENT(25)
  → ステージング環境の25%のみ

Phase 3: 本番（最小限）
  ターゲット: Tag=Environment:Prod, AZ=ap-northeast-1a, 選択: COUNT(1)
  → 本番環境の特定AZの1インスタンスのみ

Phase 4: 本番（拡大）
  ターゲット: Tag=Environment:Prod, 選択: PERCENT(33)
  → 本番環境の33%（1AZ相当）
```

---

## 5. 停止条件（ガードレール）

### 5.1 停止条件の仕組み

```
【停止条件のフロー】

FIS実験実行中
    │
    │  定期的にチェック
    ▼
┌──────────────────────────┐
│ CloudWatch Alarm 1       │── ALARM ──▶ 実験即時停止
│ (エラーレート > 5%)      │            ロールバック開始
└──────────────────────────┘
┌──────────────────────────┐
│ CloudWatch Alarm 2       │── ALARM ──▶ 実験即時停止
│ (レイテンシ > 3秒)       │            ロールバック開始
└──────────────────────────┘
┌──────────────────────────┐
│ CloudWatch Alarm 3       │── ALARM ──▶ 実験即時停止
│ (CPU > 90%)              │            ロールバック開始
└──────────────────────────┘

※ いずれか1つのアラームがALARM状態になると実験停止
※ FISアクションの中断 + リソースの復旧（可能な場合）
```

### 5.2 推奨アラーム設計

```
推奨される停止条件アラーム:

1. アプリケーションレベル
   - HTTPエラーレート（5XX > 5%）
   - レスポンスタイム（p99 > SLA値）
   - リクエスト成功率（< 99%）

2. インフラレベル
   - CPU使用率（> 90%）
   - メモリ使用率（> 90%）
   - ディスク使用率（> 85%）

3. ビジネスレベル
   - トランザクション成功率（< 目標値）
   - キュー深度（> 閾値）
```

---

## 6. AWSサービスとの統合

### 6.1 統合アーキテクチャ

```
┌─────────────────────────────────────────────────────────────────────┐
│                   FIS 統合エコシステム                                │
│                                                                     │
│  実験対象:                                                          │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐          │
│  │ EC2  │ │ ECS  │ │ EKS  │ │ RDS  │ │Network│ │ SSM  │          │
│  └──┬───┘ └──┬───┘ └──┬───┘ └──┬───┘ └──┬───┘ └──┬───┘          │
│     │        │        │        │        │        │               │
│     └────────┴────────┴────┬───┴────────┴────────┘               │
│                            │                                      │
│                      ┌─────▼─────┐                                │
│                      │    FIS    │                                │
│                      └─────┬─────┘                                │
│                            │                                      │
│  モニタリング:             │                                      │
│  ┌──────────┐  ┌──────────▼───────┐  ┌──────────┐              │
│  │CloudWatch│◀─│  実験ログ/結果   │──▶│EventBridge│              │
│  │ Alarms   │  │                  │  │          │              │
│  │(停止条件)│  │  CloudWatch Logs │  │ 実験状態 │              │
│  └──────────┘  └──────────────────┘  │ 変更通知 │              │
│                                      └──────────┘              │
│  自動化:                                                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                     │
│  │ Systems  │  │  Step    │  │ CodePipe │                     │
│  │ Manager  │  │ Functions│  │ line     │                     │
│  │(カスタム │  │(ワーク   │  │(CI/CD    │                     │
│  │ 障害)    │  │ フロー)  │  │ 統合)    │                     │
│  └──────────┘  └──────────┘  └──────────┘                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 6.2 CI/CDパイプライン統合

```
【FIS + CodePipeline 統合パターン】

┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
│ Source   │─▶│  Build   │─▶│  Deploy  │─▶│  FIS     │─▶│  Prod    │
│          │  │          │  │ (Staging)│  │ 実験     │  │  Deploy  │
│ CodeCommit│  │CodeBuild │  │          │  │          │  │          │
│          │  │          │  │          │  │ 合格→次  │  │          │
│          │  │          │  │          │  │ 失敗→停止│  │          │
└──────────┘  └──────────┘  └──────────┘  └──────────┘  └──────────┘

FISステージ:
- Lambda関数でFIS実験を開始
- 実験完了を待機
- 結果に応じてパイプライン継続/停止
```

---

## 7. GameDayと運用レジリエンス

### 7.1 GameDayの概要

```
【GameDay プランニング】

1. 目的設定
   ・DR手順の検証
   ・ランブック（手順書）の有効性確認
   ・チーム間のコミュニケーション検証
   ・監視・アラートの網羅性確認

2. シナリオ設計
   ・AZ障害: EC2停止 + RDSフェイルオーバー
   ・リージョン障害: Route 53フェイルオーバー
   ・アプリケーション障害: プロセス停止、メモリリーク
   ・セキュリティインシデント: APIキー漏洩

3. 実施フロー
   事前準備 → FIS実験実行 → チーム対応 → 振り返り → 改善

4. 指標
   ・MTTR（平均復旧時間）
   ・検知から対応開始までの時間
   ・ランブックの完了率
   ・エスカレーションの適切さ
```

---

## 8. ハンズオン演習

### 演習1: FIS用IAMロール作成

```bash
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

# FIS実行用IAMロール作成
aws iam create-role \
  --role-name "FISExperimentRole" \
  --assume-role-policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Principal": {"Service": "fis.amazonaws.com"},
      "Action": "sts:AssumeRole"
    }]
  }'

# EC2操作権限の付与
aws iam put-role-policy \
  --role-name "FISExperimentRole" \
  --policy-name "fis-ec2-policy" \
  --policy-document '{
    "Version": "2012-10-17",
    "Statement": [
      {
        "Effect": "Allow",
        "Action": [
          "ec2:StopInstances",
          "ec2:StartInstances",
          "ec2:TerminateInstances",
          "ec2:RebootInstances",
          "ec2:DescribeInstances"
        ],
        "Resource": "*",
        "Condition": {
          "StringEquals": {
            "ec2:ResourceTag/Environment": "Test"
          }
        }
      },
      {
        "Effect": "Allow",
        "Action": [
          "ec2:DescribeInstances"
        ],
        "Resource": "*"
      },
      {
        "Effect": "Allow",
        "Action": [
          "cloudwatch:DescribeAlarms"
        ],
        "Resource": "*"
      }
    ]
  }'
```

### 演習2: 実験テンプレート作成（EC2停止）

```bash
# 実験テンプレート作成
TEMPLATE_ID=$(aws fis create-experiment-template \
  --description "EC2インスタンス停止テスト - Auto Scaling復旧確認" \
  --role-arn "arn:aws:iam::${ACCOUNT_ID}:role/FISExperimentRole" \
  --actions '{
    "StopInstances": {
      "actionId": "aws:ec2:stop-instances",
      "parameters": {
        "startInstancesAfterDuration": "PT5M"
      },
      "targets": {
        "Instances": "TestInstances"
      }
    }
  }' \
  --targets '{
    "TestInstances": {
      "resourceType": "aws:ec2:instance",
      "resourceTags": {"Environment": "Test"},
      "selectionMode": "COUNT(1)",
      "filters": [
        {"path": "State.Name", "values": ["running"]}
      ]
    }
  }' \
  --stop-conditions '[
    {
      "source": "aws:cloudwatch:alarm",
      "value": "arn:aws:cloudwatch:'$(aws configure get region)':'${ACCOUNT_ID}':alarm:HighErrorRate"
    }
  ]' \
  --tags '{"Project": "DOP-Handson"}' \
  --query 'experimentTemplate.id' \
  --output text)

echo "Template ID: ${TEMPLATE_ID}"
```

### 演習3: 停止条件用CloudWatchアラーム作成

```bash
# 停止条件用アラーム作成
aws cloudwatch put-metric-alarm \
  --alarm-name "HighErrorRate" \
  --alarm-description "FIS停止条件: エラーレートが5%を超えた場合" \
  --metric-name "5XXError" \
  --namespace "AWS/ApplicationELB" \
  --statistic Sum \
  --period 60 \
  --threshold 5 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 1 \
  --treat-missing-data notBreaching

# アラーム確認
aws cloudwatch describe-alarms \
  --alarm-names "HighErrorRate" \
  --query 'MetricAlarms[].{Name:AlarmName,State:StateValue}'
```

### 演習4: 実験テンプレートの確認と一覧

```bash
# テンプレート一覧
aws fis list-experiment-templates \
  --query 'experimentTemplates[].{Id:id,Description:description,Tags:tags}'

# テンプレート詳細
aws fis get-experiment-template \
  --id ${TEMPLATE_ID}

# 実験一覧（過去の実行）
aws fis list-experiments \
  --query 'experiments[].{Id:id,Template:experimentTemplateId,State:state.status,Created:creationTime}'
```

### 演習5: 実験の実行（テスト環境のみ）

```bash
# ⚠️ 注意: 実際にリソースに影響するため、テスト環境でのみ実行

# 実験開始
EXPERIMENT_ID=$(aws fis start-experiment \
  --experiment-template-id ${TEMPLATE_ID} \
  --query 'experiment.id' \
  --output text)

echo "Experiment ID: ${EXPERIMENT_ID}"

# 実験状態の監視
aws fis get-experiment \
  --id ${EXPERIMENT_ID} \
  --query 'experiment.{Id:id,State:state.status,Actions:actions}'

# 実験の手動停止（緊急時）
aws fis stop-experiment --id ${EXPERIMENT_ID}
```

### 演習6: ネットワーク障害テンプレート

```bash
# AZ障害シミュレーション（ネットワーク中断）
aws fis create-experiment-template \
  --description "AZ-a ネットワーク中断テスト" \
  --role-arn "arn:aws:iam::${ACCOUNT_ID}:role/FISExperimentRole" \
  --actions '{
    "DisruptAZ": {
      "actionId": "aws:network:disrupt-connectivity",
      "parameters": {
        "duration": "PT5M",
        "scope": "availability-zone"
      },
      "targets": {
        "Subnets": "TestSubnets"
      }
    }
  }' \
  --targets '{
    "TestSubnets": {
      "resourceType": "aws:ec2:subnet",
      "resourceTags": {"Environment": "Test"},
      "selectionMode": "ALL",
      "filters": [
        {"path": "AvailabilityZone", "values": ["ap-northeast-1a"]}
      ]
    }
  }' \
  --stop-conditions '[
    {
      "source": "aws:cloudwatch:alarm",
      "value": "arn:aws:cloudwatch:'$(aws configure get region)':'${ACCOUNT_ID}':alarm:HighErrorRate"
    }
  ]' \
  --tags '{"Project": "DOP-Handson", "Type": "Network"}'
```

### クリーンアップ

```bash
# 実験テンプレート削除
aws fis delete-experiment-template --id ${TEMPLATE_ID}

# CloudWatchアラーム削除
aws cloudwatch delete-alarms --alarm-names "HighErrorRate"

# IAMロール削除
aws iam delete-role-policy --role-name FISExperimentRole --policy-name fis-ec2-policy
aws iam delete-role --role-name FISExperimentRole
```

---

## 9. DOP試験対策チェックリスト

### Q1: FISの基本概念
**Q: AWS FISとは何か？カオスエンジニアリングの目的は？**

<details><summary>模範解答</summary>

FISはAWSのマネージドカオスエンジニアリングサービス。制御された障害を注入してシステムのレジリエンスをテストする。カオスエンジニアリングの目的: ①本番環境で発生しうる障害を事前に発見 ②DR手順やランブックの有効性検証 ③監視・アラートの網羅性確認 ④チームの障害対応能力向上。FISは爆発半径の制御（タグ、パーセンテージ選択）と停止条件（CloudWatchアラーム）で安全に実験を実施できる。

</details>

### Q2: 実験テンプレート
**Q: FIS実験テンプレートの主要コンポーネントは？**

<details><summary>模範解答</summary>

4つの主要コンポーネント: ①アクション - 障害の種類（EC2停止、RDSフェイルオーバー、ネットワーク中断等）と実行順序（startAfterで直列/並列制御）②ターゲット - 対象リソース（タグ、ARN、フィルタで選択）と選択モード（ALL/COUNT/PERCENT）③停止条件 - CloudWatchアラームによるガードレール。ALARM状態で実験自動停止 ④IAMロール - FISがリソースを操作するための実行権限。最小権限の原則に基づきターゲットリソースのみ操作可能にする。

</details>

### Q3: 停止条件
**Q: FIS実験の停止条件はどのように設計すべきか？**

<details><summary>模範解答</summary>

停止条件にはCloudWatchアラームを使用する。推奨設計: ①アプリケーションレベル - HTTPエラーレート（5XX > 閾値）、レスポンスタイム（p99 > SLA値）②インフラレベル - CPU/メモリ使用率（> 90%）③ビジネスレベル - トランザクション成功率（< 目標値）。複数アラームの設定を推奨し、いずれか1つがALARM状態になれば実験が即停止する。アラームはexperiment開始前にOK状態であることを確認する。treat-missing-dataはnotBreachingに設定して誤停止を防ぐ。

</details>

### Q4: 爆発半径の制御
**Q: FIS実験で爆発半径（Blast Radius）を最小化するアプローチは？**

<details><summary>模範解答</summary>

①ターゲット選択: タグで環境を限定（Environment=Test）、AZフィルタで範囲限定、PERCENT/COUNTモードで対象数を制限。②段階的拡大: Dev→Staging→Prod(限定)→Prod(拡大)の順で実施。③停止条件: CloudWatchアラームで異常検知時に即停止。④時間制限: アクションのdurationパラメータで障害注入時間を制限。⑤IAMロール: タグ条件付きポリシーで操作可能なリソースを限定。⑥実験はまず非本番環境で十分に検証してから本番に適用。

</details>

### Q5: EC2障害テスト
**Q: Auto Scaling Groupのレジリエンスを検証するFIS実験を設計するには？**

<details><summary>模範解答</summary>

アクション: aws:ec2:terminate-instancesでASG内のインスタンスを終了。ターゲット: ASGのタグで選択、PERCENT(33)で約1/3のインスタンスを対象。停止条件: ALBのHTTPCodeTarget5XXCountアラーム、HealthyHostCountアラーム。検証項目: ①ASGが新インスタンスを自動起動するか ②ヘルスチェックが正常に機能するか ③ALBが不健全インスタンスを自動除外するか ④サービス全体のエラーレートとレイテンシの影響範囲。startInstancesAfterDurationは設定せず、ASGの自動復旧に依存する。

</details>

### Q6: RDSフェイルオーバーテスト
**Q: RDS Multi-AZのフェイルオーバーをFISでテストする際の考慮事項は？**

<details><summary>模範解答</summary>

アクション: aws:rds:failover-db-cluster（Aurora）またはaws:rds:reboot-db-instances（RDS）。考慮事項: ①フェイルオーバー中の接続断（60-120秒/RDS、35秒/Aurora）②アプリケーションの接続リトライロジック検証 ③DNS CNAMEの伝播時間 ④コネクションプールの再接続動作 ⑤トランザクション中断時のロールバック処理。停止条件: アプリケーションのエラーレートとデータベース接続エラー数。フェイルオーバー後の読み書き確認まで含めて検証すべき。

</details>

### Q7: ネットワーク障害
**Q: FISでAZ障害をシミュレーションするには？**

<details><summary>模範解答</summary>

aws:network:disrupt-connectivityアクションでAZレベルのネットワーク中断を実施。scope: availability-zoneを指定し、対象AZのサブネットをターゲットにする。検証項目: ①Multi-AZ構成のフェイルオーバー動作 ②ALBのクロスゾーンロードバランシング ③Auto Scalingの別AZでのインスタンス起動 ④Route 53ヘルスチェックの動作。EC2停止+ネットワーク中断を組み合わせることで、より現実的なAZ障害シナリオを再現できる。クロスリージョン接続断にはroute-table-disrupt-cross-region-connectivityを使用。

</details>

### Q8: CI/CD統合
**Q: FIS実験をCI/CDパイプラインに組み込むアーキテクチャは？**

<details><summary>模範解答</summary>

CodePipelineのステージにFIS実験を追加。Deploy(Staging)→FIS実験→Deploy(Prod)の順。FISステージはLambda関数で実装: ①start-experimentでFIS実験開始 ②get-experimentで結果をポーリング ③成功→パイプライン続行、失敗→パイプライン停止。あるいはStep Functionsで実験フローを管理し、EventBridgeで実験完了イベントをキャッチしてパイプラインを制御。これにより「ステージング環境でのレジリエンステストに合格した場合のみ本番デプロイ」を自動化できる。

</details>
