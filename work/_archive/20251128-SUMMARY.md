# 作業概要 - 20251128

## 📅 作業情報
- **作業日**: 2025-11-28 (JST)
- **主要タスク**: AWS Bedrock画像生成Webサイトの構成設計とAWS CDK実装

## 📁 生成ファイル一覧

### アーキテクチャ設計
- `generated-diagrams/bedrock-image-generation-architecture.png.png` - AWS Bedrock画像生成Webサイトの全体構成図
  - Amplify Hostingによるフロントエンド
  - Cognitoによるユーザー認証
  - API Gateway + Lambdaによるバックエンド
  - Bedrockによる画像生成AI
  - S3とCloudFrontによるストレージ・配信

- `bedrock-image-generation-architecture.md` - 構成の詳細説明ドキュメント（7,851文字）
  - アーキテクチャコンポーネント説明
  - データフロー詳細（10ステップ）
  - セキュリティ・パフォーマンス・コスト考慮事項
  - 実装手順とフェーズ
  - 推定コスト試算（月額$254-454）
  - 運用・監視のポイント

### AWS CDK実装（TypeScript）

#### プロジェクト設定
- `package.json` - ルートプロジェクト依存関係
  - `aws-cdk-lib@^2.170.0`
  - `cdk-nag@^2.29.0` (セキュリティチェック)
  - `constructs@^10.0.0`

- `cdk.json` - CDK設定ファイル
  - エントリポイント: `npx ts-node --prefer-ts-exts bin/app.ts`
  - 各種CDK機能フラグ設定

- `tsconfig.json` - TypeScript設定（ES2022ターゲット）

- `.gitignore` - Git除外パターン（CDK、Node.js、IDE関連）

#### CDKコード
- `bin/app.ts` - CDKアプリケーションエントリポイント
  - スタック定義: `BedrockImageGenStack`
  - CDK Nag適用（セキュリティベストプラクティス自動チェック）
  - デフォルトリージョン: us-east-1

- `lib/bedrock-image-gen-stack.ts` - メインインフラストラクチャスタック（475行）
  - **Cognito User Pool**: ユーザー認証・管理
    - Email認証、パスワードポリシー設定
  - **S3 Buckets**:
    - 画像保存バケット（30日自動削除ライフサイクル）
    - Webサイトアセットバケット
    - 暗号化、バージョニング、パブリックアクセスブロック設定
  - **Lambda Function**: 画像生成処理
    - Node.js 20.x、メモリ1024MB、タイムアウト60秒
    - Bedrock InvokeModel権限付与
    - S3読み書き権限
  - **API Gateway REST API**:
    - `/generate` POSTエンドポイント
    - Cognitoオーソライザー統合
    - CORSサポート
  - **CloudFront Distribution**:
    - Origin Access Identity (OAI)設定
    - HTTPSリダイレクト強制
    - キャッシュポリシー最適化
  - **IAM Roles & Policies**: 最小権限の原則
  - **CloudFormation Outputs**: 全リソースID出力

#### Lambda関数実装
- `lambda/image-generator/index.ts` - Bedrock API統合Lambda（353行）
  - **サポートモデル**:
    - Stable Diffusion XL (`stability.stable-diffusion-xl-v1`)
    - Amazon Titan Image Generator (`amazon.titan-image-generator-v1`)
  - **機能**:
    - Cognitoユーザー認証検証
    - プロンプトベース画像生成
    - S3への画像保存（UUIDベース命名）
    - 署名付きURL生成
    - エラーハンドリング
  - **パラメータサポート**:
    - prompt、negativePrompt
    - width/height（64の倍数）
    - cfgScale（1-35）、steps（10-150）

- `lambda/image-generator/package.json` - Lambda依存関係
  - `@aws-sdk/client-bedrock-runtime@^3.600.0`
  - `@aws-sdk/client-s3@^3.600.0`
  - `@types/aws-lambda@^8.10.138`

- `lambda/image-generator/tsconfig.json` - Lambda TypeScript設定

### ドキュメント

- `README.md` - プロジェクト完全ドキュメント（10,563文字）
  - 概要とアーキテクチャ説明
  - 前提条件とBedrockモデルアクセス申請手順
  - セットアップ手順（4ステップ）
  - API使用方法とパラメータ仕様
  - セキュリティ実装詳細
  - コスト試算（月額$239-439）
  - テスト手順とCLIコマンド例
  - トラブルシューティングガイド
  - 参考リンク集

