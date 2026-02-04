# AWS GuardDuty & Security Hub ハンズオンガイド

> **対象**: AWS DevOps Professional (DOP-C02) 試験対策
> **前提知識**: AWS基礎、IAM、VPC、CloudTrail、EventBridge
> **所要時間**: 約3時間

---

## 目次

1. [GuardDuty概要](#1-guardduty概要)
2. [GuardDutyの脅威タイプ](#2-guarddutyの脅威タイプ)
3. [GuardDutyの詳細設定](#3-guarddutyの詳細設定)
4. [Security Hub概要](#4-security-hub概要)
5. [Security Hub標準](#5-security-hub標準)
6. [マルチアカウントでのGuardDuty / Security Hub運用](#6-マルチアカウントでのguarddutysecurity-hub運用)
7. [自動修復パターン](#7-自動修復パターン)
8. [Amazon Inspector概要](#8-amazon-inspector概要)
9. [ハンズオン演習](#9-ハンズオン演習)
10. [DOP試験対策チェックリスト](#10-dop試験対策チェックリスト)

---

## 1. GuardDuty概要

### 1.1 GuardDutyとは

```
┌─────────────────────────────────────────────────────────────────────┐
│                       Amazon GuardDuty                               │
│              インテリジェント脅威検出サービス                         │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │                  データソース（自動分析）                       │ │
│  │                                                                │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │ │
│  │  │ VPC Flow     │  │  DNS Logs    │  │ CloudTrail   │        │ │
│  │  │   Logs       │  │              │  │   Events     │        │ │
│  │  │              │  │              │  │              │        │ │
│  │  │ ネットワーク │  │ DNSクエリ    │  │ API呼出し    │        │ │
│  │  │ トラフィック │  │ 解析         │  │ 監視         │        │ │
│  │  └──────────────┘  └──────────────┘  └──────────────┘        │ │
│  │                                                                │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │ │
│  │  │ S3 Data      │  │  EKS Audit   │  │ Lambda       │        │ │
│  │  │   Events     │  │    Logs      │  │ Network      │        │ │
│  │  │              │  │              │  │ Activity     │        │ │
│  │  │ S3操作監視   │  │ K8s監査ログ  │  │ Lambda通信   │        │ │
│  │  └──────────────┘  └──────────────┘  └──────────────┘        │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                              │                                      │
│                     機械学習 + 脅威インテリジェンス                  │
│                              │                                      │
│                              ▼                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │                    Findings（検出結果）                         │ │
│  │                                                                │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │ │
│  │  │  コンソール  │  │  EventBridge │  │ Security Hub │        │ │
│  │  │  表示        │  │  イベント    │  │  統合        │        │ │
│  │  └──────────────┘  └──────────────┘  └──────────────┘        │ │
│  └────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.2 DOP試験での重要ポイント

| トピック | 重要度 | 出題パターン |
|---------|--------|-------------|
| **マルチアカウント管理** | ★★★★★ | Organizations連携・委任管理者 |
| **自動修復パターン** | ★★★★★ | EventBridge + Lambda連携 |
| **Security Hub統合** | ★★★★★ | 集約・標準準拠 |
| **脅威タイプの理解** | ★★★★☆ | Finding分類と対応方法 |
| **データソース** | ★★★★☆ | 何を監視しているか |
| **信頼済みIPリスト/脅威リスト** | ★★★☆☆ | カスタムリスト管理 |
| **抑制ルール** | ★★★☆☆ | 誤検知対応 |

### 1.3 GuardDutyの動作フロー

```
【GuardDuty 動作フロー】

┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│ データソース │     │    GuardDuty     │     │   Findings      │
│             │     │                  │     │                 │
│ VPC Flow    │────▶│  機械学習        │────▶│  Severity:      │
│ DNS Logs    │     │  異常検知        │     │  Low (1.0-3.9)  │
│ CloudTrail  │     │  脅威Intel照合   │     │  Medium(4.0-6.9)│
│ S3 Events   │     │                  │     │  High (7.0-8.9) │
│ EKS Logs    │     │                  │     │  Critical(9.0+) │
│ Lambda Net  │     │                  │     │                 │
└─────────────┘     └──────────────────┘     └────────┬────────┘
                                                       │
                                         ┌─────────────┼─────────────┐
                                         │             │             │
                                         ▼             ▼             ▼
                                   ┌──────────┐ ┌──────────┐ ┌──────────┐
                                   │EventBridge│ │ Security │ │ S3       │
                                   │(自動修復)│ │  Hub     │ │(エクス   │
                                   │          │ │(集約)    │ │ ポート)  │
                                   └──────────┘ └──────────┘ └──────────┘
```

### 1.4 データソース詳細

| データソース | 分析対象 | 検出例 | 追加料金 |
|-------------|---------|--------|---------|
| **VPC Flow Logs** | ネットワークトラフィック | ポートスキャン、C&C通信 | 基本料金に含む |
| **DNS Logs** | DNSクエリ | マルウェアドメイン通信 | 基本料金に含む |
| **CloudTrail管理イベント** | API呼出し | 不正IAM操作 | 基本料金に含む |
| **CloudTrailデータイベント（S3）** | S3オブジェクト操作 | 不正データアクセス | 追加料金 |
| **EKS監査ログ** | Kubernetes APIログ | 不正Pod操作 | 追加料金 |
| **Lambda Network Activity** | Lambdaネットワーク | 不正外部通信 | 追加料金 |
| **RDS Login Activity** | RDSログイン試行 | ブルートフォース攻撃 | 追加料金 |
| **Runtime Monitoring** | EC2/ECS/EKSランタイム | プロセスレベル脅威 | 追加料金 |

> **重要**: GuardDutyはVPC Flow Logs、DNS Logs、CloudTrailを**直接取得**する。ユーザーが個別に有効化する必要はない（GuardDuty独自のデータ収集機構を使用）。

### 1.5 料金体系

```
【GuardDuty 料金構造】

┌─────────────────────────────────────────────────────────────┐
│ 基本分析（必須）                                             │
│ ├─ CloudTrail管理イベント: イベント数課金                   │
│ ├─ VPC Flow Logs: GB単位課金                                │
│ └─ DNS Logs: クエリ数課金                                   │
├─────────────────────────────────────────────────────────────┤
│ オプション保護（個別有効化）                                 │
│ ├─ S3保護: S3データイベント数課金                           │
│ ├─ EKS保護: EKS監査ログ数課金                              │
│ ├─ Lambda保護: Lambda呼出し数課金                          │
│ ├─ RDS保護: RDSログインイベント数課金                      │
│ └─ Runtime Monitoring: vCPU時間課金                         │
├─────────────────────────────────────────────────────────────┤
│ 無料枠: 30日間の無料トライアル                               │
│ 注意: 各保護プランごとに個別の30日トライアルあり             │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. GuardDutyの脅威タイプ

### 2.1 脅威タイプの分類体系

GuardDutyのFinding Typeは以下の命名規則に従う:

```
【Finding Type 命名規則】

{ThreatPurpose}:{ResourceTypeDetected}/{ThreatFamilyName}.{DetectionMechanism}!{Artifact}

例: Recon:EC2/PortProbeUnprotectedPort
    │       │    │
    │       │    └── 脅威ファミリー名
    │       └── リソースタイプ（EC2, IAMUser, S3等）
    └── 脅威目的
```

### 2.2 脅威目的（ThreatPurpose）一覧

| 脅威目的 | 説明 | 典型例 |
|---------|------|--------|
| **Recon** | 偵察活動 | ポートスキャン、API列挙 |
| **UnauthorizedAccess** | 不正アクセス | 通常外IPからのログイン |
| **Backdoor** | バックドア | C&Cサーバーとの通信 |
| **CryptoCurrency** | 暗号通貨マイニング | Bitcoin/Ethereum関連通信 |
| **Trojan** | トロイの木馬 | マルウェアC&C通信 |
| **Stealth** | 隠蔽活動 | CloudTrailログ無効化 |
| **PenTest** | ペネトレーションテスト | Kali Linux等のツール検出 |
| **Impact** | リソース乗っ取り | DNS改ざん、リソース破壊 |
| **CredentialAccess** | 認証情報窃取 | インスタンスメタデータ取得 |
| **Execution** | 実行 | 不正コマンド実行 |
| **Discovery** | 環境探索 | API異常呼出し |
| **Exfiltration** | データ流出 | S3からの大量データ取得 |
| **Persistence** | 永続化 | 不正IAMユーザー作成 |
| **PrivilegeEscalation** | 権限昇格 | IAMポリシー変更 |
| **DefenseEvasion** | 防御回避 | ログ削除、暗号化回避 |

### 2.3 リソースタイプ別の主要Finding

#### EC2関連のFinding

```
【EC2 Finding例】

┌─────────────────────────────────────────────────────────────┐
│ 高重要度 (High/Critical)                                     │
│ ├─ Backdoor:EC2/C&CActivity.B!DNS                          │
│ │   └─ C&Cサーバーへの通信検出                              │
│ ├─ CryptoCurrency:EC2/BitcoinTool.B!DNS                    │
│ │   └─ ビットコインマイニング通信                          │
│ ├─ Trojan:EC2/BlackholeTraffic                             │
│ │   └─ ブラックホールIPへの通信                            │
│ └─ UnauthorizedAccess:EC2/RDPBruteForce                    │
│     └─ RDPブルートフォース攻撃                             │
├─────────────────────────────────────────────────────────────┤
│ 中重要度 (Medium)                                            │
│ ├─ Recon:EC2/PortProbeUnprotectedPort                      │
│ │   └─ 保護されていないポートへの探索                      │
│ ├─ UnauthorizedAccess:EC2/SSHBruteForce                    │
│ │   └─ SSHブルートフォース攻撃                             │
│ └─ Backdoor:EC2/DenialOfService.Tcp                        │
│     └─ DoS攻撃のターゲットまたは踏み台                     │
├─────────────────────────────────────────────────────────────┤
│ 低重要度 (Low)                                               │
│ ├─ Recon:EC2/Portscan                                      │
│ │   └─ EC2からのポートスキャン                             │
│ └─ UnauthorizedAccess:EC2/TorRelay                         │
│     └─ Torリレーとしての動作                               │
└─────────────────────────────────────────────────────────────┘
```

#### IAMUser関連のFinding

| Finding Type | 説明 | 重要度 |
|-------------|------|--------|
| **Stealth:IAMUser/CloudTrailLoggingDisabled** | CloudTrail無効化 | Low |
| **Persistence:IAMUser/AnomalousBehavior** | 異常なIAM操作 | Medium-High |
| **CredentialAccess:IAMUser/AnomalousBehavior** | 認証情報への異常アクセス | Medium-High |
| **UnauthorizedAccess:IAMUser/ConsoleLoginSuccess.B** | 異常コンソールログイン | Medium |
| **Discovery:IAMUser/AnomalousBehavior** | 異常なAPI探索 | Low-Medium |
| **Impact:IAMUser/AnomalousBehavior** | 破壊的なAPI操作 | High |
| **PrivilegeEscalation:IAMUser/AnomalousBehavior** | IAMポリシー変更 | Medium |

#### S3関連のFinding

| Finding Type | 説明 | 重要度 |
|-------------|------|--------|
| **Exfiltration:S3/MaliciousIPCaller** | 悪意あるIPからのS3アクセス | High |
| **Exfiltration:S3/AnomalousBehavior** | 異常なS3データ取得パターン | High |
| **Impact:S3/MaliciousIPCaller** | 悪意あるIPからのS3変更 | High |
| **UnauthorizedAccess:S3/TorIPCaller** | TorノードからのS3アクセス | Medium |
| **Discovery:S3/AnomalousBehavior** | 異常なS3 API探索 | Low |
| **Stealth:S3/ServerAccessLoggingDisabled** | S3アクセスログ無効化 | Low |
| **PenTest:S3/KaliLinux** | Kali LinuxからのS3アクセス | Medium |

### 2.4 Findingの重要度レベル

```
【Severity（重要度）レベル】

  Critical (9.0-10.0)  ──▶ 即時対応必須
  ████████████████████      例: アクティブなC&C通信

  High (7.0-8.9)       ──▶ 優先的に対応
  ████████████████          例: 暗号通貨マイニング

  Medium (4.0-6.9)     ──▶ 調査が必要
  ████████████              例: SSH/RDPブルートフォース

  Low (1.0-3.9)        ──▶ 情報提供
  ████████                  例: ポートスキャン
```

---

## 3. GuardDutyの詳細設定

### 3.1 信頼済みIPリスト / 脅威リスト

```
【IPリスト管理】

┌──────────────────────────────────────────────────┐
│ Trusted IP List（信頼済みIPリスト）               │
│ ├─ このIPからの通信はFindingを生成しない         │
│ ├─ 自社オフィスIP、VPN出口等                     │
│ └─ 1アカウント1リストまで                        │
├──────────────────────────────────────────────────┤
│ Threat Intel Set（脅威インテリジェンスリスト）     │
│ ├─ 既知の悪意あるIPリスト                        │
│ ├─ 独自の脅威情報フィードを追加可能              │
│ └─ 1アカウント最大6リストまで                    │
├──────────────────────────────────────────────────┤
│ 形式: プレーンテキスト（1行1IP）                  │
│ 保管: S3バケット                                  │
│ 形式例: TXT, STIX, OTX CSV, FireEye iSIGHT      │
└──────────────────────────────────────────────────┘
```

```bash
# 信頼済みIPリストの作成
aws guardduty create-ip-set \
  --detector-id ${DETECTOR_ID} \
  --name "TrustedOfficeIPs" \
  --format TXT \
  --location "s3://my-guardduty-lists/trusted-ips.txt" \
  --activate

# 脅威インテリジェンスリストの作成
aws guardduty create-threat-intel-set \
  --detector-id ${DETECTOR_ID} \
  --name "CustomThreatFeed" \
  --format TXT \
  --location "s3://my-guardduty-lists/threat-ips.txt" \
  --activate
```

### 3.2 抑制ルール（Suppression Rules）

```bash
# 抑制ルール（フィルタ）の作成
# 特定の既知のペネトレーションテスト元IPからのFindingを抑制
aws guardduty create-filter \
  --detector-id ${DETECTOR_ID} \
  --name "SuppressPenTestFindings" \
  --action ARCHIVE \
  --finding-criteria '{
    "Criterion": {
      "type": {
        "Eq": ["Recon:EC2/Portscan"]
      },
      "service.action.networkConnectionAction.remoteIpDetails.ipAddressV4": {
        "Eq": ["203.0.113.100"]
      }
    }
  }'
```

### 3.3 Findingのエクスポート設定

```
【Findingエクスポート先】

GuardDuty Findings
       │
       ├──▶ S3バケット（長期保存）
       │     └─ KMS暗号化必須
       │
       ├──▶ EventBridge（リアルタイム連携）
       │     └─ 自動修復トリガー
       │
       └──▶ Detective（調査・分析）
             └─ 根本原因分析

※ Findingは90日間GuardDutyコンソールに保持
※ 長期保存にはS3エクスポートが必要
```

```bash
# S3へのFindingエクスポート設定
aws guardduty create-publishing-destination \
  --detector-id ${DETECTOR_ID} \
  --destination-type S3 \
  --destination-properties '{
    "DestinationArn": "arn:aws:s3:::guardduty-findings-bucket",
    "KmsKeyArn": "arn:aws:kms:ap-northeast-1:123456789012:key/key-id"
  }'
```

---

## 4. Security Hub概要

### 4.1 Security Hubとは

```
┌─────────────────────────────────────────────────────────────────────┐
│                       AWS Security Hub                               │
│            クラウドセキュリティ態勢管理（CSPM）サービス               │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │              Findingの集約・正規化・優先順位付け               │ │
│  │                                                                │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │ │
│  │  │  GuardDuty   │  │  Inspector   │  │   Macie      │        │ │
│  │  │  (脅威検出)  │  │  (脆弱性)    │  │  (機密データ)│        │ │
│  │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘        │ │
│  │         │                 │                 │                │ │
│  │         ▼                 ▼                 ▼                │ │
│  │  ┌──────────────────────────────────────────────────┐        │ │
│  │  │                ASFF形式に正規化                    │        │ │
│  │  │     (AWS Security Finding Format)                 │        │ │
│  │  └──────────────────────────────────────────────────┘        │ │
│  │                           │                                  │ │
│  │                           ▼                                  │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │ │
│  │  │  Config      │  │  Firewall   │  │  IAM Access  │        │ │
│  │  │  (準拠評価)  │  │  Manager    │  │  Analyzer    │        │ │
│  │  └──────────────┘  └──────────────┘  └──────────────┘        │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                              │                                      │
│                              ▼                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │                   セキュリティ標準                              │ │
│  │                                                                │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │ │
│  │  │  AWS         │  │  CIS AWS     │  │  PCI DSS     │        │ │
│  │  │  Foundational│  │  Benchmark   │  │              │        │ │
│  │  │  Best        │  │              │  │              │        │ │
│  │  │  Practices   │  │              │  │              │        │ │
│  │  └──────────────┘  └──────────────┘  └──────────────┘        │ │
│  └────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.2 ASFF (AWS Security Finding Format)

```json
{
  "SchemaVersion": "2018-10-08",
  "Id": "arn:aws:securityhub:ap-northeast-1:123456789012:finding/xxx",
  "ProductArn": "arn:aws:securityhub:ap-northeast-1::product/aws/guardduty",
  "GeneratorId": "arn:aws:guardduty:ap-northeast-1:123456789012:detector/xxx",
  "AwsAccountId": "123456789012",
  "Types": ["Software and Configuration Checks/AWS Security Best Practices"],
  "CreatedAt": "2026-02-04T10:00:00.000Z",
  "UpdatedAt": "2026-02-04T10:00:00.000Z",
  "Severity": {
    "Label": "HIGH",
    "Normalized": 70
  },
  "Title": "EC2 instance communicating with known C&C server",
  "Description": "EC2 instance i-0abcdef1234567890 is communicating with...",
  "Remediation": {
    "Recommendation": {
      "Text": "Isolate the instance and investigate..."
    }
  },
  "Resources": [
    {
      "Type": "AwsEc2Instance",
      "Id": "arn:aws:ec2:ap-northeast-1:123456789012:instance/i-0abcdef",
      "Region": "ap-northeast-1"
    }
  ],
  "Compliance": {
    "Status": "FAILED"
  },
  "Workflow": {
    "Status": "NEW"
  },
  "RecordState": "ACTIVE"
}
```

### 4.3 DOP試験でのSecurity Hub重要ポイント

| トピック | 重要度 | 出題パターン |
|---------|--------|-------------|
| **ASFF形式** | ★★★★★ | Findingの正規化フォーマット |
| **統合サービス** | ★★★★★ | GuardDuty/Inspector/Macie連携 |
| **セキュリティ標準** | ★★★★★ | FSBP, CIS, PCI DSS |
| **マルチアカウント集約** | ★★★★★ | Organizations委任管理者 |
| **カスタムアクション** | ★★★★☆ | EventBridge連携 |
| **自動化ルール** | ★★★★☆ | Finding自動更新 |
| **クロスリージョン集約** | ★★★☆☆ | リージョン集約設定 |

### 4.4 統合プロバイダー

```
【Security Hub 統合サービス】

┌─────────────────────────────────────────────────────────────┐
│ AWSネイティブ統合（自動）                                    │
│ ├─ GuardDuty         : 脅威検出                             │
│ ├─ Inspector          : 脆弱性スキャン                      │
│ ├─ Macie             : 機密データ検出                       │
│ ├─ IAM Access Analyzer: パブリック/クロスアカウントアクセス │
│ ├─ Firewall Manager   : ファイアウォール管理                │
│ ├─ Config             : コンプライアンス                    │
│ ├─ Systems Manager    : パッチコンプライアンス              │
│ ├─ Health             : サービスヘルス                      │
│ └─ Detective          : セキュリティ調査                    │
├─────────────────────────────────────────────────────────────┤
│ サードパーティ統合                                           │
│ ├─ CrowdStrike, Palo Alto, Splunk 等                       │
│ └─ カスタム統合（BatchImportFindings API）                  │
└─────────────────────────────────────────────────────────────┘
```

### 4.5 Findingのワークフローステータス

```
【Workflow Status 遷移】

  NEW ──────▶ NOTIFIED ──────▶ RESOLVED
   │              │                │
   │              │                └─ 問題解決済み
   │              └─ 担当者に通知済み
   └─ 新規検出
   │
   └──────▶ SUPPRESSED
              └─ 許容済み（既知の例外等）
```

---

## 5. Security Hub標準

### 5.1 利用可能なセキュリティ標準

```
【Security Hub セキュリティ標準一覧】

┌─────────────────────────────────────────────────────────────┐
│ 1. AWS Foundational Security Best Practices (FSBP)          │
│    ├─ AWS独自のセキュリティベストプラクティス               │
│    ├─ 最も包括的（200+コントロール）                        │
│    ├─ 全AWSユーザー推奨                                     │
│    └─ 重要度: ★★★★★                                        │
├─────────────────────────────────────────────────────────────┤
│ 2. CIS AWS Foundations Benchmark                             │
│    ├─ Center for Internet Security定義                      │
│    ├─ v1.2.0 / v1.4.0 / v3.0.0                             │
│    ├─ 業界標準のセキュリティベンチマーク                    │
│    └─ 重要度: ★★★★★                                        │
├─────────────────────────────────────────────────────────────┤
│ 3. PCI DSS v3.2.1                                            │
│    ├─ Payment Card Industry Data Security Standard           │
│    ├─ クレジットカード情報を扱う場合                        │
│    ├─ カード決済関連の環境で必須                            │
│    └─ 重要度: ★★★★☆（該当環境のみ）                       │
├─────────────────────────────────────────────────────────────┤
│ 4. NIST SP 800-53 Rev. 5                                     │
│    ├─ 米国政府標準のセキュリティ管理策                      │
│    ├─ FedRAMP等で参照                                       │
│    └─ 重要度: ★★★☆☆                                        │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 AWS Foundational Security Best Practices (FSBP)

| カテゴリ | コントロール例 | 説明 |
|---------|---------------|------|
| **IAM** | IAM.1 | IAMポリシーにフル管理者権限を許可しない |
| **S3** | S3.1 | S3ブロックパブリックアクセス設定の有効化 |
| **EC2** | EC2.1 | EBSスナップショットのパブリック共有禁止 |
| **RDS** | RDS.1 | RDSスナップショットのパブリック共有禁止 |
| **Lambda** | Lambda.1 | Lambda関数のパブリックアクセス禁止 |
| **CloudTrail** | CloudTrail.1 | CloudTrailの有効化 |
| **GuardDuty** | GuardDuty.1 | GuardDutyの有効化 |
| **Config** | Config.1 | AWS Configの有効化 |

### 5.3 CIS AWS Foundations Benchmark 主要項目

```
【CIS Benchmark カテゴリ】

1. IAM (Identity and Access Management)
   ├─ 1.1  ルートアカウントのMFA有効化
   ├─ 1.4  IAMアクセスキーの90日ローテーション
   ├─ 1.5  IAMパスワードポリシーの設定
   └─ 1.10 MFAの全ユーザー有効化

2. Logging
   ├─ 2.1  CloudTrailの全リージョン有効化
   ├─ 2.2  CloudTrailログファイル整合性検証
   ├─ 2.6  S3アクセスログの有効化
   └─ 2.9  VPC Flow Logsの有効化

3. Monitoring
   ├─ 3.1  不正API呼出しのアラーム
   ├─ 3.3  ルートアカウント使用のアラーム
   ├─ 3.5  CloudTrail設定変更のアラーム
   └─ 3.8  S3バケットポリシー変更のアラーム

4. Networking
   ├─ 4.1  SSH (22) のフルオープン禁止
   ├─ 4.2  RDP (3389) のフルオープン禁止
   └─ 4.3  デフォルトVPCの不使用
```

### 5.4 セキュリティスコア

```
【Security Score 計算】

セキュリティスコア = (PASSEDコントロール数 / 有効コントロール総数) × 100%

  100% ████████████████████ 全コントロール準拠
   90% ██████████████████   ほぼ準拠
   70% ██████████████       改善が必要
   50% ██████████           深刻な問題あり
   30% ██████               早急な対応必須

※ DISABLED（無効化）やNOT_AVAILABLE（該当なし）のコントロールは除外
```

---

## 6. マルチアカウントでのGuardDuty / Security Hub運用

### 6.1 Organizations統合アーキテクチャ

```
【マルチアカウント セキュリティアーキテクチャ】

┌─────────────────────────────────────────────────────────────────┐
│                    Management Account                            │
│                    (Organizations管理)                           │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ AWS Organizations                                        │  │
│  │  └─ サービス信頼アクセスの有効化                        │  │
│  │     ├─ guardduty.amazonaws.com                           │  │
│  │     └─ securityhub.amazonaws.com                         │  │
│  └──────────────────────────────────────────────────────────┘  │
└───────────────────────────────┬─────────────────────────────────┘
                                │ 委任
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│               Security / Audit Account                           │
│               (委任管理者アカウント)                             │
│                                                                  │
│  ┌──────────────────────┐  ┌──────────────────────┐            │
│  │   GuardDuty          │  │   Security Hub       │            │
│  │   管理者アカウント    │  │   管理者アカウント    │            │
│  │                      │  │                      │            │
│  │ ・全メンバーFinding  │  │ ・全Finding集約      │            │
│  │   一元表示            │  │ ・セキュリティ標準   │            │
│  │ ・保護プラン管理      │  │ ・自動化ルール       │            │
│  │ ・S3エクスポート     │  │ ・カスタムアクション  │            │
│  └──────────┬───────────┘  └──────────┬───────────┘            │
│             │ Findings収集            │ ASFF集約                │
│             │                         │                         │
└─────────────┼─────────────────────────┼─────────────────────────┘
              │                         │
    ┌─────────┼─────────┐     ┌─────────┼─────────┐
    │         │         │     │         │         │
    ▼         ▼         ▼     ▼         ▼         ▼
┌────────┐┌────────┐┌────────┐
│ Dev    ││ Staging││ Prod   │
│Account ││Account ││Account │
│        ││        ││        │
│GuardDuty│GuardDuty│GuardDuty│
│Sec Hub ││Sec Hub ││Sec Hub │
│Inspector│Inspector│Inspector│
└────────┘└────────┘└────────┘
 (メンバー) (メンバー) (メンバー)
```

### 6.2 委任管理者の設定

```bash
# === Management Accountで実行 ===

# Organizations信頼アクセスの有効化
aws organizations enable-aws-service-access \
  --service-principal guardduty.amazonaws.com

aws organizations enable-aws-service-access \
  --service-principal securityhub.amazonaws.com

# GuardDuty委任管理者の指定
aws guardduty enable-organization-admin-account \
  --admin-account-id 222222222222

# Security Hub委任管理者の指定
aws securityhub enable-organization-admin-account \
  --admin-account-id 222222222222

# === 委任管理者アカウント (222222222222) で実行 ===

# GuardDuty: 組織メンバーの自動有効化
DETECTOR_ID=$(aws guardduty list-detectors --query "DetectorIds[0]" --output text)

aws guardduty update-organization-configuration \
  --detector-id ${DETECTOR_ID} \
  --auto-enable \
  --features '[
    {"Name": "S3_DATA_EVENTS", "AutoEnable": "NEW"},
    {"Name": "EKS_AUDIT_LOGS", "AutoEnable": "NEW"},
    {"Name": "LAMBDA_NETWORK_LOGS", "AutoEnable": "NEW"},
    {"Name": "RDS_LOGIN_EVENTS", "AutoEnable": "NEW"},
    {"Name": "RUNTIME_MONITORING", "AutoEnable": "NEW"}
  ]'

# Security Hub: 組織メンバーの自動有効化
aws securityhub update-organization-configuration \
  --auto-enable \
  --auto-enable-standards
```

### 6.3 クロスリージョン集約（Security Hub）

```
【クロスリージョン集約】

                    ┌──────────────────────┐
                    │   Aggregation Region │
                    │   (ap-northeast-1)   │
                    │                      │
                    │  Security Hub        │
                    │  集約リージョン       │
                    └──────────┬───────────┘
                               │
          ┌────────────────────┼────────────────────┐
          │                    │                    │
          ▼                    ▼                    ▼
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│ us-east-1        │ │ eu-west-1        │ │ ap-southeast-1   │
│ Security Hub     │ │ Security Hub     │ │ Security Hub     │
│ (リンクリージョン)│ │ (リンクリージョン)│ │ (リンクリージョン)│
└──────────────────┘ └──────────────────┘ └──────────────────┘
```

```bash
# 集約リージョン（ap-northeast-1）で実行
aws securityhub create-finding-aggregator \
  --region ap-northeast-1 \
  --region-linking-mode ALL_REGIONS

# 特定リージョンのみ集約する場合
aws securityhub create-finding-aggregator \
  --region ap-northeast-1 \
  --region-linking-mode SPECIFIED_REGIONS \
  --regions "us-east-1" "eu-west-1" "ap-southeast-1"
```

### 6.4 ベストプラクティス

```
【マルチアカウントセキュリティ運用のベストプラクティス】

1. アカウント構成
   ├─ Management Account    : 最小限の操作のみ
   ├─ Security/Audit Account: GuardDuty/SecHub委任管理者
   ├─ Log Archive Account   : ログ集約（S3）
   └─ Workload Accounts     : メンバーアカウント

2. 委任管理者
   ├─ GuardDutyとSecurity Hubは同じアカウントに委任推奨
   ├─ Management Accountでの日常運用は避ける
   └─ Audit Account = 委任管理者が推奨パターン

3. 自動有効化
   ├─ 新規アカウント作成時に自動でGuardDuty有効化
   ├─ Security Hub標準も自動適用
   └─ Organizations SCP で無効化を禁止

4. Findings管理
   ├─ 集約リージョンでの一元管理
   ├─ クロスリージョン集約の有効化
   └─ S3への長期保存エクスポート
```

---

## 7. 自動修復パターン

### 7.1 EventBridge + Lambda パターン

```
【GuardDuty自動修復アーキテクチャ】

┌──────────┐     ┌──────────────┐     ┌──────────────┐     ┌────────────┐
│GuardDuty │────▶│ EventBridge  │────▶│   Lambda     │────▶│  修復対象  │
│ Finding  │     │   Rule       │     │  (修復実行)  │     │            │
└──────────┘     └──────────────┘     └──────┬───────┘     │ EC2隔離   │
                                              │            │ SG変更    │
                                              │            │ IAM無効化 │
                                              ▼            └────────────┘
                                       ┌──────────────┐
                                       │     SNS      │
                                       │  (通知)      │
                                       └──────────────┘
```

### 7.2 パターン1: 侵害されたEC2インスタンスの隔離

```
【EC2隔離フロー】

Finding: Backdoor:EC2/C&CActivity.B
                │
                ▼
EventBridge Rule (severity >= 7.0)
                │
                ▼
Lambda Function:
  1. 対象EC2のSGを「隔離用SG」に差し替え
  2. EC2のEIPを解除
  3. スナップショット取得（フォレンジック用）
  4. タグ付け: "quarantine=true"
  5. SNSで通知
```

**EventBridgeルール**:

```json
{
  "source": ["aws.guardduty"],
  "detail-type": ["GuardDuty Finding"],
  "detail": {
    "severity": [
      { "numeric": [">=", 7.0] }
    ],
    "type": [
      { "prefix": "Backdoor:EC2/" },
      { "prefix": "CryptoCurrency:EC2/" },
      { "prefix": "Trojan:EC2/" }
    ]
  }
}
```

**Lambda関数（EC2隔離）**:

```python
import boto3
import json
import os

ec2 = boto3.client('ec2')
sns = boto3.client('sns')

ISOLATION_SG = os.environ['ISOLATION_SG_ID']
SNS_TOPIC_ARN = os.environ['SNS_TOPIC_ARN']

def lambda_handler(event, context):
    detail = event['detail']
    finding_type = detail['type']
    severity = detail['severity']
    instance_id = detail['resource']['instanceDetails']['instanceId']
    account_id = detail['accountId']
    region = event['region']

    print(f"Processing: {finding_type} for {instance_id}")

    # 1. 現在のSGを記録
    instance = ec2.describe_instances(InstanceIds=[instance_id])
    current_sgs = [sg['GroupId'] for sg in
        instance['Reservations'][0]['Instances'][0]['SecurityGroups']]

    # 2. 隔離用SGに差し替え
    ec2.modify_instance_attribute(
        InstanceId=instance_id,
        Groups=[ISOLATION_SG]
    )

    # 3. フォレンジック用スナップショット
    volumes = ec2.describe_volumes(
        Filters=[{'Name': 'attachment.instance-id', 'Values': [instance_id]}]
    )
    for vol in volumes['Volumes']:
        ec2.create_snapshot(
            VolumeId=vol['VolumeId'],
            Description=f"Forensic snapshot - {finding_type} - {instance_id}",
            TagSpecifications=[{
                'ResourceType': 'snapshot',
                'Tags': [
                    {'Key': 'Purpose', 'Value': 'Forensic'},
                    {'Key': 'FindingType', 'Value': finding_type},
                    {'Key': 'InstanceId', 'Value': instance_id}
                ]
            }]
        )

    # 4. インスタンスにタグ付け
    ec2.create_tags(
        Resources=[instance_id],
        Tags=[
            {'Key': 'Quarantine', 'Value': 'true'},
            {'Key': 'OriginalSecurityGroups', 'Value': ','.join(current_sgs)},
            {'Key': 'FindingType', 'Value': finding_type}
        ]
    )

    # 5. SNS通知
    sns.publish(
        TopicArn=SNS_TOPIC_ARN,
        Subject=f"[CRITICAL] GuardDuty - EC2 Instance Isolated",
        Message=json.dumps({
            'finding_type': finding_type,
            'severity': severity,
            'instance_id': instance_id,
            'account_id': account_id,
            'region': region,
            'action': 'Instance isolated with quarantine SG',
            'original_sgs': current_sgs
        }, indent=2)
    )

    return {
        'statusCode': 200,
        'body': f'Instance {instance_id} quarantined successfully'
    }
```

### 7.3 パターン2: 侵害されたIAM認証情報の無効化

```
【IAM認証情報無効化フロー】

Finding: UnauthorizedAccess:IAMUser/ConsoleLoginSuccess.B
                │
                ▼
EventBridge Rule
                │
                ▼
Lambda Function:
  1. IAMユーザーのアクセスキーを無効化
  2. コンソールパスワードを無効化
  3. 既存セッションを無効化（インラインポリシー付与）
  4. SNSで通知
```

**Lambda関数（IAM無効化）**:

```python
import boto3
import json
import os
from datetime import datetime

iam = boto3.client('iam')
sns = boto3.client('sns')

SNS_TOPIC_ARN = os.environ['SNS_TOPIC_ARN']

def lambda_handler(event, context):
    detail = event['detail']
    finding_type = detail['type']

    # IAMユーザー情報の取得
    iam_details = detail['resource']['accessKeyDetails']
    user_name = iam_details.get('userName', '')
    access_key_id = iam_details.get('accessKeyId', '')

    if not user_name or user_name == 'Root':
        # Root アカウントの場合は通知のみ
        notify_root_compromise(detail)
        return

    actions_taken = []

    # 1. アクセスキーの無効化
    try:
        keys = iam.list_access_keys(UserName=user_name)
        for key in keys['AccessKeyMetadata']:
            if key['Status'] == 'Active':
                iam.update_access_key(
                    UserName=user_name,
                    AccessKeyId=key['AccessKeyId'],
                    Status='Inactive'
                )
                actions_taken.append(f"Disabled access key: {key['AccessKeyId']}")
    except Exception as e:
        actions_taken.append(f"Failed to disable access keys: {str(e)}")

    # 2. コンソールパスワードの無効化
    try:
        iam.delete_login_profile(UserName=user_name)
        actions_taken.append("Deleted console login profile")
    except iam.exceptions.NoSuchEntityException:
        actions_taken.append("No console login profile found")

    # 3. 既存セッションの無効化（Deny Allインラインポリシー）
    revoke_policy = {
        "Version": "2012-10-17",
        "Statement": [{
            "Effect": "Deny",
            "Action": "*",
            "Resource": "*",
            "Condition": {
                "DateLessThan": {
                    "aws:TokenIssueTime": datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ')
                }
            }
        }]
    }
    try:
        iam.put_user_policy(
            UserName=user_name,
            PolicyName='RevokeOldSessions',
            PolicyDocument=json.dumps(revoke_policy)
        )
        actions_taken.append("Attached session revocation policy")
    except Exception as e:
        actions_taken.append(f"Failed to revoke sessions: {str(e)}")

    # 4. SNS通知
    sns.publish(
        TopicArn=SNS_TOPIC_ARN,
        Subject=f"[CRITICAL] GuardDuty - IAM Credentials Compromised",
        Message=json.dumps({
            'finding_type': finding_type,
            'user_name': user_name,
            'access_key_id': access_key_id,
            'actions_taken': actions_taken
        }, indent=2)
    )

    return {'statusCode': 200, 'body': 'IAM credentials disabled'}
```

### 7.4 パターン3: Security Hubカスタムアクション連携

```
【Security Hub カスタムアクション + EventBridge】

Security Hub Console
       │
       │ オペレーターがFindingを選択し
       │ カスタムアクションを実行
       │
       ▼
┌──────────────────┐     ┌──────────────────┐
│ Custom Action    │────▶│  EventBridge     │
│ (手動トリガー)   │     │  Rule            │
└──────────────────┘     └────────┬─────────┘
                                  │
                    ┌─────────────┼─────────────┐
                    │             │             │
                    ▼             ▼             ▼
             ┌──────────┐ ┌──────────┐ ┌──────────┐
             │ Lambda   │ │ Step     │ │ SNS      │
             │ (修復)   │ │ Functions│ │ (通知)   │
             └──────────┘ └──────────┘ └──────────┘
```

```bash
# Security Hubカスタムアクションの作成
aws securityhub create-action-target \
  --name "IsolateEC2" \
  --description "Isolate compromised EC2 instance" \
  --id "IsolateEC2Instance"

# カスタムアクションのARN確認
aws securityhub describe-action-targets \
  --action-target-arns "arn:aws:securityhub:ap-northeast-1:123456789012:action/custom/IsolateEC2Instance"
```

**カスタムアクション用EventBridgeルール**:

```json
{
  "source": ["aws.securityhub"],
  "detail-type": ["Security Hub Findings - Custom Action"],
  "detail": {
    "actionName": ["IsolateEC2"]
  }
}
```

### 7.5 パターン4: Security Hub自動化ルール

```bash
# Security Hub自動化ルールの作成
# 低重要度のFindingを自動的にSUPPRESSEDに設定
aws securityhub create-automation-rule \
  --rule-name "SuppressLowSeverityFindings" \
  --rule-order 1 \
  --description "Automatically suppress low severity findings from dev accounts" \
  --criteria '{
    "SeverityLabel": [{"Value": "LOW", "Comparison": "EQUALS"}],
    "AwsAccountId": [{"Value": "111111111111", "Comparison": "EQUALS"}]
  }' \
  --actions '[
    {
      "Type": "FINDING_FIELDS_UPDATE",
      "FindingFieldsUpdate": {
        "Workflow": {"Status": "SUPPRESSED"},
        "Note": {
          "Text": "Auto-suppressed: Low severity in dev account",
          "UpdatedBy": "automation-rule"
        }
      }
    }
  ]'
```

### 7.6 自動修復パターン比較

| パターン | トリガー | ユースケース | 承認 |
|---------|---------|-------------|------|
| **GuardDuty → EventBridge → Lambda** | 自動 | 高重要度の即時対応 | 不要 |
| **Security Hub カスタムアクション** | 手動 | オペレーター判断が必要 | 手動承認 |
| **Security Hub 自動化ルール** | 自動 | Finding状態の自動更新 | 不要 |
| **GuardDuty → EventBridge → Step Functions** | 自動 | 承認フロー付き修復 | 自動＋手動 |
| **Config → SSM Automation** | 自動 | コンプライアンス自動修復 | 設定による |

---

## 8. Amazon Inspector概要

### 8.1 Inspectorとは

```
┌─────────────────────────────────────────────────────────────────────┐
│                       Amazon Inspector v2                            │
│              自動的・継続的な脆弱性スキャンサービス                   │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │                  スキャン対象                                  │ │
│  │                                                                │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │ │
│  │  │   EC2        │  │   ECR        │  │   Lambda     │        │ │
│  │  │ Instances    │  │   Images     │  │  Functions   │        │ │
│  │  │              │  │              │  │              │        │ │
│  │  │ OS脆弱性     │  │ コンテナ     │  │ コード       │        │ │
│  │  │ パッケージ   │  │ イメージ     │  │ 依存関係     │        │ │
│  │  │ ネットワーク │  │ 脆弱性       │  │ 脆弱性       │        │ │
│  │  └──────────────┘  └──────────────┘  └──────────────┘        │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                              │                                      │
│              CVE脆弱性データベース + NVD照合                        │
│                              │                                      │
│                              ▼                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │                  Finding出力先                                 │ │
│  │                                                                │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │ │
│  │  │  コンソール  │  │  Security    │  │  EventBridge │        │ │
│  │  │  表示        │  │    Hub       │  │  連携        │        │ │
│  │  └──────────────┘  └──────────────┘  └──────────────┘        │ │
│  └────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

### 8.2 Inspector v1 vs v2 の違い

| 項目 | Inspector Classic (v1) | Inspector v2 |
|------|----------------------|--------------|
| **スキャン方法** | エージェント必須 | SSM Agent（EC2）、自動（ECR/Lambda） |
| **スキャンタイミング** | 手動/スケジュール | 継続的・自動 |
| **対象** | EC2のみ | EC2, ECR, Lambda |
| **評価テンプレート** | 必要 | 不要 |
| **Organizations統合** | なし | 委任管理者対応 |
| **Security Hub統合** | 限定的 | 完全統合 |

> **DOP試験注意**: Inspector v2（現行版）が出題対象。v1はレガシー。

### 8.3 Inspector v2のスキャンタイプ

```
【Inspector v2 スキャンタイプ】

┌─────────────────────────────────────────────────────────────┐
│ EC2スキャン                                                  │
│ ├─ OS脆弱性スキャン: SSM Agent経由                          │
│ │   └─ パッケージマネージャの脆弱性                        │
│ ├─ ネットワーク到達可能性: エージェント不要                 │
│ │   └─ 開いているポート、パス分析                          │
│ └─ トリガー: 新CVE公開、パッケージ変更、ネットワーク変更  │
├─────────────────────────────────────────────────────────────┤
│ ECRスキャン                                                  │
│ ├─ プッシュ時スキャン: イメージpush時に自動                │
│ ├─ 継続的スキャン: 新CVE公開時に再スキャン                 │
│ └─ 対象: OS パッケージ + プログラミング言語パッケージ      │
├─────────────────────────────────────────────────────────────┤
│ Lambdaスキャン                                               │
│ ├─ コードスキャン: 関数コードの脆弱性                       │
│ ├─ 標準スキャン: 依存パッケージの脆弱性                    │
│ └─ トリガー: デプロイ時 + 新CVE公開時                      │
└─────────────────────────────────────────────────────────────┘
```

### 8.4 Inspector CLIコマンド

```bash
# Inspector有効化
aws inspector2 enable \
  --resource-types EC2 ECR LAMBDA

# スキャン状態確認
aws inspector2 batch-get-account-status

# Findingsの取得
aws inspector2 list-findings \
  --filter-criteria '{
    "severity": [{"comparison": "EQUALS", "value": "CRITICAL"}]
  }' \
  --sort-criteria '{"field": "SEVERITY", "sortOrder": "DESC"}'

# ECRリポジトリのスキャン設定確認
aws inspector2 list-coverage \
  --filter-criteria '{
    "resourceType": [{"comparison": "EQUALS", "value": "AWS_ECR_CONTAINER_IMAGE"}]
  }'

# 委任管理者の設定（Organizations）
aws inspector2 enable-delegated-admin-account \
  --delegated-admin-account-id 222222222222

# メンバーアカウントの自動有効化
aws inspector2 update-organization-configuration \
  --auto-enable '{
    "ec2": true,
    "ecr": true,
    "lambda": true,
    "lambdaCode": true
  }'
```

### 8.5 セキュリティサービスの比較

```
【AWS セキュリティサービス 役割比較】

┌──────────────┬────────────────────────────────────────────┐
│ サービス     │ 役割                                       │
├──────────────┼────────────────────────────────────────────┤
│ GuardDuty    │ 脅威検出（アクティブな攻撃・侵害の検知）  │
│              │ → "今起きている攻撃"                       │
├──────────────┼────────────────────────────────────────────┤
│ Inspector    │ 脆弱性管理（CVE、設定不備の検出）          │
│              │ → "攻撃される可能性のある弱点"             │
├──────────────┼────────────────────────────────────────────┤
│ Macie        │ 機密データ検出（PII、クレジットカード番号）│
│              │ → "保護すべきデータの発見"                 │
├──────────────┼────────────────────────────────────────────┤
│ Security Hub │ 統合管理（全Findingの集約・優先順位付け）  │
│              │ → "セキュリティ状況の一元管理"             │
├──────────────┼────────────────────────────────────────────┤
│ Config       │ コンプライアンス（設定のあるべき姿の評価） │
│              │ → "ルール通りに設定されているか"           │
├──────────────┼────────────────────────────────────────────┤
│ Detective    │ セキュリティ調査（根本原因分析）           │
│              │ → "何が起きたかの詳細分析"                 │
├──────────────┼────────────────────────────────────────────┤
│ CloudTrail   │ 監査証跡（APIアクティビティの記録）        │
│              │ → "誰が何をしたかの記録"                   │
└──────────────┴────────────────────────────────────────────┘
```

---

## 9. ハンズオン演習

### 9.1 前提条件

```bash
# アカウントID取得
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGION="ap-northeast-1"

echo "Account ID: ${ACCOUNT_ID}"
echo "Region: ${REGION}"
```

### 9.2 演習1: GuardDutyの有効化と設定

```bash
# GuardDuty有効化
aws guardduty create-detector \
  --enable \
  --finding-publishing-frequency FIFTEEN_MINUTES \
  --features '[
    {"Name": "S3_DATA_EVENTS", "Status": "ENABLED"},
    {"Name": "EKS_AUDIT_LOGS", "Status": "ENABLED"},
    {"Name": "LAMBDA_NETWORK_LOGS", "Status": "ENABLED"},
    {"Name": "RDS_LOGIN_EVENTS", "Status": "ENABLED"}
  ]'

# Detector ID取得
DETECTOR_ID=$(aws guardduty list-detectors --query "DetectorIds[0]" --output text)
echo "Detector ID: ${DETECTOR_ID}"

# Detector情報確認
aws guardduty get-detector --detector-id ${DETECTOR_ID}

# 保護プランの確認
aws guardduty get-detector \
  --detector-id ${DETECTOR_ID} \
  --query "Features"
```

**実行結果**:
```json
{
    "DetectorId": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "CreatedAt": "2026-02-04T10:00:00.000Z",
    "FindingPublishingFrequency": "FIFTEEN_MINUTES",
    "Status": "ENABLED",
    "Features": [
        {"Name": "CLOUD_TRAIL", "Status": "ENABLED"},
        {"Name": "DNS_LOGS", "Status": "ENABLED"},
        {"Name": "FLOW_LOGS", "Status": "ENABLED"},
        {"Name": "S3_DATA_EVENTS", "Status": "ENABLED"},
        {"Name": "EKS_AUDIT_LOGS", "Status": "ENABLED"}
    ]
}
```

### 9.3 演習2: サンプルFindingの生成と確認

```bash
# サンプルFinding生成
aws guardduty create-sample-findings \
  --detector-id ${DETECTOR_ID} \
  --finding-types \
    "Backdoor:EC2/C&CActivity.B" \
    "CryptoCurrency:EC2/BitcoinTool.B!DNS" \
    "UnauthorizedAccess:IAMUser/ConsoleLoginSuccess.B" \
    "Exfiltration:S3/AnomalousBehavior" \
    "Recon:EC2/PortProbeUnprotectedPort"

# Finding一覧取得（高重要度のみ）
aws guardduty list-findings \
  --detector-id ${DETECTOR_ID} \
  --finding-criteria '{
    "Criterion": {
      "severity": {
        "Gte": 7
      }
    }
  }' \
  --sort-criteria '{"AttributeName": "severity", "OrderBy": "DESC"}'

# Finding詳細取得
FINDING_IDS=$(aws guardduty list-findings \
  --detector-id ${DETECTOR_ID} \
  --max-results 5 \
  --query "FindingIds" --output json)

aws guardduty get-findings \
  --detector-id ${DETECTOR_ID} \
  --finding-ids ${FINDING_IDS} \
  --query "Findings[].{Type:Type,Severity:Severity,Title:Title,Description:Description}" \
  --output table
```

### 9.4 演習3: 信頼済みIPリストの設定

```bash
# 信頼済みIPリスト用S3バケット作成
TRUSTED_IP_BUCKET="guardduty-iplist-${ACCOUNT_ID}"
aws s3 mb s3://${TRUSTED_IP_BUCKET} --region ${REGION}

# 信頼済みIPリストファイル作成・アップロード
cat << 'EOF' > /tmp/trusted-ips.txt
203.0.113.0/24
198.51.100.0/24
EOF

aws s3 cp /tmp/trusted-ips.txt s3://${TRUSTED_IP_BUCKET}/trusted-ips.txt

# GuardDutyに信頼済みIPリスト登録
aws guardduty create-ip-set \
  --detector-id ${DETECTOR_ID} \
  --name "TrustedOfficeIPs" \
  --format TXT \
  --location "s3://${TRUSTED_IP_BUCKET}/trusted-ips.txt" \
  --activate

# IPリスト確認
aws guardduty list-ip-sets --detector-id ${DETECTOR_ID}
```

### 9.5 演習4: Security Hubの有効化と設定

```bash
# Security Hub有効化
aws securityhub enable-security-hub \
  --enable-default-standards

# 有効な標準の確認
aws securityhub get-enabled-standards

# 全標準の確認
aws securityhub describe-standards

# 特定の標準のコントロール確認（FSBP）
FSBP_ARN=$(aws securityhub get-enabled-standards \
  --query "StandardsSubscriptions[?contains(StandardsArn,'aws-foundational')].StandardsSubscriptionArn" \
  --output text)

aws securityhub describe-standards-controls \
  --standards-subscription-arn "${FSBP_ARN}" \
  --query "Controls[?ControlStatus=='ENABLED'].{Id:ControlId,Title:Title,Status:ControlStatus,Severity:SeverityRating}" \
  --output table
```

### 9.6 演習5: Security Hub Findingの操作

```bash
# Findingsの検索（高重要度）
aws securityhub get-findings \
  --filters '{
    "SeverityLabel": [{"Value": "HIGH", "Comparison": "EQUALS"}],
    "RecordState": [{"Value": "ACTIVE", "Comparison": "EQUALS"}],
    "WorkflowStatus": [{"Value": "NEW", "Comparison": "EQUALS"}]
  }' \
  --sort-criteria '[{"Field": "SeverityNormalized", "SortOrder": "desc"}]' \
  --max-results 10

# プロバイダー別のFinding数確認
aws securityhub get-findings \
  --filters '{
    "RecordState": [{"Value": "ACTIVE", "Comparison": "EQUALS"}]
  }' \
  --query "Findings[].ProductArn" | sort | uniq -c | sort -rn

# Findingのワークフローステータス更新
aws securityhub batch-update-findings \
  --finding-identifiers '[{
    "Id": "arn:aws:securityhub:ap-northeast-1:123456789012:finding/xxx",
    "ProductArn": "arn:aws:securityhub:ap-northeast-1::product/aws/guardduty"
  }]' \
  --workflow '{"Status": "NOTIFIED"}' \
  --note '{"Text": "Investigating - assigned to security team", "UpdatedBy": "admin"}'
```

### 9.7 演習6: EventBridge自動修復ルールの作成

```bash
# SNSトピック作成（通知用）
aws sns create-topic --name guardduty-alerts
SNS_ARN="arn:aws:sns:${REGION}:${ACCOUNT_ID}:guardduty-alerts"

# メール通知の設定
aws sns subscribe \
  --topic-arn ${SNS_ARN} \
  --protocol email \
  --notification-endpoint "security-team@example.com"

# EventBridgeルールの作成（高重要度GuardDuty Finding）
aws events put-rule \
  --name "guardduty-high-severity-findings" \
  --description "Trigger on GuardDuty findings with severity >= 7.0" \
  --event-pattern '{
    "source": ["aws.guardduty"],
    "detail-type": ["GuardDuty Finding"],
    "detail": {
      "severity": [{"numeric": [">=", 7.0]}]
    }
  }'

