# Bedrock Image Generation - デプロイガイド

## 📋 デプロイチェックリスト

このガイドに従って、Bedrock画像生成WebサイトをAWSにデプロイします。

### Phase 1: 事前準備（5-10分）

- [ ] **1.1 AWSアカウントの確認**
  - AWSアカウントを準備
  - 管理者権限または必要な権限を確認

- [ ] **1.2 ローカル環境の準備**
  ```bash
  # Node.js 20.x以上をインストール
  node --version  # v20.x.x以上

  # AWS CLI 2.xをインストール
  aws --version   # aws-cli/2.x.x以上

  # AWS CDK 2.xをインストール
  npm install -g aws-cdk
  cdk --version   # 2.170.0以上
  ```

- [ ] **1.3 AWS認証情報の設定**
  ```bash
  # AWS CLIの設定
  aws configure
  # AWS Access Key ID: YOUR_ACCESS_KEY
  # AWS Secret Access Key: YOUR_SECRET_KEY
  # Default region name: us-east-1
  # Default output format: json

  # 認証確認
  aws sts get-caller-identity
  ```

### Phase 2: Bedrockモデルアクセス申請（必須、10-30分）

- [ ] **2.1 AWSコンソールにログイン**
  - https://console.aws.amazon.com にアクセス
  - us-east-1リージョンを選択（Bedrock利用可能リージョン）

- [ ] **2.2 Bedrockモデルアクセス申請**
  ```
  1. サービス検索 → "Bedrock" を検索
  2. 左メニュー → "Model access"
  3. "Manage model access" ボタンをクリック
  4. 以下のモデルにチェック:
     ✓ Stable Diffusion XL 1.0
     ✓ Amazon Titan Image Generator G1
  5. "Request model access" をクリック
  6. 承認を待つ（数分～数時間）
  ```

- [ ] **2.3 アクセス承認の確認**
  ```
  Model access ページで以下を確認:
  - Stable Diffusion XL 1.0: ✅ Access granted
  - Amazon Titan Image Generator G1: ✅ Access granted
  ```

  **⚠️ 重要**: この承認なしではデプロイ後にエラーが発生します！

### Phase 3: プロジェクトのセットアップ（5分）

- [ ] **3.1 依存関係のインストール**
  ```bash
  # プロジェクトルートで実行
  npm install

  # Lambda関数の依存関係
  cd lambda/image-generator
  npm install
  cd ../..
  ```

- [ ] **3.2 TypeScriptのビルド確認**
  ```bash
  # プロジェクトルートで実行
  npm run build

  # エラーがないことを確認
  ```

### Phase 4: CDKブートストラップ（初回のみ、3-5分）

- [ ] **4.1 AWSアカウント情報の確認**
  ```bash
  # アカウントIDの取得
  aws sts get-caller-identity --query Account --output text
  # 出力例: 123456789012

  # リージョンの確認
  echo $AWS_REGION
  # 出力例: us-east-1
  ```

- [ ] **4.2 CDKブートストラップ実行**
  ```bash
  # ブートストラップ（初回のみ）
  cdk bootstrap aws://ACCOUNT-ID/us-east-1

  # 成功メッセージを確認
  # ✅  Environment aws://123456789012/us-east-1 bootstrapped
  ```

  **注意**: この手順はAWSアカウント×リージョンの組み合わせごとに1回だけ実行

### Phase 5: デプロイ実行（10-15分）

- [ ] **5.1 CDK Synth（CloudFormation生成）**
  ```bash
  # CloudFormationテンプレートの生成
  npm run synth

  # または
  cdk synth

  # cdk.out/BedrockImageGenStack.template.json が生成されることを確認
  ```

- [ ] **5.2 デプロイ内容の確認**
  ```bash
  # 変更内容のプレビュー
  npm run diff

  # または
  cdk diff

  # 作成されるリソースを確認:
  # - Cognito User Pool
  # - S3 Buckets (2個)
  # - Lambda Function
  # - API Gateway
  # - CloudFront Distribution
  # - IAM Roles & Policies
  ```

- [ ] **5.3 デプロイ実行**
  ```bash
  # デプロイ開始
  npm run deploy

  # または
  cdk deploy

  # 確認プロンプトで "y" を入力
  # Do you wish to deploy these changes (y/n)? y
  ```

  **予想時間**: 10-15分
  - Lambda: 2分
  - API Gateway: 1分
  - CloudFront Distribution: 10-15分（最も時間がかかる）

