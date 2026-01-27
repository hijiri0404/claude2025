#!/usr/bin/env node
// ========================================
// CDK アプリケーションのエントリーポイント
// このファイルから CDK アプリが開始される
// ========================================

// aws-cdk-lib/core: CDK のコアモジュール
import * as cdk from 'aws-cdk-lib/core';

// 作成したスタッククラスをインポート
import { LambdaOacCdkStack } from '../lib/lambda-oac-cdk-stack';

// ========================================
// CDK アプリケーションの作成
// ========================================

// App: CDK アプリケーションのルートコンストラクト
// 全てのスタックはこの App の下に作成される
const app = new cdk.App();

// ========================================
// スタックのインスタンス化
// ========================================

// new LambdaOacCdkStack: スタックを作成
// 第1引数 (app): 親コンストラクト
// 第2引数 ('LambdaOacCdkStack'): スタックの論理 ID（CloudFormation でのスタック名）
// 第3引数 (props): スタックの設定オプション
new LambdaOacCdkStack(app, 'LambdaOacCdkStack', {
  // env: デプロイ先の AWS 環境を指定
  env: {
    // CDK_DEFAULT_ACCOUNT: 現在の AWS CLI プロファイルのアカウント ID
    // 環境変数から取得される
    account: process.env.CDK_DEFAULT_ACCOUNT,

    // CDK_DEFAULT_REGION: 現在の AWS CLI プロファイルのリージョン
    // 環境変数から取得される
    region: process.env.CDK_DEFAULT_REGION,
  },

  // description: CloudFormation スタックの説明文
  // AWS コンソールでスタックを識別するのに役立つ
  description: 'Lambda Function URL with CloudFront OAC pattern',
});

// ========================================
// 補足: 環境変数を指定しない場合
// ========================================
// env を省略すると「環境非依存」スタックになる
// - メリット: どの環境にもデプロイ可能
// - デメリット: 一部の機能（VPC ルックアップ等）が使えない
//
// 本番環境では明示的に指定することを推奨:
// env: { account: '123456789012', region: 'ap-northeast-1' }
