#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { BedrockImageGenStack } from '../lib/bedrock-image-gen-stack';
import { AwsSolutionsChecks } from 'cdk-nag';
import { Aspects } from 'aws-cdk-lib';

const app = new cdk.App();

const stack = new BedrockImageGenStack(app, 'BedrockImageGenStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
  },
  description: 'Bedrock Image Generation Website Infrastructure',
});

// Apply CDK Nag for security best practices
Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }));

app.synth();
