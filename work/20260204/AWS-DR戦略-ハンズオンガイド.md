# AWS DR（災害復旧）戦略 ハンズオンガイド

> **対象**: AWS DevOps Professional (DOP-C02) 試験対策
> **前提知識**: AWS基礎、VPC、RDS、S3、Route 53基本概念
> **所要時間**: 約5時間

---

## 目次

1. [DR概要](#1-dr概要)
2. [4つのDR戦略](#2-4つのdr戦略)
3. [DR戦略の比較](#3-dr戦略の比較)
4. [AWS Backup](#4-aws-backup)
5. [Route 53フェイルオーバー](#5-route-53フェイルオーバー)
6. [RDS/Aurora DR](#6-rdsaurora-dr)
7. [S3クロスリージョンレプリケーション](#7-s3クロスリージョンレプリケーション)
8. [EBS/EC2のDR対策](#8-ebsec2のdr対策)
9. [DRテスト・GameDay戦略](#9-drテストgameday戦略)
10. [ハンズオン演習](#10-ハンズオン演習)
11. [DOP試験対策チェックリスト](#11-dop試験対策チェックリスト)

---

## 1. DR概要

### 1.1 災害復旧（Disaster Recovery）とは

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Disaster Recovery (DR)                               │
│                    災害からの事業復旧戦略                                │
│                                                                        │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │                    災害の種類                                    │  │
│  │                                                                  │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐      │  │
│  │  │  自然災害 │  │ ハードウェ│  │ ソフトウェ│  │ 人為的   │      │  │
│  │  │ 地震/洪水│  │ ア障害   │  │ ア障害   │  │ ミス/攻撃│      │  │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘      │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                        │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │                    主要メトリクス                                │  │
│  │                                                                  │  │
│  │  RPO (Recovery Point Objective)  = データ損失許容量              │  │
│  │  RTO (Recovery Time Objective)   = 復旧時間目標                  │  │
│  └────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.2 RPO / RTO の定義

```
【RPO / RTO タイムライン】

            RPO                          RTO
       ◄──────────────►          ◄──────────────────►
       データ損失許容時間         サービス復旧目標時間

───────┬──────────────────┬──────────────────────────┬──────▶ 時間
       │                  │                          │
    最終バックアップ     障害発生                   復旧完了
    (最終正常データ)     (Down開始)               (サービス再開)

例:
  RPO = 1時間  → 最大1時間分のデータ損失を許容
  RTO = 4時間  → 障害発生から4時間以内にサービス再開
```

### 1.3 ビジネス影響分析（BIA）

| 分析項目 | 内容 | 判断基準 |
|---------|------|---------|
| **業務影響度** | ダウンタイムによる損失額 | 1時間あたりの売上損失 |
| **データ重要度** | データ損失の影響範囲 | 再作成の可否・コスト |
| **コンプライアンス** | 規制要件でのRPO/RTO | 業界規制・SLA |
| **顧客影響** | エンドユーザーへの影響 | 影響ユーザー数・ブランド |
| **DR投資対効果** | DR構築コスト vs ダウンコスト | TCO分析 |

```
【BIAに基づくDR戦略選定フロー】

  ダウンタイムコスト/時間?
         │
    ┌────┴─────┐
    │          │
   低い       高い
    │          │
    ▼          ▼
  RPO/RTO    RPO/RTO
  数時間～日  分～秒
    │          │
    ▼          ▼
  Backup &   Warm Standby /
  Restore    Multi-Site
  Pilot Light  Active/Active
```

### 1.4 DOP試験での出題ポイント

| トピック | 重要度 | 主な出題内容 |
|---------|--------|-------------|
| **DR戦略の選定** | ★★★★★ | 要件に基づく最適な戦略選択 |
| **RPO/RTO設計** | ★★★★★ | 各戦略のRPO/RTO範囲 |
| **AWS Backup** | ★★★★★ | バックアッププラン・クロスリージョン |
| **Route 53フェイルオーバー** | ★★★★★ | ヘルスチェック・フェイルオーバー設定 |
| **Aurora Global Database** | ★★★★★ | クロスリージョンレプリケーション |
| **S3レプリケーション** | ★★★★☆ | CRR/SRR設定と制約 |
| **DRテスト** | ★★★★☆ | テスト戦略・GameDay |
| **CloudFormation StackSets** | ★★★★☆ | マルチリージョンDRインフラ展開 |
| **Elastic Disaster Recovery** | ★★★☆☆ | サーバーレベルのDR |

---

## 2. 4つのDR戦略

### 2.1 Backup & Restore（バックアップ＆リストア）

```
【Backup & Restore アーキテクチャ】

┌─────────── Primary Region (ap-northeast-1) ───────────┐
│                                                         │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐               │
│  │  EC2    │  │  RDS    │  │   S3    │               │
│  │ (稼働中)│  │ (稼働中)│  │ (稼働中)│               │
│  └────┬────┘  └────┬────┘  └────┬────┘               │
│       │            │            │                      │
│       ▼            ▼            ▼                      │
│  ┌─────────────────────────────────────┐              │
│  │       AWS Backup / スナップショット  │              │
│  └──────────────────┬──────────────────┘              │
│                      │                                  │
└──────────────────────┼──────────────────────────────────┘
                       │ クロスリージョンコピー
                       ▼
┌──────────── DR Region (us-west-2) ────────────────────┐
│                                                         │
│  ┌─────────────────────────────────────┐              │
│  │     バックアップ保管                  │              │
│  │     ・AMI コピー                     │              │
│  │     ・RDS スナップショット            │              │
│  │     ・S3 レプリケーション             │              │
│  └─────────────────────────────────────┘              │
│                                                         │
│  ※ 障害時にバックアップからリソースを復元               │
│  ※ インフラは障害時まで構築しない                       │
│                                                         │
│  RPO: 数時間   RTO: 数時間～24時間                     │
│  コスト: 最小（ストレージ費用のみ）                      │
└─────────────────────────────────────────────────────────┘
```

**特徴**:
- 最もコストが低い戦略
- バックアップデータのみをDRリージョンに保管
- 復旧時にすべてのリソースを再構築する必要がある
- RPO: 最終バックアップからの経過時間（数時間）
- RTO: 再構築に要する時間（数時間～24時間）

**適用シナリオ**: 非クリティカルなワークロード、コスト優先

### 2.2 Pilot Light（パイロットライト）

```
【Pilot Light アーキテクチャ】

┌─────────── Primary Region (ap-northeast-1) ───────────┐
│                                                         │
│  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐     │
│  │  ALB   │  │  EC2   │  │  EC2   │  │  RDS   │     │
│  │(Active)│─▶│  Web   │─▶│  App   │─▶│ Primary│     │
│  └────────┘  └────────┘  └────────┘  └───┬────┘     │
│                                           │           │
└───────────────────────────────────────────┼───────────┘
                                            │ レプリケーション
                                            ▼
┌──────────── DR Region (us-west-2) ────────────────────┐
│                                                         │
│  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐     │
│  │  ALB   │  │  EC2   │  │  EC2   │  │  RDS   │     │
│  │(未使用)│  │  Web   │  │  App   │  │Read    │     │
│  │        │  │(停止中)│  │(停止中)│  │Replica │     │
│  └────────┘  └────────┘  └────────┘  └────────┘     │
│                                                         │
│  ※ コアインフラ（DB）のみ常時稼働                      │
│  ※ コンピュートリソースは障害時に起動                   │
│                                                         │
│  RPO: 数分～1時間   RTO: 数十分～数時間                │
│  コスト: 低～中（DB費用 + 最小構成）                    │
└─────────────────────────────────────────────────────────┘
```

**特徴**:
- データベース等のコアコンポーネントのみ常時稼働
- Webサーバー・アプリサーバーは停止状態（AMI準備済み）
- 復旧時にコンピュートリソースを起動しスケールアップ
- Backup & Restoreより高速だがコストも増加

**適用シナリオ**: RPOが数分～1時間、RTOが数時間以内の要件

### 2.3 Warm Standby（ウォームスタンバイ）

```
【Warm Standby アーキテクチャ】

┌─────────── Primary Region (ap-northeast-1) ───────────┐
│                                                         │
│  Route 53 ─── Weight: 100                               │
│       │                                                  │
│       ▼                                                  │
│  ┌────────┐  ┌──────────────┐  ┌────────┐             │
│  │  ALB   │  │  ASG         │  │  RDS   │             │
│  │(Active)│─▶│  EC2 x 4     │─▶│ Primary│             │
│  └────────┘  │  (本番規模)   │  └───┬────┘             │
│              └──────────────┘      │                    │
└────────────────────────────────────┼────────────────────┘
                                     │ レプリケーション
                                     ▼
┌──────────── DR Region (us-west-2) ────────────────────┐
│                                                         │
│  Route 53 ─── Weight: 0 (フェイルオーバー時に有効化)    │
│       │                                                  │
│       ▼                                                  │
│  ┌────────┐  ┌──────────────┐  ┌────────┐             │
│  │  ALB   │  │  ASG         │  │  RDS   │             │
│  │(Standby│─▶│  EC2 x 1     │─▶│Read    │             │
│  │)       │  │  (縮小版)    │  │Replica │             │
│  └────────┘  └──────────────┘  └────────┘             │
│                                                         │
│  ※ 本番の縮小版が常時稼働                              │
│  ※ 障害時にスケールアウト + DB昇格                     │
│                                                         │
│  RPO: 秒～数分   RTO: 数分～数十分                     │
│  コスト: 中～高（縮小版インフラの常時稼働）             │
└─────────────────────────────────────────────────────────┘
```

**特徴**:
- DRリージョンに本番環境の縮小版を常時稼働
- フェイルオーバー時にスケールアップ/アウト
- RDS Read ReplicaをPrimaryに昇格
- 復旧が高速（リソースは既に稼働中）

**適用シナリオ**: RPOが秒～数分、RTOが数十分以内の要件

### 2.4 Multi-Site Active/Active（マルチサイト アクティブ/アクティブ）

```
【Multi-Site Active/Active アーキテクチャ】

                    ┌──────────┐
                    │ Route 53 │
                    │ Latency  │
                    │ Based    │
                    └────┬─────┘
                    ┌────┴─────┐
                    │          │
         ┌──────────┘          └──────────┐
         ▼                                 ▼
┌─────── Primary (ap-northeast-1) ──┐ ┌─── Active (us-west-2) ──────┐
│                                    │ │                              │
│  ┌────────┐  ┌──────┐  ┌──────┐ │ │ ┌──────┐  ┌──────┐  ┌────┐│
│  │  ALB   │─▶│ ASG  │─▶│Aurora│ │ │ │ ALB  │─▶│ ASG  │─▶│Aur.││
│  │        │  │ x 4  │  │ Pri. │ │ │ │      │  │ x 4  │  │Sec.││
│  └────────┘  └──────┘  └──┬───┘ │ │ └──────┘  └──────┘  └─┬──┘│
│                            │     │ │                        │    │
│  ┌──────────────┐         │     │ │ ┌──────────────┐      │    │
│  │ DynamoDB     │         │     │ │ │ DynamoDB     │      │    │
│  │ Global Table │◄────────┼─────┼─┼─│ Global Table │      │    │
│  └──────────────┘         │     │ │ └──────────────┘      │    │
│                            │     │ │                        │    │
└────────────────────────────┼─────┘ └────────────────────────┼────┘
                             │                                │
                             └────── Aurora Global DB ────────┘
                               (1秒未満のレプリケーション)

  ※ 両リージョンが同時にトラフィックを処理
  ※ データは双方向レプリケーション
  ※ Route 53 Latency Basedルーティングで最寄りリージョンへ

  RPO: ほぼゼロ（秒未満）   RTO: ほぼゼロ（秒～分）
  コスト: 最大（全リージョンでフルスケール稼働）
```

**特徴**:
- 複数リージョンが同時にリクエストを処理
- Aurora Global Database / DynamoDB Global Tablesでデータ同期
- Route 53 Latency BasedまたはGeolocationルーティング
- 障害時はDNS切り替えのみ（既にアクティブ）
- 最も高い可用性・最短のRPO/RTO

**適用シナリオ**: ミッションクリティカル、ゼロダウンタイム要件

---

## 3. DR戦略の比較

### 3.1 RPO / RTO / コスト比較表

| 戦略 | RPO | RTO | コスト | 複雑度 | 適用例 |
|------|-----|-----|--------|--------|--------|
| **Backup & Restore** | 数時間 | 24時間以内 | $ | 低 | 開発環境、非クリティカルシステム |
| **Pilot Light** | 数分～1時間 | 数十分～数時間 | $$ | 中 | 中規模業務システム |
| **Warm Standby** | 秒～数分 | 数分～数十分 | $$$ | 高 | 重要業務システム、EC/金融 |
| **Multi-Site Active/Active** | ほぼゼロ | ほぼゼロ | $$$$ | 最高 | ミッションクリティカル |

### 3.2 戦略別 AWSサービス利用マッピング

```
【DR戦略別 AWSサービス対応表】

                    Backup &    Pilot      Warm       Multi-Site
                    Restore     Light      Standby    Active/Active
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
コンピュート
  EC2/ASG           AMI保管     停止/最小   縮小稼働    フル稼働
  Lambda            -           デプロイ済   デプロイ済  デプロイ済
  ECS/EKS           -           最小構成    縮小稼働    フル稼働

データベース
  RDS               スナップ    Read Rep.   Read Rep.   Multi-Region
  Aurora            スナップ    Global DB   Global DB   Global DB
  DynamoDB          バックアップ Global Tab. Global Tab. Global Tab.

ストレージ
  S3                CRR         CRR         CRR         CRR
  EBS               スナップ    スナップ    稼働中      稼働中
  EFS               バックアップ バックアップ レプリカ    レプリカ

ネットワーク
  Route 53          手動切替    フェイルオーバー  Weighted    Latency Based
  CloudFront        -           Origin切替   Origin切替  Multi-Origin
  Global Accel.     -           -            Endpoint切替 両方Active

管理
  AWS Backup        必須        補助的       補助的      補助的
  CloudFormation    DR用テンプレート StackSets  StackSets  StackSets
  Systems Manager   Automation  Automation   Automation  Automation
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### 3.3 コスト構造の比較

```
【コスト構造（月額イメージ）】

Backup & Restore:
  ████░░░░░░░░░░░░░░░░  ストレージのみ = 低コスト
  $100-500/月

Pilot Light:
  ████████░░░░░░░░░░░░  DB + 最小構成 = 低中コスト
  $500-2,000/月

Warm Standby:
  █████████████░░░░░░░  縮小版フルスタック = 中高コスト
  $2,000-10,000/月

Multi-Site Active/Active:
  ████████████████████  フルスケール x2 = 最大コスト
  $10,000+/月

  ※ 実際のコストはワークロードにより大幅に変動
```

---

## 4. AWS Backup

### 4.1 AWS Backupの概要

```
┌─────────────────────────────────────────────────────────────────────┐
│                         AWS Backup                                     │
│                  統合バックアップサービス                               │
│                                                                        │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  Backup Plan（バックアッププラン）                               │  │
│  │  ├─ スケジュール（Cron/Rate式）                                │  │
│  │  ├─ 保持期間（日数/無期限）                                    │  │
│  │  ├─ ライフサイクル（Cold Storageへの移行）                      │  │
│  │  └─ コピールール（クロスリージョン/アカウント）                 │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                        │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  Backup Vault（バックアップボールト）                            │  │
│  │  ├─ 暗号化（KMSキー）                                          │  │
│  │  ├─ アクセスポリシー（Vault Policy）                            │  │
│  │  └─ Vault Lock（WORM: Write Once Read Many）                    │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                        │
│  対応サービス:                                                         │
│  EC2, EBS, RDS, Aurora, DynamoDB, EFS, FSx,                           │
│  S3, Storage Gateway, DocumentDB, Neptune, Redshift, SAP HANA         │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.2 バックアッププラン構成

```
【バックアッププラン構成図】

┌── Backup Plan ──────────────────────────────────────────┐
│                                                          │
│  ┌── Rule 1: Daily Backup ─────────────────────────┐   │
│  │  Schedule:  cron(0 5 ? * * *)  ← 毎日UTC 5:00   │   │
│  │  Retention: 35日                                  │   │
│  │  Lifecycle: 7日後にCold Storage                   │   │
│  │  Copy to:   us-west-2 (クロスリージョン)          │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  ┌── Rule 2: Monthly Backup ───────────────────────┐   │
│  │  Schedule:  cron(0 5 1 * ? *)  ← 毎月1日        │   │
│  │  Retention: 365日                                 │   │
│  │  Lifecycle: 30日後にCold Storage                  │   │
│  │  Copy to:   us-west-2 + Cross-Account             │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  ┌── Resource Assignment ──────────────────────────┐   │
│  │  Selection:  Tag: Backup = true                   │   │
│  │  IAM Role:   AWSBackupDefaultServiceRole          │   │
│  │  対象:       EC2, RDS, EBS, DynamoDB              │   │
│  └──────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

### 4.3 バックアッププラン作成（CLI）

```bash
# バックアップボールト作成
aws backup create-backup-vault \
  --backup-vault-name dr-vault \
  --encryption-key-arn arn:aws:kms:ap-northeast-1:123456789012:key/xxxx-xxxx

# DRリージョンにもボールト作成
aws backup create-backup-vault \
  --backup-vault-name dr-vault-replica \
  --encryption-key-arn arn:aws:kms:us-west-2:123456789012:key/yyyy-yyyy \
  --region us-west-2

# バックアッププラン作成
aws backup create-backup-plan --backup-plan '{
  "BackupPlanName": "DailyBackupPlan",
  "Rules": [
    {
      "RuleName": "DailyRule",
      "TargetBackupVaultName": "dr-vault",
      "ScheduleExpression": "cron(0 5 ? * * *)",
      "StartWindowMinutes": 60,
      "CompletionWindowMinutes": 180,
      "Lifecycle": {
        "MoveToColdStorageAfterDays": 30,
        "DeleteAfterDays": 365
      },
      "CopyActions": [
        {
          "DestinationBackupVaultArn": "arn:aws:backup:us-west-2:123456789012:backup-vault:dr-vault-replica",
          "Lifecycle": {
            "MoveToColdStorageAfterDays": 30,
            "DeleteAfterDays": 365
          }
        }
      ]
    }
  ]
}'

# リソース割り当て（タグベース）
PLAN_ID=$(aws backup list-backup-plans \
  --query "BackupPlansList[?BackupPlanName=='DailyBackupPlan'].BackupPlanId" \
  --output text)

aws backup create-backup-selection \
  --backup-plan-id ${PLAN_ID} \
  --backup-selection '{
    "SelectionName": "TagBasedSelection",
    "IamRoleArn": "arn:aws:iam::123456789012:role/AWSBackupDefaultServiceRole",
    "ListOfTags": [
      {
        "ConditionType": "STRINGEQUALS",
        "ConditionKey": "Backup",
        "ConditionValue": "true"
      }
    ]
  }'
```

### 4.4 Vault Lock（コンプライアンス対応）

```bash
# Vault Lock設定（WORM）
# ※ 一度設定すると変更・削除不可（コンプライアンスモード）
aws backup put-backup-vault-lock-configuration \
  --backup-vault-name dr-vault \
  --min-retention-days 365 \
  --max-retention-days 2555 \
  --changeable-for-days 3

# Vault Lockステータス確認
aws backup describe-backup-vault \
  --backup-vault-name dr-vault \
  --query "{VaultName:BackupVaultName, Locked:Locked, MinRetention:MinRetentionDays, MaxRetention:MaxRetentionDays}"
```

**Vault Lockの重要ポイント**:

| モード | 説明 | 変更可否 |
|--------|------|---------|
| **Governance Mode** | `changeable-for-days` 期間中は変更可能 | 猶予期間中のみ |
| **Compliance Mode** | 猶予期間終了後は完全に不変 | 不可（rootでも不可） |

### 4.5 クロスアカウントバックアップ

```
【クロスアカウントバックアップ構成】

┌── Account A (本番) ──────────┐    ┌── Account B (DR) ──────────┐
│                               │    │                             │
│  ┌─────────┐  ┌──────────┐  │    │  ┌──────────┐              │
│  │ Resources│─▶│ Backup   │──┼────┼─▶│ Backup   │              │
│  │          │  │ Vault A  │  │    │  │ Vault B  │              │
│  └─────────┘  └──────────┘  │    │  └──────────┘              │
│                               │    │                             │
│  AWS Organizations            │    │  別アカウントで保護         │
│  でのopt-in必須               │    │  ランサムウェア対策に有効   │
└───────────────────────────────┘    └─────────────────────────────┘

前提条件:
1. AWS Organizations でクロスアカウントバックアップを有効化
2. 宛先アカウントのVault Policyで送信元アカウントを許可
3. 送信元のバックアッププランにCopy Actionを設定
```

```bash
# Organizations でクロスアカウントバックアップ有効化
aws organizations enable-aws-service-access \
  --service-principal backup.amazonaws.com

# DRアカウントのVault Policy設定（DRアカウントで実行）
aws backup put-backup-vault-access-policy \
  --backup-vault-name dr-vault-cross-account \
  --policy '{
    "Version": "2012-10-17",
    "Statement": [
      {
        "Effect": "Allow",
        "Principal": {"AWS": "arn:aws:iam::111111111111:root"},
        "Action": "backup:CopyIntoBackupVault",
        "Resource": "*"
      }
    ]
  }'
```

---

## 5. Route 53フェイルオーバー

### 5.1 Route 53ヘルスチェック

```
【Route 53 ヘルスチェック アーキテクチャ】

┌─────────────────────────────────────────────────────────────────────┐
│                   Route 53 ヘルスチェック                              │
│                                                                        │
│  ┌────────────┐     ┌────────────┐     ┌────────────┐              │
│  │ Endpoint   │     │ Calculated │     │ CloudWatch │              │
│  │ ヘルスチェック │  │ ヘルスチェック │  │ Alarm連動  │              │
│  │            │     │            │     │            │              │
│  │ HTTP/HTTPS │     │ 複数HCの   │     │ メトリクス │              │
│  │ TCP        │     │ 組み合わせ │     │ ベース     │              │
│  └─────┬──────┘     └─────┬──────┘     └─────┬──────┘              │
│        │                   │                   │                      │
│        └───────────────────┼───────────────────┘                      │
│                            ▼                                          │
│                    ┌──────────────┐                                  │
│                    │  Routing     │                                  │
│                    │  Policy      │                                  │
│                    │  フェイルオーバー│                              │
│                    └──────────────┘                                  │
└─────────────────────────────────────────────────────────────────────┘
```

### 5.2 フェイルオーバールーティング設定

```
【Route 53 Failover Routing】

ユーザー
  │
  ▼
Route 53
  │
  ├── Primary Record (Failover: PRIMARY)
  │   ├── Health Check: HC-Primary (Healthy)
  │   └── → ALB (ap-northeast-1)
  │
  └── Secondary Record (Failover: SECONDARY)
      ├── Health Check: HC-Secondary (optional)
      └── → ALB (us-west-2)

通常時:  ユーザー → Primary (ap-northeast-1)
障害時:  ユーザー → Secondary (us-west-2)
         （Primary Health Check が Unhealthy になった場合）
```

```bash
# ヘルスチェック作成（プライマリ）
aws route53 create-health-check --caller-reference "primary-hc-$(date +%s)" \
  --health-check-config '{
    "Type": "HTTPS",
    "FullyQualifiedDomainName": "api.example.com",
    "Port": 443,
    "ResourcePath": "/health",
    "RequestInterval": 10,
    "FailureThreshold": 3,
    "EnableSNI": true,
    "Regions": ["ap-northeast-1", "us-east-1", "eu-west-1"]
  }'

# Calculated ヘルスチェック（複数HCの論理組み合わせ）
aws route53 create-health-check --caller-reference "calc-hc-$(date +%s)" \
  --health-check-config '{
    "Type": "CALCULATED",
    "HealthThreshold": 2,
    "ChildHealthChecks": [
      "hc-id-1",
      "hc-id-2",
      "hc-id-3"
    ]
  }'

# CloudWatchアラーム連動ヘルスチェック
aws route53 create-health-check --caller-reference "cw-hc-$(date +%s)" \
  --health-check-config '{
    "Type": "CLOUDWATCH_METRIC",
    "InsufficientDataHealthStatus": "LastKnownStatus",
    "AlarmIdentifier": {
      "Region": "ap-northeast-1",
      "Name": "HighErrorRate"
    }
  }'
```

### 5.3 フェイルオーバーレコード作成

```bash
# プライマリレコード
aws route53 change-resource-record-sets \
  --hosted-zone-id Z1234567890 \
  --change-batch '{
    "Changes": [
      {
        "Action": "CREATE",
        "ResourceRecordSet": {
          "Name": "app.example.com",
          "Type": "A",
          "SetIdentifier": "Primary",
          "Failover": "PRIMARY",
          "AliasTarget": {
            "HostedZoneId": "Z35SXDOTRQ7X7K",
            "DNSName": "alb-primary-123456.ap-northeast-1.elb.amazonaws.com",
            "EvaluateTargetHealth": true
          },
          "HealthCheckId": "hc-primary-id"
        }
      }
    ]
  }'

# セカンダリレコード
aws route53 change-resource-record-sets \
  --hosted-zone-id Z1234567890 \
  --change-batch '{
    "Changes": [
      {
        "Action": "CREATE",
        "ResourceRecordSet": {
          "Name": "app.example.com",
          "Type": "A",
          "SetIdentifier": "Secondary",
          "Failover": "SECONDARY",
          "AliasTarget": {
            "HostedZoneId": "Z1H1FL5HABSF5",
            "DNSName": "alb-secondary-789012.us-west-2.elb.amazonaws.com",
            "EvaluateTargetHealth": true
          }
        }
      }
    ]
  }'
```

### 5.4 Route 53ルーティングポリシー比較（DR観点）

| ポリシー | DR用途 | 特徴 |
|---------|--------|------|
| **Failover** | Primary/Secondary構成 | ヘルスチェック連動で自動切替 |
| **Weighted** | Warm Standby構成 | 重み付けで段階的に切替可能 |
| **Latency** | Multi-Site Active/Active | 最寄りリージョンにルーティング |
| **Geolocation** | リージョン別Active/Active | 地理的にルーティング |
| **Multivalue Answer** | 複数エンドポイント分散 | 簡易的なロードバランシング |

---

## 6. RDS/Aurora DR

### 6.1 RDS Multi-AZ

```
【RDS Multi-AZ 構成】

┌─────────── Region (ap-northeast-1) ───────────────────┐
│                                                         │
│  ┌─── AZ-a ──────────────┐  ┌─── AZ-c ──────────────┐│
│  │                        │  │                        ││
│  │  ┌──────────────────┐ │  │ ┌──────────────────┐  ││
│  │  │   RDS Primary    │ │  │ │   RDS Standby    │  ││
│  │  │   (Read/Write)   │─┼──┼─│   (同期レプリカ) │  ││
│  │  │                  │ │  │ │   (アクセス不可) │  ││
│  │  └──────────────────┘ │  │ └──────────────────┘  ││
│  │                        │  │                        ││
│  └────────────────────────┘  └────────────────────────┘│
│                                                         │
│  特徴:                                                  │
│  ・同期レプリケーション（RPO = 0）                      │
│  ・自動フェイルオーバー（RTO = 60-120秒）               │
│  ・同一リージョン内の可用性のみ                         │
│  ・Standbyは読み取りアクセス不可                        │
└─────────────────────────────────────────────────────────┘
```

### 6.2 RDS Multi-AZ Cluster（新機能）

```
【RDS Multi-AZ DB Cluster】

┌─────────── Region (ap-northeast-1) ───────────────────┐
│                                                         │
│  ┌── AZ-a ────┐  ┌── AZ-c ────┐  ┌── AZ-d ────┐    │
│  │             │  │             │  │             │    │
│  │ ┌────────┐ │  │ ┌────────┐ │  │ ┌────────┐ │    │
│  │ │Writer  │ │  │ │Reader  │ │  │ │Reader  │ │    │
│  │ │Instance│─┼──┼─│Instance│ │  │ │Instance│ │    │
│  │ │(R/W)   │ │  │ │(Read)  │─┼──┼─│(Read)  │ │    │
│  │ └────────┘ │  │ └────────┘ │  │ └────────┘ │    │
│  └─────────────┘  └─────────────┘  └─────────────┘    │
│                                                         │
│  特徴:                                                  │
│  ・Writer 1台 + Reader 2台（3AZ構成）                  │
│  ・半同期レプリケーション                               │
│  ・Readerへの読み取りアクセス可能                       │
│  ・フェイルオーバー: 35秒以内                           │
│  ・対応: MySQL, PostgreSQL                              │
└─────────────────────────────────────────────────────────┘
```

### 6.3 RDS Read Replica（クロスリージョン）

```
【RDS クロスリージョン Read Replica】

┌─── Primary Region ───────┐     ┌─── DR Region ────────────┐
│                           │     │                           │
│  ┌──────────────────┐   │     │  ┌──────────────────┐    │
│  │   RDS Primary    │───┼─────┼─▶│  Read Replica    │    │
│  │   (Read/Write)   │   │     │  │  (Read Only)     │    │
│  └──────────────────┘   │     │  └──────────────────┘    │
│                           │     │                           │
│  非同期レプリケーション    │     │  障害時に昇格可能         │
│  (レプリケーションラグあり)│     │  promote-read-replica     │
└───────────────────────────┘     └───────────────────────────┘
```

```bash
# クロスリージョン Read Replica 作成
aws rds create-db-instance-read-replica \
  --db-instance-identifier mydb-dr-replica \
  --source-db-instance-identifier arn:aws:rds:ap-northeast-1:123456789012:db:mydb-primary \
  --region us-west-2 \
  --db-instance-class db.r6g.large \
  --storage-encrypted \
  --kms-key-id arn:aws:kms:us-west-2:123456789012:key/dr-key-id

# レプリケーションラグ確認
aws cloudwatch get-metric-statistics \
  --namespace AWS/RDS \
  --metric-name ReplicaLag \
  --dimensions Name=DBInstanceIdentifier,Value=mydb-dr-replica \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Average \
  --region us-west-2

# Read Replica を Primary に昇格（DR発動時）
aws rds promote-read-replica \
  --db-instance-identifier mydb-dr-replica \
  --region us-west-2

# 昇格完了待ち
aws rds wait db-instance-available \
  --db-instance-identifier mydb-dr-replica \
  --region us-west-2
```

### 6.4 Aurora Global Database

```
【Aurora Global Database アーキテクチャ】

┌─── Primary Region (ap-northeast-1) ────────────────────┐
│                                                          │
│  ┌── Aurora Cluster (Primary) ────────────────────┐    │
│  │                                                  │    │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐     │    │
│  │  │  Writer  │  │  Reader  │  │  Reader  │     │    │
│  │  │ Instance │  │ Instance │  │ Instance │     │    │
│  │  └──────────┘  └──────────┘  └──────────┘     │    │
│  │                                                  │    │
│  │  ┌──────────────────────────────────────────┐  │    │
│  │  │        共有ストレージ (6コピー/3AZ)       │  │    │
│  │  └────────────────────┬─────────────────────┘  │    │
│  └───────────────────────┼────────────────────────┘    │
│                           │                              │
└───────────────────────────┼──────────────────────────────┘
                            │  ストレージレベル
                            │  レプリケーション
                            │  (通常1秒未満のラグ)
                            ▼
┌─── Secondary Region (us-west-2) ───────────────────────┐
│                                                          │
│  ┌── Aurora Cluster (Secondary) ──────────────────┐    │
│  │                                                  │    │
│  │  ┌──────────┐  ┌──────────┐                    │    │
│  │  │  Reader  │  │  Reader  │                    │    │
│  │  │ Instance │  │ Instance │                    │    │
│  │  └──────────┘  └──────────┘                    │    │
│  │                                                  │    │
│  │  ┌──────────────────────────────────────────┐  │    │
│  │  │        共有ストレージ (レプリカ)          │  │    │
│  │  └──────────────────────────────────────────┘  │    │
│  └────────────────────────────────────────────────┘    │
│                                                          │
│  フェイルオーバー時: Secondary → Primary に昇格          │
│  ・Managed Planned Failover: RPO=0, RTO=数分             │
│  ・Unplanned Failover: RPO=通常1秒未満, RTO=1分未満      │
└──────────────────────────────────────────────────────────┘
```

```bash
# Aurora Global Database 作成
# 1. プライマリクラスター作成
aws rds create-db-cluster \
  --db-cluster-identifier aurora-primary \
  --engine aurora-mysql \
  --engine-version 8.0.mysql_aurora.3.04.0 \
  --master-username admin \
  --master-user-password 'SecurePassword123!' \
  --storage-encrypted \
  --region ap-northeast-1

# 2. プライマリインスタンス作成
aws rds create-db-instance \
  --db-instance-identifier aurora-primary-instance-1 \
  --db-cluster-identifier aurora-primary \
  --db-instance-class db.r6g.large \
  --engine aurora-mysql \
  --region ap-northeast-1

# 3. Global Cluster 作成
aws rds create-global-cluster \
  --global-cluster-identifier my-global-db \
  --source-db-cluster-identifier arn:aws:rds:ap-northeast-1:123456789012:cluster:aurora-primary

# 4. セカンダリリージョンにクラスター追加
aws rds create-db-cluster \
  --db-cluster-identifier aurora-secondary \
  --engine aurora-mysql \
  --engine-version 8.0.mysql_aurora.3.04.0 \
  --global-cluster-identifier my-global-db \
  --storage-encrypted \
  --region us-west-2

# 5. セカンダリインスタンス作成
aws rds create-db-instance \
  --db-instance-identifier aurora-secondary-instance-1 \
  --db-cluster-identifier aurora-secondary \
  --db-instance-class db.r6g.large \
  --engine aurora-mysql \
  --region us-west-2

# レプリケーションラグ確認
aws cloudwatch get-metric-statistics \
  --namespace AWS/RDS \
  --metric-name AuroraGlobalDBReplicationLag \
  --dimensions Name=DBClusterIdentifier,Value=aurora-secondary \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 60 \
  --statistics Average \
  --region us-west-2
```

### 6.5 Aurora Global Database フェイルオーバー

```bash
# Managed Planned Failover（計画的フェイルオーバー）
# ※ データ損失なし（RPO=0）、メンテナンス時に使用
aws rds failover-global-cluster \
  --global-cluster-identifier my-global-db \
  --target-db-cluster-identifier arn:aws:rds:us-west-2:123456789012:cluster:aurora-secondary

# Unplanned Failover（障害時の緊急フェイルオーバー）
# 手順:
# 1. セカンダリクラスターをGlobal Clusterから切り離し
aws rds remove-from-global-cluster \
  --global-cluster-identifier my-global-db \
  --db-cluster-identifier arn:aws:rds:us-west-2:123456789012:cluster:aurora-secondary \
  --region us-west-2

# 2. セカンダリがスタンドアロンクラスター（Writer付き）として昇格
# 3. アプリケーションの接続先をセカンダリに切り替え
```

### 6.6 RDS/Aurora DR比較

| 機能 | RDS Multi-AZ | RDS Read Replica | Aurora Global DB |
|------|-------------|-----------------|-----------------|
| **スコープ** | 同一リージョン | クロスリージョン | クロスリージョン |
| **レプリケーション** | 同期 | 非同期 | ストレージレベル |
| **RPO** | 0 | 分～時間 | 通常1秒未満 |
| **RTO** | 60-120秒 | 分（手動昇格） | 1分未満 |
| **読み取りアクセス** | 不可（Standby） | 可能 | 可能 |
| **自動フェイルオーバー** | あり | なし | Managed Failover |
| **用途** | 高可用性 | 読み取りスケール/DR | グローバルDR |

---

## 7. S3クロスリージョンレプリケーション

### 7.1 S3レプリケーション概要

```
【S3 レプリケーション構成】

┌─── Source Bucket ─────────────────────────────────────────┐
│  Region: ap-northeast-1                                    │
│  Bucket: my-app-data-primary                               │
│                                                             │
│  要件:                                                     │
│  ・バージョニング有効化（必須）                             │
│  ・レプリケーション IAM ロール設定                          │
│                                                             │
│  ┌──────────────┐                                         │
│  │   Objects    │                                         │
│  │  ┌────────┐ │──── CRR (Cross-Region Replication) ───▶ │
│  │  │ file1  │ │                                         │
│  │  │ file2  │ │──── SRR (Same-Region Replication) ───▶  │
│  │  │ file3  │ │                                         │
│  │  └────────┘ │                                         │
│  └──────────────┘                                         │
└─────────────────────────────────────────────────────────────┘
         │                              │
         │ CRR                          │ SRR
         ▼                              ▼
┌─── DR Bucket ──────┐   ┌─── Compliance Bucket ──┐
│  Region: us-west-2  │   │  Region: ap-northeast-1 │
│  Bucket: my-app-    │   │  Bucket: my-app-         │
│    data-dr          │   │    data-compliance       │
└─────────────────────┘   └──────────────────────────┘
```

### 7.2 CRR設定

```bash
# ソースバケットのバージョニング有効化
aws s3api put-bucket-versioning \
  --bucket my-app-data-primary \
  --versioning-configuration Status=Enabled

# DRバケット作成（DRリージョン）
aws s3api create-bucket \
  --bucket my-app-data-dr \
  --region us-west-2 \
  --create-bucket-configuration LocationConstraint=us-west-2

# DRバケットのバージョニング有効化
aws s3api put-bucket-versioning \
  --bucket my-app-data-dr \
  --versioning-configuration Status=Enabled

# レプリケーション用IAMロール作成
cat > /tmp/s3-replication-trust.json << 'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {"Service": "s3.amazonaws.com"},
      "Action": "sts:AssumeRole"
    }
  ]
}
EOF

