# AWS Secrets Manager ハンズオンガイド

> **対象**: AWS DevOps Professional (DOP-C02) 試験対策
> **前提知識**: AWS基礎、IAM、KMS、RDS、Lambda、CloudFormation
> **所要時間**: 約2.5時間

---

## 目次

1. [Secrets Manager概要](#1-secrets-manager概要)
2. [DOP試験での重要ポイント](#2-dop試験での重要ポイント)
3. [シークレットの構造とバージョニング](#3-シークレットの構造とバージョニング)
4. [自動ローテーション](#4-自動ローテーション)
5. [Parameter Storeとの比較](#5-parameter-storeとの比較)
6. [クロスアカウント・クロスリージョン](#6-クロスアカウントクロスリージョン)
7. [AWSサービスとの統合](#7-awsサービスとの統合)
8. [ハンズオン演習](#8-ハンズオン演習)
9. [DOP試験対策チェックリスト](#9-dop試験対策チェックリスト)

---

## 1. Secrets Manager概要

### 1.1 Secrets Managerとは

```
┌─────────────────────────────────────────────────────────────────────┐
│                    AWS Secrets Manager                               │
│          シークレットの管理・取得・ローテーションサービス             │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                 管理可能なシークレット                          │  │
│  │                                                               │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │  │
│  │  │ データベース  │  │ APIキー      │  │ OAuthトークン│       │  │
│  │  │ 認証情報      │  │              │  │              │       │  │
│  │  │              │  │ サードパーティ│  │ アクセス     │       │  │
│  │  │ RDS/Aurora   │  │ サービスの   │  │ トークン     │       │  │
│  │  │ Redshift     │  │ 認証キー     │  │ リフレッシュ │       │  │
│  │  │ DocumentDB   │  │              │  │ トークン     │       │  │
│  │  └──────────────┘  └──────────────┘  └──────────────┘       │  │
│  │                                                               │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │  │
│  │  │ SSH鍵        │  │ TLSクライアント│ │ その他任意の │       │  │
│  │  │              │  │ 証明書       │  │ テキスト/    │       │  │
│  │  │ プライベート  │  │              │  │ バイナリデータ│      │  │
│  │  │ キー         │  │ PEMファイル  │  │ (最大64KB)  │       │  │
│  │  └──────────────┘  └──────────────┘  └──────────────┘       │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  主要機能:                                                          │
│  ・自動ローテーション（Lambda関数 or マネージドローテーション）      │
│  ・KMSによるエンベロープ暗号化                                      │
│  ・リソースベースポリシーによるクロスアカウント共有                  │
│  ・マルチリージョンレプリケーション                                  │
│  ・CloudFormation動的参照による安全なデプロイ                        │
│                                                                     │
│  料金: $0.40/シークレット/月 + $0.05/10,000 APIコール               │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.2 全体アーキテクチャ

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│  アプリケーション                     AWS Secrets Manager            │
│  ┌──────────────┐                   ┌──────────────────────────┐   │
│  │ EC2/ECS/     │  GetSecretValue   │                          │   │
│  │ Lambda/      │ ─────────────────▶│  シークレット            │   │
│  │ CodeBuild    │                   │  ┌────────────────────┐  │   │
│  │              │ ◀─────────────────│  │ SecretString/      │  │   │
│  │              │  JSON認証情報      │  │ SecretBinary       │  │   │
│  └──────────────┘                   │  │                    │  │   │
│                                     │  │ バージョン管理     │  │   │
│                                     │  │ AWSCURRENT         │  │   │
│                                     │  │ AWSPREVIOUS        │  │   │
│                                     │  │ AWSPENDING         │  │   │
│                                     │  └────────────────────┘  │   │
│                                     │           │              │   │
│                                     │           │ 暗号化       │   │
│                                     │           ▼              │   │
│  ┌──────────────┐                   │  ┌────────────────────┐  │   │
│  │   AWS KMS    │ ◀────────────────│  │ エンベロープ暗号化 │  │   │
│  │              │  GenerateDataKey  │  │ データキーで保護   │  │   │
│  │ aws/secrets  │  / Decrypt        │  └────────────────────┘  │   │
│  │ manager      │                   │           │              │   │
│  │ or CMK       │                   │           │ ローテーション│  │
│  └──────────────┘                   │           ▼              │   │
│                                     │  ┌────────────────────┐  │   │
│  ┌──────────────┐                   │  │ Lambda関数         │  │   │
│  │ RDS/Aurora   │ ◀────────────────│  │ (自動ローテーション)│  │   │
│  │ Redshift     │  認証情報更新     │  └────────────────────┘  │   │
│  │ DocumentDB   │                   │                          │   │
│  └──────────────┘                   └──────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. DOP試験での重要ポイント

| トピック | 重要度 | 出題パターン |
|---------|--------|-------------|
| **自動ローテーション** | ★★★★★ | Lambda関数によるローテーション設定、スケジュール |
| **RDS認証情報ローテーション** | ★★★★★ | シングルユーザー vs マルチユーザー戦略 |
| **CloudFormation動的参照** | ★★★★★ | `{{resolve:secretsmanager:...}}` の使い方 |
| **クロスアカウント共有** | ★★★★★ | リソースベースポリシーの設定 |
| **Parameter Storeとの使い分け** | ★★★★★ | コスト・機能・ローテーション要否 |
| **バージョニングとステージングラベル** | ★★★★☆ | AWSCURRENT / AWSPENDING / AWSPREVIOUS |
| **マルチリージョンシークレット** | ★★★★☆ | DR対応、レプリカシークレット |
| **ECS/Lambda統合** | ★★★★☆ | タスク定義でのシークレット参照 |
| **KMS CMKによる暗号化** | ★★★☆☆ | カスタムキーの指定、クロスアカウント暗号化 |
| **コスト最適化** | ★★★☆☆ | Secrets Manager vs Parameter Store のコスト比較 |

---

## 3. シークレットの構造とバージョニング

### 3.1 シークレットの構造

```
【Secrets Managerシークレットの構成要素】

┌─────────────────────────────────────────────────────────────────────┐
│ シークレット (Secret)                                                │
│                                                                     │
│  メタデータ (暗号化されない)                                         │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ ・Name:  prod/myapp/database                                │   │
│  │ ・ARN:   arn:aws:secretsmanager:ap-northeast-1:123456:      │   │
│  │          secret:prod/myapp/database-AbCdEf                  │   │
│  │ ・Description: 本番環境DB認証情報                            │   │
│  │ ・KmsKeyId: arn:aws:kms:...:key/xxxx (暗号化キー)           │   │
│  │ ・RotationEnabled: true                                     │   │
│  │ ・RotationLambdaARN: arn:aws:lambda:...:function:rotate-fn  │   │
│  │ ・Tags: Environment=prod, Team=backend                      │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  シークレット値 (暗号化される)                                       │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ SecretString (テキスト) ← JSON形式が推奨                    │   │
│  │ {                                                           │   │
│  │   "username": "admin",                                      │   │
│  │   "password": "my-secret-password",                         │   │
│  │   "engine": "mysql",                                        │   │
│  │   "host": "mydb.cluster-xxx.ap-northeast-1.rds.amazonaws.com",│ │
│  │   "port": 3306,                                             │   │
│  │   "dbname": "myapp"                                         │   │
│  │ }                                                           │   │
│  │                                                             │   │
│  │ SecretBinary (バイナリ) ← テキスト以外のデータ用            │   │
│  │ ※ SecretStringとSecretBinaryは排他的（同時使用不可）        │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  最大サイズ: 64KB (SecretString / SecretBinary)                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.2 バージョニングとステージングラベル

```
【バージョン管理の仕組み】

シークレット: prod/myapp/database

┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│  バージョン一覧 (VersionIdsToStages)                                │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ VersionId: abc-111   │ ラベル: (なし)                       │   │
│  │ 状態: 古いバージョン（ラベルなしは自動削除対象）             │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ VersionId: abc-222   │ ラベル: AWSPREVIOUS                  │   │
│  │ 状態: 1つ前のバージョン（ロールバック用に保持）              │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ VersionId: abc-333   │ ラベル: AWSCURRENT ← デフォルト取得  │   │
│  │ 状態: 現在のアクティブバージョン                              │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ VersionId: abc-444   │ ラベル: AWSPENDING                   │   │
│  │ 状態: ローテーション中の新バージョン（検証中）               │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

ステージングラベルの動作:
  AWSCURRENT  : GetSecretValueでデフォルト返却されるバージョン
  AWSPENDING  : ローテーション中に作成される新バージョン
  AWSPREVIOUS : ローテーション完了後、前のAWSCURRENTが移動
  カスタムラベル: ユーザー定義のラベルも付与可能
```

### 3.3 ステージングラベルの遷移（ローテーション時）

```
【ローテーション時のラベル遷移】

■ ローテーション開始前:
  Version-A  [AWSCURRENT]     ← アプリが使用中
  Version-X  [AWSPREVIOUS]    ← 前回のバージョン

■ Step 1: createSecret
  Version-A  [AWSCURRENT]     ← アプリが使用中
  Version-B  [AWSPENDING]     ← 新パスワード生成、まだDB未反映
  Version-X  [AWSPREVIOUS]

■ Step 2: setSecret
  Version-A  [AWSCURRENT]     ← アプリが使用中
  Version-B  [AWSPENDING]     ← DBの認証情報を更新
  Version-X  [AWSPREVIOUS]

■ Step 3: testSecret
  Version-A  [AWSCURRENT]     ← アプリが使用中
  Version-B  [AWSPENDING]     ← 新認証情報でDB接続テスト
  Version-X  [AWSPREVIOUS]

■ Step 4: finishSecret
  Version-A  [AWSPREVIOUS]    ← ラベル移動（ロールバック用に保持）
  Version-B  [AWSCURRENT]     ← アプリが使用開始
  Version-X  (ラベルなし)      ← 後日自動削除
```

**DOP重要ポイント**:
- `GetSecretValue`はデフォルトで`AWSCURRENT`を返す
- `VersionStage`パラメータで`AWSPREVIOUS`や`AWSPENDING`を指定取得可能
- ラベルなしバージョンはSecrets Managerが自動的にクリーンアップ
- カスタムラベルを使って、Blue/Greenデプロイメントパターンも実装可能

---

## 4. 自動ローテーション

### 4.1 ローテーション方式の概要

```
┌─────────────────────────────────────────────────────────────────────┐
│                    ローテーション方式                                 │
│                                                                     │
│  ┌───────────────────────────┐  ┌─────────────────────────────────┐│
│  │  マネージドローテーション   │  │  Lambda関数ローテーション       ││
│  │  (Managed Rotation)       │  │  (Lambda Function Rotation)     ││
│  │                           │  │                                 ││
│  │ ・RDS/Aurora/Redshift/    │  │ ・RDS/Aurora/Redshift/          ││
│  │   DocumentDB等のマネージド│  │   DocumentDB                    ││
│  │   シークレットに対応      │  │ ・その他のDB/サービス           ││
│  │ ・Lambda関数不要          │  │ ・カスタムシークレット          ││
│  │ ・Secrets Manager が自動管理│ │ ・Lambda関数が必要              ││
│  │ ・追加のLambdaコスト不要  │  │ ・4ステップ処理                 ││
│  │                           │  │   (create/set/test/finish)      ││
│  └───────────────────────────┘  └─────────────────────────────────┘│
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │  マネージド外部シークレットローテーション                       ││
│  │  (Managed External Secrets Rotation)                            ││
│  │                                                                 ││
│  │ ・Secrets Managerパートナーが管理するシークレット               ││
│  │ ・パートナーシステム上でシークレットを更新                      ││
│  │ ・Lambda関数不要                                                ││
│  └─────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────┘
```

### 4.2 Lambda関数ローテーションの詳細フロー

```
【Lambda関数ローテーション 4ステップ処理】

Secrets Manager          Lambda関数              データベース
     │                      │                        │
     │  Step 1: createSecret│                        │
     │─────────────────────▶│                        │
     │                      │                        │
     │  get_secret_value    │                        │
     │◀─────────────────────│ (AWSCURRENT取得)       │
     │─────────────────────▶│                        │
     │                      │                        │
     │  get_random_password │                        │
     │◀─────────────────────│ (新パスワード生成)     │
     │─────────────────────▶│                        │
     │                      │                        │
     │  put_secret_value    │                        │
     │◀─────────────────────│ (AWSPENDING作成)       │
     │─────────────────────▶│                        │
     │                      │                        │
     │  Step 2: setSecret   │                        │
     │─────────────────────▶│                        │
     │                      │  ALTER USER/SET PASSWORD│
     │                      │───────────────────────▶│
     │                      │◀───────────────────────│
     │                      │  (DB認証情報を更新)    │
     │                      │                        │
     │  Step 3: testSecret  │                        │
     │─────────────────────▶│                        │
     │                      │  接続テスト            │
     │  get_secret_value    │  (AWSPENDING認証情報)  │
     │◀─────────────────────│───────────────────────▶│
     │─────────────────────▶│◀───────────────────────│
     │                      │  接続成功!             │
     │                      │                        │
     │  Step 4: finishSecret│                        │
     │─────────────────────▶│                        │
     │                      │                        │
     │  update_secret_      │                        │
     │  version_stage       │                        │
     │◀─────────────────────│                        │
     │  AWSPENDING→AWSCURRENT                        │
     │  AWSCURRENT→AWSPREVIOUS                       │
     │                      │                        │
     ▼                      ▼                        ▼
```

### 4.3 シングルユーザー vs マルチユーザーローテーション

```
【シングルユーザーローテーション戦略】

  ┌──────────────┐     ┌──────────────┐
  │ Secret       │     │ Database     │
  │              │     │              │
  │ user: admin  │────▶│ user: admin  │
  │ pass: passA  │     │ pass: passA  │
  └──────┬───────┘     └──────────────┘
         │ ローテーション
         ▼
  ┌──────────────┐     ┌──────────────┐
  │ Secret       │     │ Database     │
  │              │     │              │
  │ user: admin  │────▶│ user: admin  │
  │ pass: passB  │     │ pass: passB  │
  └──────────────┘     └──────────────┘

  特徴:
  ・1つのユーザーのパスワードを直接変更
  ・ローテーション中の短時間、接続失敗の可能性あり
  ・設定がシンプル
  ・シークレット1つのみ必要


【マルチユーザー（交互）ローテーション戦略】

  ┌──────────────┐     ┌──────────────┐
  │ Secret       │     │ Database     │
  │              │     │              │
  │ user: appA   │────▶│ user: appA   │  ← アクティブ
  │ pass: passA  │     │ pass: passA  │
  └──────────────┘     │              │
                       │ user: appA_clone│ ← 待機中
  ┌──────────────┐     │ pass: passX  │
  │ Master Secret│     │              │
  │ (管理者用)   │────▶│ user: master │  ← クローン作成用
  │              │     │ pass: masterP│
  └──────────────┘     └──────────────┘

  ローテーション後:

  ┌──────────────┐     ┌──────────────┐
  │ Secret       │     │ Database     │
  │              │     │              │
  │ user: appA_clone│─▶│ user: appA   │  ← 待機中
  │ pass: passB  │     │ pass: passA  │
  └──────────────┘     │              │
                       │ user: appA_clone│ ← アクティブ
                       │ pass: passB  │
                       └──────────────┘

  特徴:
  ・2つのユーザーを交互に切替（ダウンタイムなし）
  ・マスターシークレット（管理者認証情報）が別途必要
  ・マスターがクローンユーザーの作成・パスワード変更を実行
  ・高可用性が求められる本番環境に推奨
```

**DOP重要ポイント**:
- **シングルユーザー**: 設定シンプル、ローテーション中に短時間の認証失敗リスクあり
- **マルチユーザー**: ダウンタイムなし、別途マスターシークレットが必要
- DOP試験では「ダウンタイムなしでローテーションするには？」→ マルチユーザー戦略

### 4.4 ローテーション対応データベース

```
【マネージドローテーション対応サービス】

┌──────────────────┬──────────────────────────────────────────────┐
│ サービス          │ ローテーション方式                            │
├──────────────────┼──────────────────────────────────────────────┤
│ Amazon RDS       │ マネージド / シングル / マルチユーザー        │
│ Amazon Aurora    │ マネージド / シングル / マルチユーザー        │
│ Amazon Redshift  │ マネージド / シングル / マルチユーザー        │
│ Amazon DocumentDB│ マネージド / シングル / マルチユーザー        │
│ Amazon ElastiCache│ マネージドローテーション                     │
│ その他DB/サービス│ カスタムLambda関数                            │
└──────────────────┴──────────────────────────────────────────────┘

※ マネージドローテーション: Lambda関数不要、Secrets Manager が内部処理
※ Lambda関数ローテーション: AWSが提供するテンプレートをカスタマイズ可能
```

### 4.5 ローテーションスケジュール

```
ローテーションスケジュール設定:

1. 日数指定 (AutomaticallyAfterDays)
   例: 30日ごと → --rotation-rules AutomaticallyAfterDays=30

2. スケジュール式 (ScheduleExpression)
   例: 毎月1日 → --rotation-rules ScheduleExpression="cron(0 16 1 * ? *)"
   例: 4時間ごと → --rotation-rules ScheduleExpression="rate(4 hours)"

   ※ ScheduleExpressionの方が柔軟
   ※ 両方指定した場合はScheduleExpressionが優先

3. ローテーションウィンドウ (Duration)
   例: 3時間以内 → Duration="3h"
   デフォルト: 期限切れまでの全時間
```

---

## 5. Parameter Storeとの比較

### 5.1 詳細比較表

```
┌───────────────────────┬──────────────────────┬──────────────────────┐
│ 機能                  │ Secrets Manager      │ Parameter Store      │
│                       │                      │ (SecureString)       │
├───────────────────────┼──────────────────────┼──────────────────────┤
│ 主な用途              │ シークレット管理     │ 設定値・パラメータ   │
│                       │ (認証情報、APIキー)  │ 管理                 │
├───────────────────────┼──────────────────────┼──────────────────────┤
│ 自動ローテーション    │ ○ (ネイティブ)      │ × (自前実装が必要)  │
├───────────────────────┼──────────────────────┼──────────────────────┤
│ RDS統合ローテーション │ ○ (マネージド)      │ ×                   │
├───────────────────────┼──────────────────────┼──────────────────────┤
│ クロスアカウント共有  │ ○ (リソースポリシー)│ ○ (RAM/IAM)        │
├───────────────────────┼──────────────────────┼──────────────────────┤
│ マルチリージョン複製  │ ○ (レプリカ)        │ ×                   │
├───────────────────────┼──────────────────────┼──────────────────────┤
│ バージョニング        │ ○ (ステージラベル)  │ ○ (バージョンID)   │
├───────────────────────┼──────────────────────┼──────────────────────┤
│ 暗号化                │ 必須 (KMS)           │ SecureStringのみ     │
│                       │                      │ (String/StringList   │
│                       │                      │  は暗号化なし)       │
├───────────────────────┼──────────────────────┼──────────────────────┤
│ 最大サイズ            │ 64 KB                │ Standard: 4 KB       │
│                       │                      │ Advanced: 8 KB       │
├───────────────────────┼──────────────────────┼──────────────────────┤
│ 階層構造              │ × (名前にパス可)    │ ○ (/app/db/host)    │
├───────────────────────┼──────────────────────┼──────────────────────┤
│ CloudFormation参照    │ {{resolve:           │ {{resolve:ssm:...}}  │
│                       │  secretsmanager:...}}│ {{resolve:           │
│                       │                      │  ssm-secure:...}}    │
├───────────────────────┼──────────────────────┼──────────────────────┤
│ ECS統合               │ ○ (secrets)         │ ○ (secrets)         │
├───────────────────────┼──────────────────────┼──────────────────────┤
│ Lambda統合            │ ○ (拡張機能)        │ ○ (拡張機能)        │
├───────────────────────┼──────────────────────┼──────────────────────┤
│ リソースベースポリシー│ ○                   │ ×                   │
├───────────────────────┼──────────────────────┼──────────────────────┤
│ パラメータ数上限      │ 500,000              │ Standard: 10,000     │
│                       │                      │ Advanced: 100,000    │
├───────────────────────┼──────────────────────┼──────────────────────┤
│ 料金                  │ $0.40/シークレット/月│ Standard: 無料       │
│                       │ +$0.05/10K APIコール │ Advanced: $0.05/     │
│                       │                      │ パラメータ/月        │
│                       │                      │ API: 無料(Standard)  │
├───────────────────────┼──────────────────────┼──────────────────────┤
│ スループット上限      │ 5,000 TPS            │ Standard: 40 TPS     │
│                       │                      │ Advanced: 1,000 TPS  │
└───────────────────────┴──────────────────────┴──────────────────────┘
```

### 5.2 使い分け判断フロー

```
【Secrets Manager vs Parameter Store 判断フロー】

シークレットの管理が必要？
    │
    ├── Yes: 自動ローテーションが必要？
    │         │
    │         ├── Yes → Secrets Manager
    │         │         (RDS認証情報、API キー等)
    │         │
    │         └── No: コスト重視？
    │                  │
    │                  ├── Yes → Parameter Store (SecureString)
    │                  │         (低コスト、基本機能で十分)
    │                  │
    │                  └── No → Secrets Manager
    │                           (クロスリージョン、リソースポリシーが必要)
    │
    └── No: 設定値・パラメータ管理？
              │
              ├── Yes → Parameter Store (String/StringList)
              │         (アプリ設定、機能フラグ等)
              │
              └── 暗号化不要な設定 → Parameter Store (String)
```

**DOP試験での判断ポイント**:
- 「DB認証情報の自動ローテーション」→ **Secrets Manager**
- 「アプリケーション設定値の一元管理」→ **Parameter Store**
- 「コストを最小限に抑えたシークレット管理」→ **Parameter Store SecureString**
- 「クロスリージョンDRでシークレットが必要」→ **Secrets Manager（レプリカ）**
- 「リソースベースポリシーでクロスアカウント共有」→ **Secrets Manager**

---

## 6. クロスアカウント・クロスリージョン

### 6.1 クロスアカウントアクセスパターン

```
【リソースベースポリシーによるクロスアカウントアクセス】

Account A (シークレット所有者)         Account B (利用者)
┌────────────────────────┐           ┌────────────────────────┐
│                        │           │                        │
│  Secrets Manager       │           │  IAM Role              │
│  ┌──────────────────┐  │           │  ┌──────────────────┐  │
│  │ シークレット      │  │◀── Get ──│  │ secretsmanager:  │  │
│  │                  │  │  Secret  │  │ GetSecretValue   │  │
│  │ リソースベース   │  │  Value   │  │                  │  │
│  │ ポリシーで       │  │           │  │ kms:Decrypt      │  │
│  │ Account Bを許可  │  │           │  │ (CMK使用時)      │  │
│  └──────────────────┘  │           │  └──────────────────┘  │
│                        │           │                        │
│  KMS Key (CMK使用時)   │           │  アプリケーション      │
│  ┌──────────────────┐  │           │  ┌──────────────────┐  │
│  │ キーポリシーで   │  │◀─ Decrypt│  │ Account Aの      │  │
│  │ Account Bの      │  │           │  │ シークレットARN   │  │
│  │ kms:Decrypt許可  │  │           │  │ を直接参照       │  │
│  └──────────────────┘  │           │  └──────────────────┘  │
│                        │           │                        │
└────────────────────────┘           └────────────────────────┘

必要な設定 (3段階):
  1. Account A: シークレットのリソースベースポリシーでAccount Bを許可
  2. Account A: KMS CMKのキーポリシーでAccount Bのkms:Decryptを許可
     (aws/secretsmanagerキーはクロスアカウント不可、CMK必須)
  3. Account B: IAMポリシーでsecretsmanager + kmsアクションを許可
```

**DOP重要ポイント**:
- AWS管理キー（`aws/secretsmanager`）はクロスアカウント不可
- クロスアカウントにはカスタマー管理CMKが必須
- リソースベースポリシーはSecrets Managerのネイティブ機能（Parameter Storeにはない）

### 6.2 リソースベースポリシーの例

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowCrossAccountAccess",
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::999888777666:role/AppRole"
      },
      "Action": [
        "secretsmanager:GetSecretValue",
        "secretsmanager:DescribeSecret"
      ],
      "Resource": "*"
    }
  ]
}
```

### 6.3 マルチリージョンシークレット（レプリカ）

```
【マルチリージョンシークレットの構成】

  プライマリリージョン                レプリカリージョン
  (ap-northeast-1)                   (us-east-1)
  ┌──────────────────────┐           ┌──────────────────────┐
  │ Primary Secret       │           │ Replica Secret       │
  │                      │           │                      │
  │ Name: prod/db/creds  │──複製───▶│ Name: prod/db/creds  │
  │                      │           │                      │
  │ ARN: arn:aws:sm:     │           │ ARN: arn:aws:sm:     │
  │  ap-northeast-1:     │           │  us-east-1:          │
  │  123456:secret:      │           │  123456:secret:      │
  │  prod/db/creds-XxYy  │           │  prod/db/creds-XxYy  │
  │                      │           │                      │
  │ KMS: CMK-A           │           │ KMS: CMK-B           │
  │ (ap-northeast-1)     │           │ (us-east-1)          │
  │                      │           │                      │
  │ Rotation: Enabled    │           │ Rotation: N/A        │
  │ (プライマリで実行)   │           │ (自動伝播)           │
  └──────────────────────┘           └──────────────────────┘
                                          │
                                     DR時にPromote
                                          ▼
                                     ┌──────────────────────┐
                                     │ Standalone Secret     │
                                     │ (独立したシークレット)│
                                     │                      │
                                     │ 独自のローテーション  │
                                     │ 設定が可能になる      │
                                     └──────────────────────┘

特徴:
  ・シークレット値の変更はプライマリからレプリカに自動伝播
  ・ローテーションはプライマリで実行、レプリカに自動反映
  ・各リージョンで異なるKMS暗号化キーを使用可能
  ・レプリカはリードオンリー（値の変更はプライマリのみ）
  ・DR時にレプリカをスタンドアロンにPromoте可能
  ・レプリカのARNはリージョン部分のみ異なる（同じ名前・サフィックス）
```

**DOP重要ポイント**:
- レプリカのローテーションは不要（プライマリから自動伝播）
- DR時は`stop-replication-to-replica`でスタンドアロンに昇格
- 各リージョンで異なるKMSキーを指定可能（リージョン固有のCMK）
- 同名のシークレットが既存のリージョンにはレプリケーション不可

---

## 7. AWSサービスとの統合

### 7.1 統合サービスマップ

```
┌─────────────────────────────────────────────────────────────────────┐
│               Secrets Manager統合サービスマップ                       │
│                                                                     │
│  データベース認証情報（自動ローテーション）                           │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌────────────┐              │
│  │ RDS  │ │Aurora│ │Red-  │ │Doc-  │ │ Elasti-    │              │
│  │      │ │      │ │shift │ │umentDB│ │ Cache      │              │
│  │MySQL │ │MySQL │ │      │ │      │ │            │              │
│  │Postgre│ │Postgre│ │    │ │MongoDB│ │ Redis/     │              │
│  │Oracle│ │      │ │      │ │互換  │ │ Memcached  │              │
│  │MSSQL │ │      │ │      │ │      │ │            │              │
│  └──────┘ └──────┘ └──────┘ └──────┘ └────────────┘              │
│                                                                     │
│  コンピュート・コンテナ                                              │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐                              │
│  │ ECS  │ │Lambda│ │ EKS  │ │ EC2  │                              │
│  │タスク │ │環境変│ │Pod   │ │SDK   │                              │
│  │定義の │ │数    │ │シーク│ │経由  │                              │
│  │secrets│ │拡張  │ │レット│ │      │                              │
│  └──────┘ └──────┘ └──────┘ └──────┘                              │
│                                                                     │
│  CI/CD・IaC                                                         │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐                              │
│  │Cloud │ │Code  │ │Code  │ │SAM   │                              │
│  │Forma-│ │Build │ │Pipe- │ │      │                              │
│  │tion  │ │環境変│ │line  │ │テンプ│                              │
│  │動的参照│ │数参照│ │アクシ│ │レート│                             │
│  └──────┘ └──────┘ └──────┘ └──────┘                              │
│                                                                     │
│  監視・セキュリティ                                                  │
│  ┌──────┐ ┌──────┐ ┌──────┐                                       │
│  │Cloud │ │Config│ │Security│                                      │
│  │Trail │ │      │ │Hub    │                                       │
│  │API   │ │ルール│ │チェック│                                      │
│  │ログ  │ │監視  │ │       │                                       │
│  └──────┘ └──────┘ └──────┘                                       │
└─────────────────────────────────────────────────────────────────────┘
```

### 7.2 RDS/Aurora統合

```
【RDS認証情報の管理パターン】

■ パターン1: RDS作成時にSecrets Manager統合
  RDSコンソールで「Secrets Managerで認証情報を管理」を選択
  → マネージドシークレットが自動作成
  → マネージドローテーションが自動設定

■ パターン2: 既存RDSの認証情報をSecrets Managerに登録
  → シークレットを手動作成
  → Lambda関数ローテーションを設定
  → VPC内Lambdaがデータベースに接続する設定が必要

Lambda関数のネットワーク要件:
  ┌───────────────────────────────────────────────┐
  │ VPC                                           │
  │                                               │
  │  ┌─────────────┐     ┌─────────────┐         │
  │  │ Private      │     │ Private      │         │
  │  │ Subnet A     │     │ Subnet B     │         │
  │  │              │     │              │         │
  │  │  ┌────────┐  │     │  ┌────────┐  │         │
  │  │  │Lambda  │  │────▶│  │ RDS    │  │         │
  │  │  │Rotation│  │     │  │        │  │         │
  │  │  │Function│  │     │  └────────┘  │         │
  │  │  └───┬────┘  │     └─────────────┘         │
  │  │      │       │                              │
  │  └──────┼───────┘                              │
  │         │                                      │
  │  ┌──────▼────────────────────────────────────┐ │
  │  │ VPCエンドポイント                          │ │
  │  │ secretsmanager.region.amazonaws.com       │ │
  │  │ (Lambda→Secrets ManagerのAPI通信に必要)   │ │
  │  └───────────────────────────────────────────┘ │
  └───────────────────────────────────────────────┘

  ※ Lambda関数がVPC内にある場合、Secrets Manager APIへの
     アクセスにVPCエンドポイント or NATゲートウェイが必要
```

### 7.3 ECSタスク定義でのシークレット参照

```json
{
  "containerDefinitions": [
    {
      "name": "myapp",
      "image": "myapp:latest",
      "secrets": [
        {
          "name": "DB_PASSWORD",
          "valueFrom": "arn:aws:secretsmanager:ap-northeast-1:123456789012:secret:prod/db/creds-AbCdEf:password::"
        },
        {
          "name": "DB_USERNAME",
          "valueFrom": "arn:aws:secretsmanager:ap-northeast-1:123456789012:secret:prod/db/creds-AbCdEf:username::"
        },
        {
          "name": "API_KEY",
          "valueFrom": "arn:aws:secretsmanager:ap-northeast-1:123456789012:secret:prod/api-key-XyZz"
        }
      ]
    }
  ],
  "executionRoleArn": "arn:aws:iam::123456789012:role/ecsTaskExecutionRole"
}
```

```
valueFromの書式:
  arn:aws:secretsmanager:REGION:ACCOUNT:secret:SECRET_NAME:JSON_KEY:VERSION_STAGE:VERSION_ID

  例: secret:prod/db/creds-AbCdEf:password::
       │                          │       │ │
       シークレット名              JSONキー │ バージョンID(省略=最新)
                                         バージョンステージ(省略=AWSCURRENT)

ECSタスク実行ロールに必要な権限:
  ・secretsmanager:GetSecretValue
  ・kms:Decrypt (CMK使用時)
```

### 7.4 Lambda環境変数での参照

```
【Lambda + Secrets Manager拡張機能】

┌────────────────────────────────────────────────────────┐
│ Lambda関数                                              │
│                                                        │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Secrets Manager Lambda Extension                  │  │
│  │ (AWS Parameters and Secrets Lambda Extension)    │  │
│  │                                                  │  │
│  │ ・Lambda Layerとして追加                         │  │
│  │ ・ローカルHTTPキャッシュ (port 2773)             │  │
│  │ ・SDKコール不要でシークレット取得                │  │
│  │ ・TTLベースのキャッシュ（APIコール削減）         │  │
│  └──────────────────────────────────────────────────┘  │
│                                                        │
│  取得方法:                                              │
│  curl "http://localhost:2773/secretsmanager/get?       │
│    secretId=prod/db/creds"                             │
│    -H "X-Aws-Parameters-Secrets-Token: $TOKEN"         │
│                                                        │
│  環境変数参照 (直接暗号化):                              │
│  ・SECRETS_MANAGER_TTL: キャッシュ期間（秒）           │
│  ・PARAMETERS_SECRETS_EXTENSION_HTTP_PORT: 2773        │
└────────────────────────────────────────────────────────┘
```

### 7.5 CloudFormation動的参照

```
【CloudFormation動的参照の構文】

{{resolve:secretsmanager:SECRET_ID:SecretString:JSON_KEY:VERSION_STAGE:VERSION_ID}}

例1: シークレット全体を参照
  {{resolve:secretsmanager:prod/db/creds}}

例2: JSON内の特定キーを参照
  {{resolve:secretsmanager:prod/db/creds:SecretString:password}}

例3: 特定バージョンステージを参照
  {{resolve:secretsmanager:prod/db/creds:SecretString:password:AWSCURRENT}}

例4: ARNで参照
  {{resolve:secretsmanager:arn:aws:secretsmanager:ap-northeast-1:123456:secret:prod/db/creds-AbCd:SecretString:password}}
```

```yaml
# CloudFormationテンプレート例
Resources:
  MyRDSInstance:
    Type: AWS::RDS::DBInstance
    Properties:
      Engine: mysql
      MasterUsername: !Sub "{{resolve:secretsmanager:prod/db/creds:SecretString:username}}"
      MasterUserPassword: !Sub "{{resolve:secretsmanager:prod/db/creds:SecretString:password}}"
      DBInstanceClass: db.t3.medium
      AllocatedStorage: 20

  # CodeBuildでの参照
  MyCodeBuildProject:
    Type: AWS::CodeBuild::Project
    Properties:
      Environment:
        EnvironmentVariables:
          - Name: DB_PASSWORD
            Type: SECRETS_MANAGER
            Value: "prod/db/creds:password"
```

**DOP重要ポイント**:
- 動的参照は**デプロイ時に解決**される（CloudFormationテンプレートにシークレット値が残らない）
- `{{resolve:secretsmanager:...}}`はスタック更新時にも最新値を取得
- CloudFormationの出力（Outputs）やメタデータには動的参照を使用不可
- テンプレートをバージョン管理してもシークレット値は漏洩しない

### 7.6 CodeBuildでの統合

```
【CodeBuild環境変数での参照方式】

buildspec.yml:
  env:
    secrets-manager:
      DB_PASSWORD: "prod/db/creds:password"
      API_KEY: "prod/api-key"

  ※ 環境変数Type: SECRETS_MANAGER
  ※ ビルド時に自動取得・環境変数として注入
  ※ CodeBuildサービスロールにsecretsmanager:GetSecretValue権限が必要

CloudFormationでの指定:
  Environment:
    EnvironmentVariables:
      - Name: DB_PASSWORD
        Type: SECRETS_MANAGER
        Value: "prod/db/creds:password"
      - Name: API_KEY
        Type: SECRETS_MANAGER
        Value: "prod/api-key"
```

---

## 8. ハンズオン演習

### 演習1: シークレット作成・取得・更新

```bash
# 1. JSON形式のDB認証情報シークレットを作成
aws secretsmanager create-secret \
  --name "dop-handson/db/credentials" \
  --description "DOP Handson - DB Credentials" \
  --secret-string '{
    "username": "admin",
    "password": "InitialPassword123!",
    "engine": "mysql",
    "host": "mydb.cluster-xxx.ap-northeast-1.rds.amazonaws.com",
    "port": 3306,
    "dbname": "myapp"
  }' \
  --query '{ARN:ARN,Name:Name,VersionId:VersionId}' \
  --output table

# 結果からARNを変数に設定
SECRET_ARN="<出力されたARN>"

# 2. シークレットの詳細情報を確認
aws secretsmanager describe-secret \
  --secret-id "dop-handson/db/credentials" \
  --query '{
    Name:Name,
    ARN:ARN,
    KmsKeyId:KmsKeyId,
    RotationEnabled:RotationEnabled,
    VersionIdsToStages:VersionIdsToStages,
    CreatedDate:CreatedDate
  }'

# 3. シークレット値の取得（AWSCURRENT）
aws secretsmanager get-secret-value \
  --secret-id "dop-handson/db/credentials" \
  --query '{
    Name:Name,
    VersionId:VersionId,
    VersionStages:VersionStages,
    SecretString:SecretString
  }'

# 4. 特定のJSON キーのみ取得（jqで抽出）
aws secretsmanager get-secret-value \
  --secret-id "dop-handson/db/credentials" \
  --query 'SecretString' \
  --output text | jq -r '.password'

# 5. シークレット値の更新
aws secretsmanager put-secret-value \
  --secret-id "dop-handson/db/credentials" \
  --secret-string '{
    "username": "admin",
    "password": "UpdatedPassword456!",
    "engine": "mysql",
    "host": "mydb.cluster-xxx.ap-northeast-1.rds.amazonaws.com",
    "port": 3306,
    "dbname": "myapp"
  }' \
  --query '{ARN:ARN,Name:Name,VersionId:VersionId,VersionStages:VersionStages}'

# 6. 更新後のバージョン情報を確認
aws secretsmanager describe-secret \
  --secret-id "dop-handson/db/credentials" \
  --query 'VersionIdsToStages'

# 7. プレーンテキスト（非JSON）シークレットの作成
aws secretsmanager create-secret \
  --name "dop-handson/api-key" \
  --description "DOP Handson - API Key" \
  --secret-string "sk-abc123def456ghi789" \
  --query '{ARN:ARN,Name:Name}'

# 8. バイナリシークレットの作成
echo -n "binary-secret-data" | base64 > /tmp/secret.b64
aws secretsmanager create-secret \
  --name "dop-handson/binary-secret" \
  --description "DOP Handson - Binary Secret" \
  --secret-binary fileb:///tmp/secret.b64 \
  --query '{ARN:ARN,Name:Name}'

# 9. ランダムパスワードの生成
aws secretsmanager get-random-password \
  --password-length 32 \
  --exclude-characters '/@"\\' \
  --require-each-included-type \
  --query 'RandomPassword' \
  --output text

# 10. シークレット一覧の確認
aws secretsmanager list-secrets \
  --filter Key=name,Values=dop-handson \
  --query 'SecretList[].{Name:Name,ARN:ARN,RotationEnabled:RotationEnabled}'
```

### 演習2: バージョン管理（ステージングラベル）

```bash
# 1. 現在のバージョン情報を確認
aws secretsmanager describe-secret \
  --secret-id "dop-handson/db/credentials" \
  --query 'VersionIdsToStages'

# 2. 新しいバージョンを追加（クライアントリクエストトークン指定）
CLIENT_TOKEN=$(uuidgen)
aws secretsmanager put-secret-value \
  --secret-id "dop-handson/db/credentials" \
  --client-request-token "${CLIENT_TOKEN}" \
  --secret-string '{
    "username": "admin",
    "password": "VersionedPassword789!",
    "engine": "mysql",
    "host": "mydb.cluster-xxx.ap-northeast-1.rds.amazonaws.com",
    "port": 3306,
    "dbname": "myapp"
  }' \
  --query '{VersionId:VersionId,VersionStages:VersionStages}'