- `DEPLOYMENT_GUIDE.md` - デプロイチェックリスト（11,300文字）
  - **Phase 1**: 事前準備（Node.js、AWS CLI、CDK）
  - **Phase 2**: Bedrockモデルアクセス申請（必須、10-30分）
  - **Phase 3**: プロジェクトセットアップ
  - **Phase 4**: CDKブートストラップ（初回のみ）
  - **Phase 5**: デプロイ実行（10-15分）
  - **Phase 6**: デプロイ検証（CloudFormation、Lambda、API Gateway）
  - **Phase 7**: 動作テスト（Cognito、JWT、画像生成API）
  - **Phase 8**: フロントエンド設定参考
  - トラブルシューティングセクション

## 🎯 完了したタスク

### フェーズ1: アーキテクチャ設計
- [x] 日付ベース作業フォルダの作成 (20251128)
- [x] AWS Bedrockアイコン含むAWSサービスアイコン一覧の確認
- [x] 画像生成Webサイトの構成図作成（PNG形式）
- [x] 詳細な構成説明ドキュメント作成

### フェーズ2: AWS CDK実装
- [x] CDKプロジェクト構造設計
- [x] CDK一般ガイダンス取得
- [x] GenAI CDK Constructsリサーチ
- [x] プロジェクト設定ファイル作成（package.json、cdk.json、tsconfig.json）
- [x] CDKアプリケーションエントリポイント作成（bin/app.ts）
- [x] メインCDKスタック実装（lib/bedrock-image-gen-stack.ts）
  - Cognito User Pool
  - S3 Buckets（画像＋Web）
  - Lambda Function
  - API Gateway with Cognito Authorizer
  - CloudFront Distribution with OAI
  - IAM Roles & Policies
- [x] Lambda関数実装（lambda/image-generator/index.ts）
  - Stable Diffusion XL サポート
  - Titan Image Generator サポート
  - S3統合
  - エラーハンドリング
- [x] Lambda依存関係設定
- [x] セキュリティチェック（CDK Nag統合）
- [x] README.md作成
- [x] DEPLOYMENT_GUIDE.md作成
- [x] .gitignore作成
- [x] SUMMARY.md更新

## 🏗️ 実装アーキテクチャ

### 技術スタック
- **IaC**: AWS CDK 2.170.0 (TypeScript)
- **Runtime**: Node.js 20.x
- **AI/ML**: Amazon Bedrock (Stable Diffusion XL, Titan Image Generator)
- **認証**: Amazon Cognito User Pools (JWT)
- **API**: Amazon API Gateway REST API
- **Compute**: AWS Lambda (1024MB, 60秒タイムアウト)
- **Storage**: Amazon S3 (2バケット)
- **CDN**: Amazon CloudFront with OAI
- **Security**: CDK Nag, IAM最小権限、TLS/SSL

### デプロイされるリソース
1. **Cognito User Pool + Client**
2. **S3 Bucket (画像)** - 30日ライフサイクル、暗号化
3. **S3 Bucket (Web)** - 静的ホスティング
4. **Lambda Function** - Bedrock統合
5. **API Gateway** - `/generate` エンドポイント
6. **CloudFront Distribution** - グローバル配信
7. **IAM Roles** - Lambda実行ロール、Bedrock権限

### APIエンドポイント
```
POST /prod/generate
Authorization: Bearer <Cognito JWT Token>
Content-Type: application/json

Request Body:
{
  "prompt": "A beautiful sunset over mountains",
  "negativePrompt": "blurry, low quality",
  "model": "stability" | "titan",
  "width": 512,
  "height": 512,
  "cfgScale": 7,
  "steps": 50
}

Response:
{
  "success": true,
  "imageKey": "user-id/uuid.png",
  "imageUrl": "https://bedrock-images-xxx.s3.amazonaws.com/...",
  "model": "stability.stable-diffusion-xl-v1",
  "prompt": "..."
}
```

## 💰 コスト試算

### 月間想定（ユーザー1,000人、画像10,000枚）
| サービス | 推定コスト（USD） |
|---------|-----------------|
| Cognito | $10 |
| API Gateway | $4 |
| Lambda | $5 |
| **Bedrock画像生成** | **$200-400** |
| S3 | $10 |
| CloudFront | $10 |
| **合計** | **$239-439** |

**注意**: Bedrockの画像生成コストが大部分を占めます。

## 🔐 セキュリティ実装

### 認証・認可
- Cognito User Pools JWT認証
- API Gateway Cognitoオーソライザー
- トークンベースアクセス制御

