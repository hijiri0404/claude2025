# ハンズオン 04: CloudFormation 基礎

## 概要

このハンズオンでは、AWS CloudFormation を使用してインフラをコードで管理します。スタックの作成、更新、ドリフト検出を学びます。

**所要時間**: 約40分
**コスト**: 約$0.50以下

## 学習目標

- CloudFormation テンプレートの構造を理解する
- スタックの作成と更新
- パラメータと出力の使用
- ドリフト検出とスタックセットの概念

---

## 前提条件

- AWS アカウント
- 管理者権限を持つ IAM ユーザー

---

## Step 1: 最初のスタックを作成

### 1.1 CloudFormation コンソールを開く

1. 検索バーに「CloudFormation」と入力
2. **CloudFormation** をクリック

### 1.2 スタックを作成

1. **スタックの作成** → **新しいリソースを使用（標準）** をクリック

### 1.3 テンプレートを準備

**テンプレートの準備**: デザイナーでテンプレートを作成する を選択
→ 今回は「テンプレートファイルのアップロード」を選択

以下のテンプレートを `cfn-handson-01.yaml` として保存:

```yaml
AWSTemplateFormatVersion: '2010-09-09'
Description: 'DOP Handson - Basic S3 Bucket'

Resources:
  MyS3Bucket:
    Type: AWS::S3::Bucket
    Properties:
      BucketName: !Sub 'dop-handson-cfn-${AWS::AccountId}'
      Tags:
        - Key: Environment
          Value: handson
        - Key: ManagedBy
          Value: CloudFormation

Outputs:
  BucketName:
    Description: Name of the S3 bucket
    Value: !Ref MyS3Bucket
  BucketArn:
    Description: ARN of the S3 bucket
    Value: !GetAtt MyS3Bucket.Arn
```

### 1.4 テンプレートをアップロード

1. **テンプレートファイルのアップロード** を選択
2. **ファイルの選択** をクリック
3. `cfn-handson-01.yaml` を選択
4. **次へ** をクリック

### 1.5 スタックの詳細を指定

| 項目 | 値 |
|------|-----|
| スタック名 | `dop-handson-stack` |

**次へ** をクリック

### 1.6 スタックオプションを設定

デフォルトのまま **次へ** をクリック

### 1.7 確認と作成

1. 設定内容を確認
2. **送信** をクリック

### 1.8 スタック作成の確認

1. **イベント** タブで進行状況を確認
2. ステータスが `CREATE_COMPLETE` になるまで待つ
3. **出力** タブで `BucketName` と `BucketArn` を確認

---

## Step 2: パラメータを使用したテンプレート

### 2.1 パラメータ付きテンプレートを作成

以下を `cfn-handson-02.yaml` として保存:

