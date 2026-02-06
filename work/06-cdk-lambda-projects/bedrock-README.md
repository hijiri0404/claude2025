# Bedrock Image Generation Website - AWS CDK

AWS CDKを使用したAmazon Bedrockベースの画像生成Webサイトのインフラストラクチャコード

## 📋 概要

このプロジェクトは、Amazon Bedrockの画像生成モデル（Stable Diffusion XL / Titan Image Generator）を活用した、
セキュアでスケーラブルなサーバーレス画像生成アプリケーションのインフラストラクチャを構築します。

## 🏗️ アーキテクチャ

### 主要コンポーネント

- **Amazon Cognito**: ユーザー認証・認可
- **Amazon API Gateway**: RESTful APIエンドポイント
- **AWS Lambda**: Bedrock API呼び出しと画像処理
- **Amazon Bedrock**: AI画像生成（Stable Diffusion XL / Titan）
- **Amazon S3**: 生成画像とWebアセットの保存
- **Amazon CloudFront**: グローバルCDN配信
- **AWS IAM**: アクセス制御とセキュリティ

### デプロイされるリソース

1. **Cognito User Pool**: ユーザー管理とJWT認証
2. **S3 Buckets**:
   - 生成画像保存用（30日自動削除）
   - Webサイトアセット用
3. **Lambda Function**: 画像生成処理
4. **API Gateway**: `/generate` エンドポイント（Cognito認証）
5. **CloudFront Distribution**: 高速配信とキャッシング
6. **IAM Roles/Policies**: 最小権限の原則

## 📦 前提条件

### 必須ツール

- Node.js 20.x以上
- AWS CLI 2.x
- AWS CDK 2.170.0以上
- TypeScript 5.x

### AWS権限

以下のサービスへの権限が必要です：

- IAM（ロール・ポリシー作成）
- CloudFormation（スタック管理）
- S3（バケット作成）
- Lambda（関数作成）
- API Gateway（API作成）
- Cognito（User Pool作成）
- CloudFront（Distribution作成）
- **Bedrock（モデルアクセス）**

### ⚠️ 重要: Bedrockモデルアクセス申請

デプロイ前に、AWSコンソールでBedrockモデルへのアクセスを申請してください：

1. AWSコンソール → Amazon Bedrock
2. 左メニュー → Model access
3. 以下のモデルをリクエスト：
   - **Stable Diffusion XL** (`stability.stable-diffusion-xl-v1`)
   - **Titan Image Generator** (`amazon.titan-image-generator-v1`)
4. 承認まで数分～数時間待機

**注意**: Bedrockは限定リージョンのみ利用可能（us-east-1, us-west-2等）

## 🚀 セットアップ手順

### 1. リポジトリのクローンと依存関係インストール

```bash
# プロジェクトディレクトリに移動
cd bedrock-image-gen-cdk

# ルートの依存関係をインストール
npm install

# Lambda関数の依存関係をインストール
cd lambda/image-generator
npm install
cd ../..
```

### 2. AWS認証情報の設定

```bash
# AWS CLIの設定
aws configure

# または環境変数で設定
export AWS_PROFILE=your-profile
export AWS_REGION=us-east-1  # Bedrockが利用可能なリージョン
```

### 3. CDKブートストラップ（初回のみ）

```bash
# AWSアカウントにCDKをブートストラップ
cdk bootstrap aws://ACCOUNT-ID/REGION
```

### 4. CDKスタックのデプロイ

```bash
# CloudFormationテンプレートの生成と検証
npm run synth

# デプロイ内容の確認
npm run diff

# デプロイ実行
npm run deploy

# または直接
cdk deploy
```

デプロイには約10-15分かかります。

### 5. デプロイ完了後の出力確認

デプロイ完了後、以下の情報が出力されます：

```
Outputs:
BedrockImageGenStack.UserPoolId = us-east-1_XXXXX
BedrockImageGenStack.UserPoolClientId = xxxxxxxxxxxxx
BedrockImageGenStack.ApiEndpoint = https://xxxxx.execute-api.us-east-1.amazonaws.com/prod/
BedrockImageGenStack.ImagesBucketName = bedrock-images-xxxxx-us-east-1
BedrockImageGenStack.WebsiteBucketName = bedrock-website-xxxxx-us-east-1
BedrockImageGenStack.DistributionDomainName = xxxxx.cloudfront.net
BedrockImageGenStack.DistributionId = XXXXXXXXXXXXX
```

これらの値をフロントエンドアプリケーションの設定に使用します。

## 🔧 Lambda関数のローカルビルド

```bash
cd lambda/image-generator
npm run build
```

## 📝 API使用方法

### エンドポイント

```
POST https://xxxxx.execute-api.us-east-1.amazonaws.com/prod/generate
```

### リクエストヘッダー

```
Authorization: Bearer <Cognito JWT Token>
Content-Type: application/json
```

### リクエストボディ

```json
{
  "prompt": "A beautiful sunset over mountains",
  "negativePrompt": "blurry, low quality",
  "model": "stability",
  "width": 512,
  "height": 512,
  "cfgScale": 7,
  "steps": 50
}
```

### パラメータ

| パラメータ | 型 | 必須 | デフォルト | 説明 |
|-----------|-----|------|-----------|------|
| prompt | string | ✅ | - | 画像生成プロンプト |
| negativePrompt | string | ❌ | - | ネガティブプロンプト |
| model | string | ❌ | "stability" | "stability" または "titan" |
| width | number | ❌ | 512 | 画像幅（64の倍数） |
| height | number | ❌ | 512 | 画像高さ（64の倍数） |
| cfgScale | number | ❌ | 7 | CFGスケール（1-35） |
| steps | number | ❌ | 50 | 生成ステップ数（10-150） |

