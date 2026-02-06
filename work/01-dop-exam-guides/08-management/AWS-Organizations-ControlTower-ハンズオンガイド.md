# AWS Organizations & Control Tower ハンズオンガイド

> **対象**: AWS DevOps Professional (DOP-C02) 試験対策
> **前提知識**: AWS基礎、IAM、マルチアカウントの概念
> **所要時間**: 約2.5時間

---

## 目次

1. [AWS Organizations概要](#1-aws-organizations概要)
2. [組織構造とOU](#2-組織構造とou)
3. [SCP（サービスコントロールポリシー）](#3-scpサービスコントロールポリシー)
4. [委任管理者](#4-委任管理者)
5. [AWS Control Tower](#5-aws-control-tower)
6. [クロスアカウント戦略](#6-クロスアカウント戦略)
7. [ハンズオン演習](#7-ハンズオン演習)
8. [DOP試験対策チェックリスト](#8-dop試験対策チェックリスト)

---

## 1. AWS Organizations概要

### 1.1 Organizationsとは

```
┌─────────────────────────────────────────────────────────────────────┐
│                      AWS Organizations                               │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │                   Management Account                           │ │
│  │                   (旧: Master Account)                         │ │
│  │                                                                │ │
│  │  ・組織全体の管理                                              │ │
│  │  ・アカウント作成/招待                                         │ │
│  │  ・SCP管理                                                    │ │
│  │  ・一括請求 (Consolidated Billing)                             │ │
│  └──────────────────────────┬─────────────────────────────────────┘ │
│                              │                                      │
│  ┌───────────────────────────┼──────────────────────────────────┐  │
│  │                        Root                                  │  │
│  │  ┌─────────────────┐  ┌─────────────────┐                  │  │
│  │  │   OU: Security  │  │   OU: Workloads │                  │  │
│  │  │  ┌───────────┐  │  │  ┌───────────┐  │                  │  │
│  │  │  │  Audit    │  │  │  │ OU: Dev   │  │                  │  │
│  │  │  │  Account  │  │  │  │  Acct-D1  │  │                  │  │
│  │  │  ├───────────┤  │  │  ├───────────┤  │                  │  │
│  │  │  │  Log      │  │  │  │ OU: Prod  │  │                  │  │
│  │  │  │  Archive  │  │  │  │  Acct-P1  │  │                  │  │
│  │  │  └───────────┘  │  │  │  Acct-P2  │  │                  │  │
│  │  └─────────────────┘  │  └───────────┘  │                  │  │
│  │                        └─────────────────┘                  │  │
│  └─────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.2 主要機能

| 機能 | 説明 | DOP重要度 |
|------|------|----------|
| **一括請求** | 全アカウントの請求を統合 | ★★★☆☆ |
| **SCP** | アカウントの権限境界設定 | ★★★★★ |
| **OU管理** | 階層的なアカウント管理 | ★★★★★ |
| **委任管理者** | 管理権限の委任 | ★★★★☆ |
| **サービス統合** | Config, CloudTrail, SSM等 | ★★★★★ |
| **アカウント作成API** | プログラマティックなアカウント作成 | ★★★☆☆ |

### 1.3 一括請求のメリット

```
【一括請求の仕組み】

┌──────────────────────────────────────────────────────────┐
│                Management Account                         │
│                (一括請求の支払者)                          │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │              Volume Discounts                      │  │
│  │                                                    │  │
│  │  Account A: S3 50TB  ─┐                           │  │
│  │  Account B: S3 30TB   ├─ 合計 100TB → 割引適用   │  │
│  │  Account C: S3 20TB  ─┘                           │  │
│  │                                                    │  │
│  │  Account A: EC2 RI   → 他アカウントでRI共有可能   │  │
│  │  Account B: Savings Plans → 同様に共有可能        │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

---

## 2. 組織構造とOU

### 2.1 推奨OU構造

```
Root
├── Security OU
│   ├── Log Archive Account        # CloudTrail、Config ログ集約
│   └── Audit Account              # セキュリティ監査用
│
├── Infrastructure OU
│   ├── Network Account            # Transit Gateway、VPC共有
│   └── Shared Services Account    # Active Directory、DNS
│
├── Sandbox OU
│   └── Developer Accounts         # 開発者個別アカウント
│
├── Workloads OU
│   ├── Dev OU
│   │   ├── App-A Dev Account
│   │   └── App-B Dev Account
│   ├── Staging OU
│   │   ├── App-A Staging Account
│   │   └── App-B Staging Account
│   └── Prod OU
│       ├── App-A Prod Account
│       └── App-B Prod Account
│
├── Policy Staging OU               # SCP テスト用
│   └── Test Account
│
└── Suspended OU                    # 使用停止アカウント
    └── (閉鎖予定アカウント)
```

### 2.2 OU操作

```bash
# OU作成
aws organizations create-organizational-unit \
  --parent-id r-xxxx \
  --name "Workloads"

# 子OU作成
aws organizations create-organizational-unit \
  --parent-id ou-xxxx-xxxxxxxx \
  --name "Production"

# アカウントをOUに移動
aws organizations move-account \
  --account-id 123456789012 \
  --source-parent-id r-xxxx \
  --destination-parent-id ou-xxxx-xxxxxxxx

# OU一覧表示
aws organizations list-organizational-units-for-parent \
  --parent-id r-xxxx
```

---

## 3. SCP（サービスコントロールポリシー）

### 3.1 SCPの基本概念

```
【SCP と IAM の関係】

┌─────────────────────────────────────────────────────────────┐
│                      有効な権限                              │
│                                                              │
│  ┌──────────────────┐   ∩   ┌──────────────────┐           │
│  │       SCP        │       │       IAM        │           │
│  │    (上限設定)     │       │   (実際の権限)    │           │
│  │                  │       │                  │           │
│  │  「何ができるか   │       │ 「何をするか     │           │
│  │   の最大範囲」    │       │   の許可」        │           │
│  └──────────────────┘       └──────────────────┘           │
│                                                              │
│  SCP ∩ IAM Policy = 実際にできること                         │
│                                                              │
│  ※SCPはManagement Accountには効かない                        │
│  ※SCPはサービスリンクロールには効かない                      │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 SCP戦略

| 戦略 | 説明 | ユースケース |
|------|------|-------------|
| **Deny list** | FullAccess + 明示的Deny | 特定操作のみブロック（推奨） |
| **Allow list** | FullAccess削除 + 明示的Allow | 使用サービスを厳格に制限 |

### 3.3 よく使うSCPパターン

```json
// パターン1: リージョン制限
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyNonApprovedRegions",
      "Effect": "Deny",
      "NotAction": [
        "iam:*",
        "organizations:*",
        "sts:*",
        "support:*",
        "cloudfront:*"
      ],
      "Resource": "*",
      "Condition": {
        "StringNotEquals": {
          "aws:RequestedRegion": [
            "ap-northeast-1",
            "us-east-1"
          ]
        }
      }
    }
  ]
}
```

```json
// パターン2: CloudTrail無効化防止
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyCloudTrailModification",
      "Effect": "Deny",
      "Action": [
        "cloudtrail:StopLogging",
        "cloudtrail:DeleteTrail",
        "cloudtrail:UpdateTrail"
      ],
      "Resource": "*"
    }
  ]
}
```

```json
// パターン3: ルートユーザーの操作制限
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyRootUserActions",
      "Effect": "Deny",
      "Action": "*",
      "Resource": "*",
      "Condition": {
        "StringLike": {
          "aws:PrincipalArn": "arn:aws:iam::*:root"
        }
      }
    }
  ]
}
```

```json
// パターン4: S3パブリックアクセス防止
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyS3PublicAccess",
      "Effect": "Deny",
      "Action": [
        "s3:PutBucketPublicAccessBlock",
        "s3:PutAccountPublicAccessBlock"
      ],
      "Resource": "*",
      "Condition": {
        "StringNotEquals": {
          "s3:PublicAccessBlockConfiguration/BlockPublicAcls": "true"
        }
      }
    }
  ]
}
```

### 3.4 SCPの適用

```bash
# SCP作成
aws organizations create-policy \
  --name "DenyNonApprovedRegions" \
  --description "承認リージョン以外の利用を禁止" \
  --type SERVICE_CONTROL_POLICY \
  --content file://deny-regions-scp.json

