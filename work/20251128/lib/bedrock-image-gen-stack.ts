import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import { NagSuppressions } from 'cdk-nag';

export class BedrockImageGenStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ========================================
    // Cognito User Pool for Authentication
    // ========================================
    const userPool = new cognito.UserPool(this, 'ImageGenUserPool', {
      userPoolName: 'bedrock-image-gen-users',
      selfSignUpEnabled: true,
      signInAliases: {
        email: true,
      },
      autoVerify: {
        email: true,
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // For dev/test only
    });

    const userPoolClient = userPool.addClient('ImageGenWebClient', {
      authFlows: {
        userPassword: true,
        userSrp: true,
      },
      generateSecret: false,
      oAuth: {
        flows: {
          authorizationCodeGrant: true,
          implicitCodeGrant: true,
        },
        scopes: [
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.PROFILE,
        ],
      },
    });

    // ========================================
    // S3 Buckets
    // ========================================

    // Bucket for generated images
    const imagesBucket = new s3.Bucket(this, 'GeneratedImagesBucket', {
      bucketName: `bedrock-images-${this.account}-${this.region}`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: false,
      lifecycleRules: [
        {
          enabled: true,
          expiration: cdk.Duration.days(30), // Auto-delete images after 30 days
        },
      ],
      cors: [
        {
          allowedMethods: [
            s3.HttpMethods.GET,
            s3.HttpMethods.PUT,
            s3.HttpMethods.POST,
          ],
          allowedOrigins: ['*'], // Update with your domain in production
          allowedHeaders: ['*'],
          maxAge: 3000,
        },
      ],
      removalPolicy: cdk.RemovalPolicy.DESTROY, // For dev/test only
      autoDeleteObjects: true, // For dev/test only
    });

    // Bucket for frontend assets
    const websiteBucket = new s3.Bucket(this, 'WebsiteBucket', {
      bucketName: `bedrock-website-${this.account}-${this.region}`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // For dev/test only
      autoDeleteObjects: true, // For dev/test only
    });

    // ========================================
    // Lambda Function for Image Generation
    // ========================================
    const imageGeneratorFunction = new lambda.Function(this, 'ImageGeneratorFunction', {
      functionName: 'bedrock-image-generator',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/image-generator'),
      timeout: cdk.Duration.seconds(60),
      memorySize: 1024,
      environment: {
        IMAGES_BUCKET_NAME: imagesBucket.bucketName,
        REGION: this.region,
      },
    });

    // Grant Lambda permissions to invoke Bedrock
    imageGeneratorFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'bedrock:InvokeModel',
          'bedrock:InvokeModelWithResponseStream',
        ],
        resources: [
          `arn:aws:bedrock:${this.region}::foundation-model/*`,
        ],
      })
    );

    // Grant Lambda permissions to write to S3
    imagesBucket.grantReadWrite(imageGeneratorFunction);

    // ========================================
    // API Gateway
    // ========================================
    const api = new apigateway.RestApi(this, 'ImageGenApi', {
      restApiName: 'Bedrock Image Generation API',
      description: 'API for generating images using Amazon Bedrock',
      deployOptions: {
        stageName: 'prod',
        throttlingRateLimit: 10,
        throttlingBurstLimit: 20,
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
        dataTraceEnabled: true,
      },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS, // Update with your domain in production
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: [
          'Content-Type',
          'X-Amz-Date',
          'Authorization',
          'X-Api-Key',
          'X-Amz-Security-Token',
        ],
        allowCredentials: true,
      },
    });

    // Cognito Authorizer
    const authorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'ApiAuthorizer', {
      cognitoUserPools: [userPool],
      authorizerName: 'CognitoAuthorizer',
    });

    // API Resources
    const generateResource = api.root.addResource('generate');
    generateResource.addMethod(
      'POST',
      new apigateway.LambdaIntegration(imageGeneratorFunction),
      {
        authorizer: authorizer,
        authorizationType: apigateway.AuthorizationType.COGNITO,
      }
    );

    // ========================================
    // CloudFront Distribution
    // ========================================

    // Origin Access Identity for S3
    const originAccessIdentity = new cloudfront.OriginAccessIdentity(this, 'OAI', {
      comment: 'OAI for Bedrock Image Gen Website',
    });

    websiteBucket.grantRead(originAccessIdentity);
    imagesBucket.grantRead(originAccessIdentity);

    const distribution = new cloudfront.Distribution(this, 'WebsiteDistribution', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessIdentity(websiteBucket, {
          originAccessIdentity: originAccessIdentity,
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
      },
      additionalBehaviors: {
        '/images/*': {
          origin: origins.S3BucketOrigin.withOriginAccessIdentity(imagesBucket, {
            originAccessIdentity: originAccessIdentity,
          }),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        },
      },
      defaultRootObject: 'index.html',
      errorResponses: [
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.seconds(0),
        },
      ],
    });

    // ========================================
    // CDK Nag Suppressions
    // ========================================
    NagSuppressions.addResourceSuppressions(
      api,
      [
        {
          id: 'AwsSolutions-APIG1',
          reason: 'API Gateway access logging will be enabled in production',
        },
        {
          id: 'AwsSolutions-APIG4',
          reason: 'API Gateway authorization is implemented via Cognito',
        },
        {
          id: 'AwsSolutions-COG4',
          reason: 'Cognito user pool does not use advanced security features for cost optimization in dev',
        },
      ],
      true
    );

    NagSuppressions.addResourceSuppressions(
      imageGeneratorFunction,
      [
        {
          id: 'AwsSolutions-IAM4',
          reason: 'Lambda execution role uses AWS managed policies which is acceptable',
        },
        {
          id: 'AwsSolutions-IAM5',
          reason: 'Wildcard permissions are necessary for Bedrock model access',
        },
      ],
      true
    );

    // ========================================
    // Outputs
    // ========================================
    new cdk.CfnOutput(this, 'UserPoolId', {
      value: userPool.userPoolId,
      description: 'Cognito User Pool ID',
      exportName: 'BedrockImageGen-UserPoolId',
    });

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: userPoolClient.userPoolClientId,
      description: 'Cognito User Pool Client ID',
      exportName: 'BedrockImageGen-UserPoolClientId',
    });

    new cdk.CfnOutput(this, 'ApiEndpoint', {
      value: api.url,
      description: 'API Gateway endpoint URL',
      exportName: 'BedrockImageGen-ApiEndpoint',
    });

    new cdk.CfnOutput(this, 'ImagesBucketName', {
      value: imagesBucket.bucketName,
      description: 'S3 bucket for generated images',
      exportName: 'BedrockImageGen-ImagesBucket',
    });

    new cdk.CfnOutput(this, 'WebsiteBucketName', {
      value: websiteBucket.bucketName,
      description: 'S3 bucket for website assets',
      exportName: 'BedrockImageGen-WebsiteBucket',
    });

    new cdk.CfnOutput(this, 'DistributionDomainName', {
      value: distribution.distributionDomainName,
      description: 'CloudFront distribution domain name',
      exportName: 'BedrockImageGen-CloudFrontDomain',
    });

    new cdk.CfnOutput(this, 'DistributionId', {
      value: distribution.distributionId,
      description: 'CloudFront distribution ID',
      exportName: 'BedrockImageGen-CloudFrontId',
    });
  }
}
