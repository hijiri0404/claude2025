# hijiri0404.link Route53 デプロイメントガイド

## 📋 概要

hijiri0404.link ドメイン用のRoute53設定を CloudFormation（IaC）で管理します。

## 📁 提供テンプレート

### 1. hijiri0404-link-basic.yaml
**シンプルな構成**
- ホストゾーンのみ作成
- 静的IPアドレス使用時のAレコード（オプション）
- 初期セットアップや検証用

### 2. hijiri0404-link-production.yaml ⭐ **推奨**
**本番環境向け構成**
- ALB統合（Aliasレコード）
- CloudFront統合（Aliasレコード）
- ヘルスチェック機能
- 複数サブドメイン対応
- IPv6対応

## 🚀 デプロイ手順

### ステップ1: ホストゾーンのみ作成（初期セットアップ）

```bash
# 基本テンプレートでホストゾーンだけ作成
aws cloudformation create-stack \
  --stack-name hijiri0404-link-route53 \
  --template-body file://hijiri0404-link-basic.yaml \
  --parameters \
    ParameterKey=UseStaticIP,ParameterValue=false \
  --region ap-northeast-1

# スタック作成完了待機
aws cloudformation wait stack-create-complete \
  --stack-name hijiri0404-link-route53 \
  --region ap-northeast-1

# ネームサーバー情報の取得
aws cloudformation describe-stacks \
  --stack-name hijiri0404-link-route53 \
  --region ap-northeast-1 \
  --query 'Stacks[0].Outputs'
```

### ステップ2: ドメインレジストラでネームサーバー設定

取得したネームサーバー（4つ）を、ドメインレジストラの管理画面で設定します。

**例**:
```
ns-123.awsdns-12.com
ns-456.awsdns-34.net
ns-789.awsdns-56.org
ns-012.awsdns-78.co.uk
```

**反映確認**（10分〜48時間かかる場合があります）:
```bash
dig hijiri0404.link NS +short
# または
nslookup -type=NS hijiri0404.link
```

### ステップ3: ALB/CloudFrontレコードの追加

#### パターンA: ALBのみ使用

```bash
# ALB情報の取得
ALB_DNS_NAME=$(aws elbv2 describe-load-balancers \
  --names your-alb-name \
  --region ap-northeast-1 \
  --query 'LoadBalancers[0].DNSName' \
  --output text)

echo "ALB DNS Name: $ALB_DNS_NAME"

# スタック更新（本番テンプレートに切り替え）
aws cloudformation update-stack \
  --stack-name hijiri0404-link-route53 \
  --template-body file://hijiri0404-link-production.yaml \
  --parameters \
    ParameterKey=ALBDNSName,ParameterValue=$ALB_DNS_NAME \
    ParameterKey=ALBHostedZoneId,ParameterValue=Z14GRHDCWA56QT \
    ParameterKey=CreateALBRecords,ParameterValue=true \
    ParameterKey=CreateCloudFrontRecords,ParameterValue=false \
    ParameterKey=EnableHealthCheck,ParameterValue=true \
  --region ap-northeast-1

# 更新完了待機
aws cloudformation wait stack-update-complete \
  --stack-name hijiri0404-link-route53 \
  --region ap-northeast-1
```

#### パターンB: ALB + CloudFront両方使用

```bash
# CloudFront情報の取得
CF_DOMAIN_NAME=$(aws cloudfront list-distributions \
  --query "DistributionList.Items[?Aliases.Items[?contains(@, 'hijiri0404.link')]].DomainName | [0]" \
  --output text)

echo "CloudFront Domain Name: $CF_DOMAIN_NAME"

# スタック更新
aws cloudformation update-stack \
  --stack-name hijiri0404-link-route53 \
  --template-body file://hijiri0404-link-production.yaml \
  --parameters \
    ParameterKey=ALBDNSName,ParameterValue=$ALB_DNS_NAME \
    ParameterKey=ALBHostedZoneId,ParameterValue=Z14GRHDCWA56QT \
    ParameterKey=CloudFrontDNSName,ParameterValue=$CF_DOMAIN_NAME \
    ParameterKey=CreateALBRecords,ParameterValue=true \
    ParameterKey=CreateCloudFrontRecords,ParameterValue=true \
    ParameterKey=EnableHealthCheck,ParameterValue=true \
  --region ap-northeast-1
```