# 3. AWSCURRENTバージョンの取得（デフォルト）
aws secretsmanager get-secret-value \
  --secret-id "dop-handson/db/credentials" \
  --query '{VersionId:VersionId,VersionStages:VersionStages}' \
  --output table

# 4. AWSPREVIOUSバージョンの取得
aws secretsmanager get-secret-value \
  --secret-id "dop-handson/db/credentials" \
  --version-stage "AWSPREVIOUS" \
  --query '{VersionId:VersionId,VersionStages:VersionStages}' \
  --output table

# 5. 特定のバージョンIDで取得
VERSION_ID="<VersionIdを指定>"
aws secretsmanager get-secret-value \
  --secret-id "dop-handson/db/credentials" \
  --version-id "${VERSION_ID}" \
  --query '{VersionId:VersionId,VersionStages:VersionStages}'

# 6. カスタムステージングラベルの付与
aws secretsmanager update-secret-version-stage \
  --secret-id "dop-handson/db/credentials" \
  --version-stage "BLUE" \
  --move-to-version-id "${CLIENT_TOKEN}"

# 7. カスタムラベルで取得
aws secretsmanager get-secret-value \
  --secret-id "dop-handson/db/credentials" \
  --version-stage "BLUE" \
  --query '{VersionId:VersionId,VersionStages:VersionStages}'

