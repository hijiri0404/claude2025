# AWS S3運用管理 & RDS/Aurora DR ハンズオンガイド

> **対象**: AWS DevOps Professional (DOP-C02) 試験対策
> **前提知識**: AWS基礎、S3基礎、RDS基礎、VPC
> **所要時間**: 約3時間

---

## 目次

### Part 1 - S3 運用管理
1. [S3バージョニング](#1-s3バージョニング)
2. [S3レプリケーション](#2-s3レプリケーション)
3. [S3ライフサイクル](#3-s3ライフサイクル)
4. [S3暗号化とアクセス制御](#4-s3暗号化とアクセス制御)
5. [S3イベント通知](#5-s3イベント通知)

### Part 2 - RDS/Aurora DR
6. [RDS Multi-AZ](#6-rds-multi-az)
7. [RDSリードレプリカとクロスリージョン](#7-rdsリードレプリカとクロスリージョン)
8. [Aurora Global Database](#8-aurora-global-database)
9. [バックアップとリストア](#9-バックアップとリストア)

### 共通
10. [ハンズオン演習](#10-ハンズオン演習)
11. [DOP試験対策チェックリスト](#11-dop試験対策チェックリスト)

---

# Part 1 - S3 運用管理

---

## 1. S3バージョニング

### 1.1 バージョニングの動作

```
【S3バージョニングの状態遷移】

バケット作成時
    │
    ▼
┌──────────────┐     EnableVersioning     ┌──────────────┐
│ 未有効化     │ ──────────────────────▶ │ 有効         │
│ (Unversioned)│                          │ (Enabled)    │
└──────────────┘                          └──────┬───────┘
                                                  │
                                      SuspendVersioning
                                                  │
                                                  ▼
                                          ┌──────────────┐
                                          │ 一時停止     │
                                          │ (Suspended)  │
                                          │              │
                                          │ 既存バージョン│
                                          │ は保持される │
                                          └──────────────┘

※ 一度有効にすると「未有効化」には戻せない
※ Suspendedでは新規オブジェクトのVersionIdが"null"になる
```

### 1.2 バージョニングとMFA Delete

```
【MFA Delete】

有効化条件:
- バージョニング有効のバケットのみ
- rootアカウントのみ設定可能（IAMユーザー不可）
- AWS CLIからのみ設定可能（コンソール不可）

保護対象:
- バージョニングの状態変更（Suspend）
- オブジェクトバージョンの永久削除

※ 通常の削除（Delete Marker追加）にはMFA不要
```

### 1.3 DOP試験での重要ポイント

| トピック | 重要度 | 出題パターン |
|---------|--------|-------------|
| **バージョニング + レプリケーション** | ★★★★★ | レプリケーションにはバージョニングが必須 |
| **MFA Delete** | ★★★★☆ | 誤削除防止、rootのみ設定可能 |
| **Delete Marker** | ★★★★☆ | 論理削除と物理削除の違い |
| **バージョニングコスト** | ★★★☆☆ | 全バージョン分のストレージコスト |

---

## 2. S3レプリケーション

### 2.1 レプリケーションの種類

```
┌─────────────────────────────────────────────────────────────────────┐
│                   S3 レプリケーション                                │
│                                                                     │
│  ┌──────────────────────────────┐  ┌──────────────────────────────┐│
│  │ CRR (Cross-Region)           │  │ SRR (Same-Region)            ││
│  │ クロスリージョンレプリケーション│  │ 同一リージョンレプリケーション ││
│  │                              │  │                              ││
│  │ 用途:                        │  │ 用途:                        ││
│  │ ・DR対策                     │  │ ・ログ集約                   ││
│  │ ・コンプライアンス            │  │ ・アカウント間データ共有      ││
│  │ ・低レイテンシアクセス        │  │ ・環境間レプリカ             ││
│  │ ・地理的冗長性               │  │   (Dev→Test)                ││
│  └──────────────────────────────┘  └──────────────────────────────┘│
│                                                                     │
│  共通要件:                                                          │
│  ・ソース/宛先バケットでバージョニング有効                           │
│  ・IAMロールによるレプリケーション権限                               │
│  ・異なるアカウント間も可能                                         │
│  ・既存オブジェクトはレプリケートされない（S3 Batch Replication使用）│
│  ・Delete Markerのレプリケーションはオプション                       │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 レプリケーション設定の詳細

```
【レプリケーションルール構成】

┌─────────────────────────────────────────────────┐
│ レプリケーションルール                           │
│                                                 │
│ フィルタ:                                       │
│ ┌─────────────────────────────────────────────┐ │
│ │ ・プレフィックス (例: logs/)                  │ │
│ │ ・タグ (例: Replicate=true)                  │ │
│ │ ・プレフィックス + タグ の組み合わせ          │ │
│ │ ・フィルタなし = バケット全体                 │ │
│ └─────────────────────────────────────────────┘ │
│                                                 │
│ 宛先設定:                                       │
│ ┌─────────────────────────────────────────────┐ │
│ │ ・宛先バケット（別リージョン/別アカウント可） │ │
│ │ ・ストレージクラス変更（任意）               │ │
│ │ ・宛先での暗号化キー指定（KMS CMK）          │ │
│ │ ・レプリカオーナー変更（別アカウント時）     │ │
│ └─────────────────────────────────────────────┘ │
│                                                 │
│ オプション:                                     │
│ ┌─────────────────────────────────────────────┐ │
│ │ ・Delete Markerレプリケーション              │ │
│ │ ・レプリケーション時間制御 (RTC) - 15分SLA   │ │
│ │ ・S3 Replication Metrics                     │ │
│ └─────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

### 2.3 レプリケーションの制約

```
重要な制約:
1. チェーンレプリケーション不可
   A → B → C の場合、AのオブジェクトはBまで。Cには行かない。

2. 既存オブジェクトはレプリケートされない
   → S3 Batch Replication で対応

3. 削除の伝播
   - Delete Markerのレプリケーション: オプション（デフォルト無効）
   - バージョンID指定の永久削除: レプリケートされない

4. SSE-C暗号化オブジェクト: レプリケート不可

5. SSE-KMS暗号化:
   - 明示的にKMSキーを指定する必要あり
   - 宛先リージョンのKMSキーを使用
   - マルチリージョンKMSキーで簡素化可能
```

---

## 3. S3ライフサイクル

### 3.1 ストレージクラスと遷移

```
【ストレージクラス遷移図】

S3 Standard
    │
    ├──▶ S3 Standard-IA (30日以上経過)
    │       │
    │       ├──▶ S3 One Zone-IA
    │       │
    │       └──▶ S3 Glacier Instant Retrieval
    │               │
    ├──▶ S3 Intelligent-Tiering
    │
    ├──▶ S3 Glacier Flexible Retrieval
    │       │
    │       └──▶ S3 Glacier Deep Archive
    │
    └──▶ S3 Glacier Deep Archive

遷移の制約:
- Standard-IA/One Zone-IA: 最小30日保持が必要
- Glacier系: 最小90日(Flexible)/180日(Deep Archive)保持
- 最小オブジェクトサイズ: 128KB (IA系)
```

### 3.2 ライフサイクルルール

```
【ライフサイクルルールの構成】

┌──────────────────────────────────────────────────┐
│ ライフサイクルルール                              │
│                                                  │
│ フィルタ:                                        │
│ - プレフィックス: logs/                          │
│ - タグ: Tier=archive                            │
│                                                  │
│ 遷移アクション:                                  │
│ ┌──────────────────────────────────────────────┐ │
│ │ 30日後  → S3 Standard-IA                     │ │
│ │ 90日後  → S3 Glacier Instant Retrieval       │ │
│ │ 365日後 → S3 Glacier Deep Archive            │ │
│ └──────────────────────────────────────────────┘ │
│                                                  │
│ 有効期限アクション:                              │
│ ┌──────────────────────────────────────────────┐ │
│ │ 730日後 → オブジェクト削除                    │ │
│ │ 非現行バージョン: 90日後削除                  │ │
│ │ 期限切れDelete Marker: 自動削除              │ │
│ │ 不完全マルチパートアップロード: 7日後中止     │ │
│ └──────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────┘
```

---

## 4. S3暗号化とアクセス制御

### 4.1 暗号化オプション（KMSガイド参照）

```
サーバーサイド暗号化:
- SSE-S3 (AES-256): デフォルト、AWS管理
- SSE-KMS: KMSキー使用、監査ログ、バケットキー対応
- SSE-C: 顧客提供キー
- DSSE-KMS: 二重暗号化

クライアントサイド暗号化:
- CSE-KMS: KMSでデータキー生成
- CSE-C: 顧客管理のマスターキー
```

### 4.2 アクセス制御の4層

```
┌─────────────────────────────────────────────────────────────┐
│ S3アクセス制御の階層                                        │
│                                                             │
│ 1. S3 Block Public Access (アカウント/バケットレベル)       │
│    → パブリックアクセスの一括ブロック                       │
│                                                             │
│ 2. バケットポリシー (リソースベースポリシー)                │
│    → JSON形式、Principal指定、条件付きアクセス              │
│                                                             │
│ 3. IAMポリシー (IDベースポリシー)                           │
│    → ユーザー/ロールに付与                                 │
│                                                             │
│ 4. S3アクセスポイント                                      │
│    → バケットごとに複数のアクセスポイント                   │
│    → チーム/アプリごとに独立したポリシー                    │
│    → VPCエンドポイント経由のアクセス制限                    │
└─────────────────────────────────────────────────────────────┘
```

---

## 5. S3イベント通知

```
【S3イベント通知の宛先】

S3バケット
    │ イベント: s3:ObjectCreated:*, s3:ObjectRemoved:*, etc.
    │
    ├──▶ SNSトピック
    ├──▶ SQSキュー
    ├──▶ Lambda関数
    └──▶ EventBridge (全イベントタイプ対応)

※ EventBridge経由が推奨（より多くのイベントタイプ、フィルタリング機能）
```

---

# Part 2 - RDS/Aurora DR

---

## 6. RDS Multi-AZ

### 6.1 Multi-AZの種類

```
【RDS Multi-AZ 構成比較】

■ Multi-AZ インスタンス (従来型)
┌─────────────────────┐    ┌─────────────────────┐
│ プライマリ (AZ-a)    │    │ スタンバイ (AZ-c)    │
│ ┌─────────────────┐ │    │ ┌─────────────────┐ │
│ │ 読み書き可能    │ │←──▶│ │ 同期レプリケーション│ │
│ │                 │ │    │ │ 読み書き不可    │ │
│ └─────────────────┘ │    │ └─────────────────┘ │
└─────────────────────┘    └─────────────────────┘
フェイルオーバー: 60-120秒

■ Multi-AZ クラスター (新型)
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ ライター(AZ-a)│  │リーダー(AZ-b) │  │リーダー(AZ-c) │
│ 読み書き      │  │ 読み取り     │  │ 読み取り     │
│               │←▶│ 半同期レプリ │←▶│ 半同期レプリ │
└──────────────┘  └──────────────┘  └──────────────┘
フェイルオーバー: 約35秒
リーダーエンドポイントで読み取りスケーリング
```

### 6.2 フェイルオーバーの動作

```
【フェイルオーバートリガー】

自動フェイルオーバー発生条件:
1. プライマリのAZ障害
2. プライマリのホスト障害
3. プライマリのネットワーク障害
4. プライマリのストレージ障害
5. プライマリのインスタンスタイプ変更（手動）
6. RDS メンテナンス（パッチ適用）
7. 手動フェイルオーバー（aws rds failover-db-instance）

フェイルオーバー中:
- DNS CNAMEレコードの切り替え
- 新プライマリへの接続確立
- アプリ側はDNSキャッシュのTTLに注意
```

---

## 7. RDSリードレプリカとクロスリージョン

### 7.1 リードレプリカ

```
【リードレプリカ構成】

                    非同期レプリケーション
プライマリ ──────────────────────────────▶ リードレプリカ
(読み書き)        (レプリケーションラグあり)  (読み取りのみ)

特徴:
- 最大15レプリカ（Aurora）/ 5レプリカ（RDS）
- 非同期レプリケーション
- クロスAZ、クロスリージョン可能
- リードレプリカをスタンドアロンに昇格可能（DR用）
- クロスリージョンレプリカ: DR + 低レイテンシ読み取り
```

### 7.2 クロスリージョンリードレプリカ

```
【クロスリージョンリードレプリカ（RDS）】

ap-northeast-1 (東京)              us-west-2 (オレゴン)
┌──────────────────────┐          ┌──────────────────────┐
│ プライマリ            │          │ クロスリージョン      │
│ (読み書き)            │──非同期──▶│ リードレプリカ       │
│                      │  レプリ   │ (読み取り)           │
│                      │  ケーション│                      │
└──────────────────────┘          └──────────────────────┘

DR時: リードレプリカを昇格
  → スタンドアロンのプライマリインスタンスに
  → 手動プロセス（数分）
  → 昇格後はレプリケーション切断
```

---

## 8. Aurora Global Database

### 8.1 アーキテクチャ

```
【Aurora Global Database】

プライマリリージョン                セカンダリリージョン
(ap-northeast-1)                   (us-east-1)
┌────────────────────────┐        ┌────────────────────────┐
│ Aurora クラスター        │        │ Aurora クラスター        │
│ ┌────────────────────┐ │        │ ┌────────────────────┐ │
│ │ ライター (1)        │ │        │ │ リーダー (最大16)   │ │
│ │ リーダー (最大15)   │ │        │ │                    │ │
│ └────────────────────┘ │        │ └────────────────────┘ │
│ ┌────────────────────┐ │        │ ┌────────────────────┐ │
│ │ Aurora ストレージ    │ │──専用──▶│ │ Aurora ストレージ    │ │
│ │ (6コピー, 3AZ)      │ │ レプリ │ │ (6コピー, 3AZ)      │ │
│ └────────────────────┘ │ ケーション│ └────────────────────┘ │
└────────────────────────┘ (1秒以下)└────────────────────────┘

特徴:
- ストレージレベルのレプリケーション（1秒以下のラグ）
- 最大5セカンダリリージョン
- 計画的フェイルオーバー: ダウンタイム最小
- 非計画的フェイルオーバー: RPO 1秒, RTO 1分以下
- Write Forwarding: セカンダリからの書き込みをプライマリに転送
```

### 8.2 フェイルオーバーの種類

```
┌─────────────────────────────────────────────────────────────────────┐
│           Aurora Global Database フェイルオーバー                     │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ 計画的フェイルオーバー (Planned Failover)                     │   │
│  │                                                              │   │
│  │ ・メンテナンスやリージョン移行で使用                          │   │
│  │ ・RPO = 0（データ損失なし）                                  │   │
│  │ ・プライマリを読み取り専用にして同期完了を待つ                │   │
│  │ ・セカンダリを新プライマリに昇格                             │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ 非計画的フェイルオーバー (Unplanned/Detach and Promote)       │   │
│  │                                                              │   │
│  │ ・リージョン障害時に使用                                     │   │
│  │ ・RPO ≈ 1秒（直近のレプリケーション分のデータ損失あり）     │   │
│  │ ・セカンダリをデタッチして独立クラスターに昇格               │   │
│  │ ・RTO: 通常1分以下                                          │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ Switchover (Aurora Global Database Switchover)                │   │
│  │                                                              │   │
│  │ ・計画的なリージョン切り替え                                 │   │
│  │ ・Global Database構成を維持したまま切り替え                   │   │
│  │ ・旧プライマリが自動的にセカンダリになる                     │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 9. バックアップとリストア

### 9.1 RDSバックアップ

```
【RDSバックアップの種類】

┌──────────────────────────────────────────────────────────┐
│ 自動バックアップ                                        │
│ ・保持期間: 0〜35日（デフォルト7日）                     │
│ ・バックアップウィンドウで毎日スナップショット           │
│ ・トランザクションログは5分ごと                         │
│ ・任意の時点に復元可能（PITR）                          │
│ ・S3に自動保存（ユーザーからは見えない）                │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│ 手動スナップショット                                    │
│ ・ユーザーが明示的に作成                                │
│ ・保持期間の制限なし（手動削除まで保持）                │
│ ・クロスリージョンコピー可能                            │
│ ・別アカウントとの共有可能                              │
│ ・暗号化スナップショットの共有にはKMSキー共有が必要     │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│ AWS Backup統合                                          │
│ ・集中バックアップ管理                                  │
│ ・バックアッププランでスケジュール/保持期間を統一管理    │
│ ・クロスアカウント/クロスリージョンバックアップ          │
│ ・コンプライアンス要件への対応                          │
└──────────────────────────────────────────────────────────┘
```

### 9.2 復元時の注意点

```
重要: RDS/Auroraの復元は常に「新しいインスタンス/クラスター」を作成する
      → 既存インスタンスへの上書き復元はできない
      → 復元後にアプリケーションのエンドポイントを更新する必要あり
      → CNAME/Route 53を使って切り替えを自動化

PITR (Point-in-Time Recovery):
- 最新の復元可能時点: 通常5分前
- 最古の復元可能時点: 自動バックアップ保持期間の開始日
- トランザクションログを適用して指定時点に復元
```

---

## 10. ハンズオン演習

### 演習1: S3バージョニングとレプリケーション

```bash
# 1. ソースバケット作成（バージョニング有効）
SRC_BUCKET="dop-src-$(date +%s)"
aws s3 mb s3://${SRC_BUCKET}
aws s3api put-bucket-versioning \
  --bucket ${SRC_BUCKET} \
  --versioning-configuration Status=Enabled

# 2. 宛先バケット作成（バージョニング有効）
DST_BUCKET="dop-dst-$(date +%s)"
aws s3 mb s3://${DST_BUCKET} --region us-east-1
aws s3api put-bucket-versioning \
  --bucket ${DST_BUCKET} \
  --versioning-configuration Status=Enabled \
  --region us-east-1

# 3. レプリケーション用IAMロール作成
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

aws iam create-role \
  --role-name "s3-replication-role" \
  --assume-role-policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Principal": {"Service": "s3.amazonaws.com"},
      "Action": "sts:AssumeRole"
    }]
  }'

aws iam put-role-policy \
  --role-name "s3-replication-role" \
  --policy-name "replication-policy" \
  --policy-document '{
    "Version": "2012-10-17",
    "Statement": [
      {
        "Effect": "Allow",
        "Action": [
          "s3:GetReplicationConfiguration",
          "s3:ListBucket"
        ],
        "Resource": "arn:aws:s3:::'${SRC_BUCKET}'"
      },
      {
        "Effect": "Allow",
        "Action": [
          "s3:GetObjectVersionForReplication",
          "s3:GetObjectVersionAcl",
          "s3:GetObjectVersionTagging"
        ],
        "Resource": "arn:aws:s3:::'${SRC_BUCKET}'/*"
      },
      {
        "Effect": "Allow",
        "Action": [
          "s3:ReplicateObject",
          "s3:ReplicateDelete",
          "s3:ReplicateTags"
        ],
        "Resource": "arn:aws:s3:::'${DST_BUCKET}'/*"
      }
    ]
  }'

# 4. レプリケーション設定
aws s3api put-bucket-replication \
  --bucket ${SRC_BUCKET} \
  --replication-configuration '{
    "Role": "arn:aws:iam::'${ACCOUNT_ID}':role/s3-replication-role",
    "Rules": [{
      "ID": "crr-rule",
      "Status": "Enabled",
      "Filter": {},
      "Destination": {
        "Bucket": "arn:aws:s3:::'${DST_BUCKET}'",
        "StorageClass": "STANDARD_IA"
      },
      "DeleteMarkerReplication": {
        "Status": "Enabled"
      }
    }]
  }'

# 5. レプリケーション確認
aws s3api get-bucket-replication --bucket ${SRC_BUCKET}

# 6. テストオブジェクトのアップロード
echo "test data v1" | aws s3 cp - s3://${SRC_BUCKET}/test.txt
sleep 10
aws s3api list-object-versions --bucket ${DST_BUCKET} --prefix test.txt
```

### 演習2: S3ライフサイクルルール

```bash
# ライフサイクルルールの設定
aws s3api put-bucket-lifecycle-configuration \
  --bucket ${SRC_BUCKET} \
  --lifecycle-configuration '{
    "Rules": [
      {
        "ID": "archive-logs",
        "Filter": {"Prefix": "logs/"},
        "Status": "Enabled",
        "Transitions": [
          {"Days": 30, "StorageClass": "STANDARD_IA"},
          {"Days": 90, "StorageClass": "GLACIER"},
          {"Days": 365, "StorageClass": "DEEP_ARCHIVE"}
        ],
        "Expiration": {"Days": 730},
        "NoncurrentVersionTransitions": [
          {"NoncurrentDays": 30, "StorageClass": "GLACIER"}
        ],
        "NoncurrentVersionExpiration": {"NoncurrentDays": 90},
        "AbortIncompleteMultipartUpload": {"DaysAfterInitiation": 7}
      }
    ]
  }'

# ライフサイクル設定の確認
aws s3api get-bucket-lifecycle-configuration --bucket ${SRC_BUCKET}
```

### 演習3: RDS Multi-AZ確認

```bash
# RDSインスタンス一覧（Multi-AZ状態確認）
aws rds describe-db-instances \
  --query 'DBInstances[].{Name:DBInstanceIdentifier,MultiAZ:MultiAZ,AZ:AvailabilityZone,Engine:Engine,Status:DBInstanceStatus}' \
  --output table

# Auroraクラスター一覧
aws rds describe-db-clusters \
  --query 'DBClusters[].{Cluster:DBClusterIdentifier,Engine:Engine,Members:DBClusterMembers[].{Id:DBInstanceIdentifier,Writer:IsClusterWriter}}' \
  --output json

# 自動バックアップの確認
aws rds describe-db-instances \
  --query 'DBInstances[].{Name:DBInstanceIdentifier,BackupRetention:BackupRetentionPeriod,BackupWindow:PreferredBackupWindow,LatestRestore:LatestRestorableTime}'

# スナップショット一覧
aws rds describe-db-snapshots \
  --query 'DBSnapshots[].{Name:DBSnapshotIdentifier,Instance:DBInstanceIdentifier,Created:SnapshotCreateTime,Status:Status,Encrypted:Encrypted}' \
  --output table
```

### 演習4: S3イベント通知設定

```bash
# SNSトピック作成
TOPIC_ARN=$(aws sns create-topic --name "s3-events" --query 'TopicArn' --output text)

# SNSトピックポリシー（S3からの通知を許可）
aws sns set-topic-attributes \
  --topic-arn ${TOPIC_ARN} \
  --attribute-name Policy \
  --attribute-value '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Principal": {"Service": "s3.amazonaws.com"},
      "Action": "SNS:Publish",
      "Resource": "'${TOPIC_ARN}'",
      "Condition": {
        "ArnLike": {"aws:SourceArn": "arn:aws:s3:::'${SRC_BUCKET}'"}
      }
    }]
  }'

# S3イベント通知設定
aws s3api put-bucket-notification-configuration \
  --bucket ${SRC_BUCKET} \
  --notification-configuration '{
    "TopicConfigurations": [{
      "TopicArn": "'${TOPIC_ARN}'",
      "Events": ["s3:ObjectCreated:*"],
      "Filter": {
        "Key": {
          "FilterRules": [{"Name": "prefix", "Value": "uploads/"}]
        }
      }
    }]
  }'
```

### クリーンアップ

```bash
# S3バケット削除
aws s3 rb s3://${SRC_BUCKET} --force
aws s3 rb s3://${DST_BUCKET} --force --region us-east-1

# IAMロール削除
aws iam delete-role-policy --role-name s3-replication-role --policy-name replication-policy
aws iam delete-role --role-name s3-replication-role

# SNSトピック削除
aws sns delete-topic --topic-arn ${TOPIC_ARN}
```

---

## 11. DOP試験対策チェックリスト

### Q1: S3レプリケーション
**Q: S3クロスリージョンレプリケーション（CRR）の前提条件と制約は？**

<details><summary>模範解答</summary>

前提条件: ①ソースと宛先の両方でバージョニングが有効 ②IAMロールにレプリケーション権限 ③ソースバケットオーナーがソースとターゲットバケットの操作権限を持つ。制約: ①既存オブジェクトはレプリケートされない（S3 Batch Replicationで対応）②チェーンレプリケーション不可（A→B→Cは不可）③バージョンID指定の永久削除は伝播しない ④Delete Markerのレプリケーションはオプション（デフォルト無効）⑤SSE-Cオブジェクトはレプリケート不可。

</details>

### Q2: Aurora Global Database
**Q: Aurora Global Databaseの計画的フェイルオーバーと非計画的フェイルオーバーの違いは？**

<details><summary>模範解答</summary>

計画的: メンテナンスやリージョン移行で使用。RPO=0（データ損失なし）。プライマリを読み取り専用にし、レプリケーション完了を待ってからセカンダリを昇格。Global Database構成を維持。非計画的（Detach and Promote）: リージョン障害時に使用。RPO≈1秒。セカンダリをデタッチして独立クラスターに昇格。旧プライマリとの接続は切断される。RTO: どちらも通常1分以下。Switchover機能は計画的切り替えで構成を維持したまま実施可能。

</details>

### Q3: RDS Multi-AZ
**Q: RDS Multi-AZインスタンスとMulti-AZクラスターの違いは？**

<details><summary>模範解答</summary>

Multi-AZインスタンス（従来型）: スタンバイは1つ、同期レプリケーション、スタンバイは読み取り不可、フェイルオーバー60-120秒。Multi-AZクラスター（新型）: リーダー2つ、半同期レプリケーション、リーダーは読み取り可能（リーダーエンドポイント提供）、フェイルオーバー約35秒。クラスター型はMySQL/PostgreSQL対応、読み取りスケーリングとDRを同時に実現。

</details>

### Q4: S3ライフサイクル
**Q: S3ライフサイクルルールでコスト最適化するパターンは？**

<details><summary>模範解答</summary>

典型的パターン: ①頻繁アクセス（0-30日）→Standard ②低頻度アクセス（30-90日）→Standard-IA ③アーカイブ（90-365日）→Glacier Instant/Flexible ④長期保管（365日+）→Deep Archive ⑤期限切れ→自動削除。バージョニング有効の場合: 非現行バージョンをGlacierに遷移→一定期間後に削除。不完全マルチパートアップロードの自動中止も設定すべき。IA系は最小128KBと30日の課金最小期間に注意。Intelligent-Tieringはアクセスパターン不明な場合に有効。

</details>

### Q5: 暗号化レプリケーション
**Q: SSE-KMS暗号化されたS3オブジェクトをクロスリージョンレプリケーションするには？**

<details><summary>模範解答</summary>

レプリケーションルールでSSE-KMSの設定が必要。①宛先リージョンのKMSキーを指定 ②レプリケーションIAMロールにソースキーでのkms:Decrypt権限と宛先キーでのkms:Encrypt権限を付与。KMS APIスロットリングにも注意が必要。マルチリージョンKMSキーを使えば同一キーで統一でき設定が簡素化される。S3バケットキーを有効にすることでKMS APIコールを99%削減可能。

</details>

### Q6: PITR
**Q: RDSのPoint-in-Time Recovery（PITR）の仕組みと制約は？**

<details><summary>模範解答</summary>

仕組み: 自動バックアップ（日次スナップショット）+ トランザクションログ（5分ごとS3保存）を組み合わせて任意の時点に復元。制約: ①復元は常に新しいDBインスタンスを作成（既存に上書き不可）②最新の復元可能時点は通常5分前 ③バックアップ保持期間（最大35日）内の時点のみ ④復元後にアプリのエンドポイント変更が必要（Route 53 CNAMEで自動化推奨）⑤パラメータグループ、セキュリティグループは手動で再設定が必要。

</details>

### Q7: S3バージョニングとMFA Delete
**Q: S3 MFA Deleteの目的と設定上の制約は？**

<details><summary>模範解答</summary>

目的: バージョニング状態の変更とオブジェクトバージョンの永久削除にMFA認証を要求し、誤操作や不正削除を防止。制約: ①バージョニング有効のバケットでのみ使用可能 ②rootアカウントのみ設定可能（IAMユーザー不可）③AWS CLIからのみ設定可能（コンソール不可）④通常の削除（Delete Marker追加）にはMFA不要 ⑤バージョンID指定の物理削除のみMFA必要。

</details>

### Q8: クロスリージョンリードレプリカ vs Aurora Global Database
**Q: DR目的でRDSクロスリージョンリードレプリカとAurora Global Databaseのどちらを選ぶべきか？**

<details><summary>模範解答</summary>

Aurora Global Database推奨の場合: ①RPO 1秒以下が必要 ②RTO 1分以下が必要 ③ストレージレベルのレプリケーションで低遅延 ④計画的フェイルオーバーでデータ損失ゼロ。RDSクロスリージョンリードレプリカ: ①MySQL/PostgreSQL（非Aurora）の場合 ②コスト重視（Global Databaseより安い場合あり）③レプリケーションラグ許容 ④シンプルな構成。Aurora Global Databaseはストレージレベルの物理レプリケーションで高速、RDSリードレプリカはbinlog/WALベースの論理レプリケーション。

</details>
