# Route53 CloudFormation デプロイメントガイド

## 📋 概要

このガイドでは、Route53のホストゾーンとレコードセットをCloudFormation（IaC）で管理する方法を説明します。

## 📁 提供テンプレート

### 1. route53-template.yaml
**基本的なRoute53構成**
- ホストゾーン
- 各種DNSレコード（A、CNAME、MX、TXT、AAAA）
- シンプルな構成に最適

### 2. route53-alb-template.yaml
**高度なRoute53構成（ALB/CloudFront連携）**
- ALBとのAlias統合
- CloudFrontとのAlias統合
- ヘルスチェック
- フェイルオーバールーティング
- 地理的ルーティング
- 重み付けルーティング
- 本番環境向けの高可用性構成

## 🚀 デプロイ方法

### 基本テンプレートのデプロイ

```bash
# 1. テンプレートの検証
aws cloudformation validate-template \
  --template-body file://route53-template.yaml

# 2. スタックの作成
aws cloudformation create-stack \
  --stack-name my-route53-stack \
  --template-body file://route53-template.yaml \
  --parameters \
    ParameterKey=DomainName,ParameterValue=example.com \
    ParameterKey=WebServerIPAddress,ParameterValue=203.0.113.10 \
    ParameterKey=MailServerPriority,ParameterValue=10

# 3. スタック作成の進捗確認
aws cloudformation describe-stacks \
  --stack-name my-route53-stack \
  --query 'Stacks[0].StackStatus'

# 4. スタック作成完了待機
aws cloudformation wait stack-create-complete \
  --stack-name my-route53-stack

# 5. ネームサーバー情報の取得
aws cloudformation describe-stacks \
  --stack-name my-route53-stack \
  --query 'Stacks[0].Outputs'
```

### ALB統合テンプレートのデプロイ

```bash
# 前提: ALBが既に作成されていること

# 1. ALB情報の取得
ALB_DNS_NAME=$(aws elbv2 describe-load-balancers \
  --names my-application-load-balancer \
  --query 'LoadBalancers[0].DNSName' \
  --output text)

ALB_HOSTED_ZONE_ID=$(aws elbv2 describe-load-balancers \
  --names my-application-load-balancer \
  --query 'LoadBalancers[0].CanonicalHostedZoneId' \
  --output text)

# 2. スタックの作成
aws cloudformation create-stack \
  --stack-name my-route53-alb-stack \
  --template-body file://route53-alb-template.yaml \
  --parameters \
    ParameterKey=DomainName,ParameterValue=example.com \
    ParameterKey=ALBDNSName,ParameterValue=$ALB_DNS_NAME \
    ParameterKey=ALBHostedZoneId,ParameterValue=$ALB_HOSTED_ZONE_ID \
    ParameterKey=CreateCloudFrontRecord,ParameterValue=false

# 3. スタック作成完了待機
aws cloudformation wait stack-create-complete \
  --stack-name my-route53-alb-stack
```

### CloudFront統合の場合

```bash
# CloudFront Distribution情報の取得
CF_DOMAIN_NAME=$(aws cloudfront list-distributions \
  --query "DistributionList.Items[?Id=='E1234EXAMPLE'].DomainName" \
  --output text)

# スタック作成（CloudFront統合あり）
aws cloudformation create-stack \
  --stack-name my-route53-cf-stack \
  --template-body file://route53-alb-template.yaml \
  --parameters \
    ParameterKey=DomainName,ParameterValue=example.com \
    ParameterKey=ALBDNSName,ParameterValue=$ALB_DNS_NAME \
    ParameterKey=ALBHostedZoneId,ParameterValue=$ALB_HOSTED_ZONE_ID \
    ParameterKey=CloudFrontDNSName,ParameterValue=$CF_DOMAIN_NAME \
    ParameterKey=CreateCloudFrontRecord,ParameterValue=true
```

## 🔄 スタックの更新

```bash
# レコード追加・変更の場合
aws cloudformation update-stack \
  --stack-name my-route53-stack \
  --template-body file://route53-template.yaml \
  --parameters \
    ParameterKey=DomainName,ParameterValue=example.com \
    ParameterKey=WebServerIPAddress,ParameterValue=203.0.113.20

# 更新完了待機
aws cloudformation wait stack-update-complete \
  --stack-name my-route53-stack
```

## 📝 レコード追加方法

既存テンプレートにレコードを追加する場合、以下のように編集します：

