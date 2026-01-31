import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as codecommit from 'aws-cdk-lib/aws-codecommit';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as codepipeline_actions from 'aws-cdk-lib/aws-codepipeline-actions';
import * as iam from 'aws-cdk-lib/aws-iam';

interface PipelineStackProps extends cdk.StackProps {
  repositoryName: string;
  pipelineName: string;
  buildProjectName: string;
}

export class PipelineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: PipelineStackProps) {
    super(scope, id, props);

    // CodeCommitリポジトリ
    const repository = new codecommit.Repository(this, 'Repository', {
      repositoryName: props.repositoryName,
      description: 'Infrastructure as Code repository',
    });

    // CodeBuildプロジェクト
    const buildProject = new codebuild.PipelineProject(this, 'BuildProject', {
      projectName: props.buildProjectName,
      environment: {
        buildImage: codebuild.LinuxBuildImage.AMAZON_LINUX_2_5,
        computeType: codebuild.ComputeType.SMALL,
      },
    });

    // CodeBuildに必要な権限
    buildProject.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'cloudformation:*',
        'iam:*',
        's3:*',
        'ssm:GetParameter',
        'sts:AssumeRole',
      ],
      resources: ['*'],
    }));

    // パイプライン
    const sourceOutput = new codepipeline.Artifact('SourceOutput');

    new codepipeline.Pipeline(this, 'Pipeline', {
      pipelineName: props.pipelineName,
      pipelineType: codepipeline.PipelineType.V2,
      stages: [
        {
          stageName: 'Source',
          actions: [
            new codepipeline_actions.CodeCommitSourceAction({
              actionName: 'CodeCommit_Source',
              repository: repository,
              branch: 'main',
              output: sourceOutput,
              trigger: codepipeline_actions.CodeCommitTrigger.EVENTS,
            }),
          ],
        },
        {
          stageName: 'Build',
          actions: [
            new codepipeline_actions.CodeBuildAction({
              actionName: 'Build_Deploy',
              project: buildProject,
              input: sourceOutput,
            }),
          ],
        },
      ],
    });

    // 出力
    new cdk.CfnOutput(this, 'RepositoryCloneUrl', {
      value: repository.repositoryCloneUrlHttp,
    });
  }
}