### レスポンス

```json
{
  "success": true,
  "imageKey": "user-id/uuid.png",
  "imageUrl": "https://bedrock-images-xxxxx.s3.us-east-1.amazonaws.com/user-id/uuid.png",
  "model": "stability.stable-diffusion-xl-v1",
  "prompt": "A beautiful sunset over mountains"
}
```

## 🔐 セキュリティ

### 実装されているセキュリティ機能

1. **認証・認可**
   - Cognito User Poolsによる認証
   - API GatewayのCognitoオーソライザー
   - JWTトークンベースのアクセス制御

2. **暗号化**
   - S3バケットのサーバーサイド暗号化（SSE-S3）
   - CloudFrontのHTTPS強制
   - API GatewayのTLS 1.2以上

3. **アクセス制御**
   - S3バケットのパブリックアクセスブロック
   - CloudFront Origin Access Identity (OAI)
   - Lambda実行ロールの最小権限

4. **CDK Nag**
   - AWS Well-Architected Framework準拠
   - セキュリティベストプラクティスの自動チェック

### 本番環境への推奨事項

- [ ] カスタムドメインの設定（Route 53 + ACM）
- [ ] CORS設定の厳格化（特定ドメインのみ許可）
- [ ] API Gatewayのレート制限調整
- [ ] CloudWatch Alarmの設定
- [ ] AWS WAFの導入（DDoS対策）
- [ ] Cognito Advanced Security の有効化
- [ ] S3バケットのライフサイクルポリシー調整
- [ ] Lambda予約済み同時実行数の設定

## 💰 コスト試算

### 月間想定（ユーザー1,000人、画像10,000枚）

| サービス | 推定コスト（USD） |
|---------|------------------|
| Cognito | $10 |
| API Gateway | $4 |
| Lambda | $5 |
| **Bedrock画像生成** | **$200-400** |
| S3 | $10 |
| CloudFront | $10 |
| **合計** | **$239-439** |

**注意**: Bedrockの画像生成コストが大部分を占めます。

### コスト削減のヒント

- ユーザー当たりの生成制限実装
- 画像サイズの制限（512x512推奨）
- S3ライフサイクルポリシーの活用
- CloudFrontキャッシュTTLの最適化

## 🧪 テスト

### CDKスタックのテスト

```bash
npm test
```

### API のテスト

```bash
# Cognito ユーザー作成
aws cognito-idp sign-up \
  --client-id YOUR_CLIENT_ID \
  --username user@example.com \
  --password 'Password123!'

# メール確認
aws cognito-idp confirm-sign-up \
  --client-id YOUR_CLIENT_ID \
  --username user@example.com \
  --confirmation-code XXXXXX

# ログインしてトークン取得
aws cognito-idp initiate-auth \
  --client-id YOUR_CLIENT_ID \
  --auth-flow USER_PASSWORD_AUTH \
  --auth-parameters USERNAME=user@example.com,PASSWORD='Password123!'

# API呼び出し
curl -X POST https://YOUR_API_ENDPOINT/prod/generate \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "A beautiful sunset over mountains",
    "model": "stability"
  }'
```

## 🔄 更新とメンテナンス

### スタックの更新

```bash
# 変更内容の確認
npm run diff

# 更新のデプロイ
npm run deploy
```

### Lambda関数コードの更新

```bash
cd lambda/image-generator
npm run build
cd ../..
npm run deploy
```

### CloudFrontキャッシュの無効化

```bash
aws cloudfront create-invalidation \
  --distribution-id YOUR_DISTRIBUTION_ID \
  --paths "/*"
```

## 🗑️ リソースの削除

```bash
# スタック全体を削除
npm run destroy

# または
cdk destroy
```

**⚠️ 警告**: この操作はすべてのリソース（生成画像を含む）を削除します。

## 📊 監視とロギング

### CloudWatch Logs

- Lambda実行ログ: `/aws/lambda/bedrock-image-generator`
- API Gatewayログ: 自動作成

### メトリクス監視

```bash
# Lambda実行回数
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Invocations \
  --dimensions Name=FunctionName,Value=bedrock-image-generator \
  --start-time 2024-01-01T00:00:00Z \
  --end-time 2024-01-02T00:00:00Z \
  --period 3600 \
  --statistics Sum
```

## 🐛 トラブルシューティング

### よくある問題

#### 1. Bedrock AccessDeniedException

**原因**: モデルアクセスが未承認

**解決策**: AWSコンソール → Bedrock → Model access でモデルを有効化

#### 2. Lambda Timeout

**原因**: 画像生成に時間がかかる

**解決策**: Lambda タイムアウトを増やす（現在60秒）

#### 3. CORS エラー

**原因**: フロントエンドドメインが許可されていない

**解決策**: API GatewayのCORS設定を更新

#### 4. 403 Forbidden (CloudFront)

**原因**: OAI設定またはS3バケットポリシーの問題

**解決策**: CloudFormation スタックを再デプロイ

## 📚 参考リンク

- [AWS CDK ドキュメント](https://docs.aws.amazon.com/cdk/)
- [Amazon Bedrock 開発者ガイド](https://docs.aws.amazon.com/bedrock/)
- [Stable Diffusion XL on Bedrock](https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-diffusion.html)
- [Titan Image Generator](https://docs.aws.amazon.com/bedrock/latest/userguide/titan-image-models.html)
- [CDK Nag](https://github.com/cdklabs/cdk-nag)

## 🤝 貢献

プルリクエストを歓迎します！

## 📄 ライセンス

MIT License

## 📧 サポート

問題や質問がある場合は、GitHubのIssuesセクションで報告してください。