# SCPをOUにアタッチ
aws organizations attach-policy \
  --policy-id p-xxxxxxxxxxxx \
  --target-id ou-xxxx-xxxxxxxx

# SCPの一覧表示
aws organizations list-policies --filter SERVICE_CONTROL_POLICY

# ターゲットのポリシー一覧
aws organizations list-policies-for-target \
  --target-id ou-xxxx-xxxxxxxx \
  --filter SERVICE_CONTROL_POLICY
```

### 3.5 SCP継承のルール

```
【SCP継承の仕組み】

Root (FullAWSAccess)
 │
 ├─ SCP: DenyRegion (us-west-2以外をDeny)
 │
 └─ OU: Production
      │
      ├─ SCP: DenyDeleteS3 (S3削除をDeny)
      │
      └─ Account: 123456789012
           │
           ├─ IAM Policy: S3FullAccess
           │
           └─ 有効な権限:
                ・S3操作: us-west-2のみ
                ・S3削除: Deny (SCP)
                ・その他: us-west-2のみ + IAM Policyの範囲

継承ルール:
・SCPは上位OUから下位に継承される
・子OUは親の許可範囲内でのみ操作可能
・暗黙のDeny: FullAWSAccessがないと全てDeny
```

---

## 4. 委任管理者

### 4.1 委任管理者パターン

```
【委任管理者アーキテクチャ】