### 暗号化
- S3サーバーサイド暗号化（SSE-S3）
- CloudFront HTTPS強制
- API Gateway TLS 1.2以上

### アクセス制御
- S3パブリックアクセスブロック
- CloudFront Origin Access Identity (OAI)
- Lambda実行ロール最小権限
- CDK Nag自動セキュリティチェック

## ⚠️ 重要な注意事項

### デプロイ前の必須事項
1. **Bedrockモデルアクセス申請が必要**
   - AWSコンソール → Amazon Bedrock → Model access
   - Stable Diffusion XL と Titan Image Generator を有効化
   - 承認まで数分～数時間

2. **リージョン制限**
   - Bedrockは限定リージョンのみ（us-east-1、us-west-2等）
   - デフォルト: us-east-1

3. **コスト管理**
   - 予算アラート設定推奨
   - 生成枚数制限の実装検討
   - S3ライフサイクルポリシー活用

4. **セキュリティ**
   - 本番環境ではカスタムドメイン推奨
   - CORS設定の厳格化
   - WAF導入検討

## 🚀 デプロイ手順（概要）

```bash
# 1. 依存関係インストール
npm install
cd lambda/image-generator && npm install && cd ../..

# 2. CDKブートストラップ（初回のみ）
cdk bootstrap aws://ACCOUNT-ID/us-east-1

# 3. デプロイ
npm run deploy

# 4. 出力値の確認
# UserPoolId, UserPoolClientId, ApiEndpoint等をメモ

# 5. 動作確認
# Cognitoユーザー作成 → ログイン → API呼び出し
```

詳細は `DEPLOYMENT_GUIDE.md` を参照。

## 📊 プロジェクト統計

- **総ファイル数**: 13ファイル
- **コード行数**:
  - CDKスタック: 475行
  - Lambda関数: 353行
  - 設定ファイル: 100行程度
- **ドキュメント**:
  - README: 10,563文字
  - DEPLOYMENT_GUIDE: 11,300文字
  - Architecture Doc: 7,851文字

## 🔗 関連リンク

- [AWS CDK ドキュメント](https://docs.aws.amazon.com/cdk/)
- [Amazon Bedrock 開発者ガイド](https://docs.aws.amazon.com/bedrock/)
- [Stable Diffusion XL on Bedrock](https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-diffusion.html)
- [Titan Image Generator](https://docs.aws.amazon.com/bedrock/latest/userguide/titan-image-models.html)
- [CDK Nag](https://github.com/cdklabs/cdk-nag)
- [AWS Amplify ドキュメント](https://docs.amplify.aws/)
- [Amazon Cognito 開発者ガイド](https://docs.aws.amazon.com/cognito/)

## 🎯 Next Actions（オプション）

### 即座実行可能
1. **デプロイ**: `npm run deploy` でインフラをAWSに展開
2. **テスト**: DEPLOYMENT_GUIDEに従った動作確認

### 拡張機能
1. フロントエンドアプリケーション開発（React/Vue.js）
2. カスタムドメイン設定（Route 53 + ACM）
3. 画像編集機能追加（Bedrock Image Variation）
4. ユーザー生成制限機能
5. 画像履歴管理機能
6. AWS WAF導入（セキュリティ強化）

## 📝 技術的ハイライト

### CDK実装のベストプラクティス
- ✅ CDK Nagによる自動セキュリティチェック
- ✅ TypeScriptの型安全性
- ✅ CloudFormation出力による自動設定
- ✅ 環境変数による柔軟な設定
- ✅ 最小権限IAMポリシー
- ✅ リソースタグ付け

### Lambda関数の工夫
- ✅ 複数Bedrockモデル対応（抽象化）
- ✅ エラーハンドリング充実
- ✅ S3署名付きURL生成
- ✅ ユーザー別フォルダ構造
- ✅ UUID命名によるファイル衝突回避

### セキュリティ対策
- ✅ S3暗号化とバージョニング
- ✅ CloudFront OAI（ダイレクトS3アクセス禁止）
- ✅ Cognito JWT検証
- ✅ HTTPS強制
- ✅ CORS適切設定

## 🎓 学習ポイント

このプロジェクトから学べる技術：
1. AWS CDKを使ったIaC実装
2. Amazon Bedrockの画像生成API統合
3. Cognitoベース認証システム
4. サーバーレスアーキテクチャ設計
5. CloudFront + S3の静的・動的コンテンツ配信
6. Lambda関数でのAWS SDK v3使用
7. TypeScriptによる型安全な開発
8. CDK Nagによるセキュリティベストプラクティス適用
