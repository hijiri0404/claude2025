# CloudFront + S3 静的Webサイト構築ガイド

## 📋 概要

このドキュメントは、Amazon CloudFront と S3 を使用して、カスタムドメイン（www.hijiri0404.link）でアクセス可能な静的Webサイトを構築する完全なガイドです。

## 🏗️ アーキテクチャ

```
[ユーザー]
    ↓ HTTPS (www.hijiri0404.link)
[Route 53]
    ↓ Alias レコード
[CloudFront Distribution]
    ↓ Origin Access Control (OAC)
[S3 Bucket] (www-hijiri0404-link)
    └── index.html
```

### 主要コンポーネント

1. **Amazon S3**: 静的コンテンツのストレージ
2. **Amazon CloudFront**: グローバルCDN、HTTPS配信
3. **AWS Certificate Manager (ACM)**: SSL/TLS証明書管理
4. **Amazon Route 53**: DNSサービス
5. **Origin Access Control (OAC)**: S3バケットのセキュアなアクセス制御

## 🚀 デプロイ手順

### 前提条件

- AWS CLIがインストール・設定済み
- Route 53でドメイン（hijiri0404.link）が登録済み
- 適切なIAM権限

### Step 1: Route53ホストゾーン確認

```bash
# ホストゾーンの存在確認
aws route53 list-hosted-zones --query "HostedZones[?Name=='hijiri0404.link.']" --output json

# 結果例
# HostedZone ID: Z05608792OMRUEGE6GF3A
```

### Step 2: S3バケット作成

```bash
# S3バケット作成（リージョン: ap-northeast-1）
aws s3 mb s3://www-hijiri0404-link --region ap-northeast-1

# パブリックアクセスブロック設定（OAC使用のためブロック）
aws s3api put-public-access-block \
  --bucket www-hijiri0404-link \
  --public-access-block-configuration \
  "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"
```

### Step 3: ACM証明書作成（重要: us-east-1リージョン）

```bash
# CloudFront用ACM証明書はus-east-1で作成必須
CERT_ARN=$(aws acm request-certificate \
  --domain-name www.hijiri0404.link \
  --validation-method DNS \
  --region us-east-1 \
  --query 'CertificateArn' \
  --output text)

echo "Certificate ARN: $CERT_ARN"
# 結果: arn:aws:acm:us-east-1:471112657080:certificate/6cb6eb35-a9c8-4add-85f1-6fd240514d26
```

### Step 4: DNS検証レコード追加

```bash
# 証明書のDNS検証レコード取得
aws acm describe-certificate \
  --certificate-arn $CERT_ARN \
  --region us-east-1 \
  --query 'Certificate.DomainValidationOptions[0].ResourceRecord'

# Route53に検証レコード追加
cat > /tmp/acm-validation.json << 'EOF'
{
  "Changes": [
    {
      "Action": "CREATE",
      "ResourceRecordSet": {
        "Name": "_6200ac1942b7c447deda1caad51701b7.www.hijiri0404.link.",
        "Type": "CNAME",
        "TTL": 300,
        "ResourceRecords": [
          {
            "Value": "_279a8e717eec17f9b590a1af425af9a5.xlfgrmvvlj.acm-validations.aws."
          }
        ]
      }
    }
  ]
}
EOF

aws route53 change-resource-record-sets \
  --hosted-zone-id Z05608792OMRUEGE6GF3A \
  --change-batch file:///tmp/acm-validation.json
```

### Step 5: 証明書検証ステータス確認

```bash
# 証明書が検証されるまで待機（通常3-5分）
aws acm describe-certificate \
  --certificate-arn $CERT_ARN \
  --region us-east-1 \
  --query 'Certificate.Status' \
  --output text

# 結果が "ISSUED" になるまで待機
```

### Step 6: Origin Access Control (OAC) 作成

```bash
# OAC設定ファイル作成
cat > /tmp/oac-config.json << 'EOF'
{
  "Name": "S3-OAC-www-hijiri0404-link",
  "Description": "Origin Access Control for www-hijiri0404-link S3 bucket",
  "SigningProtocol": "sigv4",
  "SigningBehavior": "always",
  "OriginAccessControlOriginType": "s3"
}
EOF

# OAC作成
OAC_ID=$(aws cloudfront create-origin-access-control \
  --origin-access-control-config file:///tmp/oac-config.json \
  --query 'OriginAccessControl.Id' \
  --output text)

echo "OAC ID: $OAC_ID"
# 結果: E34MUDWFZNL89N
```