## 📝 作成されるサブドメイン一覧

### ALB統合時
- `hijiri0404.link` - ルートドメイン
- `www.hijiri0404.link` - WWWサブドメイン
- `blog.hijiri0404.link` - ブログ
- `api.hijiri0404.link` - API
- `dev.hijiri0404.link` - 開発環境
- `staging.hijiri0404.link` - ステージング環境
- `admin.hijiri0404.link` - 管理画面

### CloudFront統合時（追加）
- `cdn.hijiri0404.link` - CDN（静的コンテンツ配信）
- `static.hijiri0404.link` - 静的ファイル

## 🔧 レコードの追加方法

新しいサブドメインを追加する場合、テンプレートに追記します：

```yaml
  # 新しいサブドメイン追加例
  DocsALBAliasRecord:
    Type: AWS::Route53::RecordSet
    Condition: HasALB
    Properties:
      HostedZoneId: !Ref HostedZone
      Name: 'docs.hijiri0404.link'
      Type: A
      AliasTarget:
        DNSName: !Ref ALBDNSName
        HostedZoneId: !Ref ALBHostedZoneId
        EvaluateTargetHealth: true
```

その後、スタックを更新：

```bash
aws cloudformation update-stack \
  --stack-name hijiri0404-link-route53 \
  --template-body file://hijiri0404-link-production.yaml \
  --parameters \
    ParameterKey=ALBDNSName,UsePreviousValue=true \
    ParameterKey=ALBHostedZoneId,UsePreviousValue=true \
    ParameterKey=CreateALBRecords,UsePreviousValue=true \
    ParameterKey=CreateCloudFrontRecords,UsePreviousValue=true \
    ParameterKey=EnableHealthCheck,UsePreviousValue=true \
  --region ap-northeast-1
```

## 🔍 確認方法

### DNS設定の確認

```bash
# 各サブドメインの確認
dig hijiri0404.link +short
dig www.hijiri0404.link +short
dig blog.hijiri0404.link +short
dig api.hijiri0404.link +short
dig cdn.hijiri0404.link +short

# NSレコードの確認
dig hijiri0404.link NS +short

# DNSSECの確認（設定している場合）
dig hijiri0404.link DNSKEY +short
```

### ヘルスチェックの確認

```bash
# ヘルスチェックのステータス確認
aws cloudformation describe-stacks \
  --stack-name hijiri0404-link-route53 \
  --region ap-northeast-1 \
  --query 'Stacks[0].Outputs[?OutputKey==`HealthCheckId`].OutputValue' \
  --output text | \
xargs -I {} aws route53 get-health-check-status \
  --health-check-id {} \
  --region ap-northeast-1
```

### ブラウザでの確認

```bash
# HTTPSでアクセス可能か確認
curl -I https://hijiri0404.link
curl -I https://www.hijiri0404.link
curl -I https://api.hijiri0404.link
```

## ⚠️ 重要な注意事項

### 1. リージョン設定
- Route53はグローバルサービスですが、スタックは `ap-northeast-1` で作成
- ALBのHosted Zone IDは東京リージョン（ap-northeast-1）用: `Z14GRHDCWA56QT`

### 2. 料金
- **Hosted Zone**: $0.50/月
- **DNS クエリ**: 100万クエリあたり $0.40
- **ヘルスチェック**: $0.50/月（有効化した場合）
- **Aliasレコード**: クエリ無料 ⭐

### 3. 証明書（SSL/TLS）
- Route53設定とは別に、ACM（AWS Certificate Manager）で証明書を取得する必要があります
- ALB用: `ap-northeast-1` リージョンで取得
- CloudFront用: `us-east-1` リージョンで取得（必須）