```yaml
  # 新しいサブドメインAレコード
  NewSubdomainARecord:
    Type: AWS::Route53::RecordSet
    Properties:
      HostedZoneId: !Ref HostedZone
      Name: !Sub 'new-subdomain.${DomainName}'
      Type: A
      TTL: '300'
      ResourceRecords:
        - '203.0.113.50'

  # 新しいCNAMEレコード
  NewCNAMERecord:
    Type: AWS::Route53::RecordSet
    Properties:
      HostedZoneId: !Ref HostedZone
      Name: !Sub 'blog.${DomainName}'
      Type: CNAME
      TTL: '300'
      ResourceRecords:
        - !Sub 'www.${DomainName}'
```

## 🗑️ スタックの削除

```bash
# スタック削除
aws cloudformation delete-stack \
  --stack-name my-route53-stack

# 削除完了待機
aws cloudformation wait stack-delete-complete \
  --stack-name my-route53-stack
```

## ⚠️ 重要な注意事項

### 1. ドメイン登録とネームサーバー設定
- Route53でホストゾーンを作成後、ドメインレジストラでネームサーバーを設定する必要があります
- CloudFormation Outputsからネームサーバー情報を取得してください

```bash
# ネームサーバー情報の取得
aws cloudformation describe-stacks \
  --stack-name my-route53-stack \
  --query 'Stacks[0].Outputs[?OutputKey==`NameServers`].OutputValue' \
  --output text
```

### 2. レコードタイプの制約
- **CNAMEレコード**: ゾーンのAPEX（example.com）には設定できません
- **Aliasレコード**: APEXに設定可能で、AWS リソース（ALB、CloudFront等）との統合に使用

### 3. TTL（Time To Live）
- 短いTTL（300秒）: 頻繁に変更するレコード向け
- 長いTTL（3600秒以上）: 安定したレコード向け
- 変更時は事前にTTLを短くしておくことを推奨

### 4. ヘルスチェックの料金
- ヘルスチェックは有料サービスです（$0.50/月/ヘルスチェック）
- 不要な場合は削除してください

### 5. Hosted Zoneの料金
- $0.50/月/ホストゾーン
- クエリ料金は別途発生（100万クエリあたり$0.40）

## 🔍 ALB Hosted Zone ID 一覧（参考）

| リージョン | Hosted Zone ID |
|---------|----------------|
| us-east-1 | Z35SXDOTRQ7X7K |
| us-east-2 | Z3AADJGX6KTTL2 |
| us-west-1 | Z368ELLRRE2KJ0 |
| us-west-2 | Z1H1FL5HABSF5 |
| ap-northeast-1 | Z14GRHDCWA56QT |
| ap-northeast-2 | ZWKZPGTI48KDX |
| ap-south-1 | ZP97RAFLXTNZK |
| ap-southeast-1 | Z1LMS91P8CMLE5 |
| ap-southeast-2 | Z1GM3OXH4ZPM65 |
| eu-central-1 | Z215JYRZR1TBD5 |
| eu-west-1 | Z32O12XQLNTSW2 |
| eu-west-2 | ZHURV8PSTC4K8 |

**注意**: 最新情報はAWS公式ドキュメントを確認してください。

## 📚 よくある質問

### Q1: ドメインをRoute53に移管する必要がありますか？
**A**: いいえ。既存のドメインレジストラでネームサーバーをRoute53のネームサーバーに変更するだけで使用できます。

### Q2: 複数のドメインを管理できますか？
**A**: はい。各ドメインごとにスタックを作成するか、1つのテンプレートで複数のホストゾーンを定義できます。

### Q3: Route53のエイリアスとCNAMEの違いは？
**A**:
- **Alias**: AWS リソース専用、APEXで使用可能、クエリ無料
- **CNAME**: 汎用的、APEXで使用不可、通常のクエリ料金

### Q4: レコード変更の反映時間は？
**A**: TTL値に依存します。TTL=300秒の場合、最大5分で反映されます。

## 🔗 関連リンク

- [Route53 Developer Guide](https://docs.aws.amazon.com/route53/)
- [CloudFormation Route53 Resource Reference](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/AWS_Route53.html)
- [Route53 Pricing](https://aws.amazon.com/route53/pricing/)

## 📞 サポート

テンプレートの問題や質問がある場合は、CloudFormationのスタックイベントを確認してください：

```bash
aws cloudformation describe-stack-events \
  --stack-name my-route53-stack \
  --max-items 10
```
