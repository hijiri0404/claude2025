#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import * as fs from 'fs';
import * as path from 'path';
import { CdkRepoStack } from '../lib/cdk-repo-stack';

const app = new cdk.App();

// deploy-config.json から設定を読み込み
const configPath = path.join(__dirname, '..', 'deploy-config.json');
let config = {
  stackName: 'CdkPipelineTestStack',
  environment: 'dev'
};

if (fs.existsSync(configPath)) {
  config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  console.log(`Loaded config: stackName=${config.stackName}, environment=${config.environment}`);
}

// コンテキストからの上書き（CodeBuildから渡される場合）
const stackName = app.node.tryGetContext('stackName') || config.stackName;
const environment = app.node.tryGetContext('environment') || config.environment;

new CdkRepoStack(app, stackName, {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION
  },
  tags: {
    Environment: environment,
    CreatedBy: 'CDKPipeline'
  }
});