# 8. 全バージョン情報の確認
aws secretsmanager describe-secret \
  --secret-id "dop-handson/db/credentials" \
  --query 'VersionIdsToStages' \
  --output json
```

### 演習3: 自動ローテーション設定

```bash
# ※ この演習は実際のRDSインスタンスがある場合に実行
# ※ RDSなしの場合はコマンドの理解を目的として確認

# 1. ローテーション用Lambda関数のARNを確認（既存の場合）
aws lambda list-functions \
  --query 'Functions[?starts_with(FunctionName, `SecretsManager`)].{Name:FunctionName,ARN:FunctionArn}' \
  --output table

# 2. シングルユーザーローテーションの設定
# aws secretsmanager rotate-secret \
#   --secret-id "dop-handson/db/credentials" \
#   --rotation-lambda-arn "arn:aws:lambda:ap-northeast-1:123456789012:function:SecretsManagerRotation" \
#   --rotation-rules '{
#     "AutomaticallyAfterDays": 30
#   }'

# 3. スケジュール式でのローテーション設定
# aws secretsmanager rotate-secret \
#   --secret-id "dop-handson/db/credentials" \
#   --rotation-lambda-arn "arn:aws:lambda:ap-northeast-1:123456789012:function:SecretsManagerRotation" \
#   --rotation-rules '{
#     "ScheduleExpression": "cron(0 16 1 * ? *)",
#     "Duration": "3h"
#   }'