# SNSターゲットの追加（通知）
aws events put-targets \
  --rule "guardduty-high-severity-findings" \
  --targets '[{
    "Id": "sns-notification",
    "Arn": "'${SNS_ARN}'",
    "InputTransformer": {
      "InputPathsMap": {
        "severity": "$.detail.severity",
        "type": "$.detail.type",
        "account": "$.detail.accountId",
        "region": "$.region",
        "description": "$.detail.description"
      },
      "InputTemplate": "\"[GuardDuty Alert] Severity: <severity>\\nType: <type>\\nAccount: <account>\\nRegion: <region>\\nDescription: <description>\""
    }
  }]'

# ルール確認
aws events describe-rule --name "guardduty-high-severity-findings"
```

### 9.8 演習7: Security Hubカスタムアクションの作成

```bash
# カスタムアクション作成
aws securityhub create-action-target \
  --name "SendToJira" \
  --description "Send finding to JIRA for ticket creation" \
  --id "SendToJira"

# カスタムアクション一覧確認
aws securityhub describe-action-targets

# カスタムアクション用EventBridgeルール作成
ACTION_ARN="arn:aws:securityhub:${REGION}:${ACCOUNT_ID}:action/custom/SendToJira"

aws events put-rule \
  --name "securityhub-custom-action-jira" \
  --description "Trigger on Security Hub custom action - Send to JIRA" \
  --event-pattern '{
    "source": ["aws.securityhub"],
    "detail-type": ["Security Hub Findings - Custom Action"],
    "resources": ["'${ACTION_ARN}'"]
  }'