aws iam create-role \
  --role-name S3ReplicationRole \
  --assume-role-policy-document file:///tmp/s3-replication-trust.json

cat > /tmp/s3-replication-policy.json << 'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetReplicationConfiguration",
        "s3:ListBucket"
      ],
      "Resource": "arn:aws:s3:::my-app-data-primary"
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObjectVersionForReplication",
        "s3:GetObjectVersionAcl",
        "s3:GetObjectVersionTagging"
      ],
      "Resource": "arn:aws:s3:::my-app-data-primary/*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:ReplicateObject",
        "s3:ReplicateDelete",
        "s3:ReplicateTags"
      ],
      "Resource": "arn:aws:s3:::my-app-data-dr/*"
    }
  ]
}
EOF

aws iam put-role-policy \
  --role-name S3ReplicationRole \
  --policy-name S3ReplicationPolicy \
  --policy-document file:///tmp/s3-replication-policy.json

# レプリケーションルール設定
aws s3api put-bucket-replication \
  --bucket my-app-data-primary \
  --replication-configuration '{
    "Role": "arn:aws:iam::123456789012:role/S3ReplicationRole",
    "Rules": [
      {
        "ID": "DR-Replication",
        "Status": "Enabled",
        "Priority": 1,
        "Filter": {},
        "Destination": {
          "Bucket": "arn:aws:s3:::my-app-data-dr",
          "StorageClass": "STANDARD_IA",
          "ReplicationTime": {
            "Status": "Enabled",
            "Time": {"Minutes": 15}
          },
          "Metrics": {
            "Status": "Enabled",
            "EventThreshold": {"Minutes": 15}
          }
        },
        "DeleteMarkerReplication": {
          "Status": "Enabled"
        }
      }
    ]
  }'