Management Account
├─ Organizations管理
├─ 請求管理
└─ 最小限のワークロード

     ┌─────────────────────────────────┐
     │       委任管理者アカウント        │
     ├─────────────────────────────────┤
     │ Config集約     → Audit Account  │
     │ Security Hub   → Audit Account  │
     │ GuardDuty      → Audit Account  │
     │ CloudFormation │                │
     │   StackSets    → Infra Account  │
     │ SSM            → Ops Account    │
     └─────────────────────────────────┘
```

### 4.2 委任管理者の設定

```bash
# 委任管理者の登録
aws organizations register-delegated-administrator \
  --account-id 222222222222 \
  --service-principal config.amazonaws.com

# 委任管理者の確認
aws organizations list-delegated-administrators \
  --service-principal config.amazonaws.com

# 委任管理者の解除
aws organizations deregister-delegated-administrator \
  --account-id 222222222222 \
  --service-principal config.amazonaws.com
```

---

## 5. AWS Control Tower

### 5.1 Control Towerの概要

```
【Control Tower アーキテクチャ】

┌─────────────────────────────────────────────────────────────────────┐
│                     AWS Control Tower                                │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │                    Landing Zone                                │ │
│  │                                                                │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │ │
│  │  │  Guardrails  │  │  Account     │  │  Dashboard   │       │ │
│  │  │  (ガードレール)│  │  Factory     │  │  (ダッシュ   │       │ │
│  │  │              │  │  (アカウント  │  │   ボード)    │       │ │
│  │  │  Preventive  │  │   自動作成)  │  │              │       │ │
│  │  │  Detective   │  │              │  │              │       │ │
│  │  └──────────────┘  └──────────────┘  └──────────────┘       │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │                 基盤サービス                                   │ │
│  │                                                                │ │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐        │ │
│  │  │  Org     │ │  SSO     │ │  Config  │ │CloudTrail│        │ │
│  │  │          │ │(IAM IdC) │ │          │ │          │        │ │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘        │ │
│  └────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

### 5.2 ガードレールの種類

