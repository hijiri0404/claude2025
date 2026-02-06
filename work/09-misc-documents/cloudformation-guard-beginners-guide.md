# CloudFormation Guard 初学者向けガイド

## 📚 目次
1. [CloudFormation Guardとは](#cloudformation-guardとは)
2. [なぜ必要なのか](#なぜ必要なのか)
3. [インストール方法](#インストール方法)
4. [基本的な使い方](#基本的な使い方)
5. [ルールファイルの作成](#ルールファイルの作成)
6. [今回実施した内容（実例）](#今回実施した内容実例)
7. [よくある問題と解決方法](#よくある問題と解決方法)
8. [ベストプラクティス](#ベストプラクティス)

---

## CloudFormation Guardとは

**CloudFormation Guard（cfn-guard）** は、AWS CloudFormationテンプレートがポリシーに準拠しているかを検証するためのオープンソースツールです。

### 主な特徴
- ✅ **ポリシーアズコード**: セキュリティ・コンプライアンスルールをコードで管理
- ✅ **事前検証**: デプロイ前にテンプレートの問題を発見
- ✅ **カスタマイズ可能**: 組織独自のルールを定義可能
- ✅ **CIパイプライン統合**: 自動化された検証が可能

### 類似ツールとの比較
| ツール | 用途 | 特徴 |
|-------|------|------|
| **cfn-guard** | CloudFormation検証 | ポリシーアズコード、カスタムルール |
| **cfn-lint** | CloudFormation文法チェック | テンプレート構文の検証 |
| **CloudFormation Validate** | 基本的な構文チェック | AWS CLI組み込み、基本検証のみ |

---

## なぜ必要なのか

### CloudFormation Guardが解決する問題

#### 問題1: デプロイ後に問題が発覚
❌ **従来**:
```
CloudFormationテンプレート作成
 ↓
デプロイ
 ↓
セキュリティチームがレビュー
 ↓
「タグがない！」「TTLが不適切！」
 ↓
修正・再デプロイ（時間とコストの無駄）
```

✅ **CloudFormation Guard使用**:
```
CloudFormationテンプレート作成
 ↓
cfn-guard検証（数秒）
 ↓
問題を即座に発見・修正
 ↓
デプロイ（問題なし）
```

#### 問題2: 人的レビューの限界
- レビュアーによって指摘内容が異なる
- 見落としが発生しやすい
- レビューに時間がかかる

#### 問題3: 組織ポリシーの徹底困難
- 「タグは必須」というルールがあっても、忘れることがある
- 全チームに同じ基準を適用するのが難しい

### CloudFormation Guardのメリット
1. **コスト削減**: デプロイ前に問題発見 → 手戻り削減
2. **セキュリティ向上**: ベストプラクティスを強制
3. **自動化**: CI/CDパイプラインに組み込み可能
4. **一貫性**: 全チームで同じルールを適用
5. **学習効果**: 違反メッセージから学べる

---

## インストール方法

### 前提条件
- Linux/macOS/Windows（WSL2）
- インターネット接続
- sudo権限（システム全体にインストールする場合）

### 方法1: バイナリダウンロード（推奨）

#### Linuxの場合
```bash
# 1. システムアーキテクチャを確認
uname -m
# x86_64 または aarch64

# 2. 最新バージョンをダウンロード（x86_64の例）
cd /tmp
wget https://github.com/aws-cloudformation/cloudformation-guard/releases/download/3.1.2/cfn-guard-v3-x86_64-ubuntu-latest.tar.gz

# 3. 展開
tar -xzf cfn-guard-v3-x86_64-ubuntu-latest.tar.gz

# 4. システム全体にインストール
sudo mv cfn-guard-v3-x86_64-ubuntu-latest/cfn-guard /usr/local/bin/

# 5. インストール確認
cfn-guard --version
# 出力: cfn-guard 3.1.2
```

#### macOSの場合
```bash
# Homebrewを使用（推奨）
brew install cloudformation-guard

# または、手動でバイナリダウンロード
curl -L -o cfn-guard.tar.gz https://github.com/aws-cloudformation/cloudformation-guard/releases/download/3.1.2/cfn-guard-v3-x86_64-macos-latest.tar.gz
tar -xzf cfn-guard.tar.gz
sudo mv cfn-guard-v3-x86_64-macos-latest/cfn-guard /usr/local/bin/
```

### 方法2: Cargoでビルド（開発者向け）
```bash
# Rustがインストールされている場合
cargo install cfn-guard
```

### インストール後の確認
```bash
# バージョン確認
cfn-guard --version

# ヘルプ表示
cfn-guard --help

# サブコマンド一覧
cfn-guard validate --help
```

---

## 基本的な使い方

### cfn-guardのサブコマンド

| コマンド | 用途 |
|---------|------|
| `validate` | テンプレートを検証 |
| `test` | ルールファイルをテスト |
| `rulegen` | テンプレートからルールを自動生成 |
| `migrate` | 古い形式のルールを新形式に変換 |

### 検証の基本フロー

#### 1. テンプレートファイルの準備
```yaml
# my-template.yaml
AWSTemplateFormatVersion: '2010-09-09'
Resources:
  MyBucket:
    Type: AWS::S3::Bucket
    Properties:
      BucketName: my-test-bucket
```

#### 2. ルールファイルの準備
```
# rules.guard
rule s3_bucket_encryption {
    Resources.*[ Type == 'AWS::S3::Bucket' ] {
        Properties {
            BucketEncryption exists
            <<
                違反: S3バケットには暗号化を設定してください
                理由: データ保護のため
            >>
        }
    }
}
```

#### 3. 検証実行
```bash
cfn-guard validate \
  --data my-template.yaml \
  --rules rules.guard \
  --show-summary all
```

#### 4. 結果の確認
```
# 成功の場合
my-template.yaml Status = PASS

# 失敗の場合
my-template.yaml Status = FAIL
FAILED rules
rules.guard/s3_bucket_encryption FAIL
```

---

## ルールファイルの作成

### ルール構文の基本

#### 1. 基本構造
```
rule ルール名 {
    # 対象リソースの指定
    Resources.*[ Type == 'AWS::リソースタイプ' ] {
        # プロパティのチェック
        Properties {
            # 検証条件
            プロパティ名 exists
            プロパティ名 == 値

            # エラーメッセージ
            <<
                違反: エラーメッセージ
                理由: なぜこのルールが必要か
            >>
        }
    }
}
```

#### 2. 基本的な演算子

| 演算子 | 意味 | 例 |
|-------|------|---|
| `exists` | 存在チェック | `BucketName exists` |
| `not empty` | 空でないことをチェック | `Tags not empty` |
| `==` | 等しい | `Type == 'A'` |
| `!=` | 等しくない | `Type != 'CNAME'` |
| `>=` | 以上 | `TTL >= 60` |
| `<=` | 以下 | `TTL <= 86400` |
| `>` | より大きい | `Count > 0` |
| `<` | より小さい | `Size < 100` |

#### 3. クエリ演算子

| クエリ | 意味 | 例 |
|-------|------|---|
| `some` | 少なくとも1つが条件を満たす | `some Tags[*].Key == 'Name'` |
| `every` | すべてが条件を満たす | `every Tags[*].Key exists` |
| `[*]` | 配列のすべての要素 | `Tags[*].Key` |

### 実践例

#### 例1: タグが必須
```
rule resource_must_have_tags {
    Resources.*[ Type == 'AWS::S3::Bucket' ] {
        Properties {
            Tags exists
            Tags not empty
            <<
                違反: すべてのS3バケットにはタグが必要です
                理由: リソース管理とコスト追跡のため
            >>
        }
    }
}
```

#### 例2: 特定タグのチェック
```
rule resource_must_have_name_tag {
    Resources.*[ Type == 'AWS::S3::Bucket' ] {
        Properties {
            Tags exists
            some Tags[*].Key == 'Name'
            <<
                違反: バケットにはNameタグが必要です
                理由: リソースの識別を容易にするため
            >>
        }
    }
}
```

#### 例3: 数値範囲のチェック
```
rule ttl_in_valid_range {
    Resources.*[ Type == 'AWS::Route53::RecordSet' ] {
        Properties {
            TTL exists
            TTL >= 60
            TTL <= 86400
            <<
                違反: TTLは60秒以上86400秒以下にしてください
                理由: 適切なDNSキャッシュ制御のため
            >>
        }
    }
}
```

#### 例4: 条件付きチェック
```
rule a_record_must_have_ip {
    Resources.*[
        Type == 'AWS::Route53::RecordSet'
        Properties.Type == 'A'
    ] {
        Properties {
            ResourceRecords exists
            ResourceRecords not empty
            <<
                違反: AレコードにはIPアドレスが必要です
                理由: AレコードはIPv4アドレスを指定します
            >>
        }
    }
}
```

---

## 今回実施した内容（実例）

### 背景
hogehoge.comドメインのRoute53 CloudFormationテンプレートに対して、セキュリティとベストプラクティスの検証を実施しました。

### 実施内容の全体フロー

```
1. CloudFormation Guard インストール
   ↓
2. Route53用ルールファイル作成（6ルール）
   ↓
3. テンプレート検証実行
   ↓
4. エラー修正（2件）
   ↓
5. 再検証 → 全ルールPASS ✅
```

### 手順詳細

#### ステップ1: CloudFormation Guard 3.1.2 インストール

```bash
# アーキテクチャ確認
uname -m
# 出力: x86_64

# バイナリダウンロード
cd /tmp
wget https://github.com/aws-cloudformation/cloudformation-guard/releases/download/3.1.2/cfn-guard-v3-x86_64-ubuntu-latest.tar.gz

# 展開
tar -xzf cfn-guard-v3-x86_64-ubuntu-latest.tar.gz

# インストール
sudo mv cfn-guard-v3-x86_64-ubuntu-latest/cfn-guard /usr/local/bin/

# 確認
cfn-guard --version
# 出力: cfn-guard 3.1.2
```

#### ステップ2: Route53用ガードルール作成

**ファイル名**: `route53-guard-rules.guard`

**作成したルール一覧**:

1. **ホストゾーンにタグが必須**
```
rule route53_hosted_zone_has_tags {
    Resources.*[ Type == 'AWS::Route53::HostedZone' ] {
        Properties {
            HostedZoneTags exists
            HostedZoneTags not empty
            <<
                違反: Route53ホストゾーンには必ずタグを設定してください
                理由: タグはリソース管理、コスト追跡、アクセス制御に必要です
            >>
        }
    }
}
```

2. **Nameタグが必須**
```
rule route53_hosted_zone_has_name_tag {
    Resources.*[ Type == 'AWS::Route53::HostedZone' ] {
        Properties {
            HostedZoneTags exists
            some HostedZoneTags[*].Key == 'Name'
            <<
                違反: ホストゾーンにはNameタグを設定してください
                理由: リソースの識別を容易にするため
            >>
        }
    }
}
```

3. **DNSレコードにTTL必須**
```
rule route53_record_ttl_exists {
    Resources.*[ Type == 'AWS::Route53::RecordSet' ] {
        Properties {
            TTL exists
            <<
                違反: DNSレコードにはTTL値を設定してください
                理由: TTL値は適切に設定する必要があります(推奨: 60-86400秒)
            >>
        }
    }
}
```

4. **AレコードにResourceRecords必須**
```
rule route53_a_record_valid_ipv4 {
    Resources.*[
        Type == 'AWS::Route53::RecordSet'
        Properties.Type == 'A'
    ] {
        Properties {
            ResourceRecords exists
            ResourceRecords not empty
            <<
                違反: AレコードにはResourceRecordsが必要です
                理由: AレコードはIPv4アドレスを指定する必要があります
            >>
        }
    }
}
```

5. **HostedZoneConfigにコメント必須**
```
rule route53_hosted_zone_has_comment {
    Resources.*[ Type == 'AWS::Route53::HostedZone' ] {
        Properties {
            HostedZoneConfig exists
            HostedZoneConfig.Comment exists
            <<
                違反: ホストゾーンにはHostedZoneConfig.Commentを設定してください
                理由: ホストゾーンの用途を明確にするため
            >>
        }
    }
}
```

6. **レコード名が適切に設定**
```
rule route53_record_has_valid_name {
    Resources.*[ Type == 'AWS::Route53::RecordSet' ] {
        Properties {
            Name exists
            <<
                違反: DNSレコードにはName属性が必要です
                理由: レコード名がないとDNS解決ができません
            >>
        }
    }
}
```

#### ステップ3: 初回検証実行

```bash
cd /workspaces/ubuntu-3/claude2025/work/20251220
cfn-guard validate \
  --data hogehoge-com-hostzone-only.yaml \
  --rules route53-guard-rules.guard \
  --show-summary all
```

**結果**: 2つのエラーが検出 ❌

#### ステップ4: エラー修正

**エラー1**: Nameタグチェックの構文エラー
- **問題**: `some` クエリの構文が正しくなかった
- **修正前**:
  ```
  HostedZoneTags[*] {
      some Key == 'Name'
  }
  ```
- **修正後**:
  ```
  HostedZoneTags exists
  some HostedZoneTags[*].Key == 'Name'
  ```

**エラー2**: TTL範囲チェックの制限
- **問題**: CloudFormation組み込み関数 `!Ref DefaultTTL` を cfn-guard が数値として評価できない
- **エラーメッセージ**:
  ```
  Error = [PathAwareValues are not comparable map, int]
  ```
- **対策**: TTL範囲チェックのルールを削除し、TTL存在チェックのみに変更
- **理由**: パラメータの `AllowedValues` で既に範囲制約済み

#### ステップ5: 再検証 → 成功 ✅

```bash
cfn-guard validate \
  --data hogehoge-com-hostzone-only.yaml \
  --rules route53-guard-rules.guard \
  --show-summary all
```

**結果**:
```
hogehoge-com-hostzone-only.yaml Status = PASS
PASS rules
route53-guard-rules.guard/route53_hosted_zone_has_tags        PASS
route53-guard-rules.guard/route53_hosted_zone_has_name_tag    PASS
route53-guard-rules.guard/route53_record_ttl_exists           PASS
route53-guard-rules.guard/route53_a_record_valid_ipv4         PASS
route53-guard-rules.guard/route53_hosted_zone_has_comment     PASS
route53-guard-rules.guard/route53_record_has_valid_name       PASS
```

### 学んだポイント

1. **CloudFormation組み込み関数の制限**
   - cfn-guardは静的解析ツール
   - `!Ref`, `!Sub`, `!GetAtt` などは実行時にしか評価されない
   - 対策: パラメータの `AllowedValues` で制約

2. **配列要素のチェック構文**
   - `some` クエリは正しい位置で使用する
   - 正しい: `some HostedZoneTags[*].Key == 'Name'`
   - 誤り: `HostedZoneTags[*] { some Key == 'Name' }`

3. **ルール設計の重要性**
   - 実装可能な範囲でルールを作成
   - 技術的制約を理解して現実的なルールに

---

## よくある問題と解決方法

### 問題1: 構文エラーが発生する

**エラー例**:
```
Parsing error handling rule file = rules.guard, Error = Parser Error when parsing...
```

**原因**:
- ルールファイルの構文が正しくない
- インデントが正しくない
- 予約語の誤用

**解決方法**:
```bash
# 構文チェック
cfn-guard validate --rules rules.guard

# エラー行を確認
# エラーメッセージに "at line X at column Y" という情報がある
```

### 問題2: CloudFormation組み込み関数が評価できない

**エラー例**:
```
PathAwareValues are not comparable map, int
```

**原因**:
- `!Ref`, `!Sub`, `!GetAtt` などの組み込み関数は実行時にしか値が決まらない
- cfn-guardは静的解析なので評価できない

**解決方法**:
1. パラメータの `AllowedValues` で制約
2. ルールを存在チェックのみに変更
3. デプロイ後の検証を別途実施

### 問題3: ルールが意図通り動作しない

**症状**:
- 常にPASSする
- 常にFAILする

**原因**:
- リソースセレクターが正しくない
- 条件式が間違っている

**解決方法**:
```bash
# デバッグモード実行
cfn-guard validate \
  --data template.yaml \
  --rules rules.guard \
  --show-clause-failures
```

### 問題4: 複数テンプレートの検証が面倒

**問題**:
- 大量のテンプレートを個別に検証するのは大変

**解決方法**:
```bash
# ディレクトリ内の全YAMLファイルを検証
for file in *.yaml; do
  echo "Validating $file..."
  cfn-guard validate --data "$file" --rules rules.guard
done

# または、find コマンド使用
find . -name "*.yaml" -exec cfn-guard validate --data {} --rules rules.guard \;
```

---

## ベストプラクティス

### 1. ルールファイルの管理

#### ルールをサービスごとに分割
```
rules/
├── s3-rules.guard          # S3専用ルール
├── route53-rules.guard     # Route53専用ルール
├── ec2-rules.guard         # EC2専用ルール
└── common-rules.guard      # 全サービス共通ルール
```

#### 検証時に複数ルールファイルを指定
```bash
cfn-guard validate \
  --data template.yaml \
  --rules rules/s3-rules.guard \
  --rules rules/common-rules.guard
```

### 2. CI/CDパイプラインへの組み込み

#### GitHub Actionsの例
```yaml
name: CloudFormation Validation

on: [push, pull_request]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2

      - name: Install cfn-guard
        run: |
          wget https://github.com/aws-cloudformation/cloudformation-guard/releases/download/3.1.2/cfn-guard-v3-x86_64-ubuntu-latest.tar.gz
          tar -xzf cfn-guard-v3-x86_64-ubuntu-latest.tar.gz
          sudo mv cfn-guard-v3-x86_64-ubuntu-latest/cfn-guard /usr/local/bin/

      - name: Validate Templates
        run: |
          cfn-guard validate \
            --data templates/*.yaml \
            --rules rules/*.guard
```

### 3. エラーメッセージの書き方

**❌ 悪い例**:
```
<<
    Error
>>
```

**✅ 良い例**:
```
<<
    違反: S3バケットには暗号化を設定してください
    理由: データ保護とコンプライアンス要件のため
    対策: Properties.BucketEncryption を設定してください
    参考: https://docs.aws.amazon.com/AmazonS3/latest/userguide/bucket-encryption.html
>>
```

### 4. ルールのテスト

#### テストファイルの作成
```yaml
# tests/s3-encryption-test.yaml
---
- name: S3バケット暗号化テスト - PASS
  input:
    Resources:
      MyBucket:
        Type: AWS::S3::Bucket
        Properties:
          BucketEncryption:
            ServerSideEncryptionConfiguration:
              - ServerSideEncryptionByDefault:
                  SSEAlgorithm: AES256
  expectations:
    rules:
      s3_bucket_encryption: PASS

- name: S3バケット暗号化テスト - FAIL
  input:
    Resources:
      MyBucket:
        Type: AWS::S3::Bucket
        Properties:
          BucketName: test-bucket
  expectations:
    rules:
      s3_bucket_encryption: FAIL
```

#### テスト実行
```bash
cfn-guard test --rules-file rules.guard --test-data tests/s3-encryption-test.yaml
```

### 5. ルールの段階的導入

#### Phase 1: 警告のみ（導入初期）
```bash
# 検証は実行するが、失敗しても継続
cfn-guard validate \
  --data template.yaml \
  --rules rules.guard \
  || echo "Validation warnings found, but continuing..."
```

#### Phase 2: 新規テンプレートのみ必須
```bash
# 新規ファイルのみ厳密にチェック
if git diff --name-only --cached | grep -q "new-template.yaml"; then
  cfn-guard validate --data new-template.yaml --rules rules.guard
fi
```

#### Phase 3: 全テンプレート必須
```bash
# すべてのテンプレートで必須
cfn-guard validate --data templates/*.yaml --rules rules.guard
# 失敗時は終了コード 19 を返すため、CIが停止する
```

---

## まとめ

### CloudFormation Guardを使うことで:

1. ✅ **デプロイ前の問題発見** → 手戻り削減
2. ✅ **セキュリティ向上** → ベストプラクティス強制
3. ✅ **自動化** → CI/CDパイプライン統合
4. ✅ **一貫性** → 全チーム同じ基準
5. ✅ **学習効果** → 違反メッセージから学習

### 次のステップ

1. **基本ルールの作成**: 自組織のベストプラクティスをルール化
2. **CI/CDへの統合**: デプロイパイプラインに組み込み
3. **ルールの拡充**: 段階的にルールを追加
4. **チーム教育**: ルールの意図と背景を共有

---

## 参考リンク

- [CloudFormation Guard 公式ドキュメント](https://docs.aws.amazon.com/cfn-guard/latest/ug/what-is-guard.html)
- [CloudFormation Guard GitHub](https://github.com/aws-cloudformation/cloudformation-guard)
- [ルール言語リファレンス](https://docs.aws.amazon.com/cfn-guard/latest/ug/rule-language.html)
- [AWS Well-Architected Framework](https://aws.amazon.com/architecture/well-architected/)

---

**作成日**: 2025-12-20
**バージョン**: 1.0
**対象**: CloudFormation Guard 3.1.2