```

### 7.3 S3レプリケーション重要ポイント

| 項目 | 詳細 |
|------|------|
| **前提条件** | 両バケットでバージョニング有効が必須 |
| **既存オブジェクト** | レプリケーション設定後の新規オブジェクトのみ対象（既存はS3 Batch Replicationで対応） |
| **削除マーカー** | `DeleteMarkerReplication` で設定（デフォルト無効） |
| **暗号化** | SSE-S3, SSE-KMSに対応（KMSはキー設定が必要） |
| **S3 RTC** | Replication Time Control: 99.99%のオブジェクトを15分以内にレプリケーション |
| **双方向** | 双方向レプリケーションも設定可能（レプリカのレプリカは不可） |
| **コスト** | レプリケーション自体は無料、データ転送料+ストレージ料が発生 |

### 7.4 S3 Batch Replication（既存オブジェクト対応）

```bash
# 既存オブジェクトのレプリケーション（Batch Replication）
aws s3control create-job \
  --account-id 123456789012 \
  --operation '{
    "S3ReplicateObject": {}
  }' \
  --manifest-generator '{
    "S3JobManifestGenerator": {
      "SourceS3BucketArn": "arn:aws:s3:::my-app-data-primary",
      "EnableManifestOutput": true,
      "ManifestOutputLocation": {
        "Bucket": "arn:aws:s3:::my-app-data-primary",
        "ManifestPrefix": "batch-replication-manifest"
      },
      "Filter": {
        "EligibleForReplication": true,
        "ObjectReplicationStatuses": ["NONE", "FAILED"]
      }
    }
  }' \
  --report '{
    "Bucket": "arn:aws:s3:::my-app-data-primary",
    "Prefix": "batch-replication-report",
    "Format": "Report_CSV_20180820",
    "Enabled": true,
    "ReportScope": "AllTasks"
  }' \
  --priority 1 \
  --role-arn arn:aws:iam::123456789012:role/S3BatchReplicationRole \
  --confirmation-required
