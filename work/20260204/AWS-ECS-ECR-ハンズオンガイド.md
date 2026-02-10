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
10. [ECS Exec（デバッグ）](#10-ecs-execデバッグ)
11. [マルチコンテナパターン（サイドカー）](#11-マルチコンテナパターンサイドカー)
12. [Service Connect / Service Discovery](#12-service-connect--service-discovery)
13. [Capacity Provider 詳細](#13-capacity-provider-詳細)
14. [Fargate エフェメラルストレージと EFS](#14-fargate-エフェメラルストレージと-efs)
15. [DOP試験対策 Q&A](#15-dop試験対策-qa)

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

### 9.6 演習5: ECS Exec でコンテナデバッグ

```bash
# 前提: ECS Exec 用のタスク定義を登録（enableExecuteCommand対応）
# 1. SSMプラグインインストール確認
session-manager-plugin --version

# 2. サービスでExecuteCommandを有効化
aws ecs update-service \
  --cluster handson-cluster \
  --service handson-service \
  --enable-execute-command

# 3. 新しいタスクが起動したら接続
TASK_ARN=$(aws ecs list-tasks \
  --cluster handson-cluster \
  --service-name handson-service \
  --query 'taskArns[0]' --output text)

aws ecs execute-command \
  --cluster handson-cluster \
  --task ${TASK_ARN} \
  --container app \
  --interactive \
  --command "/bin/sh"

# 4. コンテナ内で動作確認
# sh-5.1# curl localhost:80
# sh-5.1# cat /etc/os-release
# sh-5.1# exit
```

**ECS Exec の注意点**:
- タスクロールに `ssmmessages:*` 権限が必要
- Fargate プラットフォームバージョン 1.4.0 以降が必要
- タスク定義で `initProcessEnabled: true` を推奨

### 9.7 演習6: Blue/Green デプロイ

```bash
# 1. ALB作成
ALB_ARN=$(aws elbv2 create-load-balancer \
  --name handson-alb \
  --subnets ${SUBNET_1} ${SUBNET_2} \
  --security-groups ${SG_ID} \
  --query 'LoadBalancers[0].LoadBalancerArn' --output text)

# 2. ターゲットグループ2つ作成（Blue / Green）
TG_BLUE_ARN=$(aws elbv2 create-target-group \
  --name handson-tg-blue \
  --protocol HTTP --port 80 \
  --vpc-id ${VPC_ID} \
  --target-type ip \
  --health-check-path "/" \
  --query 'TargetGroups[0].TargetGroupArn' --output text)

TG_GREEN_ARN=$(aws elbv2 create-target-group \
  --name handson-tg-green \
  --protocol HTTP --port 80 \
  --vpc-id ${VPC_ID} \
  --target-type ip \
  --health-check-path "/" \
  --query 'TargetGroups[0].TargetGroupArn' --output text)

# 3. 本番リスナー（ポート80）
aws elbv2 create-listener \
  --load-balancer-arn ${ALB_ARN} \
  --protocol HTTP --port 80 \
  --default-actions Type=forward,TargetGroupArn=${TG_BLUE_ARN}

# 4. テストリスナー（ポート8080）
aws elbv2 create-listener \
  --load-balancer-arn ${ALB_ARN} \
  --protocol HTTP --port 8080 \
  --default-actions Type=forward,TargetGroupArn=${TG_GREEN_ARN}

# 5. CodeDeployアプリケーション作成
aws deploy create-application \
  --application-name handson-ecs-app \
  --compute-platform ECS

# 6. デプロイグループ作成
aws deploy create-deployment-group \
  --application-name handson-ecs-app \
  --deployment-group-name handson-ecs-dg \
  --service-role-arn arn:aws:iam::${ACCOUNT_ID}:role/ecsCodeDeployRole \
  --deployment-config-name CodeDeployDefault.ECSCanary10Percent5Minutes \
  --ecs-services clusterName=handson-cluster,serviceName=handson-service \
  --load-balancer-info "targetGroupPairInfoList=[{targetGroups=[{name=handson-tg-blue},{name=handson-tg-green}],prodTrafficRoute={listenerArns=[${LISTENER_ARN}]},testTrafficRoute={listenerArns=[${TEST_LISTENER_ARN}]}}]" \
  --auto-rollback-configuration "enabled=true,events=[DEPLOYMENT_FAILURE]" \
  --blue-green-deployment-configuration '{
    "terminateBlueInstancesOnDeploymentSuccess": {
      "action": "TERMINATE",
      "terminationWaitTimeInMinutes": 5
    },
    "deploymentReadyOption": {
      "actionOnTimeout": "CONTINUE_DEPLOYMENT",
      "waitTimeInMinutes": 0
    }
  }'
```

### 9.8 演習7: Service Auto Scaling

```bash
# 1. スケーラブルターゲット登録
aws application-autoscaling register-scalable-target \
  --service-namespace ecs \
  --scalable-dimension ecs:service:DesiredCount \
  --resource-id service/handson-cluster/handson-service \
  --min-capacity 1 \
  --max-capacity 5

# 2. ターゲット追跡: CPU 70%
aws application-autoscaling put-scaling-policy \
  --service-namespace ecs \
  --scalable-dimension ecs:service:DesiredCount \
  --resource-id service/handson-cluster/handson-service \
  --policy-name cpu-tracking \
  --policy-type TargetTrackingScaling \
  --target-tracking-scaling-policy-configuration '{
    "TargetValue": 70.0,
    "PredefinedMetricSpecification": {
      "PredefinedMetricType": "ECSServiceAverageCPUUtilization"
    },
    "ScaleInCooldown": 300,
    "ScaleOutCooldown": 60
  }'

# 3. ターゲット追跡: ALB リクエスト数
aws application-autoscaling put-scaling-policy \
  --service-namespace ecs \
  --scalable-dimension ecs:service:DesiredCount \
  --resource-id service/handson-cluster/handson-service \
  --policy-name request-tracking \
  --policy-type TargetTrackingScaling \
  --target-tracking-scaling-policy-configuration '{
    "TargetValue": 1000.0,
    "PredefinedMetricSpecification": {
      "PredefinedMetricType": "ALBRequestCountPerTarget",
      "ResourceLabel": "app/handson-alb/1234567890/targetgroup/handson-tg/9876543210"
    },
    "ScaleInCooldown": 300,
    "ScaleOutCooldown": 60
  }'

# 4. スケジュールベース（営業時間のみスケールアップ）
aws application-autoscaling put-scheduled-action \
  --service-namespace ecs \
  --scalable-dimension ecs:service:DesiredCount \
  --resource-id service/handson-cluster/handson-service \
  --scheduled-action-name scale-up-business-hours \
  --schedule "cron(0 0 ? * MON-FRI *)" \
  --scalable-target-action MinCapacity=3,MaxCapacity=10

aws application-autoscaling put-scheduled-action \
  --service-namespace ecs \
  --scalable-dimension ecs:service:DesiredCount \
  --resource-id service/handson-cluster/handson-service \
  --scheduled-action-name scale-down-night \
  --schedule "cron(0 12 ? * MON-FRI *)" \
  --scalable-target-action MinCapacity=1,MaxCapacity=3

# 5. 確認
aws application-autoscaling describe-scaling-policies \
  --service-namespace ecs \
  --resource-id service/handson-cluster/handson-service
```

---

## 10. ECS Exec（デバッグ）

### 10.1 概要

ECS Exec は SSM (Systems Manager) Session Manager を使用して、実行中のコンテナに直接接続するデバッグ機能です。

```
【ECS Exec アーキテクチャ】

┌──────────┐     SSM Session     ┌─────────────────────────────┐
│ 開発者   │ ──────────────────▶ │  ECS Task                    │
│ (CLI)    │                     │  ┌────────────────────────┐  │
│          │                     │  │  SSM Agent (sidecar)   │  │
│          │                     │  │  ↕ (IPC)               │  │
│          │                     │  │  Application Container │  │
│          │                     │  └────────────────────────┘  │
└──────────┘                     └─────────────────────────────┘
                                          │
                                          ▼
                                 ┌─────────────────┐
                                 │  CloudWatch Logs │
                                 │  / S3 (監査ログ) │
                                 └─────────────────┘
```

### 10.2 必要な設定

```json
// タスク定義に追加
{
  "containerDefinitions": [
    {
      "name": "app",
      "linuxParameters": {
        "initProcessEnabled": true
      }
    }
  ]
}
```

```json
// タスクロールに追加するIAMポリシー
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ssmmessages:CreateControlChannel",
        "ssmmessages:CreateDataChannel",
        "ssmmessages:OpenControlChannel",
        "ssmmessages:OpenDataChannel"
      ],
      "Resource": "*"
    }
  ]
}
```

### 10.3 監査ログの設定

```bash
# ECS Exec のログをS3とCloudWatch Logsに保存
aws ecs update-cluster \
  --cluster my-cluster \
  --configuration '{
    "executeCommandConfiguration": {
      "logging": "OVERRIDE",
      "logConfiguration": {
        "cloudWatchLogGroupName": "/ecs/exec-audit",
        "cloudWatchEncryptionEnabled": false,
        "s3BucketName": "my-ecs-exec-logs",
        "s3KeyPrefix": "exec-logs"
      }
    }
  }'
```

### 10.4 DOP試験ポイント

| 項目 | 内容 |
|------|------|
| **前提条件** | Fargate PV 1.4.0+、SSMプラグイン、タスクロール権限 |
| **用途** | デバッグ、トラブルシューティング、一時的な操作 |
| **本番での注意** | 監査ログ必須、IAM条件キーで制限推奨 |
| **kubectl execとの違い** | ECSネイティブ、Kubernetes不要 |

---

## 11. マルチコンテナパターン（サイドカー）

### 11.1 サイドカーパターン

1つのタスクに複数コンテナを配置し、メインアプリを補助するパターンです。

```
【サイドカーパターン】

┌─────────────────────────────────────────────┐
│                   ECS Task                    │
│                                               │
│  ┌─────────────────┐  ┌──────────────────┐  │
│  │  App Container   │  │  Log Router      │  │
│  │  (essential)     │  │  (Fluent Bit)    │  │
│  │                  │  │                  │  │
│  │  :8080           │  │  ← stdout/stderr │  │
│  └─────────────────┘  └──────────────────┘  │
│                                      │        │
│  ┌─────────────────┐                 ▼        │
│  │  Envoy Proxy    │        CloudWatch Logs   │
│  │  (App Mesh)     │        S3                │
│  │  :9901          │        Kinesis Firehose  │
│  └─────────────────┘                          │
└─────────────────────────────────────────────┘
```

### 11.2 Fluent Bit サイドカー（ログルーティング）

```json
{
  "family": "app-with-fluentbit",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "1024",
  "containerDefinitions": [
    {
      "name": "app",
      "image": "my-app:latest",
      "essential": true,
      "portMappings": [{"containerPort": 8080}],
      "logConfiguration": {
        "logDriver": "awsfirelens"
      },
      "dependsOn": [
        {"containerName": "log-router", "condition": "START"}
      ]
    },
    {
      "name": "log-router",
      "image": "public.ecr.aws/aws-observability/aws-for-fluent-bit:stable",
      "essential": true,
      "firelensConfiguration": {
        "type": "fluentbit",
        "options": {
          "config-file-type": "file",
          "config-file-value": "/fluent-bit/configs/parse-json.conf"
        }
      },
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/log-router",
          "awslogs-region": "ap-northeast-1",
          "awslogs-stream-prefix": "firelens"
        }
      },
      "memoryReservation": 50
    }
  ]
}
```

### 11.3 X-Ray デーモン サイドカー

```json
{
  "name": "xray-daemon",
  "image": "public.ecr.aws/xray/aws-xray-daemon:latest",
  "essential": false,
  "portMappings": [
    {"containerPort": 2000, "protocol": "udp"}
  ],
  "logConfiguration": {
    "logDriver": "awslogs",
    "options": {
      "awslogs-group": "/ecs/xray-daemon",
      "awslogs-region": "ap-northeast-1",
      "awslogs-stream-prefix": "xray"
    }
  },
  "memoryReservation": 64
}
```

### 11.4 コンテナ依存関係

| 条件 | 説明 | ユースケース |
|------|------|-------------|
| **START** | コンテナ起動後 | ログルータ起動待ち |
| **COMPLETE** | コンテナ正常終了後 | 初期化コンテナ |
| **SUCCESS** | 終了コード0で終了後 | マイグレーション実行後にアプリ起動 |
| **HEALTHY** | ヘルスチェック通過後 | DB接続確認後にアプリ起動 |

```json
{
  "containerDefinitions": [
    {
      "name": "db-migration",
      "essential": false,
      "command": ["python", "migrate.py"]
    },
    {
      "name": "app",
      "essential": true,
      "dependsOn": [
        {"containerName": "db-migration", "condition": "SUCCESS"}
      ]
    }
  ]
}
```

---

## 12. Service Connect / Service Discovery

### 12.1 サービス間通信の選択肢

```
【ECS サービス間通信パターン】

┌────────────────────────────────────────────────────────────┐
│                                                              │
│  (1) ALB パスベースルーティング                              │
│      ALB → /api/* → API Service                             │
│           /web/* → Web Service                              │
│      ✅ 外部公開向き  ❌ 内部通信にはオーバースペック          │
│                                                              │
│  (2) AWS Cloud Map (Service Discovery)                      │
│      DNS名でサービス間通信: api.local:8080                   │
│      ✅ シンプル  ❌ クライアント側でリトライ必要             │
│                                                              │
│  (3) ECS Service Connect (推奨)                             │
│      Envoyプロキシによるサービスメッシュ                     │
│      ✅ リトライ/タイムアウト自動  ✅ メトリクス自動収集     │
│                                                              │
│  (4) AWS App Mesh                                           │
│      フルサービスメッシュ（大規模向け）                      │
│      ✅ 高度なトラフィック制御  ❌ 設定が複雑                │
│                                                              │
└────────────────────────────────────────────────────────────┘
```

### 12.2 Service Connect 設定

```bash
# 1. Cloud Map 名前空間作成
aws servicediscovery create-http-namespace \
  --name my-app-ns \
  --description "ECS Service Connect namespace"

NAMESPACE_ARN=$(aws servicediscovery list-namespaces \
  --query "Namespaces[?Name=='my-app-ns'].Arn" --output text)

# 2. クラスターにService Connect デフォルト設定
aws ecs update-cluster \
  --cluster my-cluster \
  --service-connect-defaults "namespace=${NAMESPACE_ARN}"
```

```json
// サービス定義に Service Connect を追加
{
  "serviceConnectConfiguration": {
    "enabled": true,
    "namespace": "my-app-ns",
    "services": [
      {
        "portName": "http",
        "discoveryName": "api-service",
        "clientAliases": [
          {
            "port": 8080,
            "dnsName": "api"
          }
        ]
      }
    ],
    "logConfiguration": {
      "logDriver": "awslogs",
      "options": {
        "awslogs-group": "/ecs/service-connect",
        "awslogs-region": "ap-northeast-1",
        "awslogs-stream-prefix": "sc"
      }
    }
  }
}
```

```
【Service Connect 通信フロー】

Frontend Service                    API Service
┌──────────────────┐              ┌──────────────────┐
│  App Container   │              │  App Container   │
│  curl http://api:8080/users     │  :8080           │
│        │         │              │        ▲         │
│        ▼         │              │        │         │
│  ┌────────────┐  │              │  ┌────────────┐  │
│  │ Envoy      │──┼──────────────┼─▶│ Envoy      │  │
│  │ Proxy      │  │  Cloud Map   │  │ Proxy      │  │
│  └────────────┘  │  で名前解決   │  └────────────┘  │
└──────────────────┘              └──────────────────┘
```

### 12.3 Service Discovery（Cloud Map直接利用）

```bash
# 1. プライベートDNS名前空間
aws servicediscovery create-private-dns-namespace \
  --name local \
  --vpc ${VPC_ID}

# 2. サービス作成時にレジストリ指定
aws ecs create-service \
  --cluster my-cluster \
  --service-name api-service \
  --task-definition api:1 \
  --desired-count 2 \
  --launch-type FARGATE \
  --service-registries "registryArn=${SERVICE_REGISTRY_ARN},containerPort=8080" \
  --network-configuration "awsvpcConfiguration={subnets=[${SUBNET_IDS}],securityGroups=[${SG_ID}]}"

# 3. 他のサービスから DNS 名で接続
# api-service.local:8080
```

### 12.4 比較表

| 機能 | Service Discovery | Service Connect | App Mesh |
|------|------------------|-----------------|----------|
| **プロトコル** | DNS | HTTP/gRPC | HTTP/gRPC/TCP |
| **ロードバランシング** | DNS round-robin | Envoy L7 | Envoy L7 |
| **リトライ** | 手動実装 | 自動 | 自動（高度設定可） |
| **メトリクス** | なし | 自動収集 | 自動収集 |
| **設定の複雑さ** | 低 | 中 | 高 |
| **コスト** | Cloud Map料金のみ | Cloud Map + Envoyリソース | 同左 + Mesh管理 |
| **推奨ユースケース** | 小規模 | 中規模（推奨） | 大規模 |

---

## 13. Capacity Provider 詳細

### 13.1 Capacity Provider Strategy

```
【Capacity Provider Strategy 例】

┌─────────────────────────────────────────────────────┐
│                    ECS Cluster                        │
│                                                       │
│  Strategy: FARGATE(weight=1, base=2)                 │
│           FARGATE_SPOT(weight=3)                     │
│                                                       │
│  → base=2: 最低2タスクは FARGATE (安定)              │
│  → weight比 1:3 → 追加タスクの75%がSPOT             │
│                                                       │
│  5タスク必要な場合:                                    │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐      │
│  │FGATE │ │FGATE │ │ SPOT │ │ SPOT │ │ SPOT │      │
│  │(base)│ │(base)│ │(w:3) │ │(w:3) │ │(w:3) │      │
│  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘      │
└─────────────────────────────────────────────────────┘
```

### 13.2 CLI設定

```bash
# クラスター作成時にCapacity Provider設定
aws ecs create-cluster \
  --cluster-name production-cluster \
  --capacity-providers FARGATE FARGATE_SPOT \
  --default-capacity-provider-strategy \
    capacityProvider=FARGATE,weight=1,base=2 \
    capacityProvider=FARGATE_SPOT,weight=3

# サービス単位で上書きも可能
aws ecs create-service \
  --cluster production-cluster \
  --service-name batch-worker \
  --task-definition batch:1 \
  --desired-count 10 \
  --capacity-provider-strategy \
    capacityProvider=FARGATE_SPOT,weight=1,base=0 \
  --network-configuration "awsvpcConfiguration={subnets=[${SUBNET_IDS}],securityGroups=[${SG_ID}]}"
```

### 13.3 EC2 Capacity Provider（EC2起動タイプ向け）

```bash
# Auto Scaling Group を Capacity Provider として登録
aws ecs create-capacity-provider \
  --name my-ec2-provider \
  --auto-scaling-group-provider '{
    "autoScalingGroupArn": "arn:aws:autoscaling:ap-northeast-1:123456789012:autoScalingGroup:xxx:autoScalingGroupName/my-asg",
    "managedScaling": {
      "status": "ENABLED",
      "targetCapacity": 80,
      "minimumScalingStepSize": 1,
      "maximumScalingStepSize": 10
    },
    "managedTerminationProtection": "ENABLED"
  }'
```

| パラメータ | 説明 |
|----------|------|
| **targetCapacity** | EC2インスタンスのキャパシティ使用率目標（%） |
| **managedScaling** | ECSがASGのスケールを自動管理 |
| **managedTerminationProtection** | タスク実行中のインスタンス終了を防止 |

### 13.4 Fargate Spot の注意点

```
【Fargate Spot 中断時の挙動】

                    AWS による中断通知
                         │
                         ▼
    ┌────────────────────────────────────────┐
    │  SIGTERM シグナル送信                    │
    │  （アプリケーションに通知）              │
    │         │                              │
    │         ▼                              │
    │  30秒の猶予期間                         │
    │  （graceful shutdown）                  │
    │         │                              │
    │         ▼                              │
    │  SIGKILL（強制終了）                    │
    │         │                              │
    │         ▼                              │
    │  ECS が新しいタスクを起動              │
    │  （Service のdesiredCount 維持）        │
    └────────────────────────────────────────┘
```

**Fargate Spot に適したワークロード**:
- バッチ処理（中断されても再実行可能）
- 開発/テスト環境
- ステートレスなWebアプリ（ALB背後で複数タスク）

**適さないワークロード**:
- 長時間の処理（中断不可）
- 単一タスクのクリティカルサービス
- ステートフルなアプリケーション

---

## 14. Fargate エフェメラルストレージと EFS

### 14.1 エフェメラルストレージ

Fargate タスクにはデフォルトで 20GB のエフェメラルストレージが付与されます。最大 200GB まで拡張可能。

```json
// タスク定義でストレージ拡張
{
  "family": "large-storage-task",
  "requiresCompatibilities": ["FARGATE"],
  "ephemeralStorage": {
    "sizeInGiB": 100
  },
  "containerDefinitions": [...]
}
```

| 項目 | 値 |
|------|-----|
| **デフォルト** | 20 GiB |
| **最大** | 200 GiB |
| **追加料金** | 20GiB超過分に課金 |
| **用途** | 一時ファイル、キャッシュ、ビルド成果物 |

### 14.2 EFS マウント

永続ストレージが必要な場合はAmazon EFSをマウントします。

```json
// タスク定義にEFSボリューム追加
{
  "family": "app-with-efs",
  "requiresCompatibilities": ["FARGATE"],
  "volumes": [
    {
      "name": "shared-data",
      "efsVolumeConfiguration": {
        "fileSystemId": "fs-1234567890abcdef0",
        "rootDirectory": "/app-data",
        "transitEncryption": "ENABLED",
        "authorizationConfig": {
          "accessPointId": "fsap-1234567890abcdef0",
          "iam": "ENABLED"
        }
      }
    }
  ],
  "containerDefinitions": [
    {
      "name": "app",
      "mountPoints": [
        {
          "sourceVolume": "shared-data",
          "containerPath": "/data",
          "readOnly": false
        }
      ]
    }
  ]
}
```

```bash
# EFS作成とアクセスポイント設定
aws efs create-file-system \
  --encrypted \
  --performance-mode generalPurpose \
  --throughput-mode bursting \
  --tags Key=Name,Value=ecs-shared-data

EFS_ID=$(aws efs describe-file-systems \
  --query "FileSystems[?Tags[?Key=='Name'&&Value=='ecs-shared-data']].FileSystemId" \
  --output text)

# マウントターゲット作成（各サブネット）
aws efs create-mount-target \
  --file-system-id ${EFS_ID} \
  --subnet-id ${SUBNET_1} \
  --security-groups ${EFS_SG_ID}

# アクセスポイント作成
aws efs create-access-point \
  --file-system-id ${EFS_ID} \
  --posix-user "Uid=1000,Gid=1000" \
  --root-directory "Path=/app-data,CreationInfo={OwnerUid=1000,OwnerGid=1000,Permissions=755}"
```

### 14.3 ストレージ選択ガイド

| ストレージ | 永続性 | 共有 | パフォーマンス | ユースケース |
|-----------|--------|------|---------------|------------|
| **エフェメラル** | タスク終了で消失 | タスク内のみ | 高速 | 一時ファイル、キャッシュ |
| **EFS** | 永続 | 複数タスク共有可 | 中速 | 共有データ、設定ファイル |
| **S3** | 永続 | 全タスクアクセス可 | API経由 | アップロードファイル、ログ保管 |

---

## 15. DOP試験対策 Q&A

### Q1: タスク実行ロールとタスクロールの使い分けは？

<details>
<summary>回答を見る</summary>

| ロール | 使用者 | 用途 | 設定箇所 |
|-------|--------|------|---------|
| **Task Execution Role** | ECSエージェント | ECRからイメージプル、CW Logsへ書き込み、Secrets Managerからシークレット取得 | `executionRoleArn` |
| **Task Role** | コンテナ内アプリ | S3アクセス、DynamoDB操作、SQS送受信など | `taskRoleArn` |

**試験での引っ掛け**: 「アプリからS3にアクセスできない」→ Task Roleの権限不足（Task Execution Roleではない）
</details>

### Q2: ローリングアップデートでダウンタイムを防ぐには？

<details>
<summary>回答を見る</summary>

```json
{
  "deploymentConfiguration": {
    "minimumHealthyPercent": 100,
    "maximumPercent": 200,
    "deploymentCircuitBreaker": {
      "enable": true,
      "rollback": true
    }
  }
}
```

- `minimumHealthyPercent=100`: 常に必要数のタスクが稼働
- `maximumPercent=200`: 一時的に2倍まで許容して新旧共存
- Circuit Breaker: 新タスクが起動失敗したら自動ロールバック
</details>

### Q3: Fargate と EC2 起動タイプの選択基準は？

<details>
<summary>回答を見る</summary>

**Fargate を選ぶ場合**:
- 運用負荷を最小化したい
- バースト対応で予測不能な負荷がある
- GPU不要

**EC2 を選ぶ場合**:
- GPU インスタンスが必要
- コスト最適化が最優先（大規模・安定負荷）
- ホストレベルのカスタマイズが必要（特殊カーネルモジュール等）
- Windows コンテナを実行する

**試験のポイント**: 「コスト最適化」というキーワードがあれば、まず Fargate Spot + Capacity Provider Strategy を検討。大規模安定負荷なら EC2 + Savings Plans。
</details>

### Q4: ECS でのシークレット管理のベストプラクティスは？

<details>
<summary>回答を見る</summary>

```
❌ 悪い: 環境変数に直接値を設定
   "environment": [{"name":"DB_PASS","value":"plaintext-password"}]

✅ 良い: Secrets Manager / Parameter Store を参照
   "secrets": [{"name":"DB_PASS","valueFrom":"arn:aws:secretsmanager:..."}]
```

| 方法 | 自動ローテーション | コスト | 推奨用途 |
|------|-------------------|--------|---------|
| Secrets Manager | あり | $0.40/月/シークレット | DB認証情報、APIキー |
| SSM Parameter Store (SecureString) | なし | 標準パラメータ無料 | 設定値、エンドポイント |

**Task Execution Role** に Secrets Manager / SSM へのアクセス権限が必要。
</details>

### Q5: Blue/Green デプロイで AllAtOnce と Canary の違いは？

<details>
<summary>回答を見る</summary>

| 戦略 | 動作 | リスク | 復旧時間 |
|------|------|--------|---------|
| **AllAtOnce** | 即座に100%切替 | 高 | 即座（切り戻し） |
| **Canary10Percent5Minutes** | 10%→5分観察→残り90% | 低 | 5分以内に検知 |
| **Canary10Percent15Minutes** | 10%→15分観察→残り90% | 最低 | 15分以内に検知 |
| **Linear10PercentEvery1Minutes** | 1分ごとに10%ずつ | 中 | 段階的に検知 |

**試験のポイント**:
- 「リスクを最小化」→ Canary
- 「迅速なデプロイ」→ AllAtOnce
- 「段階的にモニタリング」→ Linear
- Blue/Green には ALB + 2つの Target Group が必須
</details>

### Q6: Container Insights で取得できるメトリクスは？

<details>
<summary>回答を見る</summary>

| レベル | メトリクス | 用途 |
|--------|----------|------|
| **クラスター** | CpuUtilized, MemoryUtilized, RunningTaskCount | 全体負荷把握 |
| **サービス** | DesiredTaskCount, RunningTaskCount, PendingTaskCount | サービス健全性 |
| **タスク** | CpuUtilized, MemoryUtilized, NetworkRxBytes/TxBytes | 個別タスク分析 |

**有効化**: `aws ecs update-cluster-settings --cluster NAME --settings name=containerInsights,value=enabled`

**試験のポイント**: Container Insights は **追加料金** が発生する（CloudWatch Logs への送信量）。デフォルトでは無効。
</details>

### Q7: imagedefinitions.json と imageDetail.json の違いは？

<details>
<summary>回答を見る</summary>

| ファイル | 用途 | 形式 |
|---------|------|------|
| **imagedefinitions.json** | 標準ECSデプロイ（ローリング） | `[{"name":"container","imageUri":"..."}]` |
| **imageDetail.json** | CodeDeploy Blue/Green デプロイ | `{"ImageURI":"..."}` |

**試験での引っ掛け**:
- ローリングアップデート → `imagedefinitions.json`
- Blue/Green（CodeDeploy経由）→ `imageDetail.json` + `appspec.yaml` + `taskdef.json`
</details>

### Q8: Service Connect と Service Discovery の選択基準は？

<details>
<summary>回答を見る</summary>

| | Service Discovery | Service Connect |
|---|---|---|
| **通信方式** | DNS (A/SRV レコード) | Envoy プロキシ |
| **ヘルスチェック** | Route 53 ヘルスチェック | Envoy L7 ヘルスチェック |
| **リトライ** | アプリ側で実装 | 自動（Envoy） |
| **可観測性** | なし | メトリクス自動収集 |
| **推奨** | レガシー / シンプル構成 | 新規構築（推奨） |

**試験のポイント**: 「サービス間通信にリトライとメトリクスが必要」→ Service Connect。「DNS名での通信のみ」→ Service Discovery。
</details>

### Q9: Fargate Spot の中断に備えるには？

<details>
<summary>回答を見る</summary>

1. **SIGTERM ハンドリング**: アプリが SIGTERM を受けて30秒以内にgraceful shutdown
2. **複数タスク**: desired count を2以上に設定し単一障害を回避
3. **Capacity Provider Strategy**: base で最低限の FARGATE を確保

```
capacityProvider=FARGATE,weight=1,base=2     ← 最低2タスクは安定
capacityProvider=FARGATE_SPOT,weight=3        ← 追加分はSpot
```

4. **冪等性**: 中断されても再実行可能な設計
5. **チェックポイント**: 長時間処理は途中結果をS3/DynamoDBに保存
</details>

### Q10: ECR のイメージタグ不変性（immutability）はなぜ重要？

<details>
<summary>回答を見る</summary>

```bash
# イメージタグ不変性を有効化
aws ecr put-image-tag-mutability \
  --repository-name my-app \
  --image-tag-mutability IMMUTABLE
```

**理由**:
1. **デプロイの再現性**: `v1.0.0` が常に同じイメージを指す
2. **ロールバックの信頼性**: 以前のタグに戻せば確実に以前のバージョンに戻る
3. **監査**: どのバージョンがいつデプロイされたか追跡可能

**タグ不変性なし（MUTABLE）のリスク**:
- `latest` タグを上書き → 意図しないバージョンがデプロイされる
- CI/CDで同じタグを再プッシュ → ロールバック不可能
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
- [ECS Service Connect](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/service-connect.html)
- [ECS Exec](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/ecs-exec.html)
- [FireLens (Fluent Bit)](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/using_firelens.html)

---

**作成日**: 2026-02-03
**最終更新**: 2026-02-10
**検証環境**: AWS ap-northeast-1 リージョン