```

### 9.9 演習8: セキュリティスコアの確認

```bash
# 全体のセキュリティスコア
aws securityhub get-security-control-definitions \
  --max-results 100 \
  --query "SecurityControlDefinitions[].{Id:SecurityControlId,Title:Title,Severity:SeverityRating}"

# 標準別のコンプライアンスサマリー
aws securityhub get-enabled-standards \
  --query "StandardsSubscriptions[].{ARN:StandardsArn,Status:StandardsStatus}"

# FAILEDコントロールの確認
aws securityhub describe-standards-controls \
  --standards-subscription-arn "${FSBP_ARN}" \
  --query "Controls[?ControlStatus=='ENABLED' && ComplianceStatus=='FAILED'].{Id:ControlId,Title:Title,Severity:SeverityRating}" \
  --output table
```

### 9.10 クリーンアップ

```bash
# GuardDutyサンプルFindingsのアーカイブ
SAMPLE_FINDINGS=$(aws guardduty list-findings \
  --detector-id ${DETECTOR_ID} \
  --finding-criteria '{
    "Criterion": {
      "service.additionalInfo.sample": {"Eq": ["true"]}
    }
  }' \
  --query "FindingIds" --output json)

aws guardduty archive-findings \
  --detector-id ${DETECTOR_ID} \
  --finding-ids ${SAMPLE_FINDINGS}