```

---

## 8. EBS/EC2のDR対策

### 8.1 EBSスナップショットのクロスリージョンコピー

```
【EBSスナップショット DR フロー】

┌─── Primary Region ──────┐     ┌─── DR Region ──────────┐
│                          │     │                         │
│  ┌────────┐              │     │              ┌────────┐│
│  │  EC2   │              │     │              │  EC2   ││
│  │ Instance│              │     │              │(復元時)││
│  └───┬────┘              │     │              └───┬────┘│
│      │                    │     │                  ▲     │
│  ┌───▼────┐  ┌────────┐ │     │ ┌────────┐  ┌───┴────┐│
│  │  EBS   │─▶│Snapshot│─┼─────┼▶│Snapshot│─▶│  EBS   ││
│  │ Volume │  │        │ │copy │ │ (Copy) │  │ Volume ││
│  └────────┘  └────────┘ │     │ └────────┘  └────────┘│
│                          │     │                         │
└──────────────────────────┘     └─────────────────────────┘
```

```bash
# EBSスナップショット作成
SNAPSHOT_ID=$(aws ec2 create-snapshot \
  --volume-id vol-0123456789abcdef0 \
  --description "DR Backup $(date +%Y%m%d)" \
  --tag-specifications 'ResourceType=snapshot,Tags=[{Key=Purpose,Value=DR}]' \
  --query "SnapshotId" --output text)