### Step 7: CloudFront Distribution作成

```bash
# Distribution設定ファイル作成
cat > /tmp/cf-distribution-config.json << EOF
{
  "CallerReference": "www-hijiri0404-link-$(date +%s)",
  "Comment": "CloudFront Distribution for www.hijiri0404.link",
  "Enabled": true,
  "DefaultRootObject": "index.html",
  "Origins": {
    "Quantity": 1,
    "Items": [
      {
        "Id": "S3-www-hijiri0404-link",
        "DomainName": "www-hijiri0404-link.s3.ap-northeast-1.amazonaws.com",
        "OriginAccessControlId": "$OAC_ID",
        "S3OriginConfig": {
          "OriginAccessIdentity": ""
        }
      }
    ]
  },
  "DefaultCacheBehavior": {
    "TargetOriginId": "S3-www-hijiri0404-link",
    "ViewerProtocolPolicy": "redirect-to-https",
    "AllowedMethods": {
      "Quantity": 2,
      "Items": ["GET", "HEAD"],
      "CachedMethods": {
        "Quantity": 2,
        "Items": ["GET", "HEAD"]
      }
    },
    "Compress": true,
    "CachePolicyId": "658327ea-f89d-4fab-a63d-7e88639e58f6",
    "OriginRequestPolicyId": "88a5eaf4-2fd4-4709-b370-b4c650ea3fcf"
  },
  "Aliases": {
    "Quantity": 1,
    "Items": ["www.hijiri0404.link"]
  },
  "ViewerCertificate": {
    "ACMCertificateArn": "$CERT_ARN",
    "SSLSupportMethod": "sni-only",
    "MinimumProtocolVersion": "TLSv1.2_2021"
  },
  "PriceClass": "PriceClass_All",
  "HttpVersion": "http2and3"
}
EOF

# Distribution作成
DIST_OUTPUT=$(aws cloudfront create-distribution \
  --distribution-config file:///tmp/cf-distribution-config.json \
  --query 'Distribution.[Id,DomainName]' \
  --output json)

DIST_ID=$(echo $DIST_OUTPUT | jq -r '.[0]')
DIST_DOMAIN=$(echo $DIST_OUTPUT | jq -r '.[1]')

echo "Distribution ID: $DIST_ID"
echo "Distribution Domain: $DIST_DOMAIN"
# 結果:
# Distribution ID: EEGQIBAL9KXND
# Distribution Domain: d1p2n8rptkbvmj.cloudfront.net
```

### Step 8: S3バケットポリシー設定

```bash
# S3バケットポリシー作成（CloudFrontからのアクセス許可）
cat > /tmp/bucket-policy.json << EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowCloudFrontServicePrincipal",
      "Effect": "Allow",
      "Principal": {
        "Service": "cloudfront.amazonaws.com"
      },
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::www-hijiri0404-link/*",
      "Condition": {
        "StringEquals": {
          "AWS:SourceArn": "arn:aws:cloudfront::471112657080:distribution/$DIST_ID"
        }
      }
    }
  ]
}
EOF

# バケットポリシー適用
aws s3api put-bucket-policy \
  --bucket www-hijiri0404-link \
  --policy file:///tmp/bucket-policy.json
```

### Step 9: Route53 Aliasレコード追加

```bash
# Route53 Aliasレコード設定
cat > /tmp/route53-alias.json << EOF
{
  "Changes": [
    {
      "Action": "CREATE",
      "ResourceRecordSet": {
        "Name": "www.hijiri0404.link",
        "Type": "A",
        "AliasTarget": {
          "HostedZoneId": "Z2FDTNDATAQYW2",
          "DNSName": "$DIST_DOMAIN",
          "EvaluateTargetHealth": false
        }
      }
    }
  ]
}
EOF

# Aliasレコード作成
aws route53 change-resource-record-sets \
  --hosted-zone-id Z05608792OMRUEGE6GF3A \
  --change-batch file:///tmp/route53-alias.json
```

**重要**: CloudFrontのHostedZone IDは固定値 `Z2FDTNDATAQYW2` です。

### Step 10: コンテンツアップロード

```bash
# サンプルindex.htmlをS3にアップロード
aws s3 cp index.html s3://www-hijiri0404-link/index.html --content-type "text/html"
```

### Step 11: デプロイ完了確認

