# Amazon EKS ハンズオンガイド

## 目次
1. [EKS概要](#1-eks概要)
2. [アーキテクチャ](#2-アーキテクチャ)
3. [クラスター作成](#3-クラスター作成)
4. [ノードグループ管理](#4-ノードグループ管理)
5. [Fargate統合](#5-fargate統合)
6. [ネットワーキング](#6-ネットワーキング)
7. [IAMとRBAC](#7-iamとrbac)
8. [ストレージ](#8-ストレージ)
9. [Ingress/ALB Controller](#9-ingressalb-controller)
10. [オートスケーリング](#10-オートスケーリング)
11. [モニタリング・ロギング](#11-モニタリングロギング)
12. [セキュリティ](#12-セキュリティ)
13. [ハンズオン演習](#13-ハンズオン演習)
14. [DOP試験対策チェックリスト](#14-dop試験対策チェックリスト)

---

## 1. EKS概要

### 1.1 Amazon EKSとは

```
┌─────────────────────────────────────────────────────────────────┐
│                     Amazon EKS                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              マネージドコントロールプレーン              │   │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐                 │   │
│  │  │  API    │  │  etcd   │  │Controller│                │   │
│  │  │ Server  │  │(暗号化) │  │ Manager │                │   │
│  │  └─────────┘  └─────────┘  └─────────┘                 │   │
│  │              (3 AZに分散、AWS管理)                       │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                  │
│                              ▼                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    データプレーン                        │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │   │
│  │  │ Managed     │  │ Self-       │  │  Fargate    │     │   │
│  │  │ Node Group  │  │ Managed     │  │  Profile    │     │   │
│  │  │ (推奨)      │  │ Nodes       │  │  (サーバレス)│     │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘     │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 データプレーンオプション比較

| 項目 | Managed Node Group | Self-Managed Nodes | Fargate |
|------|-------------------|-------------------|---------|
| **ノード管理** | AWS管理 | ユーザー管理 | 不要 |
| **AMI更新** | 自動/手動選択可 | 手動 | 不要 |
| **スケーリング** | ASG連携 | 自己設定 | 自動 |
| **コスト** | EC2料金 | EC2料金 | vCPU/メモリ課金 |
| **GPU対応** | ○ | ○ | × |
| **DaemonSet** | ○ | ○ | × |
| **推奨用途** | 汎用 | カスタマイズ | バッチ/開発 |

### 1.3 EKSバージョンライフサイクル

```
【Kubernetesバージョンサポート】

リリース ──▶ 標準サポート (14ヶ月) ──▶ 延長サポート (12ヶ月) ──▶ EOL

標準サポート: 追加料金なし
延長サポート: クラスターあたり $0.60/時間 追加

DOP重要: 延長サポートに入る前にアップグレード計画を立てる
```

---

## 2. アーキテクチャ

### 2.1 VPCアーキテクチャ

```
┌─────────────────────────────────────────────────────────────────┐
│                           VPC (10.0.0.0/16)                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    Availability Zone 1                    │   │
│  │  ┌──────────────────┐  ┌──────────────────┐             │   │
│  │  │ Public Subnet    │  │ Private Subnet   │             │   │
│  │  │ 10.0.0.0/24      │  │ 10.0.10.0/24     │             │   │
│  │  │                  │  │                  │             │   │
│  │  │ ┌──────────────┐ │  │ ┌──────────────┐ │             │   │
│  │  │ │ NAT Gateway  │ │  │ │  Worker Node │ │             │   │
│  │  │ └──────────────┘ │  │ │  (Pod群)     │ │             │   │
│  │  │ ┌──────────────┐ │  │ └──────────────┘ │             │   │
│  │  │ │ ALB          │ │  │                  │             │   │
│  │  │ └──────────────┘ │  │                  │             │   │
│  │  └──────────────────┘  └──────────────────┘             │   │
│  └─────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    Availability Zone 2                    │   │
│  │  ┌──────────────────┐  ┌──────────────────┐             │   │
│  │  │ Public Subnet    │  │ Private Subnet   │             │   │
│  │  │ 10.0.1.0/24      │  │ 10.0.11.0/24     │             │   │
│  │  └──────────────────┘  └──────────────────┘             │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘

【サブネットタグ要件】
Public Subnet:  kubernetes.io/role/elb = 1
Private Subnet: kubernetes.io/role/internal-elb = 1
共通:           kubernetes.io/cluster/<cluster-name> = shared|owned
```

### 2.2 コントロールプレーンエンドポイント

```
┌─────────────────────────────────────────────────────────────┐
│              エンドポイントアクセスモード                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  【Public】          【Private】        【Public+Private】   │
│  ┌─────────┐        ┌─────────┐        ┌─────────┐         │
│  │Internet │        │  VPC内  │        │ 両方    │         │
│  │からのみ │        │ からのみ│        │ アクセス│         │
│  └─────────┘        └─────────┘        └─────────┘         │
│                                                             │
│  開発環境向け        セキュリティ重視    本番推奨            │
│                     (VPN/Direct Connect                     │
│                      経由でアクセス)                        │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. クラスター作成

### 3.1 eksctlによるクラスター作成

```bash
# eksctl インストール
curl --silent --location "https://github.com/weaveworks/eksctl/releases/latest/download/eksctl_$(uname -s)_amd64.tar.gz" | tar xz -C /tmp
sudo mv /tmp/eksctl /usr/local/bin

# バージョン確認
eksctl version

# 基本クラスター作成
eksctl create cluster \
  --name my-cluster \
  --region ap-northeast-1 \
  --version 1.29 \
  --nodegroup-name standard-workers \
  --node-type t3.medium \
  --nodes 2 \
  --nodes-min 1 \
  --nodes-max 4 \
  --managed

# kubeconfigの更新
aws eks update-kubeconfig --name my-cluster --region ap-northeast-1
```

### 3.2 ClusterConfig YAMLでの作成

```yaml
# cluster-config.yaml
apiVersion: eksctl.io/v1alpha5
kind: ClusterConfig

metadata:
  name: my-production-cluster
  region: ap-northeast-1
  version: "1.29"

vpc:
  cidr: 10.0.0.0/16
  nat:
    gateway: HighlyAvailable  # Single | HighlyAvailable | Disable

iam:
  withOIDC: true  # IRSA有効化（重要）

managedNodeGroups:
  - name: app-workers
    instanceType: t3.large
    desiredCapacity: 3
    minSize: 2
    maxSize: 5
    volumeSize: 50
    volumeType: gp3
    privateNetworking: true
    labels:
      role: app
    tags:
      Environment: production
    iam:
      attachPolicyARNs:
        - arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy
        - arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly
        - arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy

  - name: system-workers
    instanceType: t3.medium
    desiredCapacity: 2
    labels:
      role: system
    taints:
      - key: CriticalAddonsOnly
        value: "true"
        effect: NoSchedule

fargateProfiles:
  - name: fp-default
    selectors:
      - namespace: serverless
        labels:
          compute: fargate

cloudWatch:
  clusterLogging:
    enableTypes:
      - api
      - audit
      - authenticator
      - controllerManager
      - scheduler
```

```bash
# クラスター作成
eksctl create cluster -f cluster-config.yaml

# クラスター情報確認
eksctl get cluster --name my-production-cluster
```

### 3.3 AWS CLIでのクラスター作成

```bash
# 1. クラスターロール作成
cat > eks-cluster-role-trust-policy.json << 'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "eks.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
EOF

aws iam create-role \
  --role-name EKSClusterRole \
  --assume-role-policy-document file://eks-cluster-role-trust-policy.json

aws iam attach-role-policy \
  --role-name EKSClusterRole \
  --policy-arn arn:aws:iam::aws:policy/AmazonEKSClusterPolicy

# 2. クラスター作成
aws eks create-cluster \
  --name my-cluster \
  --role-arn arn:aws:iam::$(aws sts get-caller-identity --query Account --output text):role/EKSClusterRole \
  --resources-vpc-config subnetIds=subnet-xxx,subnet-yyy,securityGroupIds=sg-zzz \
  --kubernetes-version 1.29

# 3. クラスター状態確認（ACTIVEになるまで待機）
aws eks describe-cluster --name my-cluster --query cluster.status
```

---

## 4. ノードグループ管理

### 4.1 Managed Node Group作成

```bash
# ノードロール作成
aws iam create-role \
  --role-name EKSNodeRole \
  --assume-role-policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Principal": {"Service": "ec2.amazonaws.com"},
      "Action": "sts:AssumeRole"
    }]
  }'

# 必要なポリシーをアタッチ
aws iam attach-role-policy --role-name EKSNodeRole \
  --policy-arn arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy
aws iam attach-role-policy --role-name EKSNodeRole \
  --policy-arn arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly
aws iam attach-role-policy --role-name EKSNodeRole \
  --policy-arn arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy

# ノードグループ作成
aws eks create-nodegroup \
  --cluster-name my-cluster \
  --nodegroup-name standard-workers \
  --node-role arn:aws:iam::123456789012:role/EKSNodeRole \
  --subnets subnet-xxx subnet-yyy \
  --instance-types t3.medium \
  --scaling-config minSize=1,maxSize=5,desiredSize=2 \
  --capacity-type ON_DEMAND \
  --disk-size 50
```

### 4.2 ノードグループ更新戦略

```bash
# ノードグループの更新設定
aws eks update-nodegroup-config \
  --cluster-name my-cluster \
  --nodegroup-name standard-workers \
  --update-config maxUnavailable=1

# AMIバージョン更新
aws eks update-nodegroup-version \
  --cluster-name my-cluster \
  --nodegroup-name standard-workers \
  --release-version 1.29.0-20240202

# 更新状況確認
aws eks describe-update \
  --name my-cluster \
  --nodegroup-name standard-workers \
  --update-id <update-id>
```

### 4.3 Spot Instancesの活用

```yaml
# eksctl設定
managedNodeGroups:
  - name: spot-workers
    instanceTypes:
      - t3.large
      - t3a.large
      - m5.large
      - m5a.large
    spot: true
    desiredCapacity: 3
    minSize: 1
    maxSize: 10
    labels:
      lifecycle: spot
    taints:
      - key: spotInstance
        value: "true"
        effect: PreferNoSchedule
```

```bash
# AWS CLIでSpotノードグループ
aws eks create-nodegroup \
  --cluster-name my-cluster \
  --nodegroup-name spot-workers \
  --node-role arn:aws:iam::123456789012:role/EKSNodeRole \
  --subnets subnet-xxx subnet-yyy \
  --instance-types t3.large t3a.large m5.large \
  --capacity-type SPOT \
  --scaling-config minSize=1,maxSize=10,desiredSize=3
```

---

## 5. Fargate統合

### 5.1 Fargateプロファイル

```
┌─────────────────────────────────────────────────────────────┐
│                  Fargate Pod スケジューリング                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Pod作成 ──▶ Scheduler ──▶ Fargate Profile照合            │
│                               │                             │
│                               ▼                             │
│                    ┌─────────────────────┐                  │
│                    │ namespace + labels  │                  │
│                    │   マッチ確認        │                  │
│                    └─────────────────────┘                  │
│                          │         │                        │
│                    マッチ │         │ 不一致                │
│                          ▼         ▼                        │
│                    ┌────────┐  ┌────────┐                  │
│                    │Fargate │  │ EC2    │                  │
│                    │ノード  │  │ノード  │                  │
│                    └────────┘  └────────┘                  │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 Fargateプロファイル作成

```bash
# Fargate Pod実行ロール作成
cat > fargate-pod-execution-role-trust-policy.json << 'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "eks-fargate-pods.amazonaws.com"
      },
      "Action": "sts:AssumeRole",
      "Condition": {
        "ArnLike": {
          "aws:SourceArn": "arn:aws:eks:ap-northeast-1:123456789012:fargateprofile/my-cluster/*"
        }
      }
    }
  ]
}
EOF

aws iam create-role \
  --role-name EKSFargatePodExecutionRole \
  --assume-role-policy-document file://fargate-pod-execution-role-trust-policy.json

aws iam attach-role-policy \
  --role-name EKSFargatePodExecutionRole \
  --policy-arn arn:aws:iam::aws:policy/AmazonEKSFargatePodExecutionRolePolicy

# Fargateプロファイル作成
aws eks create-fargate-profile \
  --cluster-name my-cluster \
  --fargate-profile-name fp-serverless \
  --pod-execution-role-arn arn:aws:iam::123456789012:role/EKSFargatePodExecutionRole \
  --subnets subnet-private1 subnet-private2 \
  --selectors namespace=serverless,labels={app=batch}
```

### 5.3 Fargateの制限事項

```
【Fargate制限事項 - DOP試験頻出】

✗ DaemonSets は実行不可
✗ 特権コンテナ不可
✗ HostNetwork/HostPort 不可
✗ GPUワークロード不可
✗ EBS Volume 不可（EFS は使用可能）
✗ LoadBalancer Service（ALB Ingress Controller必須）

✓ 各PodはENIを持つ（VPC内のIPアドレスを消費）
✓ 最大4 vCPU、30GB メモリ
✓ 20GB エフェメラルストレージ（拡張可能）
```

---

## 6. ネットワーキング

### 6.1 Amazon VPC CNI

```
┌─────────────────────────────────────────────────────────────┐
│                     VPC CNI Plugin                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌───────────────────────────────────────────────────┐     │
│  │                    Worker Node                     │     │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐           │     │
│  │  │ Pod 1   │  │ Pod 2   │  │ Pod 3   │           │     │
│  │  │10.0.1.10│  │10.0.1.11│  │10.0.1.12│           │     │
│  │  └────┬────┘  └────┬────┘  └────┬────┘           │     │
│  │       │            │            │                 │     │
│  │       └────────────┼────────────┘                 │     │
│  │                    │                              │     │
│  │  ┌─────────────────┴─────────────────┐           │     │
│  │  │  Secondary ENI (VPC内IPアドレス)   │           │     │
│  │  │  各PodがVPC内で直接通信可能        │           │     │
│  │  └───────────────────────────────────┘           │     │
│  └───────────────────────────────────────────────────┘     │
│                                                             │
│  特徴:                                                      │
│  - Pod IPはVPCのCIDRから割り当て                           │
│  - Security Group for Pods対応                              │
│  - 高いネットワークスループット                              │
│                                                             │
│  考慮事項:                                                  │
│  - サブネットのIPアドレス枯渇に注意                          │
│  - 大規模クラスターではセカンダリCIDR追加を検討              │
└─────────────────────────────────────────────────────────────┘
```

### 6.2 Network Policy

```yaml
# Calicoインストール（デフォルトCNIはNetwork Policy未対応）
kubectl apply -f https://raw.githubusercontent.com/aws/amazon-vpc-cni-k8s/master/config/master/calico-operator.yaml
kubectl apply -f https://raw.githubusercontent.com/aws/amazon-vpc-cni-k8s/master/config/master/calico-crs.yaml

# Network Policy例：特定namespaceからのみアクセス許可
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: api-allow
  namespace: production
spec:
  podSelector:
    matchLabels:
      app: api
  policyTypes:
    - Ingress
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              name: frontend
        - podSelector:
            matchLabels:
              role: frontend
      ports:
        - protocol: TCP
          port: 8080
```

### 6.3 Security Groups for Pods

```bash
# VPC CNI設定更新
kubectl set env daemonset aws-node -n kube-system ENABLE_POD_ENI=true

# セキュリティグループポリシー作成
cat << EOF | kubectl apply -f -
apiVersion: vpcresources.k8s.aws/v1beta1
kind: SecurityGroupPolicy
metadata:
  name: db-access-policy
  namespace: production
spec:
  podSelector:
    matchLabels:
      role: db-client
  securityGroups:
    groupIds:
      - sg-12345678  # RDSアクセス用SG
EOF
```

---

## 7. IAMとRBAC

### 7.1 IRSA (IAM Roles for Service Accounts)

```
┌─────────────────────────────────────────────────────────────┐
│                    IRSA アーキテクチャ                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐         ┌─────────────┐                   │
│  │  Pod        │         │   AWS STS   │                   │
│  │             │◀───────▶│             │                   │
│  │ServiceAccount        │  AssumeRole  │                   │
│  │  (JWT Token)│         │  WebIdentity│                   │
│  └─────────────┘         └──────┬──────┘                   │
│                                 │                           │
│                                 ▼                           │
│                         ┌─────────────┐                    │
│                         │  IAM Role   │                    │
│                         │  (S3, DynamoDB等│                │
│                         │   へのアクセス) │                │
│                         └─────────────┘                    │
│                                                             │
│  利点:                                                      │
│  - ノード全体ではなくPod単位でIAMロール割り当て             │
│  - 最小権限の原則を実現                                     │
│  - EC2インスタンスプロファイル不要                          │
└─────────────────────────────────────────────────────────────┘
```

### 7.2 IRSA設定手順

```bash
# 1. OIDCプロバイダー関連付け
eksctl utils associate-iam-oidc-provider \
  --cluster my-cluster \
  --approve

# 2. IAMサービスアカウント作成
eksctl create iamserviceaccount \
  --cluster my-cluster \
  --namespace default \
  --name s3-access-sa \
  --attach-policy-arn arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess \
  --approve

# 3. Podで使用
cat << EOF | kubectl apply -f -
apiVersion: v1
kind: Pod
metadata:
  name: s3-app
spec:
  serviceAccountName: s3-access-sa
  containers:
    - name: app
      image: amazon/aws-cli
      command: ["aws", "s3", "ls"]
EOF
```

### 7.3 aws-auth ConfigMap

```yaml
# aws-auth ConfigMapの確認
kubectl get configmap aws-auth -n kube-system -o yaml

# aws-auth ConfigMap編集
apiVersion: v1
kind: ConfigMap
metadata:
  name: aws-auth
  namespace: kube-system
data:
  mapRoles: |
    - rolearn: arn:aws:iam::123456789012:role/EKSNodeRole
      username: system:node:{{EC2PrivateDNSName}}
      groups:
        - system:bootstrappers
        - system:nodes
    - rolearn: arn:aws:iam::123456789012:role/AdminRole
      username: admin
      groups:
        - system:masters
  mapUsers: |
    - userarn: arn:aws:iam::123456789012:user/developer
      username: developer
      groups:
        - dev-group
```

### 7.4 EKS Access Entry (新方式)

```bash
# Access Entry作成（aws-auth ConfigMapの代替）
aws eks create-access-entry \
  --cluster-name my-cluster \
  --principal-arn arn:aws:iam::123456789012:role/DeveloperRole \
  --type STANDARD

# アクセスポリシー関連付け
aws eks associate-access-policy \
  --cluster-name my-cluster \
  --principal-arn arn:aws:iam::123456789012:role/DeveloperRole \
  --policy-arn arn:aws:eks::aws:cluster-access-policy/AmazonEKSViewPolicy \
  --access-scope type=namespace,namespaces=development
```

---

## 8. ストレージ

### 8.1 EBS CSI Driver

```bash
# EBS CSI Driverアドオンインストール
eksctl create iamserviceaccount \
  --cluster my-cluster \
  --namespace kube-system \
  --name ebs-csi-controller-sa \
  --attach-policy-arn arn:aws:iam::aws:policy/service-role/AmazonEBSCSIDriverPolicy \
  --approve

aws eks create-addon \
  --cluster-name my-cluster \
  --addon-name aws-ebs-csi-driver \
  --service-account-role-arn arn:aws:iam::123456789012:role/eksctl-my-cluster-addon-iamserviceaccount-kube-system-ebs-csi-controller-sa

# StorageClass作成
cat << EOF | kubectl apply -f -
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: gp3
  annotations:
    storageclass.kubernetes.io/is-default-class: "true"
provisioner: ebs.csi.aws.com
parameters:
  type: gp3
  iops: "3000"
  throughput: "125"
  encrypted: "true"
volumeBindingMode: WaitForFirstConsumer
allowVolumeExpansion: true
EOF
```

### 8.2 EFS CSI Driver

```bash
# EFS CSI Driver用IAMロール
eksctl create iamserviceaccount \
  --cluster my-cluster \
  --namespace kube-system \
  --name efs-csi-controller-sa \
  --attach-policy-arn arn:aws:iam::aws:policy/service-role/AmazonEFSCSIDriverPolicy \
  --approve

# EFS CSI Driverインストール
aws eks create-addon \
  --cluster-name my-cluster \
  --addon-name aws-efs-csi-driver

# EFS用StorageClass
cat << EOF | kubectl apply -f -
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: efs-sc
provisioner: efs.csi.aws.com
parameters:
  provisioningMode: efs-ap
  fileSystemId: fs-12345678
  directoryPerms: "700"
EOF
```

---

## 9. Ingress/ALB Controller

### 9.1 AWS Load Balancer Controller

```bash
# IAMポリシー作成
curl -o iam_policy.json https://raw.githubusercontent.com/kubernetes-sigs/aws-load-balancer-controller/main/docs/install/iam_policy.json

aws iam create-policy \
  --policy-name AWSLoadBalancerControllerIAMPolicy \
  --policy-document file://iam_policy.json

# サービスアカウント作成
eksctl create iamserviceaccount \
  --cluster my-cluster \
  --namespace kube-system \
  --name aws-load-balancer-controller \
  --attach-policy-arn arn:aws:iam::123456789012:policy/AWSLoadBalancerControllerIAMPolicy \
  --approve

# Helmでインストール
helm repo add eks https://aws.github.io/eks-charts
helm install aws-load-balancer-controller eks/aws-load-balancer-controller \
  -n kube-system \
  --set clusterName=my-cluster \
  --set serviceAccount.create=false \
  --set serviceAccount.name=aws-load-balancer-controller
```

### 9.2 Ingress設定例

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: app-ingress
  annotations:
    kubernetes.io/ingress.class: alb
    alb.ingress.kubernetes.io/scheme: internet-facing
    alb.ingress.kubernetes.io/target-type: ip
    alb.ingress.kubernetes.io/healthcheck-path: /health
    alb.ingress.kubernetes.io/listen-ports: '[{"HTTPS":443}]'
    alb.ingress.kubernetes.io/certificate-arn: arn:aws:acm:ap-northeast-1:123456789012:certificate/xxx
    alb.ingress.kubernetes.io/ssl-policy: ELBSecurityPolicy-TLS-1-2-2017-01
spec:
  rules:
    - host: app.example.com
      http:
        paths:
          - path: /api
            pathType: Prefix
            backend:
              service:
                name: api-service
                port:
                  number: 80
          - path: /
            pathType: Prefix
            backend:
              service:
                name: frontend-service
                port:
                  number: 80
```

---

## 10. オートスケーリング

### 10.1 Cluster Autoscaler

```bash
# Cluster Autoscalerインストール
kubectl apply -f https://raw.githubusercontent.com/kubernetes/autoscaler/master/cluster-autoscaler/cloudprovider/aws/examples/cluster-autoscaler-autodiscover.yaml

# 設定カスタマイズ
kubectl -n kube-system edit deployment cluster-autoscaler

# 重要な設定
# --node-group-auto-discovery=asg:tag=k8s.io/cluster-autoscaler/enabled,k8s.io/cluster-autoscaler/<cluster-name>
# --balance-similar-node-groups
# --skip-nodes-with-system-pods=false
```

### 10.2 Karpenter

```bash
# Karpenterインストール（eksctl）
eksctl create iamserviceaccount \
  --cluster my-cluster \
  --namespace karpenter \
  --name karpenter \
  --attach-policy-arn arn:aws:iam::123456789012:policy/KarpenterControllerPolicy \
  --approve

# Helmでインストール
helm install karpenter oci://public.ecr.aws/karpenter/karpenter \
  --namespace karpenter \
  --create-namespace \
  --set settings.clusterName=my-cluster \
  --set settings.clusterEndpoint=$(aws eks describe-cluster --name my-cluster --query "cluster.endpoint" --output text)
```

```yaml
# NodePool定義
apiVersion: karpenter.sh/v1beta1
kind: NodePool
metadata:
  name: default
spec:
  template:
    spec:
      requirements:
        - key: kubernetes.io/arch
          operator: In
          values: ["amd64"]
        - key: karpenter.sh/capacity-type
          operator: In
          values: ["spot", "on-demand"]
        - key: node.kubernetes.io/instance-type
          operator: In
          values: ["t3.medium", "t3.large", "m5.large"]
      nodeClassRef:
        name: default
  limits:
    cpu: 100
    memory: 200Gi
  disruption:
    consolidationPolicy: WhenUnderutilized
    consolidateAfter: 30s
```

### 10.3 HPA (Horizontal Pod Autoscaler)

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: app-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: app
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
        - type: Percent
          value: 10
          periodSeconds: 60
    scaleUp:
      stabilizationWindowSeconds: 0
      policies:
        - type: Percent
          value: 100
          periodSeconds: 15
```

---

## 11. モニタリング・ロギング

### 11.1 CloudWatch Container Insights

```bash
# Container Insights有効化
ClusterName=my-cluster
RegionName=ap-northeast-1
FluentBitHttpPort='2020'
FluentBitReadFromHead='Off'

curl https://raw.githubusercontent.com/aws-samples/amazon-cloudwatch-container-insights/latest/k8s-deployment-manifest-templates/deployment-mode/daemonset/container-insights-monitoring/quickstart/cwagent-fluent-bit-quickstart.yaml | sed "s/{{cluster_name}}/${ClusterName}/;s/{{region_name}}/${RegionName}/;s/{{http_server_port}}/${FluentBitHttpPort}/;s/{{read_from_head}}/${FluentBitReadFromHead}/" | kubectl apply -f -
```

### 11.2 コントロールプレーンログ

```bash
# コントロールプレーンログ有効化
aws eks update-cluster-config \
  --name my-cluster \
  --logging '{"clusterLogging":[{"types":["api","audit","authenticator","controllerManager","scheduler"],"enabled":true}]}'

# CloudWatch Logs Insightsでクエリ
# ロググループ: /aws/eks/my-cluster/cluster
fields @timestamp, @message
| filter @logStream like /authenticator/
| filter @message like /access denied/
| sort @timestamp desc
| limit 100
```

### 11.3 Prometheus/Grafana

```bash
# Amazon Managed Prometheus (AMP)
aws amp create-workspace --alias my-eks-metrics

# ADOT Collector設定
eksctl create iamserviceaccount \
  --cluster my-cluster \
  --namespace prometheus \
  --name amp-iamproxy-ingest-service-account \
  --attach-policy-arn arn:aws:iam::aws:policy/AmazonPrometheusRemoteWriteAccess \
  --approve
```

---

## 12. セキュリティ

### 12.1 Pod Security Standards

```yaml
# Pod Security Admission設定
apiVersion: v1
kind: Namespace
metadata:
  name: production
  labels:
    pod-security.kubernetes.io/enforce: restricted
    pod-security.kubernetes.io/warn: restricted
    pod-security.kubernetes.io/audit: restricted
```

### 12.2 Secrets暗号化

```bash
# エンベロープ暗号化の有効化
aws eks create-cluster \
  --name my-cluster \
  --encryption-config '[{"resources":["secrets"],"provider":{"keyArn":"arn:aws:kms:ap-northeast-1:123456789012:key/xxx"}}]' \
  ...

# 既存クラスターへの追加
aws eks associate-encryption-config \
  --cluster-name my-cluster \
  --encryption-config '[{"resources":["secrets"],"provider":{"keyArn":"arn:aws:kms:ap-northeast-1:123456789012:key/xxx"}}]'
```

### 12.3 セキュリティベストプラクティス

```
┌─────────────────────────────────────────────────────────────┐
│              EKS セキュリティチェックリスト                  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ □ プライベートエンドポイントの使用                          │
│ □ IRSA でPod単位のIAM権限管理                               │
│ □ Network Policy で通信制御                                 │
│ □ Security Groups for Pods                                  │
│ □ Secrets のKMS暗号化                                       │
│ □ Pod Security Standards (Restricted)                       │
│ □ ECRイメージスキャン有効化                                 │
│ □ コントロールプレーン監査ログ有効化                        │
│ □ aws-auth ConfigMap の定期監査                             │
│ □ RBAC 最小権限の原則                                       │
└─────────────────────────────────────────────────────────────┘
```

---

## 13. ハンズオン演習

### 演習1: クラスター作成とアプリケーションデプロイ

```bash
# 1. クラスター作成
eksctl create cluster \
  --name handson-cluster \
  --region ap-northeast-1 \
  --version 1.29 \
  --nodegroup-name standard-workers \
  --node-type t3.medium \
  --nodes 2 \
  --managed

# 2. kubeconfigセットアップ
aws eks update-kubeconfig --name handson-cluster

# 3. サンプルアプリデプロイ
kubectl create deployment nginx --image=nginx
kubectl expose deployment nginx --port=80 --type=LoadBalancer

# 4. 確認
kubectl get pods
kubectl get svc nginx

# 5. クリーンアップ
eksctl delete cluster --name handson-cluster
```

### 演習2: IRSA設定

```bash
# 1. OIDC Provider有効化
eksctl utils associate-iam-oidc-provider \
  --cluster handson-cluster \
  --approve

# 2. IAMサービスアカウント作成
eksctl create iamserviceaccount \
  --cluster handson-cluster \
  --namespace default \
  --name s3-reader \
  --attach-policy-arn arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess \
  --approve

# 3. S3アクセステスト用Pod
cat << EOF | kubectl apply -f -
apiVersion: v1
kind: Pod
metadata:
  name: s3-test
spec:
  serviceAccountName: s3-reader
  containers:
    - name: aws-cli
      image: amazon/aws-cli
      command: ["sleep", "3600"]
EOF

# 4. S3アクセス確認
kubectl exec -it s3-test -- aws s3 ls

# 5. クリーンアップ
kubectl delete pod s3-test
```

### 演習3: ALB Ingress設定

```bash
# 1. AWS Load Balancer Controller インストール
helm repo add eks https://aws.github.io/eks-charts
helm install aws-load-balancer-controller eks/aws-load-balancer-controller \
  -n kube-system \
  --set clusterName=handson-cluster

# 2. サンプルアプリ
kubectl create deployment web --image=nginx
kubectl expose deployment web --port=80

# 3. Ingress作成
cat << EOF | kubectl apply -f -
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: web-ingress
  annotations:
    kubernetes.io/ingress.class: alb
    alb.ingress.kubernetes.io/scheme: internet-facing
    alb.ingress.kubernetes.io/target-type: ip
spec:
  rules:
    - http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: web
                port:
                  number: 80
EOF

# 4. ALBアドレス確認
kubectl get ingress web-ingress
```

### 演習4: Fargate Profile

```bash
# 1. Fargate Profile作成
eksctl create fargateprofile \
  --cluster handson-cluster \
  --name fp-default \
  --namespace fargate-ns

# 2. namespace作成
kubectl create namespace fargate-ns

# 3. Fargateでデプロイ
kubectl -n fargate-ns create deployment fargate-app --image=nginx

# 4. Pod確認（FargateノードにSchedule）
kubectl -n fargate-ns get pods -o wide
```

### 演習5: Cluster Autoscaler

```bash
# 1. Cluster Autoscalerデプロイ
kubectl apply -f https://raw.githubusercontent.com/kubernetes/autoscaler/master/cluster-autoscaler/cloudprovider/aws/examples/cluster-autoscaler-autodiscover.yaml

# 2. 設定
kubectl -n kube-system annotate deployment.apps/cluster-autoscaler \
  cluster-autoscaler.kubernetes.io/safe-to-evict="false"

# 3. 負荷テスト用デプロイメント
kubectl create deployment load-test --image=nginx --replicas=50

# 4. ノードスケール確認
kubectl get nodes -w

# 5. クリーンアップ
kubectl delete deployment load-test
```

### 演習6: EBS永続ボリューム

```bash
# 1. EBS CSI Driverインストール
aws eks create-addon \
  --cluster-name handson-cluster \
  --addon-name aws-ebs-csi-driver

# 2. StorageClass
cat << EOF | kubectl apply -f -
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: ebs-gp3
provisioner: ebs.csi.aws.com
parameters:
  type: gp3
volumeBindingMode: WaitForFirstConsumer
EOF

# 3. PVC作成
cat << EOF | kubectl apply -f -
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: ebs-claim
spec:
  accessModes:
    - ReadWriteOnce
  storageClassName: ebs-gp3
  resources:
    requests:
      storage: 10Gi
EOF

# 4. Podで使用
cat << EOF | kubectl apply -f -
apiVersion: v1
kind: Pod
metadata:
  name: ebs-app
spec:
  containers:
    - name: app
      image: nginx
      volumeMounts:
        - mountPath: /data
          name: ebs-volume
  volumes:
    - name: ebs-volume
      persistentVolumeClaim:
        claimName: ebs-claim
EOF

# 5. 確認
kubectl exec -it ebs-app -- df -h /data
```

### 演習7: Network Policy

```bash
# 1. Calico インストール
kubectl apply -f https://raw.githubusercontent.com/aws/amazon-vpc-cni-k8s/master/config/master/calico-operator.yaml
kubectl apply -f https://raw.githubusercontent.com/aws/amazon-vpc-cni-k8s/master/config/master/calico-crs.yaml

# 2. テスト用namespace/pod作成
kubectl create namespace netpol-test
kubectl -n netpol-test create deployment web --image=nginx
kubectl -n netpol-test expose deployment web --port=80

kubectl -n netpol-test create deployment client --image=busybox -- sleep 3600

# 3. 通信確認（許可状態）
kubectl -n netpol-test exec -it deploy/client -- wget -qO- web

# 4. Network Policy適用（全拒否）
cat << EOF | kubectl apply -f -
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: deny-all
  namespace: netpol-test
spec:
  podSelector: {}
  policyTypes:
    - Ingress
EOF

# 5. 通信確認（拒否状態）
kubectl -n netpol-test exec -it deploy/client -- wget -qO- --timeout=3 web
# → タイムアウト

# 6. クリーンアップ
kubectl delete namespace netpol-test
```

---

## 14. DOP試験対策チェックリスト

### Q1: EKSクラスターへのアクセス管理

**問題**: 開発者がkubectlでEKSクラスターにアクセスできるようにする最も安全な方法は？

**解答**:
1. **EKS Access Entry** (推奨) または **aws-auth ConfigMap** でIAMロール/ユーザーをマッピング
2. IAMロールに必要最小限のKubernetes RBAC権限を付与
3. MFAを有効化したIAM認証を使用

```bash
# Access Entry方式
aws eks create-access-entry \
  --cluster-name my-cluster \
  --principal-arn arn:aws:iam::123456789012:role/DeveloperRole \
  --type STANDARD

aws eks associate-access-policy \
  --cluster-name my-cluster \
  --principal-arn arn:aws:iam::123456789012:role/DeveloperRole \
  --policy-arn arn:aws:eks::aws:cluster-access-policy/AmazonEKSViewPolicy \
  --access-scope type=namespace,namespaces=development
```

---

### Q2: Pod単位でのAWSサービスアクセス

**問題**: 特定のPodにのみS3バケットへのアクセス権限を付与する方法は？

**解答**: **IRSA (IAM Roles for Service Accounts)** を使用

```bash
# 1. OIDCプロバイダー設定
eksctl utils associate-iam-oidc-provider --cluster my-cluster --approve

# 2. サービスアカウント作成
eksctl create iamserviceaccount \
  --cluster my-cluster \
  --name s3-access-sa \
  --attach-policy-arn arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess \
  --approve

# 3. Podでサービスアカウント指定
spec:
  serviceAccountName: s3-access-sa
```

---

### Q3: ノードグループの更新戦略

**問題**: 本番環境でダウンタイムなしにノードグループのAMIを更新する方法は？

**解答**:
1. **Managed Node Group** の更新設定を使用
2. `maxUnavailable` を設定してローリング更新
3. **PodDisruptionBudget** で最小稼働Pod数を保証

```bash
aws eks update-nodegroup-config \
  --cluster-name my-cluster \
  --nodegroup-name workers \
  --update-config maxUnavailable=1

aws eks update-nodegroup-version \
  --cluster-name my-cluster \
  --nodegroup-name workers
```

---

### Q4: Fargateの制限事項

**問題**: EKS on Fargateで実行できないワークロードは？

**解答**:
- **DaemonSet** (各ノードに1つずつ配置が必要なワークロード)
- **特権コンテナ** (privileged: true)
- **HostNetwork/HostPort** を使用するPod
- **GPUワークロード**
- **EBS永続ボリューム** (EFSは使用可能)

---

### Q5: ALB Ingressの設定

**問題**: EKSでALBを使用してHTTPSトラフィックを終端する方法は？

**解答**: **AWS Load Balancer Controller** + Ingress annotations

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  annotations:
    kubernetes.io/ingress.class: alb
    alb.ingress.kubernetes.io/scheme: internet-facing
    alb.ingress.kubernetes.io/target-type: ip
    alb.ingress.kubernetes.io/listen-ports: '[{"HTTPS":443}]'
    alb.ingress.kubernetes.io/certificate-arn: arn:aws:acm:...:certificate/xxx
```

---

### Q6: クラスターオートスケーリング

**問題**: ワークロードに応じてノード数を自動調整する方法は？

**解答**:
1. **Cluster Autoscaler**: ASGベースの従来型スケーラー
2. **Karpenter** (推奨): 高速なプロビジョニング、Spot統合が優れている

| 比較項目 | Cluster Autoscaler | Karpenter |
|---------|-------------------|-----------|
| スケール速度 | 分単位 | 秒単位 |
| ノードグループ | 事前定義必要 | 動的生成 |
| Spot対応 | 手動設定 | 自動選択 |
| 推奨環境 | 小〜中規模 | 大規模・動的 |

---

### Q7: EKSセキュリティベストプラクティス

**問題**: EKSクラスターのセキュリティを強化するための推奨設定は？

**解答**:
1. **プライベートエンドポイント** を有効化
2. **IRSA** でPod単位のIAM権限
3. **Network Policy** で通信制御
4. **Secrets暗号化** (KMS)
5. **Pod Security Standards** (Restricted)
6. **コントロールプレーン監査ログ** 有効化

---

### Q8: マルチテナント分離

**問題**: 複数チームが同一EKSクラスターを安全に使用する方法は？

**解答**:
1. **Namespace分離** + RBAC
2. **Network Policy** でnamespace間通信を制御
3. **ResourceQuota** でリソース使用量制限
4. **Pod Security Standards** でセキュリティレベル強制

```yaml
# ResourceQuota例
apiVersion: v1
kind: ResourceQuota
metadata:
  name: team-a-quota
  namespace: team-a
spec:
  hard:
    requests.cpu: "10"
    requests.memory: 20Gi
    limits.cpu: "20"
    limits.memory: 40Gi
    pods: "50"
```

---

### Q9: ログ集約

**問題**: EKSクラスターのログをCloudWatch Logsに集約する方法は？

**解答**:
1. **コントロールプレーンログ**: クラスター設定で有効化
2. **アプリケーションログ**: Fluent Bit DaemonSet (Container Insights)

```bash
# コントロールプレーンログ有効化
aws eks update-cluster-config \
  --name my-cluster \
  --logging '{"clusterLogging":[{"types":["api","audit","authenticator","controllerManager","scheduler"],"enabled":true}]}'
```

---

### Q10: 障害復旧

**問題**: EKSクラスターの障害復旧計画で考慮すべき点は？

**解答**:
1. **コントロールプレーン**: AWSが3 AZで管理（高可用性）
2. **データプレーン**: 複数AZにノード分散
3. **バックアップ**:
   - etcdはAWSが管理・バックアップ
   - アプリ設定はGitOpsで管理
   - PVデータはEBSスナップショット/EFSバックアップ
4. **マルチリージョンDR**: GitOpsで別リージョンにクラスター再作成

---

## 付録: よく使うコマンド

```bash
# クラスター操作
eksctl create cluster -f cluster.yaml
eksctl delete cluster --name my-cluster
aws eks update-kubeconfig --name my-cluster

# ノードグループ
eksctl create nodegroup -f nodegroup.yaml
eksctl scale nodegroup --cluster=my-cluster --name=workers --nodes=5

# アドオン
aws eks describe-addon-versions --addon-name vpc-cni
aws eks create-addon --cluster-name my-cluster --addon-name aws-ebs-csi-driver

# デバッグ
kubectl get events --sort-by='.lastTimestamp'
kubectl describe pod <pod-name>
kubectl logs <pod-name> --previous

# IRSA確認
kubectl describe sa <service-account> | grep Annotations
```
