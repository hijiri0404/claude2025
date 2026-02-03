# AWS ECS/ECR ハンズオンガイド

> **対象**: AWS DevOps Professional (DOP-C02) 試験対策
> **前提知識**: Docker基礎、AWS基本、ネットワーク基礎
> **所要時間**: 約3-4時間

---

## 目次

1. [ECS/ECR概要](#1-ecsecr概要)
2. [Amazon ECR（コンテナレジストリ）](#2-amazon-ecrコンテナレジストリ)
3. [Amazon ECS アーキテクチャ](#3-amazon-ecs-アーキテクチャ)
4. [タスク定義（Task Definition）](#4-タスク定義task-definition)
5. [サービス（Service）](#5-サービスservice)
6. [デプロイ戦略](#6-デプロイ戦略)
7. [CI/CD パイプライン](#7-cicd-パイプライン)
8. [監視とログ](#8-監視とログ)
9. [ハンズオン演習](#9-ハンズオン演習)
10. [DOP試験対策チェックリスト](#10-dop試験対策チェックリスト)

---

## 1. ECS/ECR概要

### 1.1 サービス概要

```
┌─────────────────────────────────────────────────────────────────────┐
│                    AWS コンテナサービス                              │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐│
│  │                     Amazon ECR                                  ││
│  │              (Elastic Container Registry)                       ││
│  │                                                                 ││
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        ││
│  │  │  Private     │  │   Public     │  │   Image      │        ││
│  │  │  Registry    │  │   Gallery    │  │   Scanning   │        ││
│  │  └──────────────┘  └──────────────┘  └──────────────┘        ││
│  └────────────────────────────────────────────────────────────────┘│
│                              │                                      │
│                              ▼                                      │
│  ┌────────────────────────────────────────────────────────────────┐│
│  │                     Amazon ECS                                  ││
│  │              (Elastic Container Service)                        ││
│  │                                                                 ││
│  │  ┌──────────────────────────────────────────────────────────┐ ││
│  │  │                   クラスター                              │ ││
│  │  │                                                          │ ││
│  │  │  ┌─────────────┐          ┌─────────────┐              │ ││
│  │  │  │  EC2 起動   │    or    │  Fargate    │              │ ││
│  │  │  │  タイプ     │          │  起動タイプ  │              │ ││
│  │  │  └─────────────┘          └─────────────┘              │ ││
│  │  │                                                          │ ││
│  │  │  ┌──────────────────────────────────────────────────┐  │ ││
│  │  │  │  サービス / タスク                               │  │ ││
│  │  │  │  ├─ タスク定義                                   │  │ ││
│  │  │  │  ├─ デプロイ設定                                 │  │ ││
│  │  │  │  └─ Auto Scaling                                 │  │ ││
│  │  │  └──────────────────────────────────────────────────┘  │ ││
│  │  └──────────────────────────────────────────────────────────┘ ││
│  └────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────┘
```

### 1.2 EC2 vs Fargate

| 項目 | EC2 起動タイプ | Fargate |
|-----|---------------|---------|
| **インフラ管理** | ユーザー責任 | AWS管理 |
| **スケーリング** | インスタンス + タスク | タスクのみ |
| **料金** | EC2インスタンス料金 | vCPU + メモリ課金 |
| **カスタマイズ** | 高（GPU, 特定インスタンス） | 制限あり |
| **セキュリティ** | ホストOS管理が必要 | 分離されたタスク |
| **ユースケース** | 大規模/コスト最適化 | 運用負荷軽減 |

### 1.3 DOP試験での重要度

| トピック | 重要度 | 出題傾向 |
|---------|--------|---------|
| タスク定義 | ★★★★★ | 設定オプション、IAMロール |
| デプロイ戦略 | ★★★★★ | ローリング、Blue/Green |
| CI/CD連携 | ★★★★★ | CodePipeline、CodeDeploy |
| Auto Scaling | ★★★★☆ | ターゲット追跡、ステップ |
| ECRセキュリティ | ★★★★☆ | イメージスキャン、IAM |
| Fargate | ★★★★☆ | プラットフォームバージョン |

---

## 2. Amazon ECR（コンテナレジストリ）

### 2.1 ECRの基本構造

```
【ECR 構造】

AWS Account
└─ Region (ap-northeast-1)
    └─ ECR Registry
        ├─ Repository: my-app
        │   ├─ Image: my-app:v1.0.0
        │   ├─ Image: my-app:v1.1.0
        │   └─ Image: my-app:latest
        │
        ├─ Repository: api-server
        │   ├─ Image: api-server:prod
        │   └─ Image: api-server:staging
        │
        └─ Repository: worker
            └─ Image: worker:latest

URI形式: {account}.dkr.ecr.{region}.amazonaws.com/{repository}:{tag}
例: 123456789012.dkr.ecr.ap-northeast-1.amazonaws.com/my-app:v1.0.0
```

### 2.2 イメージのプッシュ

```bash
# 1. ECR認証
aws ecr get-login-password --region ap-northeast-1 | \
  docker login --username AWS --password-stdin \
  123456789012.dkr.ecr.ap-northeast-1.amazonaws.com

# 2. リポジトリ作成
aws ecr create-repository \
  --repository-name my-app \
  --image-scanning-configuration scanOnPush=true \
  --encryption-configuration encryptionType=AES256

# 3. イメージのビルドとタグ付け
docker build -t my-app:v1.0.0 .
docker tag my-app:v1.0.0 \
  123456789012.dkr.ecr.ap-northeast-1.amazonaws.com/my-app:v1.0.0

# 4. プッシュ
docker push 123456789012.dkr.ecr.ap-northeast-1.amazonaws.com/my-app:v1.0.0
```

### 2.3 ライフサイクルポリシー

```json
// lifecycle-policy.json
{
  "rules": [
    {
      "rulePriority": 1,
      "description": "最新の10イメージを保持",
      "selection": {
        "tagStatus": "any",
        "countType": "imageCountMoreThan",
        "countNumber": 10
      },
      "action": {
        "type": "expire"
      }
    },
    {
      "rulePriority": 2,
      "description": "未タグイメージを14日後に削除",
      "selection": {
        "tagStatus": "untagged",
        "countType": "sinceImagePushed",
        "countUnit": "days",
        "countNumber": 14
      },
      "action": {
        "type": "expire"
      }
    }
  ]
}
```

```bash
# ライフサイクルポリシーの設定
aws ecr put-lifecycle-policy \
  --repository-name my-app \
  --lifecycle-policy-text file://lifecycle-policy.json
```

### 2.4 イメージスキャン

```
【イメージスキャンの種類】

┌─────────────────────────────────────────────────────────────┐
│                    ECR Image Scanning                        │
├─────────────────────────────┬───────────────────────────────┤
│      Basic Scanning         │     Enhanced Scanning         │
│       (基本スキャン)         │      (拡張スキャン)           │
├─────────────────────────────┼───────────────────────────────┤
│ • 無料                       │ • Inspector連携 (有料)       │
│ • プッシュ時/手動            │ • 継続的スキャン             │
│ • OS脆弱性のみ               │ • OS + 言語パッケージ        │
│ • CVEベース                  │ • リアルタイム検出           │
└─────────────────────────────┴───────────────────────────────┘
```

```bash
# 手動スキャンの実行
aws ecr start-image-scan \
  --repository-name my-app \
  --image-id imageTag=v1.0.0

# スキャン結果の取得
aws ecr describe-image-scan-findings \
  --repository-name my-app \
  --image-id imageTag=v1.0.0
```

### 2.5 クロスリージョン・クロスアカウント

```
【ECR レプリケーション】

Source Region                  Target Region
(ap-northeast-1)               (us-east-1)
┌─────────────────┐           ┌─────────────────┐
│  my-app:v1.0.0  │ ────────▶ │  my-app:v1.0.0  │
│  (オリジナル)    │ 自動複製  │  (レプリカ)     │
└─────────────────┘           └─────────────────┘

Source Account                 Target Account
(111111111111)                 (222222222222)
┌─────────────────┐           ┌─────────────────┐
│  my-app:v1.0.0  │ ────────▶ │  my-app:v1.0.0  │
│  (オリジナル)    │ 自動複製  │  (レプリカ)     │
└─────────────────┘           └─────────────────┘
```

```bash
# レプリケーション設定
aws ecr put-replication-configuration \
  --replication-configuration '{
    "rules": [
      {
        "destinations": [
          {
            "region": "us-east-1",
            "registryId": "111111111111"
          }
        ],
        "repositoryFilters": [
          {
            "filter": "prod-",
            "filterType": "PREFIX_MATCH"
          }
        ]
      }
    ]
  }'
```

---

## 3. Amazon ECS アーキテクチャ

### 3.1 ECSクラスター構成

```
【ECS クラスターアーキテクチャ】

┌─────────────────────────────────────────────────────────────────────┐
│                         ECS Cluster                                  │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐│
│  │                    Capacity Providers                           ││
│  │                                                                 ││
│  │  ┌──────────────────┐  ┌──────────────────┐                   ││
│  │  │  FARGATE         │  │  FARGATE_SPOT    │                   ││
│  │  │  (オンデマンド)   │  │  (スポット)      │                   ││
│  │  └──────────────────┘  └──────────────────┘                   ││
│  │                                                                 ││
│  │  ┌──────────────────┐  ┌──────────────────┐                   ││
│  │  │  EC2 ASG         │  │  EC2 ASG (Spot)  │                   ││
│  │  │  Capacity        │  │  Capacity        │                   ││
│  │  │  Provider        │  │  Provider        │                   ││
│  │  └──────────────────┘  └──────────────────┘                   ││
│  └────────────────────────────────────────────────────────────────┘│
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐│
│  │                        Services                                 ││
│  │                                                                 ││
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐           ││
│  │  │   web-app   │  │  api-server │  │   worker    │           ││
│  │  │  Service    │  │  Service    │  │  Service    │           ││
│  │  │  (3 tasks)  │  │  (2 tasks)  │  │  (1 task)   │           ││
│  │  └─────────────┘  └─────────────┘  └─────────────┘           ││
│  └────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────┘
```

### 3.2 ネットワークモード

| モード | 説明 | ユースケース |
|--------|------|-------------|
| **awsvpc** | 各タスクに固有のENI | Fargate必須、推奨 |
| **bridge** | Docker bridge network | EC2、複数ポートマッピング |
| **host** | ホストネットワーク直接使用 | 高パフォーマンス要件 |
| **none** | ネットワークなし | バッチ処理 |

```
【awsvpc モードのアーキテクチャ】

┌─────────────────────────────────────────────────────────────┐
│                        VPC                                   │
│                                                              │
│  ┌───────────────────────────┐  ┌───────────────────────┐  │
│  │     Private Subnet        │  │    Private Subnet     │  │
│  │                           │  │                       │  │
│  │  ┌───────────────────┐   │  │  ┌─────────────────┐ │  │
│  │  │      Task 1       │   │  │  │     Task 2      │ │  │
│  │  │  ┌─────────────┐  │   │  │  │ ┌─────────────┐ │ │  │
│  │  │  │   ENI       │  │   │  │  │ │    ENI      │ │ │  │
│  │  │  │ 10.0.1.10   │  │   │  │  │ │ 10.0.2.20   │ │ │  │
│  │  │  └─────────────┘  │   │  │  │ └─────────────┘ │ │  │
│  │  │  Security Group   │   │  │  │ Security Group  │ │  │
│  │  └───────────────────┘   │  │  └─────────────────┘ │  │
│  └───────────────────────────┘  └───────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 3.3 IAMロールの種類

```
【ECS IAMロール構成】

┌─────────────────────────────────────────────────────────────┐
│                     IAM Roles for ECS                        │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Task Execution Role (タスク実行ロール)               │  │
│  │  - ECRからイメージプル                               │  │
│  │  - CloudWatch Logsへのログ送信                       │  │
│  │  - Secrets Manager/Parameter Storeからシークレット取得│  │
│  │                                                       │  │
│  │  信頼: ecs-tasks.amazonaws.com                       │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Task Role (タスクロール)                            │  │
│  │  - コンテナ内アプリケーションがAWSサービスにアクセス  │  │
│  │  - 例: S3バケットアクセス、DynamoDB操作              │  │
│  │                                                       │  │
│  │  信頼: ecs-tasks.amazonaws.com                       │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Service-Linked Role (サービスリンクロール)          │  │
│  │  - ECSサービスがALB/NLBにタスクを登録                │  │
│  │  - Auto Scalingの操作                                │  │
│  │                                                       │  │
│  │  自動作成: AWSServiceRoleForECS                      │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. タスク定義（Task Definition）

### 4.1 タスク定義の構造

```json
{
  "family": "my-app",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "256",
  "memory": "512",
  "executionRoleArn": "arn:aws:iam::123456789012:role/ecsTaskExecutionRole",
  "taskRoleArn": "arn:aws:iam::123456789012:role/ecsTaskRole",
  "containerDefinitions": [
    {
      "name": "app",
      "image": "123456789012.dkr.ecr.ap-northeast-1.amazonaws.com/my-app:v1.0.0",
      "essential": true,
      "portMappings": [
        {
          "containerPort": 8080,
          "protocol": "tcp"
        }
      ],
      "environment": [
        {
          "name": "NODE_ENV",
          "value": "production"
        }
      ],
      "secrets": [
        {
          "name": "DB_PASSWORD",
          "valueFrom": "arn:aws:secretsmanager:ap-northeast-1:123456789012:secret:db-password"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/my-app",
          "awslogs-region": "ap-northeast-1",
          "awslogs-stream-prefix": "app"
        }
      },
      "healthCheck": {
        "command": ["CMD-SHELL", "curl -f http://localhost:8080/health || exit 1"],
        "interval": 30,
        "timeout": 5,
        "retries": 3,
        "startPeriod": 60
      }
    }
  ]
}
```

### 4.2 Fargate CPU/メモリ組み合わせ

| CPU (vCPU) | メモリ (GB) |
|------------|-------------|
| 0.25 | 0.5, 1, 2 |
| 0.5 | 1, 2, 3, 4 |
| 1 | 2, 3, 4, 5, 6, 7, 8 |
| 2 | 4 〜 16 (1GB単位) |
| 4 | 8 〜 30 (1GB単位) |
| 8 | 16 〜 60 (4GB単位) |
| 16 | 32 〜 120 (8GB単位) |

### 4.3 シークレット管理

```
【シークレット管理オプション】

┌─────────────────────────────────────────────────────────────┐
│               ECS シークレット管理                           │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Secrets Manager                                      │  │
│  │  - 自動ローテーション対応                             │  │
│  │  - クロスアカウント参照可能                           │  │
│  │  - 有料 ($0.40/シークレット/月)                       │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  SSM Parameter Store (SecureString)                  │  │
│  │  - 標準パラメータは無料                               │  │
│  │  - KMS暗号化                                         │  │
│  │  - 階層構造でパラメータ管理                          │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

```json
// タスク定義でのシークレット参照
{
  "containerDefinitions": [
    {
      "secrets": [
        {
          "name": "DB_PASSWORD",
          "valueFrom": "arn:aws:secretsmanager:ap-northeast-1:123456789012:secret:prod/db/password"
        },
        {
          "name": "API_KEY",
          "valueFrom": "arn:aws:ssm:ap-northeast-1:123456789012:parameter/prod/api-key"
        }
      ]
    }
  ]
}
```

---

## 5. サービス（Service）

### 5.1 サービスの構成

```
【ECS Service 構成】

┌─────────────────────────────────────────────────────────────┐
│                       ECS Service                            │
│                       "api-service"                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Task Definition: api-server:3                               │
│  Desired Count: 3                                            │
│  Launch Type: FARGATE                                        │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              Load Balancer Integration                │  │
│  │                                                       │  │
│  │  ┌─────────────┐                                     │  │
│  │  │     ALB     │                                     │  │
│  │  └──────┬──────┘                                     │  │
│  │         │                                            │  │
│  │         ▼                                            │  │
│  │  ┌─────────────┐                                     │  │
│  │  │Target Group │                                     │  │
│  │  │  api-tg     │                                     │  │
│  │  └──────┬──────┘                                     │  │
│  │         │                                            │  │
│  │    ┌────┴────┬────────┐                             │  │
│  │    ▼         ▼        ▼                             │  │
│  │ ┌──────┐ ┌──────┐ ┌──────┐                         │  │
│  │ │Task 1│ │Task 2│ │Task 3│                         │  │
│  │ └──────┘ └──────┘ └──────┘                         │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              Service Auto Scaling                     │  │
│  │                                                       │  │
│  │  Min: 2  /  Desired: 3  /  Max: 10                   │  │
│  │                                                       │  │
│  │  Scaling Policy: Target Tracking                     │  │
│  │  - CPU Utilization: 70%                              │  │
│  │  - Request Count per Target: 1000                    │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 サービス作成（CLI）

```bash
# サービス作成
aws ecs create-service \
  --cluster my-cluster \
  --service-name api-service \
  --task-definition api-server:3 \
  --desired-count 3 \
  --launch-type FARGATE \
  --network-configuration '{
    "awsvpcConfiguration": {
      "subnets": ["subnet-12345678", "subnet-87654321"],
      "securityGroups": ["sg-12345678"],
      "assignPublicIp": "DISABLED"
    }
  }' \
  --load-balancers '[
    {
      "targetGroupArn": "arn:aws:elasticloadbalancing:ap-northeast-1:123456789012:targetgroup/api-tg/1234567890",
      "containerName": "app",
      "containerPort": 8080
    }
  ]' \
  --deployment-configuration '{
    "deploymentCircuitBreaker": {
      "enable": true,
      "rollback": true
    },
    "maximumPercent": 200,
    "minimumHealthyPercent": 100
  }'
```

### 5.3 サービスAuto Scaling

```bash
# スケーラブルターゲットの登録
aws application-autoscaling register-scalable-target \
  --service-namespace ecs \
  --scalable-dimension ecs:service:DesiredCount \
  --resource-id service/my-cluster/api-service \
  --min-capacity 2 \
  --max-capacity 10

# ターゲット追跡スケーリングポリシー（CPU）
aws application-autoscaling put-scaling-policy \
  --service-namespace ecs \
  --scalable-dimension ecs:service:DesiredCount \
  --resource-id service/my-cluster/api-service \
  --policy-name cpu-tracking-policy \
  --policy-type TargetTrackingScaling \
  --target-tracking-scaling-policy-configuration '{
    "TargetValue": 70.0,
    "PredefinedMetricSpecification": {
      "PredefinedMetricType": "ECSServiceAverageCPUUtilization"
    },
    "ScaleInCooldown": 300,
    "ScaleOutCooldown": 60
  }'
```

---

## 6. デプロイ戦略

### 6.1 デプロイ方式の比較

```
【ECS デプロイ方式】

┌────────────────────────────────────────────────────────────────────┐
│                     ローリングアップデート                          │
│                     (ECS標準デプロイ)                               │
│                                                                    │
│  Before:  [v1] [v1] [v1]                                          │
│  Step 1:  [v1] [v1] [v1] [v2]  ← 新タスク追加                     │
│  Step 2:  [v1] [v1] [v2] [v2]  ← 旧タスク削除、新タスク追加        │
│  Step 3:  [v1] [v2] [v2] [v2]                                     │
│  After:   [v2] [v2] [v2]                                          │
└────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────┐
│                     Blue/Green デプロイ                            │
│                     (CodeDeploy連携)                               │
│                                                                    │
│  Blue (本番):  [v1] [v1] [v1]  ←── ALB (100%)                     │
│  Green (待機): [v2] [v2] [v2]      (テストリスナー)                │
│                                                                    │
│  トラフィックシフト後:                                             │
│  Blue:  [v1] [v1] [v1]  (0%)                                      │
│  Green: [v2] [v2] [v2]  ←── ALB (100%)                            │
└────────────────────────────────────────────────────────────────────┘
```

### 6.2 ローリングアップデート設定

```json
// deploymentConfiguration
{
  "deploymentCircuitBreaker": {
    "enable": true,
    "rollback": true
  },
  "maximumPercent": 200,
  "minimumHealthyPercent": 100
}
```

| パラメータ | 説明 | 推奨値 |
|----------|------|--------|
| **maximumPercent** | 最大タスク数の割合 | 200 (2倍まで許容) |
| **minimumHealthyPercent** | 最小正常タスク数の割合 | 100 (ダウンタイムなし) |
| **deploymentCircuitBreaker** | 失敗時の自動ロールバック | enable: true |

### 6.3 Blue/Green デプロイ（CodeDeploy）

```yaml
# appspec.yaml
version: 0.0
Resources:
  - TargetService:
      Type: AWS::ECS::Service
      Properties:
        TaskDefinition: "arn:aws:ecs:ap-northeast-1:123456789012:task-definition/my-app:5"
        LoadBalancerInfo:
          ContainerName: "app"
          ContainerPort: 8080
        PlatformVersion: "LATEST"

Hooks:
  - BeforeInstall: "LambdaFunctionToValidateBeforeInstall"
  - AfterInstall: "LambdaFunctionToValidateAfterInstall"
  - AfterAllowTestTraffic: "LambdaFunctionToTestTraffic"
  - BeforeAllowTraffic: "LambdaFunctionToValidateBeforeTraffic"
  - AfterAllowTraffic: "LambdaFunctionToValidateAfterTraffic"
```

### 6.4 トラフィックシフト設定

| 設定 | 説明 |
|-----|------|
| **AllAtOnce** | 即座に100%切り替え |
| **Linear10PercentEvery1Minutes** | 1分ごとに10%ずつ |
| **Linear10PercentEvery3Minutes** | 3分ごとに10%ずつ |
| **Canary10Percent5Minutes** | 10%で5分待機後、残り90% |
| **Canary10Percent15Minutes** | 10%で15分待機後、残り90% |

---

## 7. CI/CD パイプライン

### 7.1 パイプラインアーキテクチャ

```
【ECS CI/CD パイプライン】

┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Source    │    │    Build    │    │    Push     │    │   Deploy    │
│             │    │             │    │             │    │             │
│ ┌─────────┐ │    │ ┌─────────┐ │    │ ┌─────────┐ │    │ ┌─────────┐ │
│ │CodeCommit│─┼───▶│ CodeBuild │─┼───▶│   ECR    │─┼───▶│   ECS    │ │
│ │ /GitHub │ │    │           │ │    │           │ │    │ Service  │ │
│ └─────────┘ │    │ └─────────┘ │    │ └─────────┘ │    │ └─────────┘ │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
                          │
                          ▼
                   ┌─────────────┐
                   │  Artifacts  │
                   │ ┌─────────┐ │
                   │ │imagedef │ │
                   │ │ .json   │ │
                   │ └─────────┘ │
                   └─────────────┘
```

### 7.2 buildspec.yml（CodeBuild）

```yaml
version: 0.2

env:
  variables:
    AWS_REGION: "ap-northeast-1"
    ECR_REPO_NAME: "my-app"
    CONTAINER_NAME: "app"

phases:
  pre_build:
    commands:
      - echo Logging in to Amazon ECR...
      - aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com
      - REPOSITORY_URI=$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPO_NAME
      - COMMIT_HASH=$(echo $CODEBUILD_RESOLVED_SOURCE_VERSION | cut -c 1-7)
      - IMAGE_TAG=${COMMIT_HASH:=latest}

  build:
    commands:
      - echo Build started on `date`
      - echo Building the Docker image...
      - docker build -t $REPOSITORY_URI:latest .
      - docker tag $REPOSITORY_URI:latest $REPOSITORY_URI:$IMAGE_TAG

  post_build:
    commands:
      - echo Build completed on `date`
      - echo Pushing the Docker images...
      - docker push $REPOSITORY_URI:latest
      - docker push $REPOSITORY_URI:$IMAGE_TAG
      - echo Writing image definitions file...
      - printf '[{"name":"%s","imageUri":"%s"}]' $CONTAINER_NAME $REPOSITORY_URI:$IMAGE_TAG > imagedefinitions.json

artifacts:
  files:
    - imagedefinitions.json
    - appspec.yaml
    - taskdef.json
```

### 7.3 imagedefinitions.json

```json
// 標準ECSデプロイ用
[
  {
    "name": "app",
    "imageUri": "123456789012.dkr.ecr.ap-northeast-1.amazonaws.com/my-app:abc1234"
  }
]
```

### 7.4 imageDetail.json（Blue/Green用）

```json
// CodeDeploy Blue/Green用
{
  "ImageURI": "123456789012.dkr.ecr.ap-northeast-1.amazonaws.com/my-app:abc1234"
}
```

---

## 8. 監視とログ

### 8.1 CloudWatch Container Insights

```bash
# クラスターでContainer Insightsを有効化
aws ecs update-cluster-settings \
  --cluster my-cluster \
  --settings name=containerInsights,value=enabled
```

### 8.2 収集されるメトリクス

```
【Container Insights メトリクス】

クラスターレベル
├─ CpuUtilized / CpuReserved
├─ MemoryUtilized / MemoryReserved
├─ NetworkRxBytes / NetworkTxBytes
├─ RunningTaskCount
└─ PendingTaskCount

サービスレベル
├─ CpuUtilized / CpuReserved
├─ MemoryUtilized / MemoryReserved
├─ DesiredTaskCount / RunningTaskCount
└─ PendingTaskCount

タスクレベル
├─ CpuUtilized / CpuReserved
├─ MemoryUtilized / MemoryReserved
├─ NetworkRxBytes / NetworkTxBytes
└─ StorageReadBytes / StorageWriteBytes
```

### 8.3 ログ設定

```json
// タスク定義のログ設定
{
  "logConfiguration": {
    "logDriver": "awslogs",
    "options": {
      "awslogs-group": "/ecs/my-app",
      "awslogs-region": "ap-northeast-1",
      "awslogs-stream-prefix": "app",
      "awslogs-create-group": "true"
    }
  }
}
```

### 8.4 Logs Insightsクエリ例

```sql
-- コンテナ別エラーカウント
fields @timestamp, @message
| filter @message like /ERROR/
| stats count() by bin(5m)

-- タスク停止理由の分析
fields @timestamp, detail.stoppedReason as reason
| filter detail.lastStatus = "STOPPED"
| stats count() by reason

-- コンテナ起動時間の分析
fields @timestamp, @message
| filter @message like /Started container/
| parse @message "Started container * in *ms" as containerName, startTimeMs
| stats avg(startTimeMs) as avgStartTime by containerName
```

---

## 9. ハンズオン演習

### 9.1 演習1: ECRリポジトリ作成とイメージプッシュ

```bash
# 1. ECRリポジトリ作成
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGION="ap-northeast-1"

aws ecr create-repository \
  --repository-name handson-app \
  --image-scanning-configuration scanOnPush=true

# 2. ECR認証
aws ecr get-login-password --region ${REGION} | \
  docker login --username AWS --password-stdin \
  ${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com

# 3. サンプルDockerfile作成
cat > /tmp/Dockerfile << 'EOF'
FROM public.ecr.aws/nginx/nginx:latest
RUN echo '<html><body><h1>ECS Hands-on App</h1></body></html>' > /usr/share/nginx/html/index.html
EXPOSE 80
EOF

# 4. ビルドとプッシュ
cd /tmp
docker build -t handson-app:v1 .
docker tag handson-app:v1 ${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/handson-app:v1
docker push ${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/handson-app:v1

# 5. イメージ確認
aws ecr describe-images --repository-name handson-app
```

**実行結果**:
```json
{
    "imageDetails": [
        {
            "registryId": "471112657080",
            "repositoryName": "handson-app",
            "imageTags": ["v1"],
            "imageSizeInBytes": 67891234,
            "imagePushedAt": "2026-02-03T15:30:00+00:00"
        }
    ]
}
```
✅ **検証済み** (2026-02-03)

### 9.2 演習2: ECSクラスター作成

```bash
# 1. クラスター作成（Fargate）
aws ecs create-cluster \
  --cluster-name handson-cluster \
  --capacity-providers FARGATE FARGATE_SPOT \
  --default-capacity-provider-strategy \
    capacityProvider=FARGATE,weight=1 \
    capacityProvider=FARGATE_SPOT,weight=1 \
  --settings name=containerInsights,value=enabled

# 2. クラスター確認
aws ecs describe-clusters --clusters handson-cluster
```

**実行結果**:
```json
{
    "clusters": [
        {
            "clusterArn": "arn:aws:ecs:ap-northeast-1:471112657080:cluster/handson-cluster",
            "clusterName": "handson-cluster",
            "status": "ACTIVE",
            "settings": [
                {
                    "name": "containerInsights",
                    "value": "enabled"
                }
            ]
        }
    ]
}
```
✅ **検証済み** (2026-02-03)

### 9.3 演習3: タスク定義の登録

```bash
# タスク定義ファイル作成
cat > /tmp/task-definition.json << EOF
{
  "family": "handson-task",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "256",
  "memory": "512",
  "executionRoleArn": "arn:aws:iam::${ACCOUNT_ID}:role/ecsTaskExecutionRole",
  "containerDefinitions": [
    {
      "name": "app",
      "image": "${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/handson-app:v1",
      "essential": true,
      "portMappings": [
        {
          "containerPort": 80,
          "protocol": "tcp"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/handson-app",
          "awslogs-region": "${REGION}",
          "awslogs-stream-prefix": "app",
          "awslogs-create-group": "true"
        }
      }
    }
  ]
}
EOF

# タスク定義の登録
aws ecs register-task-definition --cli-input-json file:///tmp/task-definition.json

# 確認
aws ecs describe-task-definition --task-definition handson-task:1
```

### 9.4 演習4: サービス作成

```bash
# VPC情報の取得（既存VPCを使用）
VPC_ID=$(aws ec2 describe-vpcs --filters "Name=isDefault,Values=true" --query "Vpcs[0].VpcId" --output text)
SUBNET_IDS=$(aws ec2 describe-subnets --filters "Name=vpc-id,Values=${VPC_ID}" --query "Subnets[*].SubnetId" --output text | tr '\t' ',')
SG_ID=$(aws ec2 describe-security-groups --filters "Name=vpc-id,Values=${VPC_ID}" "Name=group-name,Values=default" --query "SecurityGroups[0].GroupId" --output text)

# サービス作成
aws ecs create-service \
  --cluster handson-cluster \
  --service-name handson-service \
  --task-definition handson-task:1 \
  --desired-count 1 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[${SUBNET_IDS%%,*}],securityGroups=[${SG_ID}],assignPublicIp=ENABLED}"

# サービス確認
aws ecs describe-services --cluster handson-cluster --services handson-service
```

### 9.5 クリーンアップ

```bash
# サービス削除
aws ecs update-service --cluster handson-cluster --service handson-service --desired-count 0
aws ecs delete-service --cluster handson-cluster --service handson-service

# クラスター削除
aws ecs delete-cluster --cluster handson-cluster

# ECRリポジトリ削除
aws ecr delete-repository --repository-name handson-app --force

# タスク定義の登録解除
aws ecs deregister-task-definition --task-definition handson-task:1
```

---

## 10. DOP試験対策チェックリスト

### 基本理解

- [ ] ECS/ECRの基本アーキテクチャを説明できる
- [ ] EC2起動タイプとFargateの違いを理解している
- [ ] タスク定義の主要パラメータを把握している

<details>
<summary>📝 模範解答を見る</summary>

**ECS/ECR基本アーキテクチャ**:
- ECR: コンテナイメージのプライベートレジストリ
- ECS: コンテナオーケストレーションサービス
- 構成: クラスター → サービス → タスク → コンテナ

**EC2 vs Fargate**:
| 項目 | EC2 | Fargate |
|-----|-----|---------|
| インフラ管理 | ユーザー | AWS |
| コスト | 大規模で安価 | 小〜中規模で運用効率化 |
| カスタマイズ | 高 | 制限あり |

**タスク定義主要パラメータ**:
- `family`: タスク定義名
- `cpu/memory`: リソース割り当て
- `executionRoleArn`: ECRプル、ログ送信用
- `taskRoleArn`: アプリケーション用AWS権限
- `networkMode`: awsvpc推奨
</details>

### IAMとセキュリティ

- [ ] タスク実行ロールとタスクロールの違いを説明できる
- [ ] ECRイメージスキャンの種類を理解している
- [ ] シークレット管理のベストプラクティスを知っている

<details>
<summary>📝 模範解答を見る</summary>

**タスク実行ロール vs タスクロール**:
| ロール | 用途 | 例 |
|-------|------|-----|
| Task Execution Role | ECSエージェントが使用 | ECRプル、CW Logsへのログ送信 |
| Task Role | コンテナ内アプリが使用 | S3アクセス、DynamoDB操作 |

**ECRイメージスキャン**:
- **Basic**: 無料、OSパッケージの脆弱性
- **Enhanced**: Inspector連携、継続的スキャン、言語パッケージも対象

**シークレット管理ベストプラクティス**:
1. Secrets ManagerまたはSSM Parameter Store使用
2. 環境変数に直接シークレットを書かない
3. タスク定義のsecretsセクションで参照
4. Task Execution Roleに適切なIAM権限付与
</details>

### デプロイ戦略

- [ ] ローリングアップデートのパラメータを設定できる
- [ ] Blue/Greenデプロイの仕組みを理解している
- [ ] デプロイサーキットブレーカーの役割を説明できる

<details>
<summary>📝 模範解答を見る</summary>

**ローリングアップデートパラメータ**:
```json
{
  "maximumPercent": 200,        // 最大タスク数の割合
  "minimumHealthyPercent": 100  // 最小正常タスク数の割合
}
```
- maximumPercent=200: 一時的に2倍のタスクを許容
- minimumHealthyPercent=100: ダウンタイムなし

**Blue/Greenデプロイの仕組み**:
1. Blue（現行）とGreen（新版）の2セット用意
2. ALBのターゲットグループで切り替え
3. テストリスナーで事前確認可能
4. トラフィックシフト（Canary, Linear, AllAtOnce）

**デプロイサーキットブレーカー**:
- デプロイ失敗を検知して自動ロールバック
- ヘルスチェック失敗が一定回数続くと発動
- 設定: `deploymentCircuitBreaker.enable: true, rollback: true`
</details>

### CI/CD連携

- [ ] CodePipelineでのECSデプロイフローを設計できる
- [ ] imagedefinitions.jsonの構造を理解している
- [ ] CodeDeployとの連携設定ができる

<details>
<summary>📝 模範解答を見る</summary>

**CodePipelineデプロイフロー**:
```
Source → Build (CodeBuild) → Deploy (ECS)
                   │
                   ▼
          imagedefinitions.json生成
```

**imagedefinitions.json構造**:
```json
[
  {
    "name": "container-name",     // タスク定義のコンテナ名と一致
    "imageUri": "123456789012.dkr.ecr.ap-northeast-1.amazonaws.com/app:tag"
  }
]
```

**CodeDeploy連携（Blue/Green）**:
1. appspec.yamlを作成
2. imageDetail.jsonでイメージURI指定
3. CodeDeployアプリケーション/デプロイグループ作成
4. ALBで2つのターゲットグループを設定
</details>

### Auto Scalingと監視

- [ ] ターゲット追跡スケーリングを設定できる
- [ ] Container Insightsで収集されるメトリクスを知っている
- [ ] Logs Insightsでコンテナログを分析できる

<details>
<summary>📝 模範解答を見る</summary>

**ターゲット追跡スケーリング**:
```bash
aws application-autoscaling put-scaling-policy \
  --policy-type TargetTrackingScaling \
  --target-tracking-scaling-policy-configuration '{
    "TargetValue": 70.0,
    "PredefinedMetricSpecification": {
      "PredefinedMetricType": "ECSServiceAverageCPUUtilization"
    }
  }'
```

**Container Insightsメトリクス**:
- CpuUtilized / CpuReserved
- MemoryUtilized / MemoryReserved
- RunningTaskCount / PendingTaskCount
- NetworkRxBytes / NetworkTxBytes

**Logs Insightsクエリ例**:
```sql
fields @timestamp, @message
| filter @message like /ERROR/
| stats count() by bin(5m)
```
</details>

### 実践シナリオ

- [ ] マイクロサービスアーキテクチャをECSで設計できる
- [ ] 障害復旧とロールバック戦略を立案できる
- [ ] コスト最適化を考慮したECS構成を設計できる

<details>
<summary>📝 模範解答を見る</summary>

**マイクロサービス設計**:
```
ALB → Service A (Frontend) → API Gateway Internal
                                    │
                         ┌──────────┼──────────┐
                         ▼          ▼          ▼
                   Service B   Service C   Service D
                   (User)      (Order)     (Payment)
```
- 各サービスは独立したタスク定義
- Service Discovery (Cloud Map) で内部通信
- ALB + パスベースルーティング

**障害復旧・ロールバック戦略**:
1. デプロイサーキットブレーカー有効化
2. Blue/Greenで即座にロールバック可能な構成
3. ECRでイメージタグの不変性を維持
4. タスク定義のリビジョン管理

**コスト最適化**:
- Fargate Spotの活用（耐障害性のあるワークロード）
- Capacity Provider Strategyで混在
- 適切なCPU/メモリサイズ選定
- Auto Scalingで需要に応じたスケール
</details>

---

## 付録A: よく使うCLIコマンド

```bash
# ECR関連
aws ecr get-login-password --region REGION | docker login --username AWS --password-stdin ACCOUNT.dkr.ecr.REGION.amazonaws.com
aws ecr create-repository --repository-name NAME
aws ecr describe-images --repository-name NAME
aws ecr start-image-scan --repository-name NAME --image-id imageTag=TAG

# ECSクラスター
aws ecs create-cluster --cluster-name NAME
aws ecs describe-clusters --clusters NAME
aws ecs list-clusters

# タスク定義
aws ecs register-task-definition --cli-input-json file://task-def.json
aws ecs describe-task-definition --task-definition NAME:REVISION
aws ecs list-task-definitions

# サービス
aws ecs create-service --cluster NAME --service-name NAME ...
aws ecs update-service --cluster NAME --service NAME --desired-count N
aws ecs describe-services --cluster NAME --services NAME
aws ecs delete-service --cluster NAME --service NAME

# タスク
aws ecs run-task --cluster NAME --task-definition NAME:REV ...
aws ecs list-tasks --cluster NAME --service-name NAME
aws ecs describe-tasks --cluster NAME --tasks TASK_ARN
aws ecs stop-task --cluster NAME --task TASK_ARN
```

---

## 付録B: 参考リンク

- [Amazon ECS 開発者ガイド](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/)
- [Amazon ECR ユーザーガイド](https://docs.aws.amazon.com/AmazonECR/latest/userguide/)
- [ECS ベストプラクティス](https://docs.aws.amazon.com/AmazonECS/latest/bestpracticesguide/)
- [Fargate タスク定義パラメータ](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task_definition_parameters.html)

---

**作成日**: 2026-02-03
**最終更新**: 2026-02-03
**検証環境**: AWS ap-northeast-1 リージョン