```bash
# CloudFront Distributionのステータス確認
aws cloudfront get-distribution \
  --id $DIST_ID \
  --query 'Distribution.Status' \
  --output text

# "Deployed" になるまで待機（通常10-15分）
```

## ✅ 動作確認

### 1. CloudFrontドメインでのアクセス確認

```bash
curl -I https://$DIST_DOMAIN
# HTTP/2 200 が返ればOK
```

### 2. カスタムドメインでのアクセス確認

```bash
# DNS伝播を確認
dig www.hijiri0404.link

# ブラウザでアクセス
# https://www.hijiri0404.link
```

### 3. HTTPSリダイレクト確認

```bash
curl -I http://www.hijiri0404.link
# 301/302リダイレクトでHTTPSにリダイレクトされることを確認
```

## 📊 作成されたリソース一覧

| リソース | 識別子 | リージョン/グローバル |
|---------|--------|---------------------|
| S3 Bucket | www-hijiri0404-link | ap-northeast-1 |
| ACM Certificate | arn:aws:acm:us-east-1:471112657080:certificate/6cb6eb35-a9c8-4add-85f1-6fd240514d26 | us-east-1 |
| Origin Access Control | E34MUDWFZNL89N | Global |
| CloudFront Distribution | EEGQIBAL9KXND | Global |
| Route53 Hosted Zone | Z05608792OMRUEGE6GF3A | Global |
| Route53 Record | www.hijiri0404.link (A) | - |

## 🔧 運用管理

### コンテンツ更新

```bash
# 新しいファイルをアップロード
aws s3 cp new-file.html s3://www-hijiri0404-link/new-file.html

# CloudFrontキャッシュを無効化
aws cloudfront create-invalidation \
  --distribution-id EEGQIBAL9KXND \
  --paths "/*"
```

### ログ確認

CloudFrontアクセスログを有効化する場合:

```bash
# ログ用S3バケット作成
aws s3 mb s3://www-hijiri0404-link-logs

# CloudFront Distributionにログ設定を追加（Distribution更新が必要）
```

## 🛡️ セキュリティベストプラクティス

1. ✅ **Origin Access Control (OAC)**: S3への直接アクセスをブロック
2. ✅ **HTTPS強制**: `ViewerProtocolPolicy: redirect-to-https`
3. ✅ **最新TLS**: `MinimumProtocolVersion: TLSv1.2_2021`
4. ✅ **S3パブリックアクセスブロック**: 全て有効化
5. ✅ **ACM証明書**: AWS管理の自動更新

## 💰 コスト試算（月間）

- **CloudFront**: データ転送量に応じて課金
  - 最初の10TB: $0.114/GB
- **S3**: ストレージとリクエスト数
  - ストレージ: $0.025/GB
  - GETリクエスト: $0.00037/1,000リクエスト
- **Route 53**:
  - ホストゾーン: $0.50/月
  - クエリ: $0.40/100万クエリ
- **ACM**: 無料

**想定月額コスト**: 約$5-20（トラフィック10GB-100GB想定）

## 🔍 トラブルシューティング

### 問題1: 403 Forbiddenエラー

**原因**: S3バケットポリシーが正しく設定されていない

**解決策**:
```bash
# バケットポリシーを再確認
aws s3api get-bucket-policy --bucket www-hijiri0404-link --query Policy --output text | jq .
```

### 問題2: 証明書エラー

**原因**: ACM証明書がus-east-1以外で作成された

**解決策**: us-east-1リージョンで証明書を再作成

### 問題3: DNS解決できない

**原因**: DNS伝播に時間がかかっている

**解決策**:
```bash
# DNS伝播状況確認
dig www.hijiri0404.link +trace
```

## 📚 参考リンク

- [AWS CloudFront Developer Guide](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/)
- [S3 Static Website Hosting](https://docs.aws.amazon.com/AmazonS3/latest/userguide/WebsiteHosting.html)
- [ACM User Guide](https://docs.aws.amazon.com/acm/latest/userguide/)
- [Route 53 Developer Guide](https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/)

## 🎯 Next Steps

1. **CloudWatch監視**: メトリクスとアラーム設定
2. **WAF統合**: セキュリティルール追加
3. **Lambda@Edge**: 動的コンテンツ生成
4. **S3バージョニング**: ロールバック機能
5. **CI/CD統合**: GitHub Actions等での自動デプロイ

---

**作成日**: 2025-12-11
**最終更新**: 2025-12-11
**バージョン**: 1.0.0