- [ ] **5.4 デプロイ完了の確認**
  ```
  ✅  BedrockImageGenStack

  Outputs:
  BedrockImageGenStack.UserPoolId = us-east-1_XXXXXXX
  BedrockImageGenStack.UserPoolClientId = xxxxxxxxxxxxxxxxxxxx
  BedrockImageGenStack.ApiEndpoint = https://xxxxxxxxxx.execute-api.us-east-1.amazonaws.com/prod/
  BedrockImageGenStack.ImagesBucketName = bedrock-images-123456789012-us-east-1
  BedrockImageGenStack.WebsiteBucketName = bedrock-website-123456789012-us-east-1
  BedrockImageGenStack.DistributionDomainName = xxxxxxxxxxxx.cloudfront.net
  BedrockImageGenStack.DistributionId = XXXXXXXXXXXXX

  Stack ARN:
  arn:aws:cloudformation:us-east-1:123456789012:stack/BedrockImageGenStack/...
  ```

  **⚠️ 重要**: これらの出力値をメモしてください！フロントエンド設定で使用します。

### Phase 6: デプロイ検証（5分）

- [ ] **6.1 CloudFormationスタックの確認**
  ```bash
  # CloudFormationコンソールで確認
  aws cloudformation describe-stacks \
    --stack-name BedrockImageGenStack \
    --query 'Stacks[0].StackStatus' \
    --output text

  # 出力: CREATE_COMPLETE
  ```

- [ ] **6.2 Lambdaデプロイの確認**
  ```bash
  # Lambda関数の存在確認
  aws lambda get-function \
    --function-name bedrock-image-generator \
    --query 'Configuration.FunctionName' \
    --output text

  # 出力: bedrock-image-generator
  ```

- [ ] **6.3 API Gatewayエンドポイントの確認**
  ```bash
  # エンドポイントURLを取得
  aws cloudformation describe-stacks \
    --stack-name BedrockImageGenStack \
    --query 'Stacks[0].Outputs[?OutputKey==`ApiEndpoint`].OutputValue' \
    --output text

  # 出力: https://xxxxxxxxxx.execute-api.us-east-1.amazonaws.com/prod/
  ```

- [ ] **6.4 S3バケットの確認**
  ```bash
  # 画像保存バケット
  aws s3 ls | grep bedrock-images

  # Webサイトバケット
  aws s3 ls | grep bedrock-website
  ```

- [ ] **6.5 CloudFront Distributionの確認**
  ```bash
  # Distribution IDを取得
  aws cloudformation describe-stacks \
    --stack-name BedrockImageGenStack \
    --query 'Stacks[0].Outputs[?OutputKey==`DistributionId`].OutputValue' \
    --output text

  # Distribution状態を確認
  aws cloudfront get-distribution \
    --id YOUR_DISTRIBUTION_ID \
    --query 'Distribution.Status' \
    --output text

  # 出力: Deployed
  ```

### Phase 7: 動作テスト（10分）

- [ ] **7.1 Cognitoユーザーの作成**
  ```bash
  # ユーザープールIDとクライアントIDを取得
  USER_POOL_ID=$(aws cloudformation describe-stacks \
    --stack-name BedrockImageGenStack \
    --query 'Stacks[0].Outputs[?OutputKey==`UserPoolId`].OutputValue' \
    --output text)

  CLIENT_ID=$(aws cloudformation describe-stacks \
    --stack-name BedrockImageGenStack \
    --query 'Stacks[0].Outputs[?OutputKey==`UserPoolClientId`].OutputValue' \
    --output text)

  # ユーザー登録
  aws cognito-idp sign-up \
    --client-id $CLIENT_ID \
    --username testuser@example.com \
    --password 'TestPass123!'

  # メール確認（コンソールでコードを確認）
  aws cognito-idp admin-confirm-sign-up \
    --user-pool-id $USER_POOL_ID \
    --username testuser@example.com
  ```

- [ ] **7.2 JWTトークンの取得**
  ```bash
  # ログイン
  aws cognito-idp initiate-auth \
    --client-id $CLIENT_ID \
    --auth-flow USER_PASSWORD_AUTH \
    --auth-parameters USERNAME=testuser@example.com,PASSWORD='TestPass123!' \
    --query 'AuthenticationResult.IdToken' \
    --output text

  # 出力されたトークンを JWT_TOKEN 変数に保存
  JWT_TOKEN="eyJraWQ..."
  ```

