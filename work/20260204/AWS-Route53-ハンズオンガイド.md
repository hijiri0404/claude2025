# AWS Route 53 ハンズオンガイド

> **対象**: AWS DevOps Professional (DOP-C02) 試験対策
> **前提知識**: DNS基礎、VPC、ネットワーク基礎
> **所要時間**: 約3時間

---

## 目次

1. [Route 53概要](#1-route-53概要)
2. [ホストゾーンとレコード](#2-ホストゾーンとレコード)
3. [ルーティングポリシー](#3-ルーティングポリシー)
4. [ヘルスチェック](#4-ヘルスチェック)
5. [フェイルオーバー設計パターン](#5-フェイルオーバー設計パターン)
6. [Route 53 Resolver](#6-route-53-resolver)
7. [DNSSEC](#7-dnssec)
8. [ハンズオン演習](#8-ハンズオン演習)
9. [DOP試験対策チェックリスト](#9-dop試験対策チェックリスト)

---

## 1. Route 53概要

### 1.1 Route 53とは

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Amazon Route 53                               │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │            高可用性・高スケーラビリティのDNSサービス              ││
│  │                                                                  ││
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        ││
│  │  │  DNS     │  │ ヘルス   │  │ トラフィック│  │ ドメイン │        ││
│  │  │ ルーティング│  │ チェック  │  │  フロー   │  │  登録    │        ││
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘        ││
│  │                                                                  ││
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐                      ││
│  │  │ Resolver │  │ DNSSEC   │  │ ログ記録  │                      ││
│  │  │ハイブリッド│  │ 署名検証  │  │クエリログ │                      ││
│  │  └──────────┘  └──────────┘  └──────────┘                      ││
│  └─────────────────────────────────────────────────────────────────┘│
│                                                                      │
│  SLA: 100% 可用性（DNSサービスとして唯一のAWS 100% SLA）            │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.2 DNS基礎知識

```
【DNS名前解決の流れ】

ユーザー                    DNSリゾルバ          ルートサーバ
  │                           │                    │
  │ www.example.com?          │                    │
  │ ─────────────────────────>│                    │
  │                           │ .com のNS?         │
  │                           │ ──────────────────>│
  │                           │ <────────────────── │
  │                           │                    │
  │                           │     TLDサーバ(.com)
  │                           │         │
  │                           │ example.com のNS?  │
  │                           │ ───────────────────>│
  │                           │ <─────────────────── │
  │                           │                     │
  │                           │   権威DNSサーバ(Route 53)
  │                           │         │
  │                           │ www.example.com のA? │
  │                           │ ────────────────────>│
  │                           │ A: 1.2.3.4          │
  │                           │ <──────────────────── │
  │ A: 1.2.3.4               │
  │ <─────────────────────────│
```

### 1.3 主要コンポーネント

| コンポーネント | 説明 | DOP重要度 |
|--------------|------|----------|
| **ホストゾーン** | ドメインのDNSレコード管理コンテナ | ★★★★★ |
| **ルーティングポリシー** | トラフィック制御（7種類） | ★★★★★ |
| **ヘルスチェック** | エンドポイントの可用性監視 | ★★★★★ |
| **Resolver** | ハイブリッドDNS解決 | ★★★★☆ |
| **DNSSEC** | DNS応答の真正性検証 | ★★★☆☆ |
| **トラフィックフロー** | ビジュアルなルーティング設計 | ★★★☆☆ |
| **ドメイン登録** | ドメイン名の購入・管理 | ★★☆☆☆ |

### 1.4 主要レコードタイプ

| レコードタイプ | 用途 | 例 |
|-------------|------|---|
| **A** | IPv4アドレスへのマッピング | `1.2.3.4` |
| **AAAA** | IPv6アドレスへのマッピング | `2001:db8::1` |
| **CNAME** | 別のドメイン名へのエイリアス | `www.example.com → app.example.com` |
| **NS** | ネームサーバーの指定 | `ns-123.awsdns-45.com` |
| **SOA** | ゾーンの管理情報 | 自動作成 |
| **MX** | メールサーバーの指定 | `10 mail.example.com` |
| **TXT** | テキスト情報（SPF/DKIM等） | `v=spf1 include:_spf.google.com ~all` |
| **SRV** | サービスの場所指定 | SIPやLDAPなど |
| **Alias** | AWSリソースへのエイリアス（Route 53独自） | `d123.cloudfront.net` |

### 1.5 Aliasレコード vs CNAMEレコード

```
【Alias vs CNAME 比較】

┌────────────────────────────────────────────────────────────────┐
│                   CNAMEレコード                                 │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ www.example.com → app.example.com → 1.2.3.4             │ │
│  │                                                          │ │
│  │ 制約:                                                    │ │
│  │ ├─ Zone Apex (example.com) には使用不可                  │ │
│  │ ├─ 追加のDNSクエリが発生（2段階解決）                     │ │
│  │ └─ クエリ課金あり                                        │ │
│  └──────────────────────────────────────────────────────────┘ │
├────────────────────────────────────────────────────────────────┤
│                   Aliasレコード（Route 53独自）                  │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ example.com → ALB/CloudFront/S3 等のAWSリソース          │ │
│  │                                                          │ │
│  │ 利点:                                                    │ │
│  │ ├─ Zone Apex に使用可能                                  │ │
│  │ ├─ Route 53が内部で自動解決（高速）                       │ │
│  │ ├─ AWSリソース宛のクエリは無料                           │ │
│  │ └─ ヘルスチェックとの連携可能                            │ │
│  │                                                          │ │
│  │ Aliasターゲット:                                         │ │
│  │ ├─ ELB (ALB/NLB/CLB)                                    │ │
│  │ ├─ CloudFront Distribution                               │ │
│  │ ├─ S3 Website Endpoint                                   │ │
│  │ ├─ API Gateway                                           │ │
│  │ ├─ Elastic Beanstalk                                     │ │
│  │ ├─ VPC Interface Endpoint                                │ │
│  │ ├─ Global Accelerator                                    │ │
│  │ └─ 同一ホストゾーン内の別レコード                        │ │
│  │                                                          │ │
│  │ Alias不可:                                               │ │
│  │ └─ EC2インスタンスのDNS名                                │ │
│  └──────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────┘
```

> **DOP試験ポイント**: Zone Apex（ネイキッドドメイン）にAWSリソースをマッピングする場合、Aliasレコードが必須。CNAMEは使用不可。

---

## 2. ホストゾーンとレコード

### 2.1 ホストゾーンの種類

```
【ホストゾーンの種類】

┌─────────────────────────────────────────────────────────────┐
│ パブリックホストゾーン                                         │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ example.com                                             │ │
│ │ ├─ インターネットからアクセス可能                        │ │
│ │ ├─ パブリックDNSクエリに応答                            │ │
│ │ └─ $0.50/ホストゾーン/月                                │ │
│ └─────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│ プライベートホストゾーン                                       │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ internal.example.com                                    │ │
│ │ ├─ VPC内からのみアクセス可能                            │ │
│ │ ├─ 複数VPCとの関連付け可能                              │ │
│ │ ├─ クロスアカウントVPC関連付け可能                      │ │
│ │ └─ $0.50/ホストゾーン/月                                │ │
│ │                                                         │ │
│ │ 関連付け:                                               │ │
│ │  VPC-A (us-east-1) ──┐                                 │ │
│ │  VPC-B (ap-northeast-1) ──── internal.example.com      │ │
│ │  VPC-C (Account B)  ──┘                                │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 ホストゾーンの作成と管理

```bash
# パブリックホストゾーンの作成
aws route53 create-hosted-zone \
  --name example.com \
  --caller-reference "unique-string-$(date +%s)"

# プライベートホストゾーンの作成
aws route53 create-hosted-zone \
  --name internal.example.com \
  --caller-reference "unique-string-$(date +%s)" \
  --vpc VPCRegion=ap-northeast-1,VPCId=vpc-0123456789abcdef0 \
  --hosted-zone-config PrivateZone=true

# ホストゾーン一覧の取得
aws route53 list-hosted-zones

# 特定ホストゾーンのレコード一覧
aws route53 list-resource-record-sets \
  --hosted-zone-id Z0123456789ABCDEFGHIJ
```

### 2.3 レコードの作成（UPSERT）

```bash
# Aレコードの作成（UPSERT = 存在すれば更新、なければ作成）
aws route53 change-resource-record-sets \
  --hosted-zone-id Z0123456789ABCDEFGHIJ \
  --change-batch '{
    "Changes": [
      {
        "Action": "UPSERT",
        "ResourceRecordSet": {
          "Name": "www.example.com",
          "Type": "A",
          "TTL": 300,
          "ResourceRecords": [
            {"Value": "1.2.3.4"}
          ]
        }
      }
    ]
  }'

# Aliasレコードの作成（ALBへのマッピング）
aws route53 change-resource-record-sets \
  --hosted-zone-id Z0123456789ABCDEFGHIJ \
  --change-batch '{
    "Changes": [
      {
        "Action": "UPSERT",
        "ResourceRecordSet": {
          "Name": "example.com",
          "Type": "A",
          "AliasTarget": {
            "HostedZoneId": "Z14GRHDCWA56QT",
            "DNSName": "my-alb-123456.ap-northeast-1.elb.amazonaws.com",
            "EvaluateTargetHealth": true
          }
        }
      }
    ]
  }'

# レコードの削除
aws route53 change-resource-record-sets \
  --hosted-zone-id Z0123456789ABCDEFGHIJ \
  --change-batch '{
    "Changes": [
      {
        "Action": "DELETE",
        "ResourceRecordSet": {
          "Name": "www.example.com",
          "Type": "A",
          "TTL": 300,
          "ResourceRecords": [
            {"Value": "1.2.3.4"}
          ]
        }
      }
    ]
  }'
```

### 2.4 TTL（Time To Live）の設計

| シナリオ | 推奨TTL | 理由 |
|---------|---------|-----|
| 静的コンテンツ | 86400（24時間） | 変更頻度が低い |
| 一般的なWebサイト | 300（5分） | バランス型 |
| フェイルオーバー構成 | 60（1分） | 切り替えの迅速化 |
| 移行前の事前準備 | 60以下 | 移行時の影響最小化 |
| Aliasレコード | 設定不可 | ターゲットのTTLに従う |

> **DOP試験ポイント**: DNS移行前にTTLを下げておくことが重要。高TTLのままフェイルオーバーすると、切り替え完了まで旧キャッシュが残る。

---

## 3. ルーティングポリシー

### 3.1 ルーティングポリシー一覧

```
┌─────────────────────────────────────────────────────────────────────┐
│                 Route 53 ルーティングポリシー（7種類）                │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ 基本                                                        │  │
│  │  ┌──────────┐  ┌──────────┐                                │  │
│  │  │  Simple  │  │Multivalue│                                │  │
│  │  │  単純    │  │複数値応答 │                                │  │
│  │  └──────────┘  └──────────┘                                │  │
│  ├──────────────────────────────────────────────────────────────┤  │
│  │ 重み・性能ベース                                            │  │
│  │  ┌──────────┐  ┌──────────┐                                │  │
│  │  │ Weighted │  │ Latency  │                                │  │
│  │  │  加重    │  │レイテンシ │                                │  │
│  │  └──────────┘  └──────────┘                                │  │
│  ├──────────────────────────────────────────────────────────────┤  │
│  │ 地理・位置ベース                                            │  │
│  │  ┌──────────┐  ┌──────────────┐                            │  │
│  │  │Geolocation│  │Geoproximity  │                            │  │
│  │  │ 地理的位置│  │ 地理的近接性  │                            │  │
│  │  └──────────┘  └──────────────┘                            │  │
│  ├──────────────────────────────────────────────────────────────┤  │
│  │ 可用性ベース                                                │  │
│  │  ┌──────────┐                                              │  │
│  │  │ Failover │                                              │  │
│  │  │フェイルオーバー│                                          │  │
│  │  └──────────┘                                              │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.2 Simple（単純ルーティング）

```
【Simpleルーティング】

クライアント ──── Route 53 ──── 1.2.3.4
                                  2.3.4.5  ← 複数IPを返却
                                  3.4.5.6    クライアントがランダム選択

特徴:
├─ 1つのレコードに複数値を設定可能
├─ ヘルスチェックとの連携不可
├─ クライアント側でランダムに1つ選択
└─ 最もシンプルな設定
```

```bash
# Simpleルーティング（複数値）
aws route53 change-resource-record-sets \
  --hosted-zone-id Z0123456789ABCDEFGHIJ \
  --change-batch '{
    "Changes": [{
      "Action": "UPSERT",
      "ResourceRecordSet": {
        "Name": "simple.example.com",
        "Type": "A",
        "TTL": 300,
        "ResourceRecords": [
          {"Value": "1.2.3.4"},
          {"Value": "2.3.4.5"},
          {"Value": "3.4.5.6"}
        ]
      }
    }]
  }'
```

### 3.3 Weighted（加重ルーティング）

```
【Weightedルーティング】

                              Weight: 70
クライアント ─── Route 53 ───┬──────────── 1.2.3.4 (Production v1)
                              │  Weight: 20
                              ├──────────── 2.3.4.5 (Production v2)
                              │  Weight: 10
                              └──────────── 3.4.5.6 (Canary)

トラフィック配分:
├─ v1: 70/(70+20+10) = 70%
├─ v2: 20/(70+20+10) = 20%
└─ Canary: 10/(70+20+10) = 10%

ユースケース:
├─ Blue/Greenデプロイ
├─ カナリアリリース
├─ A/Bテスト
└─ リージョン間のトラフィック分散
```

```bash
# Weightedルーティング - レコード1（本番）
aws route53 change-resource-record-sets \
  --hosted-zone-id Z0123456789ABCDEFGHIJ \
  --change-batch '{
    "Changes": [{
      "Action": "UPSERT",
      "ResourceRecordSet": {
        "Name": "weighted.example.com",
        "Type": "A",
        "SetIdentifier": "production-v1",
        "Weight": 70,
        "TTL": 60,
        "ResourceRecords": [{"Value": "1.2.3.4"}]
      }
    }]
  }'

# Weightedルーティング - レコード2（カナリア）
aws route53 change-resource-record-sets \
  --hosted-zone-id Z0123456789ABCDEFGHIJ \
  --change-batch '{
    "Changes": [{
      "Action": "UPSERT",
      "ResourceRecordSet": {
        "Name": "weighted.example.com",
        "Type": "A",
        "SetIdentifier": "canary",
        "Weight": 10,
        "TTL": 60,
        "ResourceRecords": [{"Value": "2.3.4.5"}]
      }
    }]
  }'

# Weight=0 にするとトラフィック停止（テスト終了時）
# 全レコードがWeight=0の場合は均等配分
```

### 3.4 Latency（レイテンシベースルーティング）

```
【Latencyルーティング】

                                     レイテンシ測定
                              ┌──── ap-northeast-1: 10ms ★最小
US/EU ユーザー ── Route 53 ──┤
                              ├──── us-east-1: 180ms
                              └──── eu-west-1: 200ms

                                     レイテンシ測定
                              ┌──── ap-northeast-1: 200ms
JP ユーザー ──── Route 53 ───┤
                              ├──── us-east-1: 10ms ★最小
                              └──── eu-west-1: 180ms

特徴:
├─ AWSが定期的にレイテンシテーブルを更新
├─ ユーザーのIPアドレスから最寄りリージョンを判定
├─ 物理的距離ではなくネットワークレイテンシで判定
└─ ヘルスチェックとの連携可能
```

```bash
# Latencyルーティング - 東京リージョン
aws route53 change-resource-record-sets \
  --hosted-zone-id Z0123456789ABCDEFGHIJ \
  --change-batch '{
    "Changes": [{
      "Action": "UPSERT",
      "ResourceRecordSet": {
        "Name": "latency.example.com",
        "Type": "A",
        "SetIdentifier": "tokyo",
        "Region": "ap-northeast-1",
        "TTL": 60,
        "ResourceRecords": [{"Value": "10.0.1.1"}]
      }
    }]
  }'

# Latencyルーティング - バージニアリージョン
aws route53 change-resource-record-sets \
  --hosted-zone-id Z0123456789ABCDEFGHIJ \
  --change-batch '{
    "Changes": [{
      "Action": "UPSERT",
      "ResourceRecordSet": {
        "Name": "latency.example.com",
        "Type": "A",
        "SetIdentifier": "virginia",
        "Region": "us-east-1",
        "TTL": 60,
        "ResourceRecords": [{"Value": "10.0.2.1"}]
      }
    }]
  }'
```

### 3.5 Failover（フェイルオーバールーティング）

```
【Failoverルーティング】

正常時:
クライアント ─── Route 53 ──── Primary (Active)     ← ヘルスチェックOK
                     │
                     │          Secondary (Standby)   ← 待機中
                     │
                     └── ヘルスチェック ── Primary: Healthy ✓

障害時:
クライアント ─── Route 53 ──── Primary (Down)        ← ヘルスチェックNG
                     │                ×
                     │          Secondary (Active)    ← フェイルオーバー
                     │
                     └── ヘルスチェック ── Primary: Unhealthy ✗

特徴:
├─ Primary/Secondaryの2レコード構成
├─ Primaryにヘルスチェック必須
├─ Secondaryにヘルスチェック任意（推奨）
└─ S3静的サイトをSecondaryにする構成が定番
```

```bash
# Failover - Primary
aws route53 change-resource-record-sets \
  --hosted-zone-id Z0123456789ABCDEFGHIJ \
  --change-batch '{
    "Changes": [{
      "Action": "UPSERT",
      "ResourceRecordSet": {
        "Name": "failover.example.com",
        "Type": "A",
        "SetIdentifier": "primary",
        "Failover": "PRIMARY",
        "TTL": 60,
        "HealthCheckId": "abcdef12-3456-7890-abcd-ef1234567890",
        "ResourceRecords": [{"Value": "1.2.3.4"}]
      }
    }]
  }'

# Failover - Secondary（S3静的サイトへのAlias）
aws route53 change-resource-record-sets \
  --hosted-zone-id Z0123456789ABCDEFGHIJ \
  --change-batch '{
    "Changes": [{
      "Action": "UPSERT",
      "ResourceRecordSet": {
        "Name": "failover.example.com",
        "Type": "A",
        "SetIdentifier": "secondary",
        "Failover": "SECONDARY",
        "AliasTarget": {
          "HostedZoneId": "Z2M4EHUR26P7ZW",
          "DNSName": "s3-website-ap-northeast-1.amazonaws.com",
          "EvaluateTargetHealth": true
        }
      }
    }]
  }'
```

### 3.6 Geolocation（地理的位置ルーティング）

```
【Geolocationルーティング】

                              ┌─ 日本からのアクセス → 東京サーバ
クライアント ─── Route 53 ───┼─ 米国からのアクセス → バージニアサーバ
                              ├─ EU からのアクセス  → フランクフルトサーバ
                              └─ その他（Default）  → バージニアサーバ

判定基準:
├─ 大陸（Continent）: AF, AN, AS, EU, NA, OC, SA
├─ 国（Country）: JP, US, DE, etc.
├─ 米国の州（Subdivision）: CA, NY, TX, etc.
└─ デフォルト（必須）: マッチしないクエリの応答先

ユースケース:
├─ コンテンツの地域制限（ジオブロッキング）
├─ 規制準拠（データ主権）
├─ 言語・地域別コンテンツ配信
└─ ライセンス制限の実装
```

```bash
# Geolocation - 日本向け
aws route53 change-resource-record-sets \
  --hosted-zone-id Z0123456789ABCDEFGHIJ \
  --change-batch '{
    "Changes": [{
      "Action": "UPSERT",
      "ResourceRecordSet": {
        "Name": "geo.example.com",
        "Type": "A",
        "SetIdentifier": "japan",
        "GeoLocation": {"CountryCode": "JP"},
        "TTL": 60,
        "ResourceRecords": [{"Value": "10.0.1.1"}]
      }
    }]
  }'

# Geolocation - デフォルト（必須）
aws route53 change-resource-record-sets \
  --hosted-zone-id Z0123456789ABCDEFGHIJ \
  --change-batch '{
    "Changes": [{
      "Action": "UPSERT",
      "ResourceRecordSet": {
        "Name": "geo.example.com",
        "Type": "A",
        "SetIdentifier": "default",
        "GeoLocation": {"CountryCode": "*"},
        "TTL": 60,
        "ResourceRecords": [{"Value": "10.0.2.1"}]
      }
    }]
  }'
```

> **DOP試験ポイント**: Geolocationルーティングでは必ず「Default」レコードを設定すること。設定しないとマッチしない地域からのクエリに応答できない（NXDOMAIN）。

### 3.7 Geoproximity（地理的近接性ルーティング）

```
【Geoproximityルーティング】

Bias(バイアス)による範囲調整:

  Bias = 0（デフォルト）     Bias = +50（東京拡大）
  ┌────────────────────┐    ┌────────────────────┐
  │   ┌──┐    ┌──┐     │    │ ┌────────┐  ┌──┐  │
  │   │TK│    │VA│     │    │ │  TK    │  │VA│  │
  │   │  │    │  │     │    │ │ (+50)  │  │  │  │
  │   └──┘    └──┘     │    │ └────────┘  └──┘  │
  │   東京    Virginia  │    │ ← 東京の範囲拡大 → │
  └────────────────────┘    └────────────────────┘

特徴:
├─ AWSリージョン or 緯度経度で場所を指定
├─ Bias値（-99〜+99）でトラフィック範囲を調整
├─ Biasを大きくすると対象リソースへのトラフィック増加
├─ Traffic Flowでのみ使用可能（ポリシーレコード）
└─ Latencyとの違い: 物理的距離ベース（ネットワーク遅延ではない）

ユースケース:
├─ 特定リージョンへの段階的トラフィック移行
└─ 地理的にきめ細かいルーティング制御
```

### 3.8 Multivalue Answer（複数値応答ルーティング）

```
【Multivalueルーティング】

クライアント ─── Route 53 ───┬── 1.2.3.4 (Healthy ✓) ← 返却
                              ├── 2.3.4.5 (Healthy ✓) ← 返却
                              ├── 3.4.5.6 (Unhealthy ✗) ← 除外
                              └── 4.5.6.7 (Healthy ✓) ← 返却

応答: [1.2.3.4, 2.3.4.5, 4.5.6.7]（最大8個）

特徴:
├─ ヘルスチェックと連携可能（Simpleとの違い）
├─ 正常なレコードのみ応答に含める
├─ 最大8つの正常レコードを返却
├─ クライアント側DNS（ELB的な簡易負荷分散）
└─ ELBの代替ではない（DNS レベルの分散のみ）

Simple vs Multivalue:
├─ Simple: ヘルスチェック不可、全レコード返却
└─ Multivalue: ヘルスチェック可、正常レコードのみ返却
```

```bash
# Multivalue - レコード1
aws route53 change-resource-record-sets \
  --hosted-zone-id Z0123456789ABCDEFGHIJ \
  --change-batch '{
    "Changes": [{
      "Action": "UPSERT",
      "ResourceRecordSet": {
        "Name": "multi.example.com",
        "Type": "A",
        "SetIdentifier": "server-1",
        "MultiValueAnswer": true,
        "TTL": 60,
        "HealthCheckId": "hc-111111",
        "ResourceRecords": [{"Value": "1.2.3.4"}]
      }
    }]
  }'

# Multivalue - レコード2
aws route53 change-resource-record-sets \
  --hosted-zone-id Z0123456789ABCDEFGHIJ \
  --change-batch '{
    "Changes": [{
      "Action": "UPSERT",
      "ResourceRecordSet": {
        "Name": "multi.example.com",
        "Type": "A",
        "SetIdentifier": "server-2",
        "MultiValueAnswer": true,
        "TTL": 60,
        "HealthCheckId": "hc-222222",
        "ResourceRecords": [{"Value": "2.3.4.5"}]
      }
    }]
  }'
```

### 3.9 ルーティングポリシー比較表

| ポリシー | ヘルスチェック | ユースケース | 設定の複雑さ |
|---------|-------------|------------|------------|
| **Simple** | 不可 | 単一リソース、基本設定 | ★☆☆☆☆ |
| **Weighted** | 可能 | カナリア、A/B、Blue/Green | ★★☆☆☆ |
| **Latency** | 可能 | マルチリージョン低遅延 | ★★☆☆☆ |
| **Failover** | 必須(Primary) | DR、Active-Passive | ★★★☆☆ |
| **Geolocation** | 可能 | 地域制限、規制準拠 | ★★★☆☆ |
| **Geoproximity** | 可能 | きめ細かい地理的制御 | ★★★★☆ |
| **Multivalue** | 可能 | 簡易負荷分散+ヘルスチェック | ★★☆☆☆ |

### 3.10 ルーティングポリシーの組み合わせ（ネスト）

```
【ポリシーの組み合わせ例: Latency + Failover】

                              Latency ルーティング
                              ┌─────────────────────┐
                              │                     │
                      ┌───────┴───────┐     ┌───────┴───────┐
                      │ ap-northeast-1│     │ us-east-1     │
                      └───────┬───────┘     └───────┬───────┘
                              │                     │
                      Failover ルーティング    Failover ルーティング
                      ┌───────┴───────┐     ┌───────┴───────┐
                      │               │     │               │
                  Primary        Secondary  Primary        Secondary
                  ALB-TK         S3-Sorry   ALB-VA         S3-Sorry

実装: Aliasレコードのチェーンで実現
├─ 親レコード: Latency（ap-northeast-1, us-east-1）
└─ 子レコード: 各リージョン内でFailover（Primary/Secondary）
```

---

## 4. ヘルスチェック

### 4.1 ヘルスチェックの種類

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Route 53 ヘルスチェック                           │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ 1. エンドポイント監視                                        │  │
│  │    ├─ HTTP/HTTPS/TCP プロトコル                              │  │
│  │    ├─ IP or ドメイン名を指定                                 │  │
│  │    ├─ 応答コード（2xx, 3xx）で判定                           │  │
│  │    ├─ 応答本文の文字列検索（最初の5120バイト）                │  │
│  │    └─ 世界中のヘルスチェッカーから監視                       │  │
│  ├──────────────────────────────────────────────────────────────┤  │
│  │ 2. CloudWatchアラーム監視                                    │  │
│  │    ├─ CloudWatchアラームの状態をヘルスチェックに連携          │  │
│  │    ├─ プライベートリソースの監視に有用                       │  │
│  │    └─ ALARM状態 → Unhealthy                                 │  │
│  ├──────────────────────────────────────────────────────────────┤  │
│  │ 3. 計算されたヘルスチェック（Calculated）                     │  │
│  │    ├─ 複数のヘルスチェックを組み合わせ                       │  │
│  │    ├─ AND/OR/最小N個の条件設定                               │  │
│  │    └─ 最大256個の子ヘルスチェック                            │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.2 エンドポイントヘルスチェック

```
【エンドポイントヘルスチェックの仕組み】

Route 53 ヘルスチェッカー（グローバル分散）
┌──────────────────────────────────────────────────┐
│                                                  │
│  US-East ──────┐                                │
│  US-West ──────┤                                │
│  EU-West ──────┼──── エンドポイント監視 ────→ ターゲット │
│  AP-SE   ──────┤         (HTTP/HTTPS/TCP)       │
│  AP-NE   ──────┤                                │
│  SA-East ──────┘                                │
│                                                  │
│  判定ロジック:                                   │
│  ├─ 18%以上のチェッカーがHealthy → Healthy      │
│  └─ 18%未満のチェッカーがHealthy → Unhealthy    │
│                                                  │
│  チェック間隔:                                   │
│  ├─ 標準: 30秒（デフォルト）                    │
│  └─ Fast: 10秒（追加料金）                      │
│                                                  │
│  失敗しきい値（Failure Threshold）:              │
│  └─ デフォルト: 3回連続失敗でUnhealthy           │
└──────────────────────────────────────────────────┘
```

```bash
# HTTPエンドポイントのヘルスチェック作成
aws route53 create-health-check \
  --caller-reference "hc-$(date +%s)" \
  --health-check-config '{
    "Type": "HTTP",
    "FullyQualifiedDomainName": "www.example.com",
    "Port": 80,
    "ResourcePath": "/health",
    "RequestInterval": 30,
    "FailureThreshold": 3,
    "EnableSNI": false
  }'

# HTTPSエンドポイント + 文字列マッチ
aws route53 create-health-check \
  --caller-reference "hc-https-$(date +%s)" \
  --health-check-config '{
    "Type": "HTTPS_STR_MATCH",
    "FullyQualifiedDomainName": "api.example.com",
    "Port": 443,
    "ResourcePath": "/health",
    "SearchString": "\"status\":\"ok\"",
    "RequestInterval": 10,
    "FailureThreshold": 2,
    "EnableSNI": true
  }'

# ヘルスチェック一覧
aws route53 list-health-checks

# ヘルスチェックのステータス確認
aws route53 get-health-check-status \
  --health-check-id "abcdef12-3456-7890-abcd-ef1234567890"
```

> **DOP試験ポイント**: ヘルスチェッカーはAWSのパブリックIPから接続するため、セキュリティグループでRoute 53のヘルスチェッカーIP範囲を許可する必要がある。

### 4.3 CloudWatchアラームベースのヘルスチェック

```
【CloudWatchアラーム連携ヘルスチェック】

プライベートサブネット内のリソース監視に有効

┌─ VPC ─────────────────────────────────────┐
│ ┌─ Private Subnet ──────────────────────┐ │
│ │                                       │ │
│ │   EC2/RDS ──→ CloudWatch Agent        │ │
│ │                    │                   │ │
│ │                    ▼                   │ │
│ │           CloudWatch Metric           │ │
│ │                    │                   │ │
│ └────────────────────│───────────────────┘ │
│                      ▼                     │
│              CloudWatch Alarm              │
│                      │                     │
└──────────────────────│─────────────────────┘
                       ▼
            Route 53 ヘルスチェック
            （CloudWatch Alarm状態を監視）
                       │
                       ▼
              DNS フェイルオーバー

メリット:
├─ プライベートリソースの間接監視が可能
├─ カスタムメトリクスによる柔軟な判定
└─ エンドポイント直接監視が不可能な場合の代替手段
```

```bash
# CloudWatchアラームベースのヘルスチェック作成
aws route53 create-health-check \
  --caller-reference "hc-cw-$(date +%s)" \
  --health-check-config '{
    "Type": "CLOUDWATCH_METRIC",
    "AlarmIdentifier": {
      "Region": "ap-northeast-1",
      "Name": "rds-cpu-alarm"
    },
    "InsufficientDataHealthStatus": "LastKnownStatus"
  }'
```

| InsufficientDataHealthStatus | 動作 | ユースケース |
|------------------------------|------|------------|
| `Healthy` | データ不足時はHealthy扱い | 新規メトリクス |
| `Unhealthy` | データ不足時はUnhealthy扱い | クリティカル監視 |
| `LastKnownStatus` | 最後の既知状態を維持 | 一般的な推奨設定 |

### 4.4 計算されたヘルスチェック（Calculated Health Check）

```
【計算されたヘルスチェック】

           ┌─ HC-1: Web Server  (Healthy ✓)
           │
Calculated ┼─ HC-2: API Server  (Healthy ✓)  → 全体: Healthy ✓
           │
           └─ HC-3: DB Server   (Healthy ✓)

条件設定例:
├─ AND: すべてがHealthy → 全体Healthy
├─ OR: 1つでもHealthy → 全体Healthy
└─ N of M: 3つ中2つ以上がHealthy → 全体Healthy

設定: HealthThreshold
├─ 0 = OR（1つでもHealthyなら全体Healthy）
├─ N = N個以上がHealthyなら全体Healthy
└─ 子HC数と同じ = AND（すべてHealthy必須）
```

```bash
# 子ヘルスチェック1（Webサーバ）
WEB_HC=$(aws route53 create-health-check \
  --caller-reference "hc-web-$(date +%s)" \
  --health-check-config '{
    "Type": "HTTP",
    "IPAddress": "1.2.3.4",
    "Port": 80,
    "ResourcePath": "/health"
  }' --query 'HealthCheck.Id' --output text)

# 子ヘルスチェック2（APIサーバ）
API_HC=$(aws route53 create-health-check \
  --caller-reference "hc-api-$(date +%s)" \
  --health-check-config '{
    "Type": "HTTP",
    "IPAddress": "2.3.4.5",
    "Port": 8080,
    "ResourcePath": "/health"
  }' --query 'HealthCheck.Id' --output text)

# 計算されたヘルスチェック（2つ中1つ以上がHealthy）
aws route53 create-health-check \
  --caller-reference "hc-calc-$(date +%s)" \
  --health-check-config "{
    \"Type\": \"CALCULATED\",
    \"ChildHealthChecks\": [\"${WEB_HC}\", \"${API_HC}\"],
    \"HealthThreshold\": 1
  }"
```

### 4.5 ヘルスチェックとSNS通知

```bash
# ヘルスチェックにCloudWatchアラームを設定
# Route 53ヘルスチェックメトリクスは us-east-1 リージョンのみ
aws cloudwatch put-metric-alarm \
  --region us-east-1 \
  --alarm-name "Route53-HealthCheck-Failed" \
  --namespace "AWS/Route53" \
  --metric-name "HealthCheckStatus" \
  --dimensions Name=HealthCheckId,Value=abcdef12-3456-7890-abcd-ef1234567890 \
  --comparison-operator LessThanThreshold \
  --threshold 1 \
  --period 60 \
  --evaluation-periods 1 \
  --statistic Minimum \
  --alarm-actions "arn:aws:sns:us-east-1:123456789012:alerts"
```

> **DOP試験ポイント**: Route 53のヘルスチェックメトリクスは **us-east-1リージョンのみ** でCloudWatchに発行される。アラーム作成時はリージョンに注意。

---

## 5. フェイルオーバー設計パターン

### 5.1 Active-Passive フェイルオーバー

```
【Active-Passive パターン】

正常時:
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  ┌──────────┐    Failover    ┌──────────────────────────┐ │
│  │          │    Primary     │  Primary Site            │ │
│  │ Route 53 │ ─────────────→│  (ap-northeast-1)        │ │
│  │          │                │  ALB + EC2 + RDS         │ │
│  │          │                └──────────────────────────┘ │
│  │          │                                             │
│  │          │    Failover    ┌──────────────────────────┐ │
│  │          │    Secondary   │  Sorry Page              │ │
│  │          │ - - - - - - →│  (S3 Static Website)     │ │
│  │          │   (待機中)     │  "メンテナンス中です"      │ │
│  └──────────┘                └──────────────────────────┘ │
│       │                                                    │
│       └── Health Check ──→ Primary ALB: Healthy ✓         │
│                                                             │
└─────────────────────────────────────────────────────────────┘

障害時:
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  ┌──────────┐    Failover    ┌──────────────────────────┐ │
│  │          │    Primary     │  Primary Site            │ │
│  │ Route 53 │ ─── ✗ ───→    │  (障害中)                │ │
│  │          │                │  ALB + EC2 + RDS         │ │
│  │          │                └──────────────────────────┘ │
│  │          │                                             │
│  │          │    Failover    ┌──────────────────────────┐ │
│  │          │    Secondary   │  Sorry Page              │ │
│  │          │ ─────────────→│  (S3 Static Website)     │ │
│  │          │   (切替済)     │  "メンテナンス中です"      │ │
│  └──────────┘                └──────────────────────────┘ │
│       │                                                    │
│       └── Health Check ──→ Primary ALB: Unhealthy ✗       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 Active-Active フェイルオーバー

```
【Active-Active パターン（マルチリージョン）】

┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  ┌──────────┐    Latency     ┌──────────────────────────┐ │
│  │          │ ─────────────→│  Region A                │ │
│  │ Route 53 │    (低遅延)    │  (ap-northeast-1)        │ │
│  │          │                │  ALB + EC2 + Aurora       │ │
│  │ Latency  │                │          ↕ (レプリケーション)│ │
│  │ Routing  │    Latency     ┌──────────────────────────┐ │
│  │          │ ─────────────→│  Region B                │ │
│  │          │    (低遅延)    │  (us-east-1)             │ │
│  │          │                │  ALB + EC2 + Aurora       │ │
│  └──────────┘                └──────────────────────────┘ │
│       │                                                    │
│       ├── Health Check A ──→ Region A ALB: Healthy ✓      │
│       └── Health Check B ──→ Region B ALB: Healthy ✓      │
│                                                             │
│  障害時: Unhealthyなリージョンを自動除外                     │
│  ├─ Region A障害 → 全トラフィックがRegion Bへ               │
│  └─ Region B障害 → 全トラフィックがRegion Aへ               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 5.3 多層フェイルオーバー（Latency + Failover ネスト）

```
【多層フェイルオーバーアーキテクチャ】

                        Route 53
                    Latency Routing
                    ┌─────┴─────┐
                    │           │
              ap-northeast-1  us-east-1
              Failover        Failover
              ┌───┴───┐      ┌───┴───┐
              │       │      │       │
          Primary Secondary Primary Secondary
           ALB     S3-Sorry  ALB     S3-Sorry
          (東京)   (東京)    (Virginia)(Virginia)

動作:
1. 通常: レイテンシが低いリージョンのPrimary ALBに接続
2. リージョン内障害: 同リージョンのS3 Sorryページに切替
3. リージョン全体障害: 別リージョンに自動フェイルオーバー

レコード構成（4レコード必要）:
├─ tokyo-primary.example.com (Failover Primary, ap-northeast-1)
├─ tokyo-secondary.example.com (Failover Secondary, ap-northeast-1)
├─ virginia-primary.example.com (Failover Primary, us-east-1)
├─ virginia-secondary.example.com (Failover Secondary, us-east-1)
└─ app.example.com (Latency → 上記Aliasを参照)
```

### 5.4 フェイルオーバーパターン比較

| パターン | RTO | RPO | コスト | 複雑さ | ユースケース |
|---------|-----|-----|--------|--------|------------|
| **Active-Passive (S3 Sorry)** | 60秒 | N/A | 低 | ★★☆☆☆ | メンテナンスページ表示 |
| **Active-Passive (DR)** | 数分 | 数分〜数時間 | 中 | ★★★☆☆ | 通常のDR要件 |
| **Active-Active (Latency)** | 60秒 | ほぼ0 | 高 | ★★★★☆ | ミッションクリティカル |
| **多層フェイルオーバー** | 60秒 | ほぼ0 | 高 | ★★★★★ | 最高可用性要件 |

---

## 6. Route 53 Resolver

### 6.1 Route 53 Resolverの概要

```
【Route 53 Resolver アーキテクチャ】

┌─────────────────────────────────────────────────────────────┐
│                      ハイブリッドDNS環境                      │
│                                                             │
│  ┌───────────────────┐         ┌───────────────────┐       │
│  │   AWS VPC         │         │  オンプレミス      │       │
│  │                   │         │                   │       │
│  │ ┌──────────────┐  │  VPN/DX │ ┌──────────────┐  │       │
│  │ │ EC2          │  │ ←─────→ │ │ サーバ       │  │       │
│  │ │ (aws.internal│  │         │ │ (corp.local  │  │       │
│  │ │  解決可)     │  │         │ │  解決可)     │  │       │
│  │ └──────────────┘  │         │ └──────────────┘  │       │
│  │                   │         │                   │       │
│  │ ┌──────────────┐  │         │ ┌──────────────┐  │       │
│  │ │ Route 53     │  │         │ │ 社内DNS      │  │       │
│  │ │ Resolver     │  │         │ │ (Active      │  │       │
│  │ │              │  │         │ │  Directory)  │  │       │
│  │ └──────────────┘  │         │ └──────────────┘  │       │
│  └───────────────────┘         └───────────────────┘       │
│                                                             │
│  課題:                                                      │
│  ├─ VPC内からcorp.localを解決できない                       │
│  └─ オンプレからaws.internalを解決できない                   │
│                                                             │
│  解決策: Route 53 Resolver エンドポイント                    │
└─────────────────────────────────────────────────────────────┘
```

### 6.2 インバウンドエンドポイント

```
【インバウンドエンドポイント】
オンプレミス → AWS VPCのDNS名前解決を可能にする

┌── オンプレミス ──┐         ┌── AWS VPC ─────────────────────┐
│                  │         │                                │
│  社内DNS Server  │         │  Route 53 Resolver             │
│       │          │  VPN/DX │       │                        │
│       ▼          │ ───────→│  ┌────▼──────────────────┐    │
│  "api.internal   │         │  │ Inbound Endpoint      │    │
│   .example.com?" │         │  │ (ENI: 10.0.1.100)     │    │
│                  │         │  │ (ENI: 10.0.2.100)     │    │
│                  │         │  └────────────┬───────────┘    │
│                  │         │               │                │
│                  │         │               ▼                │
│                  │         │  Private Hosted Zone           │
│                  │         │  api.internal.example.com      │
│                  │         │  → 10.0.3.50 (EC2)            │
└──────────────────┘         └────────────────────────────────┘

設定手順:
1. VPC内にインバウンドエンドポイント作成（2AZ推奨）
2. オンプレDNSの条件付きフォワーダーにエンドポイントIPを設定
3. オンプレからVPC内のプライベートドメインが解決可能に
```

### 6.3 アウトバウンドエンドポイント

```
【アウトバウンドエンドポイント】
AWS VPC → オンプレミスのDNS名前解決を可能にする

┌── AWS VPC ─────────────────────┐         ┌── オンプレミス ──┐
│                                │         │                  │
│  EC2 Instance                  │         │                  │
│  "dc.corp.local?"              │         │  社内DNS Server  │
│       │                        │         │  (AD DNS)        │
│       ▼                        │  VPN/DX │       ▲          │
│  Route 53 Resolver             │ ───────→│       │          │
│       │                        │         │  "dc.corp.local" │
│  ┌────▼──────────────────┐    │         │  → 192.168.1.10  │
│  │ Outbound Endpoint     │    │         │                  │
│  │ (ENI: 10.0.1.200)     │────│────────→│                  │
│  │ (ENI: 10.0.2.200)     │    │         │                  │
│  └───────────────────────┘    │         │                  │
│       ▲                        │         │                  │
│  ┌────┴──────────────────┐    │         │                  │
│  │ Resolver Rule         │    │         │                  │
│  │ "corp.local" →        │    │         │                  │
│  │ 192.168.1.53 (転送先) │    │         │                  │
│  └───────────────────────┘    │         │                  │
└────────────────────────────────┘         └──────────────────┘

設定手順:
1. VPC内にアウトバウンドエンドポイント作成（2AZ推奨）
2. Resolverルール作成（ドメイン名→転送先DNSサーバIP）
3. VPC関連付け（ルールを適用するVPCを指定）
```

### 6.4 Resolver ルールの種類

| ルールタイプ | 説明 | ユースケース |
|------------|------|------------|
| **Forward** | 指定ドメインのクエリを外部DNSに転送 | オンプレドメインの解決 |
| **System** | Route 53 Resolverのデフォルト動作 | VPC内ドメインの解決 |
| **Recursive** | 再帰クエリ（パブリックDNS） | インターネットドメインの解決 |

```bash
# アウトバウンドエンドポイントの作成
aws route53resolver create-resolver-endpoint \
  --creator-request-id "outbound-$(date +%s)" \
  --name "outbound-to-onprem" \
  --security-group-ids "sg-0123456789abcdef0" \
  --direction "OUTBOUND" \
  --ip-addresses \
    SubnetId=subnet-0a1b2c3d4e5f67890,Ip=10.0.1.200 \
    SubnetId=subnet-1a2b3c4d5e6f78901,Ip=10.0.2.200

# インバウンドエンドポイントの作成
aws route53resolver create-resolver-endpoint \
  --creator-request-id "inbound-$(date +%s)" \
  --name "inbound-from-onprem" \
  --security-group-ids "sg-0123456789abcdef0" \
  --direction "INBOUND" \
  --ip-addresses \
    SubnetId=subnet-0a1b2c3d4e5f67890,Ip=10.0.1.100 \
    SubnetId=subnet-1a2b3c4d5e6f78901,Ip=10.0.2.100

# Resolverルール（転送ルール）の作成
aws route53resolver create-resolver-rule \
  --creator-request-id "rule-$(date +%s)" \
  --name "forward-to-onprem-dns" \
  --rule-type "FORWARD" \
  --domain-name "corp.local" \
  --resolver-endpoint-id "rslvr-out-0123456789abcdef0" \
  --target-ips "Ip=192.168.1.53,Port=53" "Ip=192.168.1.54,Port=53"

# ルールとVPCの関連付け
aws route53resolver associate-resolver-rule \
  --resolver-rule-id "rslvr-rr-0123456789abcdef0" \
  --vpc-id "vpc-0123456789abcdef0" \
  --name "associate-to-main-vpc"

# Resolverルールの共有（RAM経由でクロスアカウント共有）
aws ram create-resource-share \
  --name "dns-resolver-rules-share" \
  --resource-arns "arn:aws:route53resolver:ap-northeast-1:123456789012:resolver-rule/rslvr-rr-0123456789abcdef0" \
  --principals "arn:aws:organizations::123456789012:organization/o-abcdef1234"
```

### 6.5 Resolver Query Logging

```bash
# クエリログの設定
aws route53resolver create-resolver-query-log-config \
  --name "dns-query-log" \
  --destination-arn "arn:aws:s3:::my-dns-query-logs" \
  --creator-request-id "log-$(date +%s)"

# VPCとの関連付け
aws route53resolver associate-resolver-query-log-config \
  --resolver-query-log-config-id "rqlc-0123456789abcdef0" \
  --resource-id "vpc-0123456789abcdef0"
```

| ログ送信先 | ユースケース | コスト |
|-----------|------------|--------|
| **CloudWatch Logs** | リアルタイム分析、アラート | 中 |
| **S3** | 長期保存、コンプライアンス | 低 |
| **Kinesis Data Firehose** | ストリーム処理、SIEM連携 | 中〜高 |

---

## 7. DNSSEC

### 7.1 DNSSECの概要

```
【DNSSEC - DNS Security Extensions】

通常のDNS:
クライアント ──→ DNSリゾルバ ──→ 権威DNS
                                     │
                          応答: A 1.2.3.4
                          (改ざんされる可能性あり)

DNSSEC有効時:
クライアント ──→ DNSリゾルバ ──→ 権威DNS (Route 53)
                                     │
                          応答: A 1.2.3.4
                          + RRSIG (デジタル署名)
                          + DNSKEY (公開鍵)
                                     │
                          DNSリゾルバが署名を検証
                          → 改ざんされていないことを確認

保護対象:
├─ DNSスプーフィング（なりすまし応答）
├─ キャッシュポイズニング
└─ 中間者攻撃（DNS応答の改ざん）

Route 53でのDNSSEC:
├─ DNSSEC署名: Route 53がDNS応答に署名
├─ KMS連携: KSK（Key Signing Key）にKMSを使用
├─ ZSK: Route 53が自動管理
└─ 対応レコード: パブリックホストゾーンのみ
```

### 7.2 DNSSEC有効化手順

```
【DNSSEC有効化フロー】

Step 1: KMS CMKの作成（us-east-1必須）
         │
         ▼
Step 2: DNSSEC署名の有効化
         │
         ▼
Step 3: DSレコードの作成（親ゾーン / レジストラ）
         │
         ▼
Step 4: 信頼チェーンの確立
         │
         ▼
Step 5: 検証・テスト
```

```bash
# Step 1: KMS CMKの作成（us-east-1 必須、非対称鍵）
KMS_KEY_ID=$(aws kms create-key \
  --region us-east-1 \
  --key-spec ECC_NIST_P256 \
  --key-usage SIGN_VERIFY \
  --description "DNSSEC KSK for example.com" \
  --query 'KeyMetadata.KeyId' --output text)

# KMSキーポリシーでRoute 53アクセスを許可
aws kms create-alias \
  --region us-east-1 \
  --alias-name "alias/dnssec-example-com" \
  --target-key-id "${KMS_KEY_ID}"

# Step 2: DNSSEC署名の有効化
aws route53 create-key-signing-key \
  --hosted-zone-id Z0123456789ABCDEFGHIJ \
  --name "ksk-1" \
  --key-management-service-arn "arn:aws:kms:us-east-1:123456789012:key/${KMS_KEY_ID}" \
  --status ACTIVE

aws route53 enable-hosted-zone-dnssec \
  --hosted-zone-id Z0123456789ABCDEFGHIJ

# Step 3: DSレコード情報の取得（親ゾーン/レジストラに設定）
aws route53 get-dnssec \
  --hosted-zone-id Z0123456789ABCDEFGHIJ

# DNSSEC状態の確認
aws route53 get-dnssec \
  --hosted-zone-id Z0123456789ABCDEFGHIJ \
  --query 'Status.ServeSignature'
```

### 7.3 DNSSEC設計上の注意点

| 注意点 | 説明 |
|--------|------|
| **KMSリージョン** | KSK用KMSキーはus-east-1に作成必須 |
| **キーローテーション** | KSKは手動ローテーション、ZSKはRoute 53が自動管理 |
| **パブリックのみ** | プライベートホストゾーンではDNSSEC非対応 |
| **CNAMEチェーン** | DNSSEC有効ゾーンへのCNAMEは署名チェーンに注意 |
| **CloudWatch監視** | DNSSECInternalFailure, DNSSECKeySigningKeysNeedingActionメトリクス |
| **ロールバック** | 問題発生時はDNSSEC無効化前にDSレコードを親から削除 |

> **DOP試験ポイント**: DNSSEC無効化時の手順が重要。先にDSレコードを削除（信頼チェーン解除）→TTL待機→DNSSEC署名無効化の順序。逆にするとDNS解決に失敗する。

---

## 8. ハンズオン演習

### 8.1 演習1: ホストゾーンとレコード管理

```bash
# 1. パブリックホストゾーンの作成
aws route53 create-hosted-zone \
  --name handson-dop.example.com \
  --caller-reference "handson-$(date +%s)"

# → HostedZone.Id を記録（例: Z0123456789ABCDEFGHIJ）
# 出力例:
# {
#     "Location": "https://route53.amazonaws.com/2013-04-01/hostedzone/Z0123456789ABCDEFGHIJ",
#     "HostedZone": {
#         "Id": "/hostedzone/Z0123456789ABCDEFGHIJ",
#         "Name": "handson-dop.example.com.",
#         "CallerReference": "handson-1738660000"
#     },
#     "DelegationSet": {
#         "NameServers": [
#             "ns-123.awsdns-45.com",
#             "ns-678.awsdns-90.net",
#             "ns-1234.awsdns-12.co.uk",
#             "ns-456.awsdns-78.org"
#         ]
#     }
# }

HOSTED_ZONE_ID="Z0123456789ABCDEFGHIJ"

# 2. NSレコードの確認
aws route53 list-resource-record-sets \
  --hosted-zone-id ${HOSTED_ZONE_ID} \
  --query "ResourceRecordSets[?Type=='NS']"

# 3. Aレコードの作成
aws route53 change-resource-record-sets \
  --hosted-zone-id ${HOSTED_ZONE_ID} \
  --change-batch '{
    "Changes": [{
      "Action": "UPSERT",
      "ResourceRecordSet": {
        "Name": "web.handson-dop.example.com",
        "Type": "A",
        "TTL": 300,
        "ResourceRecords": [{"Value": "203.0.113.10"}]
      }
    }]
  }'

# 4. 変更ステータスの確認
aws route53 get-change --id "/change/C1234567890ABCDEF"
# Status: INSYNC = 完了, PENDING = 反映中

# 5. レコード一覧の確認
aws route53 list-resource-record-sets \
  --hosted-zone-id ${HOSTED_ZONE_ID}
```

### 8.2 演習2: ヘルスチェックの作成と監視

```bash
# 1. HTTPヘルスチェックの作成
HC_ID=$(aws route53 create-health-check \
  --caller-reference "handson-hc-$(date +%s)" \
  --health-check-config '{
    "Type": "HTTP",
    "FullyQualifiedDomainName": "www.example.com",
    "Port": 80,
    "ResourcePath": "/",
    "RequestInterval": 30,
    "FailureThreshold": 3
  }' --query 'HealthCheck.Id' --output text)

echo "Health Check ID: ${HC_ID}"

# 2. ヘルスチェックにタグを設定
aws route53 change-tags-for-resource \
  --resource-type healthcheck \
  --resource-id ${HC_ID} \
  --add-tags Key=Name,Value=handson-web-hc Key=Environment,Value=handson

# 3. ヘルスチェックステータスの確認
aws route53 get-health-check-status \
  --health-check-id ${HC_ID}

# 出力例:
# {
#     "HealthCheckObservations": [
#         {
#             "Region": "us-east-1",
#             "IPAddress": "15.177.62.21",
#             "StatusReport": {
#                 "Status": "Success: HTTP Status Code 200, ...",
#                 "CheckedTime": "2026-02-04T10:00:00Z"
#             }
#         },
#         ...
#     ]
# }

# 4. ヘルスチェック一覧
aws route53 list-health-checks \
  --query 'HealthChecks[].{Id:Id,Type:HealthCheckConfig.Type,FQDN:HealthCheckConfig.FullyQualifiedDomainName}'
```

### 8.3 演習3: Weighted ルーティング

```bash
HOSTED_ZONE_ID="Z0123456789ABCDEFGHIJ"

# 1. Weighted レコード - Blue (90%)
aws route53 change-resource-record-sets \
  --hosted-zone-id ${HOSTED_ZONE_ID} \
  --change-batch '{
    "Changes": [{
      "Action": "UPSERT",
      "ResourceRecordSet": {
        "Name": "app.handson-dop.example.com",
        "Type": "A",
        "SetIdentifier": "blue",
        "Weight": 90,
        "TTL": 60,
        "ResourceRecords": [{"Value": "203.0.113.10"}]
      }
    }]
  }'

# 2. Weighted レコード - Green (10%)
aws route53 change-resource-record-sets \
  --hosted-zone-id ${HOSTED_ZONE_ID} \
  --change-batch '{
    "Changes": [{
      "Action": "UPSERT",
      "ResourceRecordSet": {
        "Name": "app.handson-dop.example.com",
        "Type": "A",
        "SetIdentifier": "green",
        "Weight": 10,
        "TTL": 60,
        "ResourceRecords": [{"Value": "203.0.113.20"}]
      }
    }]
  }'

# 3. 重みの変更（カナリア → 段階的切り替え）
# Green を50%に増加
aws route53 change-resource-record-sets \
  --hosted-zone-id ${HOSTED_ZONE_ID} \
  --change-batch '{
    "Changes": [{
      "Action": "UPSERT",
      "ResourceRecordSet": {
        "Name": "app.handson-dop.example.com",
        "Type": "A",
        "SetIdentifier": "blue",
        "Weight": 50,
        "TTL": 60,
        "ResourceRecords": [{"Value": "203.0.113.10"}]
      }
    },
    {
      "Action": "UPSERT",
      "ResourceRecordSet": {
        "Name": "app.handson-dop.example.com",
        "Type": "A",
        "SetIdentifier": "green",
        "Weight": 50,
        "TTL": 60,
        "ResourceRecords": [{"Value": "203.0.113.20"}]
      }
    }]
  }'

# 4. 確認
aws route53 list-resource-record-sets \
  --hosted-zone-id ${HOSTED_ZONE_ID} \
  --query "ResourceRecordSets[?Name=='app.handson-dop.example.com.']"
```

### 8.4 演習4: Failoverルーティング + ヘルスチェック

```bash
HOSTED_ZONE_ID="Z0123456789ABCDEFGHIJ"

# 1. Primaryのヘルスチェック作成
PRIMARY_HC=$(aws route53 create-health-check \
  --caller-reference "hc-primary-$(date +%s)" \
  --health-check-config '{
    "Type": "HTTP",
    "IPAddress": "203.0.113.10",
    "Port": 80,
    "ResourcePath": "/health",
    "RequestInterval": 10,
    "FailureThreshold": 2
  }' --query 'HealthCheck.Id' --output text)

# 2. Failover Primary レコード
aws route53 change-resource-record-sets \
  --hosted-zone-id ${HOSTED_ZONE_ID} \
  --change-batch "{
    \"Changes\": [{
      \"Action\": \"UPSERT\",
      \"ResourceRecordSet\": {
        \"Name\": \"dr.handson-dop.example.com\",
        \"Type\": \"A\",
        \"SetIdentifier\": \"primary\",
        \"Failover\": \"PRIMARY\",
        \"TTL\": 60,
        \"HealthCheckId\": \"${PRIMARY_HC}\",
        \"ResourceRecords\": [{\"Value\": \"203.0.113.10\"}]
      }
    }]
  }"

# 3. Failover Secondary レコード
aws route53 change-resource-record-sets \
  --hosted-zone-id ${HOSTED_ZONE_ID} \
  --change-batch '{
    "Changes": [{
      "Action": "UPSERT",
      "ResourceRecordSet": {
        "Name": "dr.handson-dop.example.com",
        "Type": "A",
        "SetIdentifier": "secondary",
        "Failover": "SECONDARY",
        "TTL": 60,
        "ResourceRecords": [{"Value": "203.0.113.99"}]
      }
    }]
  }'

# 4. フェイルオーバー動作確認
# Primaryのヘルスチェック状態を確認
aws route53 get-health-check-status --health-check-id ${PRIMARY_HC}

# DNSレコードの確認
aws route53 test-dns-answer \
  --hosted-zone-id ${HOSTED_ZONE_ID} \
  --record-name "dr.handson-dop.example.com" \
  --record-type A
```

### 8.5 演習5: Route 53 Resolverエンドポイント

```bash
# 1. セキュリティグループの作成（DNS用）
SG_ID=$(aws ec2 create-security-group \
  --group-name "resolver-endpoint-sg" \
  --description "Security group for Route 53 Resolver endpoints" \
  --vpc-id "vpc-0123456789abcdef0" \
  --query 'GroupId' --output text)

# DNS用のインバウンドルール
aws ec2 authorize-security-group-ingress \
  --group-id ${SG_ID} \
  --protocol udp \
  --port 53 \
  --cidr 10.0.0.0/8

aws ec2 authorize-security-group-ingress \
  --group-id ${SG_ID} \
  --protocol tcp \
  --port 53 \
  --cidr 10.0.0.0/8

# 2. インバウンドエンドポイントの作成
aws route53resolver create-resolver-endpoint \
  --creator-request-id "inbound-handson-$(date +%s)" \
  --name "handson-inbound" \
  --security-group-ids "${SG_ID}" \
  --direction "INBOUND" \
  --ip-addresses \
    SubnetId=subnet-0a1b2c3d4e5f67890 \
    SubnetId=subnet-1a2b3c4d5e6f78901

# 3. アウトバウンドエンドポイントの作成
OUTBOUND_EP=$(aws route53resolver create-resolver-endpoint \
  --creator-request-id "outbound-handson-$(date +%s)" \
  --name "handson-outbound" \
  --security-group-ids "${SG_ID}" \
  --direction "OUTBOUND" \
  --ip-addresses \
    SubnetId=subnet-0a1b2c3d4e5f67890 \
    SubnetId=subnet-1a2b3c4d5e6f78901 \
  --query 'ResolverEndpoint.Id' --output text)

# 4. 転送ルールの作成
aws route53resolver create-resolver-rule \
  --creator-request-id "rule-handson-$(date +%s)" \
  --name "forward-to-onprem" \
  --rule-type "FORWARD" \
  --domain-name "corp.internal" \
  --resolver-endpoint-id "${OUTBOUND_EP}" \
  --target-ips "Ip=192.168.1.53,Port=53"

# 5. エンドポイント一覧の確認
aws route53resolver list-resolver-endpoints \
  --query 'ResolverEndpoints[].{Name:Name,Direction:Direction,Status:Status}'

# 6. ルール一覧の確認
aws route53resolver list-resolver-rules \
  --query 'ResolverRules[].{Name:Name,DomainName:DomainName,RuleType:RuleType}'
```

### 8.6 クリーンアップ

```bash
# ヘルスチェックの削除
aws route53 delete-health-check --health-check-id ${HC_ID}
aws route53 delete-health-check --health-check-id ${PRIMARY_HC}

# レコードの削除（Weighted）
aws route53 change-resource-record-sets \
  --hosted-zone-id ${HOSTED_ZONE_ID} \
  --change-batch '{
    "Changes": [
      {
        "Action": "DELETE",
        "ResourceRecordSet": {
          "Name": "app.handson-dop.example.com",
          "Type": "A",
          "SetIdentifier": "blue",
          "Weight": 50,
          "TTL": 60,
          "ResourceRecords": [{"Value": "203.0.113.10"}]
        }
      },
      {
        "Action": "DELETE",
        "ResourceRecordSet": {
          "Name": "app.handson-dop.example.com",
          "Type": "A",
          "SetIdentifier": "green",
          "Weight": 50,
          "TTL": 60,
          "ResourceRecords": [{"Value": "203.0.113.20"}]
        }
      }
    ]
  }'

# Resolverエンドポイントの削除
aws route53resolver delete-resolver-rule --resolver-rule-id "rslvr-rr-xxx"
aws route53resolver delete-resolver-endpoint --resolver-endpoint-id "rslvr-in-xxx"
aws route53resolver delete-resolver-endpoint --resolver-endpoint-id "rslvr-out-xxx"

# ホストゾーンの削除（全レコード削除後）
aws route53 delete-hosted-zone --id ${HOSTED_ZONE_ID}
```

---

## 9. DOP試験対策チェックリスト

### DNSの基礎

- [ ] Route 53の主要機能（DNS、ヘルスチェック、ドメイン登録）を説明できる
- [ ] レコードタイプ（A, AAAA, CNAME, Alias, MX, TXT, NS）の違いを理解している
- [ ] AliasレコードとCNAMEレコードの使い分けを判断できる

<details>
<summary>模範解答を見る</summary>

**Route 53の主要機能**:
1. **DNS**: 権威DNSサービスとして名前解決を提供（100% SLA）
2. **ヘルスチェック**: エンドポイントの可用性監視とDNSフェイルオーバー
3. **ドメイン登録**: ドメイン名の購入・更新・移管
4. **Resolver**: ハイブリッドDNS（VPCとオンプレミス間のDNS解決）

**Alias vs CNAME**:
- **Alias**: Zone Apexに使用可能、AWSリソース宛は無料、Route 53独自機能
- **CNAME**: Zone Apexに使用不可、追加DNSクエリ発生、標準DNS規格
- 判断基準: AWSリソースへのマッピングならAlias、外部サービスならCNAME

**Zone Apex（ネイキッドドメイン）**:
- `example.com`（wwwなし）をAWSリソースにマッピングする場合、Aliasが唯一の選択肢
- CNAMEをZone Apexに設定するとDNS規格違反（RFC 1034）
</details>

### ルーティングポリシー

- [ ] 7種類のルーティングポリシーの違いを説明できる
- [ ] ユースケースに応じた最適なルーティングポリシーを選択できる
- [ ] ルーティングポリシーのネスト（組み合わせ）を設計できる

<details>
<summary>模範解答を見る</summary>

**ルーティングポリシーの選択基準**:

| シナリオ | 最適なポリシー |
|---------|-------------|
| 単一サーバに接続 | Simple |
| カナリアリリース（10%→50%→100%） | Weighted |
| マルチリージョンで最速応答 | Latency |
| DR構成（Primary/Secondary） | Failover |
| 国別コンテンツ配信 | Geolocation |
| リージョン間の段階的トラフィック移行 | Geoproximity |
| 簡易負荷分散 + ヘルスチェック | Multivalue |

**ネストの典型パターン**:
- **Latency + Failover**: マルチリージョン + 各リージョンでDR
- **Geolocation + Weighted**: 地域別にカナリアリリース
- **Latency + Weighted**: レイテンシベースの選択後にカナリア

**Weighted vs Multivalue**:
- Weighted: トラフィック比率を厳密に制御（カナリアデプロイ向き）
- Multivalue: ヘルスチェック付きの均等分散（簡易LB向き）
</details>

### ヘルスチェック

- [ ] エンドポイント、CloudWatchアラーム、計算されたヘルスチェックの違いを理解している
- [ ] プライベートリソースのヘルスチェック方法を説明できる
- [ ] ヘルスチェックメトリクスがus-east-1のみで発行されることを知っている

<details>
<summary>模範解答を見る</summary>

**ヘルスチェックの種類**:
1. **エンドポイント**: HTTP/HTTPS/TCPで直接監視、パブリックアクセス必要
2. **CloudWatchアラーム**: アラーム状態と連携、プライベートリソース対応
3. **計算(Calculated)**: 複数のヘルスチェックを論理演算で組み合わせ

**プライベートリソースの監視パターン**:
```
プライベートEC2/RDS
     │
     ▼ CloudWatch Agent
CloudWatch Metric
     │
     ▼
CloudWatch Alarm
     │
     ▼
Route 53 Health Check (CLOUDWATCH_METRIC type)
     │
     ▼
DNS Failover
```
- ヘルスチェッカーはパブリックIPからアクセスするため、プライベートリソースは直接監視不可
- CloudWatchアラーム連携で間接監視が唯一の方法

**InsufficientDataHealthStatus設定**:
- `Healthy`: データ不足時にHealthy扱い（楽観的）
- `Unhealthy`: データ不足時にUnhealthy扱い（保守的）
- `LastKnownStatus`: 最後の既知状態を維持（推奨）

**重要注意事項**:
- ヘルスチェックのCloudWatchメトリクスは **us-east-1リージョンのみ** に発行
- アラーム作成時は必ず `--region us-east-1` を指定
</details>

### フェイルオーバー設計

- [ ] Active-PassiveとActive-Activeの違いを設計観点で説明できる
- [ ] S3静的サイトを使ったSorryページ構成を実装できる
- [ ] 多層フェイルオーバー（Latency + Failover）を設計できる

<details>
<summary>模範解答を見る</summary>

**Active-Passive vs Active-Active**:

| 観点 | Active-Passive | Active-Active |
|------|---------------|---------------|
| リソース | Primary + Standby | 両方アクティブ |
| コスト | Standby分が遊休 | 効率的に利用 |
| RTO | TTL + 伝播時間 | ほぼ0（自動除外） |
| RPO | データ同期頻度に依存 | レプリケーション遅延分 |
| 複雑さ | 低〜中 | 中〜高 |
| ルーティング | Failover | Latency/Weighted |

**S3 Sorryページ構成**:
1. S3バケットを静的ウェブサイトホスティングで設定
2. Route 53でFailover Secondaryレコードを作成
3. S3ウェブサイトエンドポイントをAliasターゲットに指定
4. 注意: S3バケット名はドメイン名と一致させる必要あり

**多層フェイルオーバーの実装方法**:
- Aliasレコードのチェーンを利用
- 各リージョンにFailover Primary/Secondaryを設定
- 上位のLatencyレコードが各リージョンのFailoverレコードをAlias参照
- TTLは60秒以下を推奨
</details>

### Route 53 Resolver

- [ ] インバウンドとアウトバウンドエンドポイントの違いを説明できる
- [ ] ハイブリッドDNS環境のアーキテクチャを設計できる
- [ ] Resolverルールの共有（RAM）を理解している

<details>
<summary>模範解答を見る</summary>

**インバウンド vs アウトバウンドエンドポイント**:

| 方向 | 用途 | DNS クエリの流れ |
|------|------|----------------|
| **Inbound** | オンプレ → VPCのDNS解決 | オンプレDNS → Inbound EP → Route 53 |
| **Outbound** | VPC → オンプレのDNS解決 | EC2 → Outbound EP → オンプレDNS |

**ハイブリッドDNS設計のベストプラクティス**:
1. 各方向にエンドポイントを2AZに配置（高可用性）
2. アウトバウンドルールは具体的なドメイン名を指定（ワイルドカード回避）
3. セキュリティグループでDNSポート（53/TCP, 53/UDP）のみ許可
4. RAM（Resource Access Manager）でルールをOrganization全体に共有

**クロスアカウント共有パターン**:
```
中央ネットワークアカウント
├─ Resolverエンドポイント作成
├─ Resolverルール作成
└─ RAMで全アカウントにルール共有
     │
     ├─ アカウントA: VPC関連付け
     ├─ アカウントB: VPC関連付け
     └─ アカウントC: VPC関連付け
```
- RAM共有により各アカウントでルールの再作成不要
- 一元管理でDNS設定の一貫性を確保
</details>

### DNSSEC

- [ ] DNSSECの目的と保護対象を説明できる
- [ ] Route 53でのDNSSEC有効化手順を知っている
- [ ] DNSSEC無効化時の正しい手順を理解している

<details>
<summary>模範解答を見る</summary>

**DNSSECの目的**:
- DNS応答の真正性と完全性を暗号学的に検証
- DNSスプーフィング、キャッシュポイズニングからの保護
- 中間者攻撃によるDNS応答改ざんの防止

**有効化手順**:
1. KMS CMK作成（us-east-1、ECC_NIST_P256、SIGN_VERIFY用途）
2. KSK（Key Signing Key）作成
3. DNSSEC署名の有効化
4. DSレコードを親ゾーン/レジストラに設定
5. 信頼チェーンの確立と検証

**無効化手順（順序が重要）**:
1. 親ゾーン/レジストラからDSレコードを削除
2. DSレコードのTTL期間待機（キャッシュ消失を待つ）
3. Route 53でDNSSEC署名を無効化
4. KSKの無効化/削除

逆にすると: 親ゾーンがDNSSECを期待 → 署名なし応答 → 検証失敗 → DNS解決不能

**制約事項**:
- パブリックホストゾーンのみ対応
- KMS CMKはus-east-1必須
- ZSKはRoute 53が自動管理（ローテーション含む）
- KSKは手動でローテーション管理
</details>

### 実践シナリオ

- [ ] Blue/Greenデプロイメントを Route 53 Weighted で実現する手順を説明できる
- [ ] マルチリージョンDR構成のDNS設計ができる
- [ ] DNS移行時のTTL戦略を立案できる

<details>
<summary>模範解答を見る</summary>

**Blue/Green デプロイ with Weighted ルーティング**:
```
Step 1: Blue=100, Green=0     (Blue のみ)
Step 2: Blue=90,  Green=10    (カナリア10%)
Step 3: Blue=50,  Green=50    (50/50分散)
Step 4: Blue=0,   Green=100   (Green完全切替)
Step 5: Blue環境削除
```
- TTLは60秒以下に設定
- 各ステップ間で動作確認
- 問題発生時はWeightを即座に戻してロールバック

**マルチリージョンDR構成**:
```
Route 53 (Latency Routing)
├─ ap-northeast-1
│   └─ Failover
│       ├─ Primary: ALB (東京)
│       └─ Secondary: S3 Sorry Page
└─ us-east-1
    └─ Failover
        ├─ Primary: ALB (Virginia)
        └─ Secondary: S3 Sorry Page
```
- Auroraグローバルデータベースでデータレプリケーション
- ヘルスチェック間隔: 10秒（Fast）
- TTL: 60秒

**DNS移行のTTL戦略**:
```
T-48h: TTLを300秒 → 60秒に短縮
T-0h:  DNSレコード切り替え実施
T+2h:  問題なければTTLを元に戻す（300秒）
T+24h: 旧環境のリソース削除
```
- 移行前にTTLを下げることで、切り替え時のキャッシュ残存を最小化
- 高TTLのまま移行すると、旧IPへのアクセスがTTL期間継続する
</details>

### 料金とクォータ

- [ ] Route 53の主要な料金体系を理解している
- [ ] サービスクォータ（レコード数上限等）を把握している

<details>
<summary>模範解答を見る</summary>

**料金体系**:
| 項目 | 料金 |
|------|------|
| ホストゾーン | $0.50/ゾーン/月（最初の25ゾーン） |
| 標準クエリ | $0.40/100万クエリ |
| Latency/Geoクエリ | $0.60/100万クエリ |
| Aliasクエリ（AWS宛） | 無料 |
| ヘルスチェック（HTTP） | $0.50/チェック/月 |
| ヘルスチェック（HTTPS+文字列） | $2.00/チェック/月 |
| ヘルスチェック（Fast 10秒） | 追加料金あり |
| Resolverエンドポイント | $0.125/ENI/時間 |
| Resolverクエリ | $0.40/100万クエリ |

**主要クォータ**:
| リソース | デフォルト上限 |
|---------|-------------|
| ホストゾーン | 500/アカウント |
| レコード/ゾーン | 10,000 |
| ヘルスチェック | 200/アカウント |
| Resolverエンドポイント | 4/リージョン |
| Resolverルール | 1,000/リージョン |

**コスト最適化のポイント**:
- AWSリソースへはAliasレコードを使用（クエリ無料）
- 不要なヘルスチェックは削除（特にHTTPS+文字列は高額）
- トラフィックフローのポリシーレコードは$50/月/ポリシー
</details>

---

## 付録A: よく使うCLIコマンド

```bash
# ホストゾーン関連
aws route53 list-hosted-zones
aws route53 create-hosted-zone --name example.com --caller-reference "ref-123"
aws route53 get-hosted-zone --id Z0123456789ABCDEFGHIJ
aws route53 delete-hosted-zone --id Z0123456789ABCDEFGHIJ

# レコード関連
aws route53 list-resource-record-sets --hosted-zone-id Z0123456789ABCDEFGHIJ
aws route53 change-resource-record-sets --hosted-zone-id Z0123456789ABCDEFGHIJ --change-batch file://changes.json
aws route53 test-dns-answer --hosted-zone-id Z0123456789ABCDEFGHIJ --record-name www.example.com --record-type A

# ヘルスチェック関連
aws route53 list-health-checks
aws route53 create-health-check --caller-reference "ref-hc" --health-check-config file://hc-config.json
aws route53 get-health-check-status --health-check-id HC_ID
aws route53 delete-health-check --health-check-id HC_ID

# Resolver関連
aws route53resolver list-resolver-endpoints
aws route53resolver list-resolver-rules
aws route53resolver create-resolver-endpoint --direction INBOUND --ip-addresses ...
aws route53resolver create-resolver-rule --rule-type FORWARD --domain-name corp.local ...

# DNSSEC関連
aws route53 get-dnssec --hosted-zone-id Z0123456789ABCDEFGHIJ
aws route53 enable-hosted-zone-dnssec --hosted-zone-id Z0123456789ABCDEFGHIJ
aws route53 create-key-signing-key --hosted-zone-id Z0123456789ABCDEFGHIJ --name ksk-1 ...

# クエリログ関連
aws route53 create-query-logging-config --hosted-zone-id Z0123456789ABCDEFGHIJ --cloud-watch-logs-log-group-arn ...
aws route53resolver create-resolver-query-log-config --name dns-log --destination-arn ...
```

---

## 付録B: Route 53 トラブルシューティング

| 問題 | 原因 | 対処法 |
|------|------|--------|
| DNS解決が遅い | TTLが短すぎる | 適切なTTLに調整（静的は長く） |
| フェイルオーバーが遅い | TTLが長い | TTLを60秒以下に設定 |
| ヘルスチェックが常にUnhealthy | SGでブロック | Route 53のヘルスチェッカーIP許可 |
| プライベートリソースの監視不可 | パブリックアクセス不可 | CloudWatchアラーム連携を使用 |
| Aliasレコードが作成できない | ターゲットが異なるリージョン | リージョン制約を確認 |
| DNSSEC有効化エラー | KMSキーの設定不備 | us-east-1、ECC_NIST_P256を確認 |
| Resolver接続エラー | SG/NACLの設定不備 | Port 53 (TCP/UDP) を許可 |

---

## 付録C: 参考リンク

- [Route 53 開発者ガイド](https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/)
- [Route 53 API リファレンス](https://docs.aws.amazon.com/Route53/latest/APIReference/)
- [Route 53 Resolver ユーザーガイド](https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/resolver.html)
- [Route 53 DNSSEC ガイド](https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/dns-configuring-dnssec.html)
- [Route 53 ヘルスチェックの仕組み](https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/dns-failover-determining-health-of-endpoints.html)
- [Route 53 料金ページ](https://aws.amazon.com/route53/pricing/)

---

**作成日**: 2026-02-04
**最終更新**: 2026-02-04
**検証環境**: AWS ap-northeast-1 リージョン