# IPリスト削除
IP_SET_ID=$(aws guardduty list-ip-sets \
  --detector-id ${DETECTOR_ID} \
  --query "IpSetIds[0]" --output text)

aws guardduty delete-ip-set \
  --detector-id ${DETECTOR_ID} \
  --ip-set-id ${IP_SET_ID}

# S3バケット削除
aws s3 rb s3://${TRUSTED_IP_BUCKET} --force

# EventBridgeルール削除
aws events remove-targets \
  --rule "guardduty-high-severity-findings" \
  --ids "sns-notification"
aws events delete-rule --name "guardduty-high-severity-findings"

# SNSトピック削除
aws sns delete-topic --topic-arn ${SNS_ARN}

# Security Hubカスタムアクション削除
aws securityhub delete-action-target \
  --action-target-arn "${ACTION_ARN}"

# === 注意: GuardDuty/Security Hub自体の無効化は慎重に ===
# GuardDuty無効化（全Findingが削除される）
# aws guardduty delete-detector --detector-id ${DETECTOR_ID}

# Security Hub無効化（全Finding/標準設定が削除される）
# aws securityhub disable-security-hub
```

---

## 10. DOP試験対策チェックリスト

### GuardDuty基本理解

- [ ] GuardDutyのデータソース（VPC Flow Logs, DNS Logs, CloudTrail）を説明できる
- [ ] GuardDutyが独自にデータを収集する仕組みを理解している
- [ ] Finding Typeの命名規則を理解している
- [ ] 重要度レベル（Low/Medium/High/Critical）の判断基準を知っている

<details>
<summary>模範解答を見る</summary>

**データソース**:
- **VPC Flow Logs**: ネットワークトラフィック分析（ポートスキャン、C&C通信検出）
- **DNS Logs**: DNSクエリ分析（マルウェアドメイン通信検出）
- **CloudTrail管理イベント**: API呼出し分析（不正操作検出）
- **追加データソース**: S3データイベント、EKS監査ログ、Lambda Network Activity、RDSログイン

**重要**: GuardDutyはこれらのデータソースを**独自に取得**する。ユーザーがVPC Flow LogsやCloudTrailを個別に有効化する必要はない。GuardDutyの料金にデータ取得コストが含まれている。

**Finding Type命名規則**:
```
{ThreatPurpose}:{ResourceType}/{ThreatFamilyName}.{Mechanism}!{Artifact}
例: Backdoor:EC2/C&CActivity.B!DNS
```

**重要度レベル**:
| レベル | 数値 | 対応 |
|--------|------|------|
| Critical | 9.0-10.0 | 即時対応（自動修復推奨） |
| High | 7.0-8.9 | 24時間以内の対応 |
| Medium | 4.0-6.9 | 調査・計画的対応 |
| Low | 1.0-3.9 | 情報収集・トレンド監視 |
</details>

### GuardDuty運用管理

- [ ] 信頼済みIPリストと脅威インテリジェンスリストの違いを説明できる
- [ ] 抑制ルール（Suppression Rules）の用途と設定方法を知っている
- [ ] Findingのエクスポート設定（S3、EventBridge）を理解している
- [ ] 保護プラン（S3, EKS, Lambda, RDS, Runtime Monitoring）を把握している

<details>
<summary>模範解答を見る</summary>

**IPリスト管理**:
| リスト種類 | 説明 | 制限 |
|-----------|------|------|
| Trusted IP List | このIPからの通信はFinding生成しない | 1アカウント1リスト |
| Threat Intel Set | 既知の悪意あるIP。マッチ時Finding生成 | 1アカウント最大6リスト |

**抑制ルール**:
- フィルタ条件に合致するFindingを自動的にアーカイブ
- 用途: 既知の誤検知抑制、テスト環境の低重要度Finding除外
- Findingは生成されるが、ステータスがARCHIVEDになる
- `action: ARCHIVE`でフィルタを作成

**エクスポート設定**:
- S3: KMS暗号化必須。長期保存・フォレンジック用
- EventBridge: リアルタイム連携。自動修復・通知トリガー
- コンソール保持: 90日間（90日以降はS3エクスポートが必要）

**保護プラン**: 各プランは個別に有効化/無効化可能。30日間の無料トライアルがプランごとに提供される。
</details>

### Security Hub基本理解

- [ ] ASFF（AWS Security Finding Format）の構造を理解している
- [ ] Security Hubの統合プロバイダー（GuardDuty, Inspector, Macie等）を把握している
- [ ] ワークフローステータス（NEW/NOTIFIED/RESOLVED/SUPPRESSED）を説明できる
- [ ] カスタムアクションとEventBridge連携を理解している

<details>
<summary>模範解答を見る</summary>

**ASFF主要フィールド**:
```
SchemaVersion  : フォーマットバージョン
Id             : Finding一意識別子
ProductArn     : 検出元サービスARN
Severity       : 重要度（Label + Normalized）
Types          : Finding分類
Resources      : 影響リソース
Compliance     : コンプライアンスステータス
Workflow        : ワークフローステータス
Remediation    : 修復推奨事項
```

**統合プロバイダー**: GuardDuty（脅威）、Inspector（脆弱性）、Macie（機密データ）、Config（コンプライアンス）、IAM Access Analyzer（アクセス）、Firewall Manager（ファイアウォール）、Systems Manager Patch Manager（パッチ）、Health（サービスヘルス）

**カスタムアクション**:
1. Security Hubでカスタムアクションを作成
2. EventBridgeルールでカスタムアクションARNをマッチ
3. オペレーターがFinding選択 → カスタムアクション実行
4. EventBridge → Lambda/SNS/Step Functions等で対応
</details>

### Security Hub標準

- [ ] AWS Foundational Security Best Practices (FSBP)の概要を説明できる
- [ ] CIS AWS Foundations Benchmarkの主要項目を把握している
- [ ] PCI DSSの適用条件を理解している
- [ ] セキュリティスコアの算出方法を知っている

<details>
<summary>模範解答を見る</summary>

**FSBP**: AWSが定義するセキュリティベストプラクティス。200以上のコントロールで、IAM、S3、EC2、RDS、Lambda等の主要サービスをカバー。全AWSユーザーに推奨される最も包括的な標準。

**CIS Benchmark主要項目**:
- IAM: ルートMFA、アクセスキーローテーション、パスワードポリシー
- Logging: CloudTrail全リージョン有効化、ログ整合性検証
- Monitoring: 不正API呼出しアラーム、ルート使用アラーム
- Networking: SSH/RDPのフルオープン禁止

**PCI DSS**: クレジットカード決済データを扱う環境で必須。該当しない環境では有効化不要。

**セキュリティスコア**:
```
スコア = (PASSEDコントロール数) / (全有効コントロール数) × 100%
除外: DISABLED、NOT_AVAILABLE のコントロール
```
</details>

### マルチアカウント運用

- [ ] GuardDutyのOrganizations統合と委任管理者を設定できる
- [ ] Security HubのOrganizations統合と委任管理者を設定できる
- [ ] クロスリージョン集約（Finding Aggregator）を理解している
- [ ] 新規アカウント作成時の自動有効化設定を知っている

<details>
<summary>模範解答を見る</summary>

**委任管理者パターン（推奨）**:
```
Management Account → 委任設定のみ
Audit/Security Account → GuardDuty + Security Hub委任管理者
Workload Accounts → メンバーアカウント（自動有効化）
```

**設定手順**:
1. Management AccountでOrganizationsサービス信頼アクセス有効化
2. 委任管理者アカウントを指定
3. 委任管理者アカウントで自動有効化設定
4. 新規アカウント作成時に自動でGuardDuty/Security Hub有効化

**クロスリージョン集約**:
- Security Hubの機能（GuardDuty単体にはない）
- 集約リージョンを1つ指定し、他リージョンのFindingを集約
- `create-finding-aggregator`で設定
- ALL_REGIONS または SPECIFIED_REGIONS を選択

**SCP（サービスコントロールポリシー）で無効化防止**:
```json
{
  "Effect": "Deny",
  "Action": [
    "guardduty:DeleteDetector",
    "guardduty:DisassociateFromMasterAccount",
    "securityhub:DisableSecurityHub"
  ],
  "Resource": "*"
}
```
</details>

### 自動修復パターン

- [ ] GuardDuty → EventBridge → Lambdaの自動修復パターンを実装できる
- [ ] 侵害EC2の隔離手順を説明できる
- [ ] 侵害IAM認証情報の無効化手順を説明できる
- [ ] Security Hubカスタムアクション + EventBridge連携を設計できる
- [ ] Security Hub自動化ルールの用途と設定を理解している

<details>
<summary>模範解答を見る</summary>

**EC2隔離パターン**:
1. GuardDuty: Backdoor:EC2/C&CActivity.B 検出
2. EventBridge: severity >= 7.0 でルール発火
3. Lambda:
   - セキュリティグループを隔離用SGに差し替え
   - EIPを解除（外部通信遮断）
   - フォレンジック用EBSスナップショット取得
   - タグ付け（quarantine=true, 元SG情報保存）
4. SNS: セキュリティチームに通知

**IAM認証情報無効化パターン**:
1. GuardDuty: UnauthorizedAccess:IAMUser 検出
2. EventBridge: ルール発火
3. Lambda:
   - アクセスキーの無効化（全キー）
   - コンソールパスワード削除
   - Deny Allインラインポリシーで既存セッション無効化
4. SNS: 管理者に通知

**Security Hubカスタムアクション**:
- 用途: 手動トリガーの修復アクション（承認が必要なケース）
- EventBridgeイベントソース: `aws.securityhub`
- detail-type: `Security Hub Findings - Custom Action`

**自動化ルール**:
- Finding属性に基づく自動的なワークフロー更新
- 用途例: Dev環境の低重要度Findingを自動SUPPRESS
- `create-automation-rule`で作成
</details>

### Inspector

- [ ] Inspector v2のスキャン対象（EC2, ECR, Lambda）を把握している
- [ ] Inspector v1とv2の違いを説明できる
- [ ] 継続的スキャンの仕組みを理解している
- [ ] Security Hubとの統合を理解している

<details>
<summary>模範解答を見る</summary>

**Inspector v2スキャン対象**:
| 対象 | スキャン内容 | 前提条件 |
|------|-------------|---------|
| EC2 | OS脆弱性 + ネットワーク到達可能性 | SSM Agent稼働 |
| ECR | コンテナイメージの脆弱性 | ECRリポジトリ |
| Lambda | コード依存関係の脆弱性 | Lambda関数 |

**v1 vs v2**:
- v1: エージェント必須、EC2のみ、手動スケジュール、評価テンプレート必要
- v2: SSM Agent利用、EC2+ECR+Lambda、継続的自動スキャン、テンプレート不要

**継続的スキャン**:
- 新しいCVEが公開された時点で自動的に再スキャン
- EC2: パッケージ変更時に再スキャン
- ECR: プッシュ時スキャン + 継続的再スキャン
- Lambda: デプロイ時 + 新CVE時

**Security Hub統合**: Inspector FindingはASFF形式で自動的にSecurity Hubに送信。集約ダッシュボードで一元管理可能。
</details>

### 実践シナリオ

- [ ] 企業のセキュリティ監視アーキテクチャを設計できる
- [ ] インシデントレスポンスの自動化フローを構築できる
- [ ] GuardDuty/Security Hub/Inspector/Config の使い分けを判断できる

<details>
<summary>模範解答を見る</summary>

**企業セキュリティ監視アーキテクチャ**:
```
┌─────────────────────────────────────────────────┐
│            Security/Audit Account                │
│                                                  │
│  Security Hub (委任管理者)                       │
│  ├─ GuardDuty Findings (脅威)                   │
│  ├─ Inspector Findings (脆弱性)                  │
│  ├─ Macie Findings (機密データ)                  │
│  ├─ Config Rules (コンプライアンス)              │
│  └─ IAM Access Analyzer (アクセス)              │
│                                                  │
│  EventBridge                                     │
│  ├─ Critical/High → Lambda (自動修復)           │
│  ├─ Medium → SNS → Slack/PagerDuty             │
│  └─ Low → SQS → バッチ処理                     │
│                                                  │
│  S3 (長期保存)                                   │
│  ├─ GuardDuty Findings                          │
│  └─ CloudTrail Logs                              │
│                                                  │
│  Detective (調査)                                │
│  └─ インシデント発生時の根本原因分析             │
└─────────────────────────────────────────────────┘
```

**サービス使い分け**:
| シナリオ | 最適サービス |
|---------|-------------|
| EC2にマルウェア通信が検出された | GuardDuty |
| EC2にパッチ未適用のCVEがある | Inspector |
| S3にクレジットカード番号が保存されている | Macie |
| SGでSSHがフルオープンになっている | Config |
| 上記を一元的に管理したい | Security Hub |
| 検出された脅威の根本原因を調査したい | Detective |

**インシデントレスポンス自動化**:
1. **検出**: GuardDuty（リアルタイム）
2. **集約**: Security Hub（一元管理）
3. **通知**: EventBridge → SNS（即時通知）
4. **封じ込め**: Lambda（自動隔離）
5. **調査**: Detective（根本原因分析）
6. **修復**: Step Functions（承認付きワークフロー）
7. **事後分析**: CloudTrail + S3（監査証跡）
</details>

---

## 付録A: よく使うCLIコマンド

```bash
# === GuardDuty ===