# 4. ローテーション状態の確認
aws secretsmanager describe-secret \
  --secret-id "dop-handson/db/credentials" \
  --query '{
    RotationEnabled:RotationEnabled,
    RotationLambdaARN:RotationLambdaARN,
    RotationRules:RotationRules,
    LastRotatedDate:LastRotatedDate
  }'

# 5. 即時ローテーションの実行
# aws secretsmanager rotate-secret \
#   --secret-id "dop-handson/db/credentials"

# 6. ローテーション後のバージョン確認
# aws secretsmanager describe-secret \
#   --secret-id "dop-handson/db/credentials" \
#   --query 'VersionIdsToStages'

# 7. ローテーションの無効化
# aws secretsmanager cancel-rotate-secret \
#   --secret-id "dop-handson/db/credentials"

# === ローテーション用Lambda関数のIAMロールに必要な権限 ===
# {
#   "Version": "2012-10-17",
#   "Statement": [
#     {
#       "Effect": "Allow",
#       "Action": [
#         "secretsmanager:DescribeSecret",
#         "secretsmanager:GetSecretValue",
#         "secretsmanager:PutSecretValue",
#         "secretsmanager:UpdateSecretVersionStage"
#       ],
#       "Resource": "arn:aws:secretsmanager:*:*:secret:dop-handson/*"
#     },
#     {
#       "Effect": "Allow",
#       "Action": [
#         "secretsmanager:GetRandomPassword"
#       ],
#       "Resource": "*"
#     },
#     {
#       "Effect": "Allow",
#       "Action": [
#         "ec2:CreateNetworkInterface",
#         "ec2:DeleteNetworkInterface",
#         "ec2:DescribeNetworkInterfaces"
#       ],
#       "Resource": "*"
#     },
#     {
#       "Effect": "Allow",
#       "Action": [
#         "kms:Decrypt",
#         "kms:GenerateDataKey"
#       ],
#       "Resource": "arn:aws:kms:*:*:key/*"
#     }
#   ]
# }
```

### 演習4: リソースベースポリシー（クロスアカウント）

```bash
# 1. リソースベースポリシーの設定
aws secretsmanager put-resource-policy \
  --secret-id "dop-handson/db/credentials" \
  --resource-policy '{
    "Version": "2012-10-17",
    "Statement": [
      {
        "Sid": "AllowCrossAccountRead",
        "Effect": "Allow",
        "Principal": {
          "AWS": "arn:aws:iam::999888777666:root"
        },
        "Action": [
          "secretsmanager:GetSecretValue",
          "secretsmanager:DescribeSecret"
        ],
        "Resource": "*"
      }
    ]
  }'