echo "Created snapshot: ${SNAPSHOT_ID}"

# スナップショット完了待ち
aws ec2 wait snapshot-completed --snapshot-ids ${SNAPSHOT_ID}

# クロスリージョンコピー
DR_SNAPSHOT_ID=$(aws ec2 copy-snapshot \
  --source-region ap-northeast-1 \
  --source-snapshot-id ${SNAPSHOT_ID} \
  --destination-region us-west-2 \
  --description "DR Copy from ap-northeast-1" \
  --encrypted \
  --kms-key-id arn:aws:kms:us-west-2:123456789012:key/dr-key-id \
  --region us-west-2 \
  --query "SnapshotId" --output text)

echo "DR snapshot copy: ${DR_SNAPSHOT_ID}"
```

### 8.2 AMIのクロスリージョンコピー

```bash
# AMI作成
AMI_ID=$(aws ec2 create-image \
  --instance-id i-0123456789abcdef0 \
  --name "DR-AMI-$(date +%Y%m%d)" \
  --description "DR用AMI" \
  --no-reboot \
  --query "ImageId" --output text)

# AMI完了待ち
aws ec2 wait image-available --image-ids ${AMI_ID}

# クロスリージョンコピー
DR_AMI_ID=$(aws ec2 copy-image \
  --source-image-id ${AMI_ID} \
  --source-region ap-northeast-1 \
  --region us-west-2 \
  --name "DR-AMI-$(date +%Y%m%d)-copy" \
  --description "DR region copy" \
  --encrypted \
  --kms-key-id arn:aws:kms:us-west-2:123456789012:key/dr-key-id \
  --query "ImageId" --output text)

echo "DR AMI: ${DR_AMI_ID}"
```

### 8.3 DLM（Data Lifecycle Manager）による自動化

```bash
# DLMポリシー作成（EBSスナップショットの自動取得・クロスリージョンコピー）
aws dlm create-lifecycle-policy \
  --description "DR Snapshot Policy" \
  --state ENABLED \
  --execution-role-arn arn:aws:iam::123456789012:role/AWSDataLifecycleManagerDefaultRole \
  --policy-details '{
    "PolicyType": "EBS_SNAPSHOT_MANAGEMENT",
    "ResourceTypes": ["VOLUME"],
    "TargetTags": [{"Key": "DR", "Value": "enabled"}],
    "Schedules": [
      {
        "Name": "Daily DR Snapshots",
        "CopyTags": true,
        "TagsToAdd": [{"Key": "Type", "Value": "DLM-DR"}],
        "CreateRule": {
          "CronExpression": "cron(0 5 * * ? *)"
        },
        "RetainRule": {
          "Count": 14
        },
        "CrossRegionCopyRules": [
          {
            "TargetRegion": "us-west-2",
            "Encrypted": true,
            "CmkArn": "arn:aws:kms:us-west-2:123456789012:key/dr-key-id",
            "CopyTags": true,
            "RetainRule": {
              "Interval": 30,
              "IntervalUnit": "DAYS"
            }
          }
        ]
      }
    ]
  }'
```

### 8.4 AWS Elastic Disaster Recovery (DRS)

```
【Elastic Disaster Recovery (DRS) 構成】

┌─── Source Region ─────────────────────────────────────────┐
│                                                            │
│  ┌──────────┐    ┌──────────────────┐                    │
│  │  EC2     │    │  DRS Agent       │                    │
│  │  Source  │◄───│  (ソースサーバー │                    │
│  │  Server  │    │   にインストール)│                    │
│  └──────────┘    └────────┬─────────┘                    │
│                            │                               │
└────────────────────────────┼───────────────────────────────┘
                             │ 継続的データレプリケーション
                             │ (ブロックレベル)
                             ▼
┌─── DR Region ─────────────────────────────────────────────┐
│                                                            │
│  ┌──────────────────────────┐    ┌──────────────────┐    │
│  │  Staging Area            │    │  Recovery        │    │
│  │  (軽量EC2 + EBSボリューム)│───▶│  Instance       │    │
│  │  ※ 通常時は最小構成      │    │  (ドリル/復旧時) │    │
│  └──────────────────────────┘    └──────────────────┘    │
│                                                            │
│  特徴:                                                     │
│  ・エージェントベースの継続レプリケーション                 │
│  ・RPO: 秒単位（通常は数秒以内）                           │
│  ・RTO: 数分（起動時間）                                   │
│  ・Point-in-Time Recovery対応                              │
│  ・定期的なDRドリル可能（非破壊テスト）                    │
└────────────────────────────────────────────────────────────┘
```

---

## 9. DRテスト・GameDay戦略

### 9.1 DRテストの重要性

```
【DRテストピラミッド】

                    ┌───────┐
                    │GameDay│  ← 本番環境での実障害シミュレーション
                   ┌┴───────┴┐
                   │ DR Drill │  ← 実際のフェイルオーバー実行
                  ┌┴──────────┴┐
                  │ Integration │  ← コンポーネント間のDR連携テスト
                 ┌┴─────────────┴┐
                 │  Unit Test     │  ← 個別バックアップ/リストア確認
                ┌┴────────────────┴┐
                │ Documentation    │  ← 手順書レビュー・ウォークスルー
                └──────────────────┘

頻度の目安:
  Documentation Review: 毎月
  Unit Test:            毎月
  Integration Test:     四半期
  DR Drill:             半年
  GameDay:              年1-2回
```

### 9.2 DRテスト手順書テンプレート

```
【DR Drill 実行手順】

Phase 1: 事前準備
  □ DRテスト計画の承認取得
  □ ステークホルダーへの事前通知
  □ ロールバック手順の確認
  □ 監視・アラート設定の確認
  □ テスト成功/失敗基準の定義

Phase 2: DRテスト実行
  □ 現在の状態のスナップショット取得
  □ プライマリリージョンの障害シミュレーション
  □ フェイルオーバー実行
  □ DRリージョンでのサービス正常性確認
  □ データ整合性検証
  □ パフォーマンス検証

Phase 3: フェイルバック
  □ プライマリリージョンの復旧
  □ データ同期の確認
  □ フェイルバック実行
  □ 正常性確認

Phase 4: 事後レビュー
  □ テスト結果のドキュメント化
  □ 問題点・改善点の洗い出し
  □ 手順書の更新
  □ 次回テスト計画の策定
```

### 9.3 AWS FIS（Fault Injection Simulator）を使ったカオスエンジニアリング

```bash
# FIS実験テンプレート作成（EC2インスタンスの停止）
aws fis create-experiment-template \
  --description "DR Test - Stop EC2 instances in Primary AZ" \
  --role-arn arn:aws:iam::123456789012:role/FISExperimentRole \
  --stop-conditions '[
    {
      "source": "aws:cloudwatch:alarm",
      "value": "arn:aws:cloudwatch:ap-northeast-1:123456789012:alarm:DR-SafetyStop"
    }
  ]' \
  --targets '{
    "ec2-instances": {
      "resourceType": "aws:ec2:instance",
      "resourceTags": {"DR-Test": "target"},
      "selectionMode": "ALL"
    }
  }' \
  --actions '{
    "stop-instances": {
      "actionId": "aws:ec2:stop-instances",
      "parameters": {},
      "targets": {"Instances": "ec2-instances"},
      "duration": "PT30M"
    }
  }' \
  --tags '{"Purpose": "DR-Test"}'

# 実験実行
aws fis start-experiment \
  --experiment-template-id EXT123456789 \
  --tags '{"TestRun": "DR-Drill-2026-Q1"}'

# 実験ステータス確認
aws fis get-experiment \
  --id EXP123456789 \
  --query "{State:state.status, StartTime:startTime, Actions:actions}"
```

### 9.4 GameDay計画

```
【GameDay 実施フレームワーク】