# Detector管理
aws guardduty list-detectors
aws guardduty get-detector --detector-id DETECTOR_ID
aws guardduty create-detector --enable
aws guardduty update-detector --detector-id DETECTOR_ID --finding-publishing-frequency FIFTEEN_MINUTES

# Finding操作
aws guardduty list-findings --detector-id DETECTOR_ID --finding-criteria '{...}'
aws guardduty get-findings --detector-id DETECTOR_ID --finding-ids '[...]'
aws guardduty archive-findings --detector-id DETECTOR_ID --finding-ids '[...]'
aws guardduty create-sample-findings --detector-id DETECTOR_ID --finding-types '[...]'

# IPリスト管理
aws guardduty create-ip-set --detector-id DETECTOR_ID --name NAME --format TXT --location S3_URI --activate
aws guardduty list-ip-sets --detector-id DETECTOR_ID
aws guardduty delete-ip-set --detector-id DETECTOR_ID --ip-set-id IPSET_ID

# 抑制ルール
aws guardduty create-filter --detector-id DETECTOR_ID --name NAME --action ARCHIVE --finding-criteria '{...}'

# Organizations
aws guardduty enable-organization-admin-account --admin-account-id ACCOUNT_ID
aws guardduty update-organization-configuration --detector-id DETECTOR_ID --auto-enable