| 種類 | 実装方法 | 動作 | 例 |
|------|---------|------|-----|
| **Preventive** | SCP | 操作を事前にブロック | リージョン制限 |
| **Detective** | Config Rules | 違反を検出・通知 | S3暗号化チェック |
| **Proactive** | CloudFormation Hooks | デプロイ前にブロック | 非暗号化EBSの作成防止 |

### 5.3 ガードレールのカテゴリ

| レベル | 説明 | 例 |
|--------|------|-----|
| **Mandatory** | 必須（無効化不可） | CloudTrail有効化 |
| **Strongly recommended** | 強く推奨 | S3パブリックアクセスブロック |
| **Elective** | 任意 | リージョン制限 |

### 5.4 Account Factory

```
【Account Factory フロー】

管理者/開発者
      │
      ▼
┌──────────────────┐
│ Account Factory  │
│ (Service Catalog)│
└────────┬─────────┘
         │
         ▼
┌──────────────────────────────────────────────────────────┐
│ 自動プロビジョニング                                     │
│                                                          │
│  1. 新規AWSアカウント作成                                │
│  2. 指定OUへの配置                                       │
│  3. IAM Identity Center (SSO) 設定                      │
│  4. ガードレール自動適用                                 │
│  5. VPCベースライン設定                                  │
│  6. CloudTrail/Config 自動有効化                         │
└──────────────────────────────────────────────────────────┘
```

### 5.5 Account Factory for Terraform (AFT)

```
【AFT アーキテクチャ】

┌──────────────────────────────────────────────────────────┐
│                Account Factory for Terraform             │
│                                                          │
│  ┌────────────┐    ┌────────────┐    ┌────────────┐    │
│  │   Git      │───▶│  CodePipeline│──▶│  Terraform │    │
│  │   Repo     │    │            │    │  Apply     │    │
│  │ (IaC定義)  │    │  (CI/CD)   │    │            │    │
│  └────────────┘    └────────────┘    └──────┬─────┘    │
│                                              │          │
│                                              ▼          │
│                                     ┌────────────┐     │
│                                     │ New Account│     │
│                                     │ + Baseline │     │
│                                     └────────────┘     │
└──────────────────────────────────────────────────────────┘
```

---

## 6. クロスアカウント戦略

### 6.1 クロスアカウントアクセスパターン

```
【クロスアカウントアクセス方式】

方式1: IAMロールの引き受け (AssumeRole)
┌──────────────┐         ┌──────────────┐
│  Account A   │         │  Account B   │
│              │         │              │
│  IAM User    │──STS──▶│  IAM Role    │
│  or Role     │AssumeRole│ (Cross-Acct)│
│              │         │              │
└──────────────┘         └──────────────┘

方式2: リソースベースポリシー
┌──────────────┐         ┌──────────────┐
│  Account A   │         │  Account B   │
│              │         │              │
│  IAM User    │──直接──▶│  S3 Bucket   │
│              │ アクセス │  Policy      │
│              │         │  (Acct A許可)│
└──────────────┘         └──────────────┘

方式3: AWS RAM (Resource Access Manager)
┌──────────────┐         ┌──────────────┐
│  Account A   │         │  Account B   │
│              │         │              │
│  VPC Subnet  │──共有──▶│  利用可能    │
│  Transit GW  │  (RAM)  │              │
└──────────────┘         └──────────────┘
```

### 6.2 集約パターン