### 4. TTL（Time To Live）
- Aliasレコード: TTLは自動設定（Route53が管理）
- 通常のAレコード: 300秒（5分）に設定

### 5. ヘルスチェックの動作
- 30秒間隔でチェック
- 3回連続失敗で「Unhealthy」判定
- HTTPSエンドポイントの `/` をチェック

## 🛡️ セキュリティベストプラクティス

### 1. DNSSEC有効化（推奨）

```bash
# DNSSEC署名の有効化
aws route53 enable-hosted-zone-dnssec \
  --hosted-zone-id $(aws cloudformation describe-stacks \
    --stack-name hijiri0404-link-route53 \
    --region ap-northeast-1 \
    --query 'Stacks[0].Outputs[?OutputKey==`HostedZoneId`].OutputValue' \
    --output text)
```

### 2. CloudWatch監視設定

Route53のヘルスチェックをCloudWatchアラームと連携：

```bash
# アラーム作成例
aws cloudwatch put-metric-alarm \
  --alarm-name hijiri0404-link-health-check-alarm \
  --alarm-description "hijiri0404.link health check failed" \
  --metric-name HealthCheckStatus \
  --namespace AWS/Route53 \
  --statistic Minimum \
  --period 60 \
  --threshold 1 \
  --comparison-operator LessThanThreshold \
  --evaluation-periods 2 \
  --region us-east-1
```

## 🗑️ スタックの削除

```bash
# 削除前の確認
aws cloudformation describe-stacks \
  --stack-name hijiri0404-link-route53 \
  --region ap-northeast-1

# スタック削除
aws cloudformation delete-stack \
  --stack-name hijiri0404-link-route53 \
  --region ap-northeast-1

# 削除完了待機
aws cloudformation wait stack-delete-complete \
  --stack-name hijiri0404-link-route53 \
  --region ap-northeast-1
```

**注意**: スタック削除後も、ドメインレジストラのネームサーバー設定は自動削除されません。手動で元に戻す必要があります。

## 📚 トラブルシューティング

### Q1: ネームサーバーが反映されない
**A**: DNS伝播には最大48時間かかる場合があります。以下で確認：
```bash
dig hijiri0404.link NS @8.8.8.8  # Google DNSで確認
dig hijiri0404.link NS @1.1.1.1  # Cloudflare DNSで確認
```

### Q2: ALBに接続できない
**A**: 以下を確認：
1. ALBのセキュリティグループでHTTP/HTTPS許可
2. ターゲットグループにHealthyなターゲット存在
3. Route53のヘルスチェックステータス

### Q3: スタック更新に失敗する
**A**: 変更セットで事前確認：
```bash
aws cloudformation create-change-set \
  --stack-name hijiri0404-link-route53 \
  --change-set-name update-records \
  --template-body file://hijiri0404-link-production.yaml \
  --region ap-northeast-1

aws cloudformation describe-change-set \
  --stack-name hijiri0404-link-route53 \
  --change-set-name update-records \
  --region ap-northeast-1
```

## 🔗 関連リンク

- [Route53 Developer Guide](https://docs.aws.amazon.com/route53/)
- [ALB Integration](https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/routing-to-elb-load-balancer.html)
- [CloudFront Integration](https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/routing-to-cloudfront-distribution.html)
- [Route53 Pricing](https://aws.amazon.com/route53/pricing/)

## ✅ デプロイチェックリスト

- [ ] テンプレートファイルを確認
- [ ] AWS CLIがインストール済み
- [ ] 適切なAWSプロファイル設定
- [ ] ALB/CloudFrontが作成済み（本番テンプレート使用時）
- [ ] スタック作成実行
- [ ] ネームサーバー情報取得
- [ ] ドメインレジストラでネームサーバー設定
- [ ] DNS伝播確認（dig/nslookup）
- [ ] ヘルスチェック確認（本番テンプレート使用時）
- [ ] ブラウザでアクセス確認
- [ ] SSL/TLS証明書設定（ACM）
- [ ] CloudWatch監視設定（オプション）