```yaml
AWSTemplateFormatVersion: '2010-09-09'
Description: 'DOP Handson - VPC with Parameters'

Parameters:
  EnvironmentName:
    Type: String
    Default: dev
    AllowedValues:
      - dev
      - stg
      - prod
    Description: Environment name (dev, stg, prod)

  VpcCidr:
    Type: String
    Default: 10.0.0.0/16
    AllowedPattern: ^([0-9]{1,3}\.){3}[0-9]{1,3}/[0-9]{1,2}$
    Description: CIDR block for VPC

  EnableDnsHostnames:
    Type: String
    Default: 'true'
    AllowedValues:
      - 'true'
      - 'false'
    Description: Enable DNS hostnames in VPC

Mappings:
  EnvironmentMap:
    dev:
      InstanceType: t2.micro
      SubnetCount: 2
    stg:
      InstanceType: t2.small
      SubnetCount: 2
    prod:
      InstanceType: t2.medium
      SubnetCount: 3

Conditions:
  IsProd: !Equals [!Ref EnvironmentName, prod]

Resources:
  VPC:
    Type: AWS::EC2::VPC
    Properties:
      CidrBlock: !Ref VpcCidr
      EnableDnsHostnames: !Ref EnableDnsHostnames
      EnableDnsSupport: true
      Tags:
        - Key: Name
          Value: !Sub '${EnvironmentName}-vpc'
        - Key: Environment
          Value: !Ref EnvironmentName

  InternetGateway:
    Type: AWS::EC2::InternetGateway
    Properties:
      Tags:
        - Key: Name
          Value: !Sub '${EnvironmentName}-igw'

  AttachGateway:
    Type: AWS::EC2::VPCGatewayAttachment
    Properties:
      VpcId: !Ref VPC
      InternetGatewayId: !Ref InternetGateway

  PublicSubnet1:
    Type: AWS::EC2::Subnet
    Properties:
      VpcId: !Ref VPC
      CidrBlock: !Select [0, !Cidr [!Ref VpcCidr, 4, 8]]
      AvailabilityZone: !Select [0, !GetAZs '']
      MapPublicIpOnLaunch: true
      Tags:
        - Key: Name
          Value: !Sub '${EnvironmentName}-public-1'

  PublicSubnet2:
    Type: AWS::EC2::Subnet
    Properties:
      VpcId: !Ref VPC
      CidrBlock: !Select [1, !Cidr [!Ref VpcCidr, 4, 8]]
      AvailabilityZone: !Select [1, !GetAZs '']
      MapPublicIpOnLaunch: true
      Tags:
        - Key: Name
          Value: !Sub '${EnvironmentName}-public-2'

  # 本番環境のみ作成
  PublicSubnet3:
    Type: AWS::EC2::Subnet
    Condition: IsProd
    Properties:
      VpcId: !Ref VPC
      CidrBlock: !Select [2, !Cidr [!Ref VpcCidr, 4, 8]]
      AvailabilityZone: !Select [2, !GetAZs '']
      MapPublicIpOnLaunch: true
      Tags:
        - Key: Name
          Value: !Sub '${EnvironmentName}-public-3'

  PublicRouteTable:
    Type: AWS::EC2::RouteTable
    Properties:
      VpcId: !Ref VPC
      Tags:
        - Key: Name
          Value: !Sub '${EnvironmentName}-public-rt'

  PublicRoute:
    Type: AWS::EC2::Route
    DependsOn: AttachGateway
    Properties:
      RouteTableId: !Ref PublicRouteTable
      DestinationCidrBlock: 0.0.0.0/0
      GatewayId: !Ref InternetGateway

  SubnetRouteTableAssociation1:
    Type: AWS::EC2::SubnetRouteTableAssociation
    Properties:
      SubnetId: !Ref PublicSubnet1
      RouteTableId: !Ref PublicRouteTable

  SubnetRouteTableAssociation2:
    Type: AWS::EC2::SubnetRouteTableAssociation
    Properties:
      SubnetId: !Ref PublicSubnet2
      RouteTableId: !Ref PublicRouteTable

Outputs:
  VpcId:
    Description: VPC ID
    Value: !Ref VPC
    Export:
      Name: !Sub '${EnvironmentName}-VpcId'

  PublicSubnet1Id:
    Description: Public Subnet 1 ID
    Value: !Ref PublicSubnet1
    Export:
      Name: !Sub '${EnvironmentName}-PublicSubnet1Id'

  PublicSubnet2Id:
    Description: Public Subnet 2 ID
    Value: !Ref PublicSubnet2
    Export:
      Name: !Sub '${EnvironmentName}-PublicSubnet2Id'

  InstanceType:
    Description: Recommended instance type for this environment
    Value: !FindInMap [EnvironmentMap, !Ref EnvironmentName, InstanceType]
```

### 2.2 新しいスタックを作成

1. **スタックの作成** をクリック
2. テンプレートをアップロード

### 2.3 パラメータを設定

| パラメータ | 値 |
|-----------|-----|
| スタック名 | `dop-handson-vpc-stack` |
| EnvironmentName | `dev` |
| VpcCidr | `10.0.0.0/16` |
| EnableDnsHostnames | `true` |

3. **次へ** → **次へ** → **送信** をクリック

### 2.4 作成完了を確認

1. **リソース** タブで作成されたリソースを確認
2. **出力** タブでエクスポートされた値を確認

---

## Step 3: スタックの更新

### 3.1 テンプレートを変更

`cfn-handson-02.yaml` を編集して VPC にタグを追加:

```yaml
  VPC:
    Type: AWS::EC2::VPC
    Properties:
      CidrBlock: !Ref VpcCidr
      EnableDnsHostnames: !Ref EnableDnsHostnames
      EnableDnsSupport: true
      Tags:
        - Key: Name
          Value: !Sub '${EnvironmentName}-vpc'
        - Key: Environment
          Value: !Ref EnvironmentName
        - Key: UpdatedAt        # 追加
          Value: '2024-01-20'   # 追加
```

### 3.2 スタックを更新

1. `dop-handson-vpc-stack` を選択
2. **更新** をクリック
3. **既存テンプレートを置き換える** を選択
4. 更新したテンプレートをアップロード
5. **次へ** → **次へ** → **次へ** をクリック

### 3.3 変更セットを確認

1. **変更セットのプレビュー** で変更内容を確認
2. **アクション**: `Modify` で VPC のタグのみ変更されることを確認
3. **送信** をクリック