```
【ログ・セキュリティ集約】

各メンバーアカウント
┌────┐ ┌────┐ ┌────┐
│ A  │ │ B  │ │ C  │
│    │ │    │ │    │
│CT  │ │CT  │ │CT  │  CT = CloudTrail
│CW  │ │CW  │ │CW  │  CW = Config
│GD  │ │GD  │ │GD  │  GD = GuardDuty
└──┬─┘ └──┬─┘ └──┬─┘
   │      │      │
   └──────┼──────┘
          │
          ▼
┌─────────────────────┐
│  Security Account   │
│  (委任管理者)       │
│                     │
│  ┌───────────────┐ │
│  │ Security Hub  │ │  ← 集約ビュー
│  │ GuardDuty     │ │
│  │ Config        │ │
│  └───────────────┘ │
└─────────────────────┘
          │
          ▼
┌─────────────────────┐
│  Log Archive Acct   │
│                     │
│  ┌───────────────┐ │
│  │ S3 (CloudTrail│ │  ← 長期保存
│  │  Config Logs) │ │
│  │ Glacier       │ │
│  └───────────────┘ │
└─────────────────────┘
```

---

## 7. ハンズオン演習

### 7.1 演習1: 組織情報の確認

```bash
# 組織情報の確認
aws organizations describe-organization

# ルートID取得
aws organizations list-roots

# OU一覧
ROOT_ID=$(aws organizations list-roots --query "Roots[0].Id" --output text)
aws organizations list-organizational-units-for-parent --parent-id ${ROOT_ID}

# アカウント一覧
aws organizations list-accounts

# 有効なサービス一覧
aws organizations list-aws-service-access-for-organization
```

### 7.2 演習2: SCP作成とアタッチ

```bash
# SCPの作成（テスト用: EC2 RunInstances制限）
cat > /tmp/test-scp.json << 'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyLargeEC2",
      "Effect": "Deny",
      "Action": "ec2:RunInstances",
      "Resource": "arn:aws:ec2:*:*:instance/*",
      "Condition": {
        "ForAnyValue:StringNotLike": {
          "ec2:InstanceType": ["t3.*", "t2.*"]
        }
      }
    }
  ]
}
EOF

# SCP作成
aws organizations create-policy \
  --name "DenyLargeEC2Instances" \
  --description "t2/t3以外のEC2インスタンス起動を制限" \
  --type SERVICE_CONTROL_POLICY \
  --content file:///tmp/test-scp.json

# SCPの確認
aws organizations list-policies --filter SERVICE_CONTROL_POLICY
```

### 7.3 演習3: ポリシーシミュレーション

```bash
# 特定アカウントに適用されているSCPの確認
aws organizations list-policies-for-target \
  --target-id 123456789012 \
  --filter SERVICE_CONTROL_POLICY

# ポリシーの内容確認
aws organizations describe-policy \
  --policy-id p-xxxxxxxxxxxx
```

### 7.4 クリーンアップ

```bash
# SCPのデタッチ
aws organizations detach-policy \
  --policy-id p-xxxxxxxxxxxx \
  --target-id ou-xxxx-xxxxxxxx

# SCPの削除
aws organizations delete-policy \
  --policy-id p-xxxxxxxxxxxx
```

---

## 8. DOP試験対策チェックリスト

### Organizations基本

- [ ] Organizations の組織構造（Root, OU, Account）を説明できる
- [ ] 一括請求のメリットを理解している
- [ ] Management Accountの特殊な位置づけを知っている

<details>
<summary>📝 模範解答を見る</summary>

**組織構造**:
- Root: 組織のトップレベル（1つのみ）
- OU: アカウントをグループ化する論理コンテナ（ネスト可能、最大5階層）
- Account: 個々のAWSアカウント

**一括請求のメリット**:
1. ボリュームディスカウント（S3, EC2等の使用量を合算）
2. RI/Savings Plansの共有
3. 請求の一元管理

**Management Accountの特殊性**:
- SCPの影響を受けない
- 組織を解散できる唯一のアカウント
- ワークロードを置かないのがベストプラクティス
</details>

### SCP

- [ ] SCPとIAMポリシーの関係を説明できる
- [ ] Deny listとAllow listの戦略を使い分けできる
- [ ] SCP継承のルールを理解している
- [ ] よく使うSCPパターンを実装できる

<details>
<summary>📝 模範解答を見る</summary>

**SCPとIAMの関係**:
- SCP = 権限の上限（ガードレール）
- IAM = 実際の権限付与
- 有効な権限 = SCP ∩ IAM Policy
- SCPだけでは権限は付与されない