# === Security Hub ===

# 有効化・管理
aws securityhub enable-security-hub --enable-default-standards
aws securityhub disable-security-hub
aws securityhub get-enabled-standards
aws securityhub describe-standards
aws securityhub describe-standards-controls --standards-subscription-arn ARN

# Finding操作
aws securityhub get-findings --filters '{...}' --sort-criteria '[...]'
aws securityhub batch-update-findings --finding-identifiers '[...]' --workflow '{...}'
aws securityhub batch-import-findings --findings '[...]'

# カスタムアクション
aws securityhub create-action-target --name NAME --description DESC --id ID
aws securityhub describe-action-targets
aws securityhub delete-action-target --action-target-arn ARN

# 自動化ルール
aws securityhub create-automation-rule --rule-name NAME --rule-order N --criteria '{...}' --actions '[...]'
aws securityhub list-automation-rules

# クロスリージョン集約
aws securityhub create-finding-aggregator --region REGION --region-linking-mode ALL_REGIONS
aws securityhub get-finding-aggregator --finding-aggregator-arn ARN

# Organizations
aws securityhub enable-organization-admin-account --admin-account-id ACCOUNT_ID
aws securityhub update-organization-configuration --auto-enable

# === Inspector ===

# 有効化・管理
aws inspector2 enable --resource-types EC2 ECR LAMBDA
aws inspector2 batch-get-account-status
aws inspector2 list-findings --filter-criteria '{...}'
aws inspector2 list-coverage --filter-criteria '{...}'