┌─────────────────────────────────────────────────────────────────┐
│                        GameDay 実施計画                            │
│                                                                    │
│  ┌── Step 1: 計画 (2-4週間前) ──────────────────────────────┐   │
│  │  ・障害シナリオの定義                                      │   │
│  │  ・影響範囲の評価                                          │   │
│  │  ・参加メンバーの選定                                      │   │
│  │  ・安全停止条件（ガードレール）の設定                      │   │
│  │  ・ロールバック手順の準備                                  │   │
│  └────────────────────────────────────────────────────────────┘   │
│                                                                    │
│  ┌── Step 2: 実行 (当日) ───────────────────────────────────┐   │
│  │  ・障害注入（FIS / 手動 / スクリプト）                     │   │
│  │  ・監視・観察（CloudWatch / X-Ray）                        │   │
│  │  ・チームの対応を記録                                      │   │
│  │  ・必要に応じて安全停止                                    │   │
│  └────────────────────────────────────────────────────────────┘   │
│                                                                    │
│  ┌── Step 3: レビュー (翌日-1週間後) ───────────────────────┐   │
│  │  ・タイムラインの作成                                      │   │
│  │  ・検出されたギャップの分析                                │   │
│  │  ・RTO/RPO実測値 vs 目標値の比較                           │   │
│  │  ・改善アクションの策定                                    │   │
│  │  ・ランブック/手順書の更新                                 │   │
│  └────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘

【障害シナリオ例】

レベル1: コンポーネント障害
  ・単一EC2インスタンスの障害
  ・RDSフェイルオーバー
  ・Lambda関数のエラー

レベル2: AZ障害
  ・1つのAZが完全にダウン
  ・Multi-AZ構成のフェイルオーバー
  ・ALBからの切り離し

レベル3: リージョン障害
  ・プライマリリージョン全体がダウン
  ・DRリージョンへの完全なフェイルオーバー
  ・データ整合性の検証
```

### 9.5 SSM Automation によるDRランブック

```bash
# SSM Automation ドキュメント（DRフェイルオーバー手順）
cat > /tmp/dr-failover-runbook.json << 'SSMDOC'
{
  "schemaVersion": "0.3",
  "description": "DR Failover Automation Runbook",
  "assumeRole": "{{AutomationAssumeRole}}",
  "parameters": {
    "AutomationAssumeRole": {
      "type": "String",
      "description": "IAM Role for SSM Automation"
    },
    "DRRegion": {
      "type": "String",
      "default": "us-west-2"
    }
  },
  "mainSteps": [
    {
      "name": "CheckPrimaryHealth",
      "action": "aws:executeAwsApi",
      "inputs": {
        "Service": "route53",
        "Api": "GetHealthCheckStatus",
        "HealthCheckId": "hc-primary-id"
      },
      "outputs": [
        {
          "Name": "HealthStatus",
          "Selector": "$.HealthCheckObservations[0].StatusReport.Status",
          "Type": "String"
        }
      ]
    },
    {
      "name": "PromoteReadReplica",
      "action": "aws:executeAwsApi",
      "inputs": {
        "Service": "rds",
        "Api": "PromoteReadReplica",
        "DBInstanceIdentifier": "mydb-dr-replica"
      }
    },
    {
      "name": "WaitForDBAvailable",
      "action": "aws:waitForAwsResourceProperty",
      "inputs": {
        "Service": "rds",
        "Api": "DescribeDBInstances",
        "DBInstanceIdentifier": "mydb-dr-replica",
        "PropertySelector": "$.DBInstances[0].DBInstanceStatus",
        "DesiredValues": ["available"]
      },
      "timeoutSeconds": 600
    },
    {
      "name": "ScaleUpDRASG",
      "action": "aws:executeAwsApi",
      "inputs": {
        "Service": "autoscaling",
        "Api": "UpdateAutoScalingGroup",
        "AutoScalingGroupName": "dr-asg",
        "MinSize": 4,
        "DesiredCapacity": 4,
        "MaxSize": 8
      }
    },
    {
      "name": "UpdateRoute53",
      "action": "aws:executeAwsApi",
      "inputs": {
        "Service": "route53",
        "Api": "ChangeResourceRecordSets",
        "HostedZoneId": "Z1234567890",
        "ChangeBatch": {
          "Changes": [
            {
              "Action": "UPSERT",
              "ResourceRecordSet": {
                "Name": "app.example.com",
                "Type": "A",
                "SetIdentifier": "Secondary",
                "Failover": "PRIMARY",
                "AliasTarget": {
                  "HostedZoneId": "Z1H1FL5HABSF5",
                  "DNSName": "alb-dr.us-west-2.elb.amazonaws.com",
                  "EvaluateTargetHealth": true
                }
              }
            }
          ]
        }
      }
    },
    {
      "name": "NotifyTeam",
      "action": "aws:executeAwsApi",
      "inputs": {
        "Service": "sns",
        "Api": "Publish",
        "TopicArn": "arn:aws:sns:us-west-2:123456789012:DR-Notifications",
        "Subject": "DR Failover Completed",
        "Message": "DR failover to us-west-2 has been completed successfully."
      }
    }
  ]
}
SSMDOC

aws ssm create-document \
  --name "DR-Failover-Runbook" \
  --document-type "Automation" \
  --content file:///tmp/dr-failover-runbook.json \
  --document-format JSON

# ランブック実行
aws ssm start-automation-execution \
  --document-name "DR-Failover-Runbook" \
  --parameters '{
    "AutomationAssumeRole": ["arn:aws:iam::123456789012:role/SSMAutomationRole"],
    "DRRegion": ["us-west-2"]
  }'
```

---

## 10. ハンズオン演習

### 10.1 演習1: AWS Backupによるクロスリージョンバックアップ

```bash
# === 前提: DynamoDB テーブルを使用 ===

# DynamoDB テーブル作成
aws dynamodb create-table \
  --table-name dr-test-table \
  --attribute-definitions AttributeName=PK,AttributeType=S \
  --key-schema AttributeName=PK,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --tags Key=Backup,Value=true

# テストデータ投入
aws dynamodb put-item \
  --table-name dr-test-table \
  --item '{"PK": {"S": "item1"}, "Data": {"S": "Critical Data 1"}}'

aws dynamodb put-item \
  --table-name dr-test-table \
  --item '{"PK": {"S": "item2"}, "Data": {"S": "Critical Data 2"}}'

# バックアップボールト作成（両リージョン）
aws backup create-backup-vault --backup-vault-name dr-handson-vault
aws backup create-backup-vault --backup-vault-name dr-handson-vault --region us-west-2

# オンデマンドバックアップ実行
BACKUP_JOB_ID=$(aws backup start-backup-job \
  --backup-vault-name dr-handson-vault \
  --resource-arn arn:aws:dynamodb:ap-northeast-1:123456789012:table/dr-test-table \
  --iam-role-arn arn:aws:iam::123456789012:role/AWSBackupDefaultServiceRole \
  --query "BackupJobId" --output text)

echo "Backup Job ID: ${BACKUP_JOB_ID}"

# バックアップ完了待ち
aws backup describe-backup-job --backup-job-id ${BACKUP_JOB_ID}

# クロスリージョンコピー
RECOVERY_POINT_ARN=$(aws backup describe-backup-job \
  --backup-job-id ${BACKUP_JOB_ID} \
  --query "RecoveryPointArn" --output text)

aws backup start-copy-job \
  --recovery-point-arn ${RECOVERY_POINT_ARN} \
  --source-backup-vault-name dr-handson-vault \
  --destination-backup-vault-arn arn:aws:backup:us-west-2:123456789012:backup-vault:dr-handson-vault \
  --iam-role-arn arn:aws:iam::123456789012:role/AWSBackupDefaultServiceRole

# DRリージョンでリストアテスト
aws backup start-restore-job \
  --recovery-point-arn arn:aws:backup:us-west-2:123456789012:recovery-point:xxx \
  --iam-role-arn arn:aws:iam::123456789012:role/AWSBackupDefaultServiceRole \
  --metadata '{
    "targetTableName": "dr-test-table-restored",
    "dynamodb:tableName": "dr-test-table-restored"
  }' \
  --region us-west-2

# リストア確認
aws dynamodb scan --table-name dr-test-table-restored --region us-west-2
```

### 10.2 演習2: Route 53フェイルオーバー設定

```bash
# === S3静的ウェブサイトを使用した簡易フェイルオーバー ===

# プライマリバケット作成
aws s3api create-bucket \
  --bucket dr-handson-primary-$(aws sts get-caller-identity --query Account --output text) \
  --region ap-northeast-1 \
  --create-bucket-configuration LocationConstraint=ap-northeast-1

PRIMARY_BUCKET="dr-handson-primary-$(aws sts get-caller-identity --query Account --output text)"

# 静的ウェブサイト有効化
aws s3 website s3://${PRIMARY_BUCKET} --index-document index.html

# プライマリコンテンツ作成
echo '<html><body><h1>Primary Region (ap-northeast-1)</h1></body></html>' > /tmp/index.html
aws s3 cp /tmp/index.html s3://${PRIMARY_BUCKET}/

# セカンダリバケット作成（DRリージョン）
SECONDARY_BUCKET="dr-handson-secondary-$(aws sts get-caller-identity --query Account --output text)"

aws s3api create-bucket \
  --bucket ${SECONDARY_BUCKET} \
  --region us-west-2 \
  --create-bucket-configuration LocationConstraint=us-west-2

aws s3 website s3://${SECONDARY_BUCKET} --index-document index.html

echo '<html><body><h1>DR Region (us-west-2)</h1></body></html>' > /tmp/index-dr.html
aws s3 cp /tmp/index-dr.html s3://${SECONDARY_BUCKET}/index.html

# ヘルスチェック作成
HC_ID=$(aws route53 create-health-check \
  --caller-reference "dr-handson-hc-$(date +%s)" \
  --health-check-config '{
    "Type": "HTTP",
    "FullyQualifiedDomainName": "'${PRIMARY_BUCKET}'.s3-website-ap-northeast-1.amazonaws.com",
    "Port": 80,
    "RequestInterval": 10,
    "FailureThreshold": 2
  }' \
  --query "HealthCheck.Id" --output text)

