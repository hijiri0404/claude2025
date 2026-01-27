// ========================================
// AWS CDK スタック定義ファイル
// Lambda Function URL + CloudFront + OAC パターン
// ========================================

// aws-cdk-lib: CDK のコアライブラリ（全ての AWS サービスの定義が含まれる）
import * as cdk from 'aws-cdk-lib';

// Construct: CDK の基本構成要素。全てのリソースはこれを継承する
import { Construct } from 'constructs';

// aws-lambda: Lambda 関数を定義するためのモジュール
import * as lambda from 'aws-cdk-lib/aws-lambda';

// aws-cloudfront: CloudFront（CDN）を定義するためのモジュール
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';

// aws-cloudfront-origins: CloudFront のオリジン（配信元）を定義するモジュール
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';

// aws-lambda-nodejs: TypeScript/JavaScript の Lambda を簡単にバンドル・デプロイするモジュール
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';

// path: ファイルパスを扱う Node.js の標準モジュール
import * as path from 'path';

// ========================================
// スタッククラスの定義
// Stack: CloudFormation スタックに対応する CDK の単位
// ========================================
export class LambdaOacCdkStack extends cdk.Stack {
  // constructor: スタックが作成される時に呼ばれる関数
  // scope: このスタックの親（通常は App）
  // id: このスタックの一意な識別子
  // props: スタックの設定オプション（env, description など）
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    // 親クラス（cdk.Stack）のコンストラクタを呼び出し
    super(scope, id, props);

    // ========================================
    // 1. Lambda 関数の作成
    // ========================================

    // NodejsFunction: TypeScript/JavaScript を自動でバンドルして Lambda にデプロイする便利なクラス
    const fn = new nodejs.NodejsFunction(this, 'ApiFunction', {
      // entry: Lambda のソースコードのパス
      // __dirname は現在のファイルのディレクトリを表す
      entry: path.join(__dirname, '../lambda/index.ts'),

      // handler: Lambda が実行する関数名（export された関数名）
      handler: 'handler',

      // runtime: Lambda の実行環境（Node.js 20.x を使用）
      runtime: lambda.Runtime.NODEJS_20_X,

      // architecture: CPU アーキテクチャ（ARM64 は x86 より安価で高速）
      architecture: lambda.Architecture.ARM_64,

      // timeout: Lambda の最大実行時間（30秒でタイムアウト）
      timeout: cdk.Duration.seconds(30),

      // memorySize: Lambda に割り当てるメモリ（MB単位、CPU も比例して増加）
      memorySize: 256,

      // bundling: esbuild によるバンドル設定
      bundling: {
        // minify: コードを圧縮して小さくする
        minify: true,
        // sourceMap: デバッグ用のソースマップを生成
        sourceMap: true,
        // forceDockerBundling: false でローカルの esbuild を使用（Docker 不要）
        forceDockerBundling: false,
      },
    });

    // ========================================
    // 2. Lambda Function URL の作成
    // ========================================

    // addFunctionUrl: Lambda に直接 HTTP でアクセスできる URL を追加
    const functionUrl = fn.addFunctionUrl({
      // authType: 認証方式
      // AWS_IAM: IAM 認証が必要（OAC を使うには必須！）
      // NONE にすると誰でもアクセス可能になる（セキュリティリスク）
      authType: lambda.FunctionUrlAuthType.AWS_IAM,

      // cors: Cross-Origin Resource Sharing（ブラウザからのアクセス許可設定）
      cors: {
        // allowedOrigins: アクセスを許可するオリジン（'*' は全て許可）
        allowedOrigins: ['*'],
        // allowedMethods: 許可する HTTP メソッド
        allowedMethods: [lambda.HttpMethod.ALL],
        // allowedHeaders: 許可するリクエストヘッダー
        allowedHeaders: ['*'],
      },
    });

    // ========================================
    // 3. Origin Access Control (OAC) の作成
    // ========================================

    // CfnOriginAccessControl: CloudFront からオリジンへのアクセスを制御する設定
    // Cfn プレフィックスは CloudFormation の L1 コンストラクト（低レベル API）を意味する
    const oac = new cloudfront.CfnOriginAccessControl(this, 'LambdaOAC', {
      originAccessControlConfig: {
        // name: OAC の名前（識別用）
        name: `${this.stackName}-lambda-oac`,

        // originAccessControlOriginType: オリジンの種類
        // 'lambda' = Lambda Function URL 用
        // 's3' = S3 バケット用
        originAccessControlOriginType: 'lambda',

        // signingBehavior: リクエストへの署名動作
        // 'always' = 常に SigV4 署名を付与（推奨）
        // 'never' = 署名しない
        // 'no-override' = オリジンリクエストに署名がなければ追加
        signingBehavior: 'always',

        // signingProtocol: 署名プロトコル
        // 'sigv4' = AWS Signature Version 4（現在唯一のオプション）
        signingProtocol: 'sigv4',

        // description: OAC の説明文
        description: 'OAC for Lambda Function URL',
      },
    });

    // ========================================
    // 4. Lambda Function URL のドメイン名を抽出
    // ========================================

    // functionUrl.url の形式: "https://xxxxx.lambda-url.region.on.aws/"
    // この URL からドメイン名部分だけを取り出す