**戦略の使い分け**:
- **Deny list（推奨）**: FullAWSAccessを残し、特定操作をDeny
  - 管理が容易、新サービス自動対応
- **Allow list**: FullAWSAccessを削除し、必要操作のみAllow
  - 厳格だが管理コスト高

**SCP継承ルール**:
1. 上位OUのSCPが下位に継承
2. 暗黙のDeny（FullAWSAccessがないと全てDeny）
3. 明示的Denyは常に優先
4. Management Accountには効かない
</details>

### Control Tower

- [ ] Control Towerの主要コンポーネントを説明できる
- [ ] ガードレールの3種類（Preventive, Detective, Proactive）を理解している
- [ ] Account Factoryの仕組みを知っている
- [ ] AFT（Account Factory for Terraform）の概要を理解している

<details>
<summary>📝 模範解答を見る</summary>

**主要コンポーネント**:
1. **Landing Zone**: マルチアカウント環境のベースライン
2. **Guardrails**: ガバナンスルール
3. **Account Factory**: アカウント自動プロビジョニング
4. **Dashboard**: コンプライアンス状況の可視化

**ガードレールの種類**:
| 種類 | 実装 | 動作 |
|------|------|------|
| Preventive | SCP | 事前ブロック |
| Detective | Config Rules | 違反検出 |
| Proactive | CFn Hooks | デプロイ前チェック |

**Account Factory**:
- Service Catalogベース
- 新規アカウントの自動作成
- ベースライン設定自動適用
- SSO/IAM Identity Center自動設定
</details>

### マルチアカウント設計

- [ ] 推奨OU構造を設計できる
- [ ] 委任管理者パターンを説明できる
- [ ] クロスアカウントアクセスの方式を使い分けできる
- [ ] ログ・セキュリティ集約のアーキテクチャを設計できる

<details>
<summary>📝 模範解答を見る</summary>

**推奨OU構造**:
- Security OU: Log Archive + Audit
- Infrastructure OU: Network + Shared Services
- Workloads OU: Dev/Staging/Prod
- Sandbox OU: 個人実験用
- Suspended OU: 廃止予定アカウント

**委任管理者パターン**:
- Security Hub/GuardDuty/Config → Audit Account
- StackSets → Infrastructure Account
- 理由: Management Accountの責務を最小化

**クロスアカウントアクセス方式**:
1. **AssumeRole**: 最も一般的、一時的な認証情報
2. **リソースベースポリシー**: S3, SNS, SQS等
3. **AWS RAM**: VPCサブネット, Transit GW共有

**ログ・セキュリティ集約**:
```
各アカウント → Security Account (委任管理者)
                    ↓
              Log Archive Account (S3/Glacier)
```
</details>

---

## 付録A: よく使うCLIコマンド

```bash
# 組織管理
aws organizations describe-organization
aws organizations list-roots
aws organizations list-accounts
aws organizations list-organizational-units-for-parent --parent-id ROOT_ID

# SCP管理
aws organizations create-policy --name NAME --type SERVICE_CONTROL_POLICY --content file://policy.json
aws organizations attach-policy --policy-id POLICY_ID --target-id OU_ID
aws organizations detach-policy --policy-id POLICY_ID --target-id OU_ID
aws organizations list-policies --filter SERVICE_CONTROL_POLICY
aws organizations list-policies-for-target --target-id TARGET_ID --filter SERVICE_CONTROL_POLICY

# 委任管理者
aws organizations register-delegated-administrator --account-id ACCOUNT_ID --service-principal SERVICE
aws organizations list-delegated-administrators

# サービス統合
aws organizations list-aws-service-access-for-organization
aws organizations enable-aws-service-access --service-principal SERVICE
```

---

**作成日**: 2026-02-04
**最終更新**: 2026-02-04
**検証環境**: AWS ap-northeast-1 リージョン