# 2. リソースベースポリシーの確認
aws secretsmanager get-resource-policy \
  --secret-id "dop-handson/db/credentials" \
  --query '{Name:Name,ResourcePolicy:ResourcePolicy}'

# 3. ポリシーの検証（validate）
aws secretsmanager validate-resource-policy \
  --resource-policy '{
    "Version": "2012-10-17",
    "Statement": [
      {
        "Sid": "AllowCrossAccountRead",
        "Effect": "Allow",
        "Principal": {
          "AWS": "arn:aws:iam::999888777666:root"
        },
        "Action": [
          "secretsmanager:GetSecretValue"
        ],
        "Resource": "*"
      }
    ]
  }'

# 4. リソースベースポリシーの削除
aws secretsmanager delete-resource-policy \
  --secret-id "dop-handson/db/credentials"

# 5. 条件付きポリシーの設定（特定ロールのみ許可）
aws secretsmanager put-resource-policy \
  --secret-id "dop-handson/db/credentials" \
  --resource-policy '{
    "Version": "2012-10-17",
    "Statement": [
      {
        "Sid": "AllowSpecificRole",
        "Effect": "Allow",
        "Principal": {
          "AWS": "arn:aws:iam::999888777666:role/AppReadOnlyRole"
        },
        "Action": [
          "secretsmanager:GetSecretValue"
        ],
        "Resource": "*",
        "Condition": {
          "StringEquals": {
            "aws:PrincipalTag/Department": "Engineering"
          }
        }
      }
    ]
  }'