echo "Health Check ID: ${HC_ID}"

# ヘルスチェックステータス確認
aws route53 get-health-check-status --health-check-id ${HC_ID}
```

### 10.3 演習3: S3クロスリージョンレプリケーション

```bash
# ソースバケット作成
SOURCE_BUCKET="crr-source-$(aws sts get-caller-identity --query Account --output text)"

aws s3api create-bucket \
  --bucket ${SOURCE_BUCKET} \
  --region ap-northeast-1 \
  --create-bucket-configuration LocationConstraint=ap-northeast-1

# バージョニング有効化
aws s3api put-bucket-versioning \
  --bucket ${SOURCE_BUCKET} \
  --versioning-configuration Status=Enabled

# 宛先バケット作成
DEST_BUCKET="crr-dest-$(aws sts get-caller-identity --query Account --output text)"

aws s3api create-bucket \
  --bucket ${DEST_BUCKET} \
  --region us-west-2 \
  --create-bucket-configuration LocationConstraint=us-west-2

aws s3api put-bucket-versioning \
  --bucket ${DEST_BUCKET} \
  --versioning-configuration Status=Enabled

# レプリケーションIAMロール作成（前述の手順を参照）
# ... (IAMロール作成は4.2参照)

# レプリケーションルール設定
aws s3api put-bucket-replication \
  --bucket ${SOURCE_BUCKET} \
  --replication-configuration '{
    "Role": "arn:aws:iam::'$(aws sts get-caller-identity --query Account --output text)':role/S3ReplicationRole",
    "Rules": [
      {
        "ID": "DR-CRR-Rule",
        "Status": "Enabled",
        "Priority": 1,
        "Filter": {"Prefix": ""},
        "Destination": {
          "Bucket": "arn:aws:s3:::'${DEST_BUCKET}'"
        },
        "DeleteMarkerReplication": {"Status": "Enabled"}
      }
    ]
  }'

# テストファイルアップロード
echo "DR Test Data $(date)" > /tmp/test-crr.txt
aws s3 cp /tmp/test-crr.txt s3://${SOURCE_BUCKET}/

# レプリケーション確認（数分待つ）
sleep 120
aws s3 ls s3://${DEST_BUCKET}/

# レプリケーションステータス確認
aws s3api head-object \
  --bucket ${SOURCE_BUCKET} \
  --key test-crr.txt \
  --query "ReplicationStatus"
```

### 10.4 クリーンアップ

```bash
# DynamoDB テーブル削除
aws dynamodb delete-table --table-name dr-test-table
aws dynamodb delete-table --table-name dr-test-table-restored --region us-west-2

# S3 バケット削除
aws s3 rb s3://${PRIMARY_BUCKET} --force
aws s3 rb s3://${SECONDARY_BUCKET} --force
aws s3 rb s3://${SOURCE_BUCKET} --force
aws s3 rb s3://${DEST_BUCKET} --force

# バックアップボールト削除（中身を先に削除）
aws backup delete-backup-vault --backup-vault-name dr-handson-vault
aws backup delete-backup-vault --backup-vault-name dr-handson-vault --region us-west-2

# Route 53 ヘルスチェック削除
aws route53 delete-health-check --health-check-id ${HC_ID}

# IAMロール/ポリシー削除
aws iam delete-role-policy --role-name S3ReplicationRole --policy-name S3ReplicationPolicy
aws iam delete-role --role-name S3ReplicationRole

# SSMドキュメント削除
aws ssm delete-document --name "DR-Failover-Runbook"
```

---

## 11. DOP試験対策チェックリスト

### DR戦略の基礎

- [ ] 4つのDR戦略（Backup & Restore, Pilot Light, Warm Standby, Multi-Site）を説明できる
- [ ] RPO/RTOの定義と各戦略での違いを理解している
- [ ] 要件（RPO/RTO/コスト）に基づいて最適なDR戦略を選定できる

<details>
<summary>模範解答を見る</summary>

**4つのDR戦略の要約**:

| 戦略 | RPO | RTO | コスト | 常時稼働リソース |
|------|-----|-----|--------|----------------|
| Backup & Restore | 数時間 | 24時間 | 最小 | ストレージのみ |
| Pilot Light | 分～時間 | 時間 | 低 | DB（コア）のみ |
| Warm Standby | 秒～分 | 分 | 中 | 縮小版フルスタック |
| Multi-Site | ほぼゼロ | ほぼゼロ | 最大 | フルスケール |

**選定基準**:
- コスト優先 + 長RTO許容 → Backup & Restore
- データ保護重視 + 数時間RTO → Pilot Light
- 短RTO要件 + コストバランス → Warm Standby
- ゼロダウンタイム必須 → Multi-Site Active/Active

**試験での考え方**: 問題文のRPO/RTO要件とコスト制約を読み取り、最もコスト効率の良い戦略を選ぶ。「最もコスト効率が良く、RPO 1時間、RTO 4時間を満たす」→ Pilot Light
</details>

### AWS Backup

- [ ] バックアッププランの構成要素（ルール、スケジュール、保持期間）を説明できる
- [ ] クロスリージョン/クロスアカウントバックアップを設定できる
- [ ] Vault Lockのコンプライアンスモードとガバナンスモードの違いを理解している

<details>
<summary>模範解答を見る</summary>

**バックアッププランの構成要素**:
- **Backup Rule**: スケジュール、保持期間、ライフサイクル（Cold Storage移行）
- **Resource Assignment**: タグベースまたはリソースARNでの対象指定
- **Copy Action**: クロスリージョン/クロスアカウントへのコピー設定

**クロスリージョンバックアップの手順**:
1. DRリージョンにBackup Vault作成
2. バックアッププランのCopy ActionにDR Vault ARNを指定
3. KMSキーの設定（各リージョンのキー）

**クロスアカウントバックアップ**:
- AWS Organizations でクロスアカウントバックアップを有効化
- 宛先アカウントのVault Policyで送信元を許可
- ランサムウェア対策として有効

**Vault Lock**:
- Governance Mode: `changeable-for-days` 期間中は変更可能
- Compliance Mode: 猶予期間終了後は不変（rootでも削除不可）
- WORM (Write Once Read Many) 要件への対応
- SEC 17a-4, CFTC等のコンプライアンス要件に対応
</details>

### Route 53 DR

- [ ] フェイルオーバールーティングの設定方法を理解している
- [ ] ヘルスチェックの種類（Endpoint, Calculated, CloudWatch Alarm）を使い分けできる
- [ ] DR用途でのルーティングポリシー選択ができる

<details>
<summary>模範解答を見る</summary>

**フェイルオーバー設定**:
- Primary Record (Failover: PRIMARY) + Health Check
- Secondary Record (Failover: SECONDARY) + 任意でHealth Check
- HealthCheckがUnhealthyになるとSecondaryにルーティング

**ヘルスチェックの種類**:
| タイプ | 用途 | チェック方法 |
|--------|------|-------------|
| Endpoint | 直接的なエンドポイント監視 | HTTP/HTTPS/TCP |
| Calculated | 複数HCの論理組み合わせ | AND/OR（閾値設定） |
| CloudWatch Alarm | メトリクスベースの監視 | アラーム状態連動 |

**DR用ルーティングポリシー選択**:
- **Active/Passive DR** → Failover Routing
- **段階的切替** → Weighted Routing（0% → 10% → 50% → 100%）
- **Active/Active DR** → Latency Based Routing
- **地域別Active/Active** → Geolocation Routing

**重要ポイント**:
- `EvaluateTargetHealth: true` でALBの状態も自動判定
- ヘルスチェッカーはAWSのグローバルインフラから実行される
- ファイアウォールでRoute 53ヘルスチェッカーのIPレンジを許可する必要あり
</details>

### RDS/Aurora DR

- [ ] RDS Multi-AZとRead Replicaの違いを説明できる
- [ ] Aurora Global Databaseのフェイルオーバー種類を理解している
- [ ] クロスリージョンRead Replicaの昇格手順を実行できる

<details>
<summary>模範解答を見る</summary>

**Multi-AZ vs Read Replica**:
| 項目 | Multi-AZ | Read Replica |
|------|----------|-------------|
| 目的 | 高可用性 | 読み取りスケール/DR |
| レプリケーション | 同期 | 非同期 |
| フェイルオーバー | 自動（60-120秒） | 手動（promote） |
| 読み取りアクセス | 不可 | 可能 |
| クロスリージョン | 不可（同一リージョン） | 可能 |

**Aurora Global Database フェイルオーバー**:
1. **Managed Planned Failover**: 計画的切替、RPO=0、RTO=数分、メンテナンス用
2. **Unplanned Failover (Detach)**: 緊急時、`remove-from-global-cluster`でセカンダリを切り離し、スタンドアロンWriterとして昇格
3. **Switchover (新機能)**: Global Databaseのswitchbackをサポート

**クロスリージョンRead Replica昇格手順**:
1. `aws rds promote-read-replica` でRead Replicaを独立DBに昇格
2. `aws rds wait db-instance-available` で完了待ち
3. アプリケーションの接続先エンドポイントを変更
4. Route 53レコードを更新

**注意**: 昇格後はレプリケーションが停止し、独立したDBインスタンスになる。フェイルバック時は再度Read Replicaを作成する必要がある。
</details>

### S3レプリケーション

- [ ] CRR（クロスリージョンレプリケーション）の前提条件と設定手順を理解している
- [ ] 既存オブジェクトのレプリケーション方法（Batch Replication）を知っている
- [ ] S3 Replication Time Control (RTC) の仕組みを説明できる

<details>
<summary>模範解答を見る</summary>

**CRRの前提条件**:
- 送信元・宛先の両バケットでバージョニングが有効であること
- 適切なIAMロール（GetObject, ReplicateObject等の権限）
- 送信元と宛先は異なるリージョン（SRRは同一リージョン）

**レプリケーション対象の制約**:
- レプリケーション設定後の新規オブジェクトのみ（既存は対象外）
- 既存オブジェクトにはS3 Batch Replicationを使用
- SSE-C暗号化オブジェクトはレプリケーション不可
- 削除マーカーのレプリケーションはオプション（DeleteMarkerReplication）
- バージョンID指定の削除（永久削除）はレプリケーションされない

**S3 Replication Time Control (RTC)**:
- 99.99%のオブジェクトを15分以内にレプリケーション
- レプリケーションメトリクスの有効化が必要
- 追加コストが発生（通常のCRRより高額）
- コンプライアンス要件がある場合に使用

**Batch Replication**:
- S3 Batch Operationsを使用
- レプリケーションステータスが NONE または FAILED のオブジェクトを対象
- 既存オブジェクトの一括レプリケーションに使用
</details>

### DRテスト・運用

- [ ] DRテストの種類と頻度を説明できる
- [ ] AWS FIS（Fault Injection Simulator）の使い方を理解している
- [ ] SSM Automationを使ったDRランブックを作成できる
- [ ] GameDayの計画・実施・振り返りプロセスを理解している

<details>
<summary>模範解答を見る</summary>

**DRテストの種類と頻度**:
| テスト種類 | 内容 | 推奨頻度 |
|-----------|------|---------|
| Tabletop Exercise | 手順書のウォークスルー | 毎月 |
| Component Test | 個別コンポーネントの復旧テスト | 毎月 |
| Integration Test | 複数コンポーネントの連携テスト | 四半期 |
| Full DR Drill | 完全なフェイルオーバー実行 | 半年 |
| GameDay | 本番環境での障害シミュレーション | 年1-2回 |

**AWS FISの活用**:
- EC2インスタンスの停止/終了
- AZ障害のシミュレーション
- ネットワーク遅延/パケットロスの注入
- Stop Conditions（安全停止条件）でCloudWatchアラーム連動
- 本番環境でも安全に実行可能（ガードレール付き）

**SSM Automation DRランブック**:
- 手動手順を自動化（人的ミスの排除）
- 承認ステップの組み込み（`aws:approve` アクション）
- 並列実行・条件分岐のサポート
- CloudWatch Events / EventBridgeからのトリガー可能

**GameDay成功のポイント**:
1. 明確な成功/失敗基準の事前定義
2. 安全停止条件（ガードレール）の設定
3. 全関係者への事前通知
4. 振り返りでの改善アクション策定
5. ランブック・手順書の継続的更新
</details>

### マルチリージョンインフラ展開

- [ ] CloudFormation StackSetsを使ったマルチリージョンDRインフラ展開ができる
- [ ] DynamoDB Global Tablesの仕組みと制約を理解している
- [ ] Global AcceleratorとCloudFrontのDR活用方法を知っている

<details>
<summary>模範解答を見る</summary>

**CloudFormation StackSets でDRインフラ展開**:
```bash
aws cloudformation create-stack-set \
  --stack-set-name DR-Infrastructure \
  --template-body file://dr-template.yaml \
  --permission-model SERVICE_MANAGED \
  --auto-deployment Enabled=true,RetainStacksOnAccountRemoval=false