- [ ] **7.3 画像生成APIのテスト**
  ```bash
  # API エンドポイントを取得
  API_ENDPOINT=$(aws cloudformation describe-stacks \
    --stack-name BedrockImageGenStack \
    --query 'Stacks[0].Outputs[?OutputKey==`ApiEndpoint`].OutputValue' \
    --output text)

  # 画像生成リクエスト
  curl -X POST "${API_ENDPOINT}generate" \
    -H "Authorization: Bearer $JWT_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "prompt": "A beautiful sunset over mountains",
      "model": "stability",
      "width": 512,
      "height": 512
    }'

  # 成功レスポンス例:
  # {
  #   "success": true,
  #   "imageKey": "user-id/uuid.png",
  #   "imageUrl": "https://bedrock-images-...s3.amazonaws.com/user-id/uuid.png",
  #   "model": "stability.stable-diffusion-xl-v1",
  #   "prompt": "A beautiful sunset over mountains"
  # }
  ```

- [ ] **7.4 生成画像の確認**
  ```bash
  # S3バケットの画像を確認
  IMAGES_BUCKET=$(aws cloudformation describe-stacks \
    --stack-name BedrockImageGenStack \
    --query 'Stacks[0].Outputs[?OutputKey==`ImagesBucketName`].OutputValue' \
    --output text)

  aws s3 ls s3://$IMAGES_BUCKET/ --recursive

  # 画像ファイルがリストされることを確認
  ```

### Phase 8: フロントエンド設定（参考）

- [ ] **8.1 設定値のエクスポート**
  ```bash
  # 設定ファイル作成
  cat > frontend-config.json <<EOF
  {
    "userPoolId": "$USER_POOL_ID",
    "userPoolClientId": "$CLIENT_ID",
    "apiEndpoint": "$API_ENDPOINT",
    "imagesBucket": "$IMAGES_BUCKET",
    "region": "us-east-1"
  }
  EOF

  # ファイル内容の確認
  cat frontend-config.json
  ```

- [ ] **8.2 フロントエンドアプリでの使用**
  ```javascript
  // React/Vue.jsアプリの設定例
  const awsConfig = {
    Auth: {
      region: 'us-east-1',
      userPoolId: 'us-east-1_XXXXXXX',
      userPoolWebClientId: 'xxxxxxxxxxxxxxxxxxxx',
    },
    API: {
      endpoints: [
        {
          name: 'ImageGenAPI',
          endpoint: 'https://xxxxxxxxxx.execute-api.us-east-1.amazonaws.com/prod',
        },
      ],
    },
  };
  ```

## 🚨 トラブルシューティング

### デプロイエラー

#### エラー: "AccessDeniedException: Could not perform sts:AssumeRole"
**解決策**: IAM権限を確認。CloudFormation, Lambda, S3等へのフルアクセスが必要

#### エラー: "Account has not been bootstrapped"
**解決策**: Phase 4のCDKブートストラップを実行

#### エラー: CloudFrontのデプロイが遅い
**対処法**: 正常です。CloudFrontは10-15分かかります。気長に待ちましょう。

### 動作テストエラー

#### エラー: "AccessDeniedException" (Bedrock API)
**解決策**: Phase 2のBedrockモデルアクセスが承認されているか確認

#### エラー: "User is not confirmed"
**解決策**: `admin-confirm-sign-up` コマンドでユーザーを確認

#### エラー: "Signature has expired"
**解決策**: JWTトークンを再取得（有効期限は1時間）

## 🎉 デプロイ完了！

すべてのチェックが完了したら、以下が利用可能です：

- ✅ Cognito認証システム
- ✅ Bedrock画像生成API
- ✅ S3画像ストレージ
- ✅ CloudFront CDN

次のステップ:
1. フロントエンドアプリケーションの開発
2. カスタムドメインの設定
3. 本番環境への最適化

## 📧 サポート

問題が発生した場合は、以下を確認してください：
- CloudWatch Logs: `/aws/lambda/bedrock-image-generator`
- CloudFormation コンソール: エラーメッセージ
- Bedrock Model access: 承認状態