# 6. CMKを使用したシークレットの作成（クロスアカウント対応）
# ※ aws/secretsmanagerキーはクロスアカウント不可のためCMK必須
# aws secretsmanager create-secret \
#   --name "dop-handson/cross-account-secret" \
#   --kms-key-id "arn:aws:kms:ap-northeast-1:123456789012:key/xxxx-yyyy-zzzz" \
#   --secret-string '{"api_key": "cross-account-key-value"}' \
#   --query '{ARN:ARN,Name:Name}'
```

### 演習5: CloudFormation動的参照

```bash
# 1. CloudFormationテンプレートの作成
cat > /tmp/cfn-secrets-test.yaml << 'EOF'
AWSTemplateFormatVersion: '2010-09-09'
Description: 'Secrets Manager Dynamic Reference Test'

Parameters:
  SecretName:
    Type: String
    Default: 'dop-handson/db/credentials'

Resources:
  # シークレットの作成
  MyDatabaseSecret:
    Type: AWS::SecretsManager::Secret
    Properties:
      Name: !Sub '${AWS::StackName}-db-secret'
      Description: 'Auto-generated database credentials'
      GenerateSecretString:
        SecretStringTemplate: '{"username": "admin"}'
        GenerateStringKey: 'password'
        PasswordLength: 32
        ExcludeCharacters: '"@/\'

  # ローテーションスケジュールの設定
  # MyRotationSchedule:
  #   Type: AWS::SecretsManager::RotationSchedule
  #   Properties:
  #     SecretId: !Ref MyDatabaseSecret
  #     RotationRules:
  #       AutomaticallyAfterDays: 30
  #     HostedRotationLambda:
  #       RotationType: MySQLSingleUser
  #       SuperuserSecretArn: !Ref MyMasterSecret

  # 動的参照でシークレットを使用するSSMパラメータ（テスト用）
  TestParameter:
    Type: AWS::SSM::Parameter
    Properties:
      Type: String
      Value: !Sub 'Connected to secret: ${AWS::StackName}-db-secret'
      Description: 'Test parameter for dynamic reference validation'