    // Fn.split: 文字列を指定した区切り文字で分割
    // 例: "https://abc.lambda-url.ap-northeast-1.on.aws/" を "/" で分割すると
    //     ["https:", "", "abc.lambda-url.ap-northeast-1.on.aws", ""]
    // Fn.select: 分割した配列から指定したインデックスの要素を取得
    // インデックス 2 = "abc.lambda-url.ap-northeast-1.on.aws"
    const functionUrlDomain = cdk.Fn.select(
      2,  // 配列の3番目（0始まり）
      cdk.Fn.split('/', functionUrl.url)
    );

    // ========================================
    // 5. CloudFront Distribution の作成
    // ========================================

    // Distribution: CloudFront のディストリビューション（CDN の配信設定）
    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      // defaultBehavior: デフォルトのキャッシュ動作設定
      defaultBehavior: {
        // origin: コンテンツの取得元（Lambda Function URL）
        // HttpOrigin: HTTP/HTTPS エンドポイントをオリジンとして使用
        origin: new origins.HttpOrigin(functionUrlDomain, {
          // protocolPolicy: オリジンへの接続プロトコル
          // HTTPS_ONLY: HTTPS のみ使用（セキュリティのため推奨）
          protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
        }),

        // viewerProtocolPolicy: ユーザー（ビューワー）との通信プロトコル
        // REDIRECT_TO_HTTPS: HTTP アクセスを HTTPS にリダイレクト
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,

        // allowedMethods: 許可する HTTP メソッド
        // ALLOW_ALL: GET, HEAD, OPTIONS, PUT, PATCH, POST, DELETE を全て許可
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,

        // cachePolicy: キャッシュポリシー
        // CACHING_DISABLED: キャッシュを無効化（API には通常これを使用）
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,

        // originRequestPolicy: オリジンへのリクエストに含める情報
        // ALL_VIEWER_EXCEPT_HOST_HEADER: Host ヘッダー以外の全てをオリジンに転送
        originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
      },

      // httpVersion: 対応する HTTP バージョン
      // HTTP2_AND_3: HTTP/2 と HTTP/3 の両方に対応（最新・最速）
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,

      // priceClass: 価格クラス（使用するエッジロケーションの範囲）
      // PRICE_CLASS_200: 北米、欧州、アジア、中東、アフリカ（コストと性能のバランス）
      // PRICE_CLASS_100: 北米、欧州のみ（最安）
      // PRICE_CLASS_ALL: 全世界（最高性能・最高コスト）
      priceClass: cloudfront.PriceClass.PRICE_CLASS_200,

      // comment: ディストリビューションの説明
      comment: 'CloudFront Distribution with Lambda Function URL OAC',
    });

    // ========================================
    // 6. OAC を CloudFront Distribution に関連付け
    // ========================================

    // L2 コンストラクト（Distribution）から L1 コンストラクト（CfnDistribution）を取得
    // L1 は CloudFormation のプロパティに直接アクセスできる
    const cfnDistribution = distribution.node.defaultChild as cloudfront.CfnDistribution;

    // addPropertyOverride: CloudFormation プロパティを直接上書き
    // Origins の最初のオリジン（インデックス 0）に OAC ID を設定
    cfnDistribution.addPropertyOverride(
      'DistributionConfig.Origins.0.OriginAccessControlId',
      oac.attrId  // OAC の ID を参照
    );

    // ========================================
    // 7. Lambda に CloudFront からのアクセス許可を付与
    // ========================================

    // Lambda Function URL を呼び出す許可
    // これがないと CloudFront から Lambda にアクセスできない
    fn.addPermission('AllowCloudFrontServicePrincipalUrl', {
      // principal: 許可を与える対象（CloudFront サービス）
      principal: new cdk.aws_iam.ServicePrincipal('cloudfront.amazonaws.com'),
      // action: 許可するアクション
      action: 'lambda:InvokeFunctionUrl',
      // sourceArn: 許可する CloudFront ディストリビューションの ARN
      // 特定のディストリビューションからのみアクセスを許可（セキュリティ強化）
      sourceArn: `arn:aws:cloudfront::${this.account}:distribution/${distribution.distributionId}`,
    });

    // Lambda 関数自体を呼び出す許可（Function URL と両方必要）
    fn.addPermission('AllowCloudFrontServicePrincipalInvoke', {
      principal: new cdk.aws_iam.ServicePrincipal('cloudfront.amazonaws.com'),
      action: 'lambda:InvokeFunction',
      sourceArn: `arn:aws:cloudfront::${this.account}:distribution/${distribution.distributionId}`,
    });

    // ========================================
    // 8. スタックの出力（Outputs）
    // ========================================

    // CfnOutput: CloudFormation の出力。デプロイ後にコンソールに表示される

    // CloudFront のドメイン名を出力
    new cdk.CfnOutput(this, 'DistributionDomainName', {
      value: distribution.distributionDomainName,
      description: 'CloudFront Distribution Domain Name',
    });

    // CloudFront の完全な URL を出力
    new cdk.CfnOutput(this, 'DistributionUrl', {
      value: `https://${distribution.distributionDomainName}`,
      description: 'CloudFront Distribution URL (Use this to access the API)',
    });

    // Lambda Function URL のドメインを出力（直接アクセスは禁止されている）
    new cdk.CfnOutput(this, 'FunctionUrlDomain', {
      value: functionUrlDomain,
      description: 'Lambda Function URL Domain (Direct access is blocked by OAC)',
    });

    // Lambda 関数の ARN を出力
    new cdk.CfnOutput(this, 'FunctionArn', {
      value: fn.functionArn,
      description: 'Lambda Function ARN',
    });
  }
}