### 3.4 更新完了を確認

1. **イベント** タブで `UPDATE_COMPLETE` を確認
2. VPC コンソールでタグが追加されていることを確認

---

## Step 4: ドリフト検出

### 4.1 手動でリソースを変更

1. VPC コンソールを開く
2. `dev-vpc` を選択
3. **タグ** タブで **タグを管理** をクリック
4. 新しいタグを追加:

| キー | 値 |
|------|-----|
| ManualChange | `true` |

5. **保存** をクリック

### 4.2 ドリフト検出を実行

1. CloudFormation コンソールで `dop-handson-vpc-stack` を選択
2. **スタックアクション** → **ドリフトの検出** をクリック
3. 数分待つ

### 4.3 ドリフト結果を確認

1. **スタックアクション** → **ドリフト結果を表示** をクリック
2. **ドリフトステータス**: `DRIFTED` になっている
3. **リソースのドリフトステータスを表示** をクリック
4. `VPC` リソースの **ドリフトステータス** が `MODIFIED` になっている
5. **ドリフトの詳細を表示** をクリック
6. 差分を確認（`ManualChange` タグが追加されている）

### 4.4 ドリフトの解消

**方法 1: 手動変更を元に戻す**
- VPC コンソールで `ManualChange` タグを削除

**方法 2: テンプレートを更新**
- テンプレートに `ManualChange` タグを追加してスタック更新

---

## Step 5: クロススタック参照

### 5.1 別のスタックから参照

以下を `cfn-handson-03.yaml` として保存:

```yaml
AWSTemplateFormatVersion: '2010-09-09'
Description: 'DOP Handson - EC2 using exported VPC'

Parameters:
  EnvironmentName:
    Type: String
    Default: dev

Resources:
  WebSecurityGroup:
    Type: AWS::EC2::SecurityGroup
    Properties:
      GroupDescription: Security group for web server
      VpcId: !ImportValue
        Fn::Sub: '${EnvironmentName}-VpcId'
      SecurityGroupIngress:
        - IpProtocol: tcp
          FromPort: 80
          ToPort: 80
          CidrIp: 0.0.0.0/0
      Tags:
        - Key: Name
          Value: !Sub '${EnvironmentName}-web-sg'

Outputs:
  SecurityGroupId:
    Description: Security Group ID
    Value: !Ref WebSecurityGroup
```

### 5.2 新しいスタックを作成

1. **スタックの作成** をクリック
2. テンプレートをアップロード
3. スタック名: `dop-handson-sg-stack`
4. EnvironmentName: `dev`
5. **送信** をクリック

### 5.3 クロススタック参照の確認

1. **リソース** タブでセキュリティグループを確認
2. VPC コンソールでセキュリティグループが VPC 内に作成されていることを確認

---

## Step 6: リソースのクリーンアップ

### 6.1 依存関係の順序で削除

```
削除順序:
1. dop-handson-sg-stack     (クロススタック参照元)
2. dop-handson-vpc-stack    (エクスポート元)
3. dop-handson-stack        (S3 バケット)
```

### 6.2 スタックを削除

1. `dop-handson-sg-stack` を選択
2. **削除** をクリック
3. 完了を待つ
4. 同様に他のスタックも削除

> **Note**: 削除に失敗した場合は、依存関係を確認してください

---

## 学習のポイント

### テンプレートの構造

```yaml
AWSTemplateFormatVersion: '2010-09-09'  # 必須
Description: 'テンプレートの説明'          # 推奨

Parameters:        # パラメータ定義
Mappings:          # 静的マッピング
Conditions:        # 条件定義
Resources:         # リソース定義（必須）
Outputs:           # 出力定義
```

### 組み込み関数

| 関数 | 用途 |
|------|------|
| `!Ref` | パラメータ・リソースの参照 |
| `!GetAtt` | リソースの属性取得 |
| `!Sub` | 文字列置換 |
| `!Join` | 文字列結合 |
| `!Select` | リストから要素選択 |
| `!If` | 条件分岐 |
| `!ImportValue` | クロススタック参照 |
| `!FindInMap` | Mappings から値取得 |

### DOP試験での出題ポイント

- スタック更新時の置換 vs 更新の違い
- ドリフト検出とその解消方法
- StackSets によるマルチアカウント展開
- 変更セット（Change Set）の活用
- DeletionPolicy と UpdateReplacePolicy

---

## 次のステップ

- [ハンズオン 05: AWS Config ルール](./handson-05-aws-config.md)
- [ハンズオン 06: CloudWatch アラームとダッシュボード](./handson-06-cloudwatch.md)