Outputs:
  SecretARN:
    Description: 'Secret ARN'
    Value: !Ref MyDatabaseSecret
  SecretName:
    Description: 'Secret Name'
    Value: !Sub '${AWS::StackName}-db-secret'
EOF

# 2. スタックの作成
aws cloudformation create-stack \
  --stack-name dop-secrets-test \
  --template-body file:///tmp/cfn-secrets-test.yaml \
  --query 'StackId' \
  --output text

# 3. スタックの状態確認
aws cloudformation wait stack-create-complete \
  --stack-name dop-secrets-test

aws cloudformation describe-stacks \
  --stack-name dop-secrets-test \
  --query 'Stacks[0].{Status:StackStatus,Outputs:Outputs}'

# 4. 自動生成されたシークレットの確認
aws secretsmanager get-secret-value \
  --secret-id "dop-secrets-test-db-secret" \
  --query '{VersionId:VersionId,SecretString:SecretString}'

# 5. 動的参照の構文確認（実際のテンプレートで使用する例）
echo '
# RDSでの動的参照例:
# MasterUsername: {{resolve:secretsmanager:dop-secrets-test-db-secret:SecretString:username}}
# MasterUserPassword: {{resolve:secretsmanager:dop-secrets-test-db-secret:SecretString:password}}

# CodeBuildでの参照例:
# Environment:
#   EnvironmentVariables:
#     - Name: DB_PASSWORD
#       Type: SECRETS_MANAGER
#       Value: "dop-secrets-test-db-secret:password"
'
```

### 演習6: マルチリージョンレプリケーション

```bash
# 1. レプリカリージョンへのシークレット複製
# aws secretsmanager replicate-secret-to-regions \
#   --secret-id "dop-handson/db/credentials" \
#   --add-replica-regions Region=us-east-1

# 2. レプリケーション状態の確認
aws secretsmanager describe-secret \
  --secret-id "dop-handson/db/credentials" \
  --query '{
    Name:Name,
    ReplicationStatus:ReplicationStatus
  }'

# 3. レプリカリージョンでのシークレット取得
# aws secretsmanager get-secret-value \
#   --secret-id "dop-handson/db/credentials" \
#   --region us-east-1 \
#   --query '{VersionId:VersionId,VersionStages:VersionStages}'

# 4. レプリカのスタンドアロン昇格（DR時）
# aws secretsmanager stop-replication-to-replica \
#   --secret-id "dop-handson/db/credentials" \
#   --region us-east-1

# 5. レプリカの削除
# aws secretsmanager remove-regions-from-replication \
#   --secret-id "dop-handson/db/credentials" \
#   --remove-replica-regions us-east-1

# 6. 作成時にレプリカも同時指定
# aws secretsmanager create-secret \
#   --name "dop-handson/multi-region-secret" \
#   --secret-string '{"key": "value"}' \
#   --add-replica-regions Region=us-east-1 Region=eu-west-1 \
#   --query '{ARN:ARN,ReplicationStatus:ReplicationStatus}'
```

### 演習7: クリーンアップ

```bash
# 1. CloudFormationスタックの削除
aws cloudformation delete-stack \
  --stack-name dop-secrets-test

aws cloudformation wait stack-delete-complete \
  --stack-name dop-secrets-test

# 2. シークレットの削除（復元猶予期間なし - テスト環境のみ）
aws secretsmanager delete-secret \
  --secret-id "dop-handson/db/credentials" \
  --force-delete-without-recovery

aws secretsmanager delete-secret \
  --secret-id "dop-handson/api-key" \
  --force-delete-without-recovery

aws secretsmanager delete-secret \
  --secret-id "dop-handson/binary-secret" \
  --force-delete-without-recovery

# 3. 復元猶予期間付きの削除（本番環境推奨）
# aws secretsmanager delete-secret \
#   --secret-id "dop-handson/db/credentials" \
#   --recovery-window-in-days 7

# 4. 削除のキャンセル（猶予期間内のみ可能）
# aws secretsmanager restore-secret \
#   --secret-id "dop-handson/db/credentials"

# 5. 削除済みシークレットの確認
aws secretsmanager list-secrets \
  --filter Key=name,Values=dop-handson \
  --include-planned-deletion \
  --query 'SecretList[].{Name:Name,DeletedDate:DeletedDate}'

# 6. クリーンアップ確認
echo "=== クリーンアップ完了 ==="
aws secretsmanager list-secrets \
  --filter Key=name,Values=dop-handson \
  --query 'SecretList[].Name'
