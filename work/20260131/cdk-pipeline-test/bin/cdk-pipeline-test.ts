#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { PipelineStack } from '../lib/pipeline-stack';

const app = new cdk.App();

// CDK手順検証用パイプライン
new PipelineStack(app, 'CdkTestPipelineStack', {
  repositoryName: 'cdk-test-repo',
  pipelineName: 'cdk-test-pipeline',
  buildProjectName: 'cdk-test-build',
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});