# Organizations
aws inspector2 enable-delegated-admin-account --delegated-admin-account-id ACCOUNT_ID
aws inspector2 update-organization-configuration --auto-enable '{...}'
```

---

## 付録B: 参考リンク

- [Amazon GuardDuty ユーザーガイド](https://docs.aws.amazon.com/guardduty/latest/ug/)
- [GuardDuty Finding Types](https://docs.aws.amazon.com/guardduty/latest/ug/guardduty_finding-types-active.html)
- [AWS Security Hub ユーザーガイド](https://docs.aws.amazon.com/securityhub/latest/userguide/)
- [ASFF (AWS Security Finding Format)](https://docs.aws.amazon.com/securityhub/latest/userguide/securityhub-findings-format.html)
- [AWS Foundational Security Best Practices](https://docs.aws.amazon.com/securityhub/latest/userguide/fsbp-standard.html)
- [CIS AWS Foundations Benchmark](https://docs.aws.amazon.com/securityhub/latest/userguide/cis-aws-foundations-benchmark.html)
- [Amazon Inspector ユーザーガイド](https://docs.aws.amazon.com/inspector/latest/user/)
- [GuardDuty Findings を EventBridge で自動対応](https://docs.aws.amazon.com/guardduty/latest/ug/guardduty_findings_cloudwatch.html)

---

**作成日**: 2026-02-04
**最終更新**: 2026-02-04
**検証環境**: AWS ap-northeast-1 リージョン