```

---

## 9. DOP試験対策チェックリスト

### Q1: 自動ローテーション
**Q: RDSのDB認証情報をSecrets Managerで自動ローテーションする場合、どのような設定が必要か？Lambda関数ローテーションの4ステップを説明せよ。**

<details><summary>模範解答</summary>

RDSの自動ローテーションには、ローテーション用Lambda関数の設定が必要（マネージドシークレットの場合はマネージドローテーションでLambda不要）。Lambda関数ローテーションの4ステップ: (1) **createSecret**: 新パスワードを生成し、AWPENDINGステージラベル付きの新バージョンとして保存。(2) **setSecret**: データベースの認証情報をAWSPENDINGの値に変更。(3) **testSecret**: AWPENDINGの認証情報でデータベースに接続テスト。(4) **finishSecret**: ステージングラベルを移動し、AWPENDINGをAWSCURRENTに、旧AWSCURRENTをAWSPREVIOUSに変更。Lambda関数はVPC内で動作し、RDSとSecrets Manager APIの両方にアクセスする必要がある（VPCエンドポイントまたはNATゲートウェイが必要）。

</details>

### Q2: シングルユーザー vs マルチユーザーローテーション
**Q: RDS認証情報のローテーション戦略として、シングルユーザーとマルチユーザー（交互）の違いは？ダウンタイムなしのローテーションにはどちらを選択すべきか？**

<details><summary>模範解答</summary>

**シングルユーザー**: 1つのDBユーザーのパスワードを直接変更。設定がシンプルだが、ローテーション中（setSecretからfinishSecretまで）に短時間の認証失敗が発生する可能性がある。**マルチユーザー（交互）**: 2つのDBユーザー（例: appとapp_clone）を交互に切り替え。別途マスターシークレット（管理者認証情報）が必要で、マスターユーザーがクローンユーザーの作成・パスワード変更を実行する。ダウンタイムなしのローテーションにはマルチユーザー戦略を選択する。旧ユーザーの認証情報はAWSPREVIOUSとして保持されるため、ロールバックも可能。

</details>

### Q3: CloudFormation動的参照
**Q: CloudFormationテンプレートでSecrets Managerのシークレットを安全に参照する方法は？構文と制約を説明せよ。**

<details><summary>模範解答</summary>

動的参照構文: `{{resolve:secretsmanager:SECRET_ID:SecretString:JSON_KEY:VERSION_STAGE:VERSION_ID}}`。例: `{{resolve:secretsmanager:prod/db/creds:SecretString:password}}`。この参照はデプロイ時に解決され、テンプレートやスタック定義にシークレット値が保存されない。制約: (1) Outputs値には使用不可 (2) `DependsOn`の条件には使用不可 (3) テンプレートのMetadataセクションには使用不可。また、`AWS::SecretsManager::Secret`リソースの`GenerateSecretString`で自動生成し、`!Ref`でARNを取得後に動的参照で値を使用するパターンが推奨。

</details>

### Q4: クロスアカウントシークレット共有
**Q: Account AのシークレットをAccount Bからアクセスするための設定手順は？AWS管理キー（aws/secretsmanager）使用時の制約は？**

<details><summary>模範解答</summary>

3段階の設定が必要: (1) Account A: シークレットのリソースベースポリシーでAccount Bのプリンシパル（ロール/ユーザー）に`secretsmanager:GetSecretValue`を許可。(2) Account A: KMS CMKのキーポリシーでAccount Bに`kms:Decrypt`を許可。(3) Account B: IAMポリシーでAccount AのシークレットARNに対する`secretsmanager:GetSecretValue`とKMSキーに対する`kms:Decrypt`を許可。**重要な制約**: AWS管理キー（`aws/secretsmanager`）はクロスアカウントアクセスに使用不可。クロスアカウントでは必ずカスタマー管理CMKでシークレットを暗号化する必要がある。

</details>

### Q5: Secrets Manager vs Parameter Store
**Q: DB認証情報の管理にSecrets ManagerとParameter Store（SecureString）のどちらを選択すべきか？判断基準を説明せよ。**

<details><summary>模範解答</summary>

Secrets Managerを選択すべきケース: (1) 自動ローテーションが必要（特にRDS/Aurora/Redshift/DocumentDB） (2) クロスリージョンDRでシークレットのレプリケーションが必要 (3) リソースベースポリシーでクロスアカウント共有が必要 (4) 64KBまでの大きなシークレットを扱う場合。Parameter Store SecureStringを選択すべきケース: (1) コスト重視（Standardは無料） (2) 自動ローテーション不要の設定値・パラメータ (3) 階層構造でパラメータを整理したい (4) 既にParameter Storeのエコシステムを活用中。料金差: Secrets Managerは$0.40/シークレット/月 + $0.05/10,000 API、Parameter Store Standardは無料。

</details>

### Q6: マルチリージョンシークレット
**Q: DR対応でSecrets Managerのマルチリージョンシークレットを設定する方法は？ローテーションとの関係は？**

<details><summary>模範解答</summary>

`replicate-secret-to-regions`でレプリカを作成。レプリカはプライマリのコピーで、シークレット値の変更はプライマリからレプリカに自動伝播される。ローテーションはプライマリリージョンでのみ実行され、ローテーション結果はレプリカに自動反映される（レプリカで個別にローテーション設定は不要）。各リージョンで異なるKMS暗号化キーを指定可能。DR時は`stop-replication-to-replica`でレプリカをスタンドアロンに昇格させ、独立したシークレットとして運用可能（独自のローテーション設定も可能になる）。レプリカのARNはリージョン部分のみ異なり、同じ名前とサフィックスを持つ。

</details>

### Q7: ECSタスク定義でのシークレット参照
**Q: ECSタスク定義でSecrets Managerのシークレットを環境変数として注入する方法は？必要なIAM権限は？**

<details><summary>模範解答</summary>

ECSタスク定義の`containerDefinitions`内の`secrets`セクションで、`valueFrom`にシークレットのARNを指定する。JSON形式のシークレットから特定キーを抽出するには`ARN:JSON_KEY:VERSION_STAGE:VERSION_ID`の形式を使用（例: `secret:prod/db-AbCd:password::`）。必要なIAM権限: **ECSタスク実行ロール**（executionRoleArn）に`secretsmanager:GetSecretValue`が必要。CMK使用時は`kms:Decrypt`も追加。タスクロール（taskRoleArn）ではなくタスク**実行**ロールに権限を付与する点が重要。シークレットはコンテナ起動時に取得され環境変数として注入される。

</details>

### Q8: バージョニングとステージングラベル
**Q: Secrets Managerのバージョニングの仕組みを説明せよ。AWSCURRENT、AWSPENDING、AWSPREVIOUSの各ステージングラベルの役割は？**

<details><summary>模範解答</summary>

Secrets Managerは各シークレットに複数バージョンを保持し、ステージングラベルで管理する。**AWSCURRENT**: 現在のアクティブバージョン。`GetSecretValue`でデフォルト返却される。**AWSPENDING**: ローテーション中に作成される新バージョン。Lambda関数の4ステップ処理中に使用され、テスト完了後にAWSCURRENTに昇格する。**AWSPREVIOUS**: ローテーション完了時に、旧AWSCURRENTが自動的にこのラベルに移動。ロールバック用に保持される。ラベルのないバージョンはSecrets Managerが自動的にクリーンアップする。カスタムラベルの付与も可能で、Blue/Greenデプロイメントパターンにも活用できる。`GetSecretValue`で`--version-stage`パラメータを指定して特定バージョンを取得可能。

</details>

### Q9: KMS暗号化とSecrets Manager
**Q: Secrets ManagerのシークレットはKMSでどのように暗号化されるか？暗号化キーの選択肢と考慮事項は？**

<details><summary>模範解答</summary>

Secrets Managerはエンベロープ暗号化を使用。KMSの`GenerateDataKey`で256ビットAESデータキーを生成し、データキーでシークレット値を暗号化、暗号化済みデータキーをメタデータに保存する。暗号化キーの選択肢: (1) AWS管理キー`aws/secretsmanager`（デフォルト、無料、クロスアカウント不可） (2) カスタマー管理CMK（$1/月、クロスアカウント可、キーポリシーで細かい制御可能）。考慮事項: シークレット名、説明、ローテーション設定、タグなどのメタデータは暗号化されない。暗号化キーの変更時、AWSCURRENT/AWSPENDING/AWSPREVIOUSは新キーで再暗号化されるが、古いバージョンは旧キーでも復号可能。

</details>

### Q10: コスト最適化とベストプラクティス
**Q: Secrets Managerの料金体系を説明し、コスト最適化のベストプラクティスを述べよ。**

<details><summary>模範解答</summary>

料金体系: (1) シークレット保管: $0.40/シークレット/月（レプリカも同額） (2) APIコール: $0.05/10,000リクエスト (3) Lambda関数（ローテーション用）: Lambda料金 (4) KMS CMK使用時: KMS料金（aws/secretsmanagerキーは無料）。コスト最適化: (1) 削除予定のシークレットは`ForceDeleteWithoutRecovery`で即削除（課金停止） (2) Lambda拡張機能やアプリ側のキャッシュでAPIコール数を削減 (3) 自動ローテーション不要なシークレットはParameter Store SecureString（Standard: 無料）を検討 (4) 不要なシークレットの定期棚卸し (5) コスト配分タグの活用で部門別コスト管理。削除マーク済みのシークレットは課金されない。

</details>

---

**補足: 試験当日の確認ポイント**

```
┌─────────────────────────────────────────────────────────────────────┐
│ DOP-C02 Secrets Manager 最終確認チェックリスト                       │
│                                                                     │
│ □ ローテーション4ステップの順序と各ステップの役割                    │
│ □ シングルユーザー vs マルチユーザーの選択基準                       │
│ □ ステージングラベル (AWSCURRENT/AWSPENDING/AWSPREVIOUS) の遷移     │
│ □ CloudFormation動的参照の構文 {{resolve:secretsmanager:...}}       │
│ □ Parameter Storeとの使い分け判断基準                               │
│ □ クロスアカウントにはCMK必須（aws/secretsmanagerキーは不可）       │
│ □ マルチリージョンレプリカのローテーション伝播                       │
│ □ ECSタスク定義のsecretsセクションとタスク実行ロール                 │
│ □ VPC内LambdaのSecrets Managerアクセス（エンドポイント必要）        │
│ □ 料金: $0.40/secret/月 + $0.05/10K API                            │
└─────────────────────────────────────────────────────────────────────┘
```