aws cloudformation create-stack-instances \
  --stack-set-name DR-Infrastructure \
  --regions ap-northeast-1 us-west-2 \
  --deployment-targets OrganizationalUnitIds=ou-xxxxx
```

**DynamoDB Global Tables**:
- 複数リージョンでの読み書きが可能（Active/Active）
- レプリケーションラグ: 通常1秒未満
- 競合解決: Last Writer Wins（タイムスタンプベース）
- 制約: テーブル作成時にGlobal Tablesを有効化推奨
- すべてのレプリカで同じテーブル名

**Global Accelerator**:
- AWS グローバルネットワーク経由のルーティング
- エンドポイントのヘルスチェック + 自動フェイルオーバー
- 固定IPアドレス（DNS TTL問題なし）
- リージョン障害時に正常なリージョンに自動切替

**CloudFront**:
- Origin Group設定でフェイルオーバー可能
- Primary Origin障害時にSecondary Originへ
- 5xx/4xxエラーコードでフェイルオーバー判定
- カスタムエラーページでユーザー体験を維持
</details>

### 総合問題

- [ ] 「RPO 15分、RTO 1時間、コスト最小化」の要件に対する最適なDR戦略を回答できる
- [ ] 「ランサムウェア対策としてのバックアップ戦略」を設計できる
- [ ] 「リージョン障害時の完全自動フェイルオーバー」を構成できる

<details>
<summary>模範解答を見る</summary>

**RPO 15分、RTO 1時間、コスト最小化**:
→ **Pilot Light** が最適
- Aurora Global Database（RPO: 通常1秒未満 < 15分）
- DRリージョンにDB + 最小EC2構成
- Route 53フェイルオーバー + SSM Automation
- 障害時にASGスケールアップ（RTO: 数十分 < 1時間）
- Warm Standbyほどのコストはかからない

**ランサムウェア対策バックアップ戦略**:
1. **AWS Backup + クロスアカウント**: 別アカウントにバックアップコピー
2. **Vault Lock (Compliance Mode)**: バックアップの不変性を保証（rootでも削除不可）
3. **S3 Object Lock**: S3データのWORM保護
4. **バージョニング + MFA Delete**: 意図しない削除の防止
5. **最小権限IAM**: バックアップ管理者とバックアップ運用者の分離
6. **定期リストアテスト**: バックアップからの復旧が確実に可能であることを検証

**完全自動フェイルオーバー構成**:
```
Route 53 Health Check (10秒間隔, 失敗閾値3)
  → Unhealthy検出
  → Route 53 Failover Routing で自動DNS切替
  → EventBridge Rule でSSM Automation起動
    → Aurora Global DB Failover
    → ASGスケールアップ
    → SNS通知
```
構成要素:
- Route 53 Failover Routing（自動DNS切替）
- Aurora Global Database（Managed Failover）
- Auto Scaling Group（DRリージョンで自動スケール）
- EventBridge + SSM Automation（追加手順の自動化）
- CloudWatch + SNS（監視・通知）
</details>

---

## 付録A: よく使うCLIコマンド

```bash
# === AWS Backup ===
aws backup create-backup-vault --backup-vault-name VAULT_NAME
aws backup create-backup-plan --backup-plan '{...}'
aws backup start-backup-job --backup-vault-name VAULT --resource-arn ARN --iam-role-arn ROLE
aws backup start-copy-job --recovery-point-arn ARN --source-backup-vault-name SRC --destination-backup-vault-arn DST
aws backup start-restore-job --recovery-point-arn ARN --metadata '{...}'
aws backup describe-backup-job --backup-job-id JOB_ID
aws backup list-recovery-points-by-backup-vault --backup-vault-name VAULT

# === Route 53 ===
aws route53 create-health-check --caller-reference REF --health-check-config '{...}'
aws route53 get-health-check-status --health-check-id HC_ID
aws route53 change-resource-record-sets --hosted-zone-id ZONE --change-batch '{...}'
aws route53 list-resource-record-sets --hosted-zone-id ZONE

# === RDS / Aurora ===
aws rds create-db-instance-read-replica --db-instance-identifier ID --source-db-instance-identifier ARN --region DR_REGION
aws rds promote-read-replica --db-instance-identifier ID
aws rds create-global-cluster --global-cluster-identifier ID --source-db-cluster-identifier ARN
aws rds failover-global-cluster --global-cluster-identifier ID --target-db-cluster-identifier ARN
aws rds remove-from-global-cluster --global-cluster-identifier ID --db-cluster-identifier ARN

# === S3 レプリケーション ===
aws s3api put-bucket-versioning --bucket BUCKET --versioning-configuration Status=Enabled
aws s3api put-bucket-replication --bucket BUCKET --replication-configuration '{...}'
aws s3api head-object --bucket BUCKET --key KEY --query ReplicationStatus

# === EBS / EC2 ===
aws ec2 create-snapshot --volume-id VOL_ID --description "DR Backup"
aws ec2 copy-snapshot --source-region SRC --source-snapshot-id SNAP_ID --region DST
aws ec2 create-image --instance-id ID --name AMI_NAME --no-reboot
aws ec2 copy-image --source-image-id AMI_ID --source-region SRC --region DST

# === DLM ===
aws dlm create-lifecycle-policy --description DESC --policy-details '{...}'
aws dlm get-lifecycle-policies

# === FIS ===
aws fis create-experiment-template --description DESC --targets '{...}' --actions '{...}'
aws fis start-experiment --experiment-template-id TEMPLATE_ID
aws fis get-experiment --id EXP_ID

# === SSM Automation ===
aws ssm create-document --name DOC_NAME --document-type Automation --content file://doc.json
aws ssm start-automation-execution --document-name DOC_NAME --parameters '{...}'
aws ssm get-automation-execution --automation-execution-id EXEC_ID
```

## 付録B: DR設計チェックリスト

```
【DR設計の確認項目】

基本設計
  □ RPO/RTOが明確に定義されている
  □ BIA（ビジネス影響分析）が完了している
  □ DR戦略がRPO/RTO/コスト要件を満たしている
  □ DRリージョンが選定されている

データ保護
  □ バックアップスケジュールがRPOを満たしている
  □ クロスリージョンバックアップが設定されている
  □ クロスアカウントバックアップ（ランサムウェア対策）
  □ バックアップの暗号化（KMS）
  □ Vault Lock（コンプライアンス要件がある場合）

コンピュート
  □ AMI/コンテナイメージがDRリージョンに存在する
  □ 起動テンプレート/ASG設定がDRリージョンに準備済み
  □ Lambda関数がDRリージョンにデプロイ済み

ネットワーク
  □ Route 53フェイルオーバーが設定されている
  □ ヘルスチェックが適切に構成されている
  □ VPC/サブネット/セキュリティグループがDRリージョンに存在する
  □ DNS TTLが適切に設定されている

データベース
  □ RDS/AuroraのDR構成（Read Replica/Global DB）
  □ DynamoDB Global Tables（必要な場合）
  □ ElastiCache（DRリージョンでの再構築手順）

モニタリング
  □ DRリージョンでのCloudWatch設定
  □ アラーム・通知の設定
  □ ダッシュボードの準備

運用
  □ DRランブック（SSM Automation）の作成
  □ DRテスト計画の策定
  □ フェイルバック手順の文書化
  □ 定期的なDRドリルの実施
  □ IAM権限の確認（DRリージョンでの操作権限）
```

---

**作成日**: 2026-02-04
**最終更新**: 2026-02-04
**検証環境**: AWS ap-northeast-1 / us-west-2 リージョン
