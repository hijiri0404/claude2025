# EC2からS3オブジェクト取得ガイド 📦

## 📋 概要

EC2インスタンスからS3のオブジェクトを安全かつ効率的に取得するための包括的ガイドです。IAMロール設定から実装例まで、実用的な手順を提供します。

---

## 🎯 目次

1. [IAMロール設定](#-iamロール設定)
2. [インスタンスプロファイル設定](#-インスタンスプロファイル設定)
3. [SDK実装方法](#-sdk実装方法)
4. [セキュリティベストプラクティス](#-セキュリティベストプラクティス)
5. [エラーハンドリング](#-エラーハンドリング)
6. [パフォーマンス最適化](#-パフォーマンス最適化)
7. [トラブルシューティング](#-トラブルシューティング)

---

## 🔑 IAMロール設定

### 基本的なS3読み取り権限

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "S3GetObjectAccess",
            "Effect": "Allow",
            "Action": [
                "s3:GetObject",
                "s3:GetObjectVersion",
                "s3:ListBucket"
            ],
            "Resource": [
                "arn:aws:s3:::your-bucket-name/*",
                "arn:aws:s3:::your-bucket-name"
            ]
        }
    ]
}
```

### 詳細権限設定

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "S3BasicAccess",
            "Effect": "Allow",
            "Action": [
                "s3:GetObject",
                "s3:GetObjectVersion",
                "s3:GetObjectMetadata",
                "s3:GetObjectAttributes",
                "s3:ListBucket",
                "s3:ListBucketVersions"
            ],
            "Resource": [
                "arn:aws:s3:::your-bucket-name/*",
                "arn:aws:s3:::your-bucket-name"
            ]
        },
        {
            "Sid": "S3ConditionalAccess",
            "Effect": "Allow",
            "Action": [
                "s3:GetObject"
            ],
            "Resource": "arn:aws:s3:::your-bucket-name/secure/*",
            "Condition": {
                "StringEquals": {
                    "s3:ExistingObjectTag/Environment": "Production"
                }
            }
        }
    ]
}
```

### IAMロール信頼関係

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": {
                "Service": "ec2.amazonaws.com"
            },
            "Action": "sts:AssumeRole"
        }
    ]
}
```

---

## 🔗 インスタンスプロファイル設定

### CloudFormationテンプレート例

```yaml
AWSTemplateFormatVersion: '2010-09-09'
Description: 'EC2インスタンス用S3アクセス設定'

Resources:
  EC2S3AccessRole:
    Type: AWS::IAM::Role
    Properties:
      RoleName: EC2-S3-Access-Role
      AssumeRolePolicyDocument:
        Version: '2012-10-17'
        Statement:
          - Effect: Allow
            Principal:
              Service: ec2.amazonaws.com
            Action: sts:AssumeRole
      ManagedPolicyArns:
        - arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy
      Policies:
        - PolicyName: S3AccessPolicy
          PolicyDocument:
            Version: '2012-10-17'
            Statement:
              - Effect: Allow
                Action:
                  - s3:GetObject
                  - s3:GetObjectVersion
                  - s3:ListBucket
                Resource:
                  - !Sub 'arn:aws:s3:::${S3BucketName}/*'
                  - !Sub 'arn:aws:s3:::${S3BucketName}'

  EC2InstanceProfile:
    Type: AWS::IAM::InstanceProfile
    Properties:
      InstanceProfileName: EC2-S3-Instance-Profile
      Roles:
        - !Ref EC2S3AccessRole

  EC2Instance:
    Type: AWS::EC2::Instance
    Properties:
      InstanceType: t3.micro
      ImageId: ami-0123456789abcdef0
      IamInstanceProfile: !Ref EC2InstanceProfile
      SecurityGroupIds:
        - !Ref InstanceSecurityGroup
      Tags:
        - Key: Name
          Value: S3-Access-Instance

Parameters:
  S3BucketName:
    Type: String
    Description: S3バケット名
    Default: your-s3-bucket-name
```

---

## 🐍 SDK実装方法

### Python (Boto3) 実装

#### 基本的な実装

```python
import boto3
import logging
from botocore.exceptions import ClientError, NoCredentialsError
from typing import Dict, Any, Optional

# ロギング設定
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class S3ObjectRetriever:
    def __init__(self, region_name: str = 'ap-northeast-1'):
        """
        S3オブジェクト取得クラスの初期化
        
        Args:
            region_name: AWS リージョン名
        """
        try:
            self.s3_client = boto3.client('s3', region_name=region_name)
            self.s3_resource = boto3.resource('s3', region_name=region_name)
            logger.info(f"S3クライアント初期化完了: {region_name}")
        except NoCredentialsError:
            logger.error("AWS認証情報が見つかりません")
            raise
        except Exception as e:
            logger.error(f"S3クライアント初期化エラー: {str(e)}")
            raise

    def get_object_to_memory(self, bucket_name: str, object_key: str) -> Dict[str, Any]:
        """
        S3オブジェクトをメモリに読み込み
        
        Args:
            bucket_name: S3バケット名
            object_key: オブジェクトキー
            
        Returns:
            オブジェクトデータと メタデータ
        """
        try:
            logger.info(f"オブジェクト取得開始: s3://{bucket_name}/{object_key}")
            
            response = self.s3_client.get_object(
                Bucket=bucket_name,
                Key=object_key
            )
            
            content = response['Body'].read()
            
            result = {
                'content': content,
                'metadata': {
                    'content_type': response.get('ContentType', ''),
                    'content_length': response.get('ContentLength', 0),
                    'last_modified': response.get('LastModified', ''),
                    'etag': response.get('ETag', ''),
                    'version_id': response.get('VersionId', '')
                }
            }
            
            logger.info(f"オブジェクト取得完了: {len(content)} bytes")
            return result
            
        except ClientError as e:
            error_code = e.response['Error']['Code']
            if error_code == 'NoSuchKey':
                logger.error(f"オブジェクトが存在しません: {object_key}")
            elif error_code == 'NoSuchBucket':
                logger.error(f"バケットが存在しません: {bucket_name}")
            elif error_code == 'AccessDenied':
                logger.error(f"アクセス権限がありません: s3://{bucket_name}/{object_key}")
            else:
                logger.error(f"S3エラー: {error_code} - {e.response['Error']['Message']}")
            raise
        except Exception as e:
            logger.error(f"予期しないエラー: {str(e)}")
            raise

    def download_file(self, bucket_name: str, object_key: str, local_file_path: str) -> bool:
        """
        S3オブジェクトをローカルファイルにダウンロード
        
        Args:
            bucket_name: S3バケット名
            object_key: オブジェクトキー
            local_file_path: ローカル保存パス
            
        Returns:
            ダウンロード成功可否
        """
        try:
            logger.info(f"ファイルダウンロード開始: s3://{bucket_name}/{object_key} -> {local_file_path}")
            
            self.s3_client.download_file(
                Bucket=bucket_name,
                Key=object_key,
                Filename=local_file_path
            )
            
            logger.info("ファイルダウンロード完了")
            return True
            
        except ClientError as e:
            error_code = e.response['Error']['Code']
            logger.error(f"ダウンロードエラー: {error_code}")
            return False
        except Exception as e:
            logger.error(f"予期しないエラー: {str(e)}")
            return False

    def get_object_with_conditions(self, 
                                 bucket_name: str, 
                                 object_key: str,
                                 if_modified_since: Optional[str] = None,
                                 if_match: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """
        条件付きオブジェクト取得
        
        Args:
            bucket_name: S3バケット名
            object_key: オブジェクトキー
            if_modified_since: 指定日時以降に変更された場合のみ取得
            if_match: 指定ETagと一致する場合のみ取得
            
        Returns:
            条件に合致した場合のオブジェクトデータ
        """
        try:
            params = {
                'Bucket': bucket_name,
                'Key': object_key
            }
            
            if if_modified_since:
                params['IfModifiedSince'] = if_modified_since
            if if_match:
                params['IfMatch'] = if_match
                
            logger.info(f"条件付き取得開始: s3://{bucket_name}/{object_key}")
            
            response = self.s3_client.get_object(**params)
            
            return {
                'content': response['Body'].read(),
                'metadata': {
                    'content_type': response.get('ContentType', ''),
                    'content_length': response.get('ContentLength', 0),
                    'last_modified': response.get('LastModified', ''),
                    'etag': response.get('ETag', '')
                }
            }
            
        except ClientError as e:
            if e.response['Error']['Code'] == 'NotModified':
                logger.info("オブジェクトは変更されていません")
                return None
            else:
                logger.error(f"条件付き取得エラー: {e.response['Error']['Code']}")
                raise
        except Exception as e:
            logger.error(f"予期しないエラー: {str(e)}")
            raise

    def list_bucket_objects(self, bucket_name: str, prefix: str = '') -> Dict[str, Any]:
        """
        バケット内オブジェクト一覧取得
        
        Args:
            bucket_name: S3バケット名
            prefix: オブジェクトキープレフィックス
            
        Returns:
            オブジェクト一覧
        """
        try:
            logger.info(f"オブジェクト一覧取得: s3://{bucket_name}/{prefix}")
            
            paginator = self.s3_client.get_paginator('list_objects_v2')
            page_iterator = paginator.paginate(
                Bucket=bucket_name,
                Prefix=prefix
            )
            
            objects = []
            total_size = 0
            
            for page in page_iterator:
                if 'Contents' in page:
                    for obj in page['Contents']:
                        objects.append({
                            'key': obj['Key'],
                            'size': obj['Size'],
                            'last_modified': obj['LastModified'],
                            'etag': obj['ETag']
                        })
                        total_size += obj['Size']
            
            result = {
                'objects': objects,
                'count': len(objects),
                'total_size': total_size
            }
            
            logger.info(f"オブジェクト一覧取得完了: {len(objects)}個, {total_size} bytes")
            return result
            
        except ClientError as e:
            logger.error(f"一覧取得エラー: {e.response['Error']['Code']}")
            raise
        except Exception as e:
            logger.error(f"予期しないエラー: {str(e)}")
            raise


# 使用例
def main():
    """
    S3オブジェクト取得のサンプル実行
    """
    try:
        # S3取得クライアント初期化
        s3_retriever = S3ObjectRetriever()
        
        bucket_name = "your-bucket-name"
        object_key = "path/to/your/file.txt"
        
        # 1. オブジェクトをメモリに読み込み
        result = s3_retriever.get_object_to_memory(bucket_name, object_key)
        print(f"取得したデータサイズ: {len(result['content'])} bytes")
        print(f"メタデータ: {result['metadata']}")
        
        # 2. ファイルダウンロード
        local_path = "/tmp/downloaded_file.txt"
        success = s3_retriever.download_file(bucket_name, object_key, local_path)
        if success:
            print(f"ファイルダウンロード成功: {local_path}")
        
        # 3. バケット内オブジェクト一覧取得
        objects_info = s3_retriever.list_bucket_objects(bucket_name, "documents/")
        print(f"オブジェクト数: {objects_info['count']}")
        
    except Exception as e:
        logger.error(f"メイン処理エラー: {str(e)}")


if __name__ == "__main__":
    main()
```

#### 大容量ファイル対応実装

```python
import boto3
from botocore.exceptions import ClientError
import threading
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import List, Dict, Any

class LargeFileRetriever:
    def __init__(self, region_name: str = 'ap-northeast-1'):
        self.s3_client = boto3.client('s3', region_name=region_name)
        self.logger = logging.getLogger(__name__)
        
    def download_large_file_multipart(self, 
                                    bucket_name: str, 
                                    object_key: str, 
                                    local_file_path: str,
                                    chunk_size: int = 1024*1024*10,  # 10MB
                                    max_threads: int = 4) -> bool:
        """
        大容量ファイルのマルチスレッドダウンロード
        
        Args:
            bucket_name: S3バケット名
            object_key: オブジェクトキー
            local_file_path: ローカル保存パス
            chunk_size: チャンクサイズ（バイト）
            max_threads: 最大スレッド数
            
        Returns:
            ダウンロード成功可否
        """
        try:
            # オブジェクトサイズ取得
            head_response = self.s3_client.head_object(Bucket=bucket_name, Key=object_key)
            file_size = head_response['ContentLength']
            
            self.logger.info(f"大容量ファイルダウンロード開始: {file_size} bytes")
            
            if file_size <= chunk_size:
                # 小さいファイルは通常ダウンロード
                self.s3_client.download_file(bucket_name, object_key, local_file_path)
                return True
            
            # チャンク分割
            chunks = []
            for start in range(0, file_size, chunk_size):
                end = min(start + chunk_size - 1, file_size - 1)
                chunks.append((start, end))
            
            # マルチスレッドダウンロード
            with ThreadPoolExecutor(max_workers=max_threads) as executor:
                futures = []
                
                for i, (start, end) in enumerate(chunks):
                    future = executor.submit(
                        self._download_chunk,
                        bucket_name, object_key, start, end, i
                    )
                    futures.append(future)
                
                # チャンクデータ収集
                chunk_data = {}
                for future in as_completed(futures):
                    chunk_index, data = future.result()
                    chunk_data[chunk_index] = data
            
            # ファイル結合
            with open(local_file_path, 'wb') as f:
                for i in range(len(chunks)):
                    f.write(chunk_data[i])
            
            self.logger.info("大容量ファイルダウンロード完了")
            return True
            
        except Exception as e:
            self.logger.error(f"大容量ファイルダウンロードエラー: {str(e)}")
            return False
    
    def _download_chunk(self, bucket_name: str, object_key: str, start: int, end: int, chunk_index: int):
        """
        チャンクダウンロード
        """
        try:
            range_header = f"bytes={start}-{end}"
            response = self.s3_client.get_object(
                Bucket=bucket_name,
                Key=object_key,
                Range=range_header
            )
            
            return chunk_index, response['Body'].read()
            
        except Exception as e:
            self.logger.error(f"チャンクダウンロードエラー ({chunk_index}): {str(e)}")
            raise
```

### Node.js (AWS SDK v3) 実装

```javascript
import { 
    S3Client, 
    GetObjectCommand, 
    HeadObjectCommand,
    ListObjectsV2Command 
} from "@aws-sdk/client-s3";
import { fromInstanceMetadata } from "@aws-sdk/credential-providers";
import fs from 'fs';
import { pipeline } from 'stream/promises';

class S3ObjectRetriever {
    constructor(region = 'ap-northeast-1') {
        this.s3Client = new S3Client({
            region: region,
            credentials: fromInstanceMetadata({
                timeout: 5000,
                maxRetries: 3
            })
        });
        this.logger = console;
    }

    async getObjectToMemory(bucketName, objectKey) {
        try {
            this.logger.info(`オブジェクト取得開始: s3://${bucketName}/${objectKey}`);
            
            const command = new GetObjectCommand({
                Bucket: bucketName,
                Key: objectKey
            });
            
            const response = await this.s3Client.send(command);
            
            // StreamをBufferに変換
            const chunks = [];
            for await (const chunk of response.Body) {
                chunks.push(chunk);
            }
            const buffer = Buffer.concat(chunks);
            
            const result = {
                content: buffer,
                metadata: {
                    contentType: response.ContentType || '',
                    contentLength: response.ContentLength || 0,
                    lastModified: response.LastModified || '',
                    etag: response.ETag || ''
                }
            };
            
            this.logger.info(`オブジェクト取得完了: ${buffer.length} bytes`);
            return result;
            
        } catch (error) {
            if (error.name === 'NoSuchKey') {
                this.logger.error(`オブジェクトが存在しません: ${objectKey}`);
            } else if (error.name === 'NoSuchBucket') {
                this.logger.error(`バケットが存在しません: ${bucketName}`);
            } else if (error.name === 'AccessDenied') {
                this.logger.error(`アクセス権限がありません: s3://${bucketName}/${objectKey}`);
            } else {
                this.logger.error(`S3エラー: ${error.message}`);
            }
            throw error;
        }
    }

    async downloadFile(bucketName, objectKey, localFilePath) {
        try {
            this.logger.info(`ファイルダウンロード開始: s3://${bucketName}/${objectKey} -> ${localFilePath}`);
            
            const command = new GetObjectCommand({
                Bucket: bucketName,
                Key: objectKey
            });
            
            const response = await this.s3Client.send(command);
            
            const writeStream = fs.createWriteStream(localFilePath);
            await pipeline(response.Body, writeStream);
            
            this.logger.info('ファイルダウンロード完了');
            return true;
            
        } catch (error) {
            this.logger.error(`ダウンロードエラー: ${error.message}`);
            return false;
        }
    }

    async listBucketObjects(bucketName, prefix = '') {
        try {
            this.logger.info(`オブジェクト一覧取得: s3://${bucketName}/${prefix}`);
            
            const objects = [];
            let totalSize = 0;
            let continuationToken = undefined;
            
            do {
                const command = new ListObjectsV2Command({
                    Bucket: bucketName,
                    Prefix: prefix,
                    ContinuationToken: continuationToken
                });
                
                const response = await this.s3Client.send(command);
                
                if (response.Contents) {
                    for (const obj of response.Contents) {
                        objects.push({
                            key: obj.Key,
                            size: obj.Size,
                            lastModified: obj.LastModified,
                            etag: obj.ETag
                        });
                        totalSize += obj.Size;
                    }
                }
                
                continuationToken = response.NextContinuationToken;
                
            } while (continuationToken);
            
            const result = {
                objects: objects,
                count: objects.length,
                totalSize: totalSize
            };
            
            this.logger.info(`オブジェクト一覧取得完了: ${objects.length}個, ${totalSize} bytes`);
            return result;
            
        } catch (error) {
            this.logger.error(`一覧取得エラー: ${error.message}`);
            throw error;
        }
    }
}

// 使用例
async function main() {
    try {
        const s3Retriever = new S3ObjectRetriever();
        
        const bucketName = "your-bucket-name";
        const objectKey = "path/to/your/file.txt";
        
        // オブジェクトをメモリに読み込み
        const result = await s3Retriever.getObjectToMemory(bucketName, objectKey);
        console.log(`取得したデータサイズ: ${result.content.length} bytes`);
        
        // ファイルダウンロード
        const localPath = "/tmp/downloaded_file.txt";
        const success = await s3Retriever.downloadFile(bucketName, objectKey, localPath);
        if (success) {
            console.log(`ファイルダウンロード成功: ${localPath}`);
        }
        
        // バケット内オブジェクト一覧取得
        const objectsInfo = await s3Retriever.listBucketObjects(bucketName, "documents/");
        console.log(`オブジェクト数: ${objectsInfo.count}`);
        
    } catch (error) {
        console.error(`メイン処理エラー: ${error.message}`);
    }
}

main();
```

---

## 🛡️ セキュリティベストプラクティス

### 最小権限の原則

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "RestrictedS3Access",
            "Effect": "Allow",
            "Action": [
                "s3:GetObject"
            ],
            "Resource": "arn:aws:s3:::your-bucket-name/allowed-prefix/*",
            "Condition": {
                "StringEquals": {
                    "s3:ExistingObjectTag/AccessLevel": "EC2Allowed"
                },
                "DateGreaterThan": {
                    "aws:CurrentTime": "2024-01-01T00:00:00Z"
                },
                "IpAddress": {
                    "aws:SourceIp": ["10.0.0.0/8", "172.16.0.0/12"]
                }
            }
        }
    ]
}
```

### VPCエンドポイント経由アクセス

```yaml
# VPCエンドポイント設定
S3VPCEndpoint:
  Type: AWS::EC2::VPCEndpoint
  Properties:
    VpcId: !Ref VPC
    ServiceName: !Sub 'com.amazonaws.${AWS::Region}.s3'
    VpcEndpointType: Gateway
    RouteTableIds:
      - !Ref PrivateRouteTable
    PolicyDocument:
      Version: '2012-10-17'
      Statement:
        - Effect: Allow
          Principal: '*'
          Action:
            - s3:GetObject
            - s3:ListBucket
          Resource:
            - arn:aws:s3:::your-bucket-name/*
            - arn:aws:s3:::your-bucket-name
```

### 暗号化設定

```python
# 暗号化されたオブジェクト取得
def get_encrypted_object(bucket_name: str, object_key: str, kms_key_id: str):
    """
    KMS暗号化されたオブジェクトの取得
    """
    try:
        response = s3_client.get_object(
            Bucket=bucket_name,
            Key=object_key,
            # サーバーサイド暗号化情報
            ServerSideEncryption='aws:kms',
            SSEKMSKeyId=kms_key_id
        )
        
        return {
            'content': response['Body'].read(),
            'encryption_info': {
                'sse_algorithm': response.get('ServerSideEncryption', ''),
                'kms_key_id': response.get('SSEKMSKeyId', ''),
                'bucket_key_enabled': response.get('BucketKeyEnabled', False)
            }
        }
        
    except ClientError as e:
        if 'KMSAccessDenied' in str(e):
            logger.error("KMS暗号化キーへのアクセス権限がありません")
        raise
```

---

## 🚨 エラーハンドリング

### 包括的エラーハンドリング実装

```python
import boto3
from botocore.exceptions import (
    ClientError, 
    NoCredentialsError, 
    PartialCredentialsError,
    ConnectTimeoutError,
    ReadTimeoutError
)
import time
import random
from functools import wraps

def retry_with_backoff(max_retries=3, base_delay=1, max_delay=60):
    """
    指数バックオフによるリトライデコレータ
    """
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            for attempt in range(max_retries + 1):
                try:
                    return func(*args, **kwargs)
                except ClientError as e:
                    error_code = e.response['Error']['Code']
                    
                    # リトライ可能なエラーの場合
                    if error_code in ['ServiceUnavailable', 'Throttling', 'SlowDown', 'RequestTimeout']:
                        if attempt < max_retries:
                            delay = min(base_delay * (2 ** attempt) + random.uniform(0, 1), max_delay)
                            logger.warning(f"リトライ {attempt + 1}/{max_retries}: {delay:.1f}秒後に再試行")
                            time.sleep(delay)
                            continue
                    
                    # リトライ不可能なエラーの場合
                    raise
                except (ConnectTimeoutError, ReadTimeoutError) as e:
                    if attempt < max_retries:
                        delay = min(base_delay * (2 ** attempt), max_delay)
                        logger.warning(f"タイムアウト - リトライ {attempt + 1}/{max_retries}: {delay:.1f}秒後")
                        time.sleep(delay)
                        continue
                    raise
                    
            return func(*args, **kwargs)  # 最後の試行
        return wrapper
    return decorator

class ErrorHandlerS3Client:
    def __init__(self, region_name='ap-northeast-1'):
        self.s3_client = boto3.client('s3', region_name=region_name)
        self.logger = logging.getLogger(__name__)

    @retry_with_backoff(max_retries=3)
    def safe_get_object(self, bucket_name: str, object_key: str) -> Dict[str, Any]:
        """
        安全なオブジェクト取得（包括的エラーハンドリング付き）
        """
        try:
            response = self.s3_client.get_object(
                Bucket=bucket_name,
                Key=object_key
            )
            
            return {
                'success': True,
                'content': response['Body'].read(),
                'metadata': {
                    'content_type': response.get('ContentType', ''),
                    'content_length': response.get('ContentLength', 0),
                    'last_modified': response.get('LastModified', ''),
                    'etag': response.get('ETag', '')
                },
                'error': None
            }
            
        except ClientError as e:
            error_code = e.response['Error']['Code']
            error_message = e.response['Error']['Message']
            
            error_mapping = {
                'NoSuchKey': f"オブジェクトが存在しません: {object_key}",
                'NoSuchBucket': f"バケットが存在しません: {bucket_name}",
                'AccessDenied': f"アクセス権限がありません: s3://{bucket_name}/{object_key}",
                'InvalidBucketName': f"無効なバケット名: {bucket_name}",
                'InvalidObjectName': f"無効なオブジェクト名: {object_key}",
                'RequestTimeout': "リクエストタイムアウト",
                'ServiceUnavailable': "S3サービス利用不可",
                'Throttling': "リクエスト制限に達しました",
                'SlowDown': "リクエスト頻度を下げてください",
                'InternalError': "AWS内部エラー"
            }
            
            user_message = error_mapping.get(error_code, f"S3エラー: {error_code}")
            self.logger.error(f"{user_message} - 詳細: {error_message}")
            
            return {
                'success': False,
                'content': None,
                'metadata': {},
                'error': {
                    'code': error_code,
                    'message': user_message,
                    'aws_message': error_message,
                    'retriable': error_code in ['ServiceUnavailable', 'Throttling', 'SlowDown', 'RequestTimeout']
                }
            }
            
        except NoCredentialsError:
            error_msg = "AWS認証情報が設定されていません"
            self.logger.error(error_msg)
            return {
                'success': False,
                'content': None,
                'metadata': {},
                'error': {
                    'code': 'NoCredentials',
                    'message': error_msg,
                    'aws_message': '',
                    'retriable': False
                }
            }
            
        except PartialCredentialsError:
            error_msg = "AWS認証情報が不完全です"
            self.logger.error(error_msg)
            return {
                'success': False,
                'content': None,
                'metadata': {},
                'error': {
                    'code': 'PartialCredentials',
                    'message': error_msg,
                    'aws_message': '',
                    'retriable': False
                }
            }
            
        except Exception as e:
            error_msg = f"予期しないエラー: {str(e)}"
            self.logger.error(error_msg)
            return {
                'success': False,
                'content': None,
                'metadata': {},
                'error': {
                    'code': 'UnexpectedError',
                    'message': error_msg,
                    'aws_message': str(e),
                    'retriable': True
                }
            }

# 使用例
def robust_file_processing():
    """
    堅牢なファイル処理例
    """
    error_handler = ErrorHandlerS3Client()
    
    result = error_handler.safe_get_object('your-bucket', 'your-object-key')
    
    if result['success']:
        # 成功時の処理
        content = result['content']
        metadata = result['metadata']
        print(f"ファイル取得成功: {metadata['content_length']} bytes")
        
        # ファイル処理ロジック
        process_file_content(content)
        
    else:
        # エラー時の処理
        error = result['error']
        print(f"エラー: {error['message']}")
        
        if error['retriable']:
            print("リトライ可能なエラーです")
            # アラートやメトリクス送信
            send_retry_alert(error)
        else:
            print("リトライ不可能なエラーです")
            # エラー報告やフォールバック処理
            handle_permanent_error(error)
```

---

## ⚡ パフォーマンス最適化

### 接続プール設定

```python
import boto3
from botocore.config import Config
from concurrent.futures import ThreadPoolExecutor
import threading

class OptimizedS3Client:
    def __init__(self, region_name='ap-northeast-1'):
        # パフォーマンス最適化設定
        config = Config(
            retries={'max_attempts': 3, 'mode': 'adaptive'},
            max_pool_connections=50,  # 接続プール最大数
            region_name=region_name
        )
        
        self.s3_client = boto3.client('s3', config=config)
        self.thread_local = threading.local()
        
    def get_thread_local_client(self):
        """
        スレッドローカルクライアントの取得
        """
        if not hasattr(self.thread_local, 's3_client'):
            config = Config(
                retries={'max_attempts': 3, 'mode': 'adaptive'},
                max_pool_connections=10
            )
            self.thread_local.s3_client = boto3.client('s3', config=config)
        return self.thread_local.s3_client

    def parallel_object_processing(self, bucket_name: str, object_keys: List[str], max_workers: int = 10):
        """
        並列オブジェクト処理
        """
        results = []
        
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = {
                executor.submit(self._process_single_object, bucket_name, key): key 
                for key in object_keys
            }
            
            for future in as_completed(futures):
                object_key = futures[future]
                try:
                    result = future.result()
                    results.append({
                        'object_key': object_key,
                        'success': True,
                        'data': result
                    })
                except Exception as e:
                    results.append({
                        'object_key': object_key,
                        'success': False,
                        'error': str(e)
                    })
        
        return results
    
    def _process_single_object(self, bucket_name: str, object_key: str):
        """
        単一オブジェクト処理
        """
        client = self.get_thread_local_client()
        
        response = client.get_object(
            Bucket=bucket_name,
            Key=object_key
        )
        
        # データ処理ロジック
        content = response['Body'].read()
        
        return {
            'size': len(content),
            'content_type': response.get('ContentType', ''),
            'last_modified': response.get('LastModified', '')
        }
```

### キャッシング実装

```python
import redis
import json
import hashlib
from typing import Optional, Dict, Any
from datetime import datetime, timedelta

class CachedS3Client:
    def __init__(self, region_name='ap-northeast-1', redis_host='localhost', redis_port=6379):
        self.s3_client = boto3.client('s3', region_name=region_name)
        self.redis_client = redis.Redis(host=redis_host, port=redis_port, decode_responses=True)
        self.default_ttl = 3600  # 1時間
        
    def _generate_cache_key(self, bucket_name: str, object_key: str) -> str:
        """
        キャッシュキー生成
        """
        key_string = f"s3:{bucket_name}:{object_key}"
        return hashlib.md5(key_string.encode()).hexdigest()
    
    def get_object_cached(self, bucket_name: str, object_key: str, ttl: Optional[int] = None) -> Dict[str, Any]:
        """
        キャッシュ付きオブジェクト取得
        """
        cache_key = self._generate_cache_key(bucket_name, object_key)
        ttl = ttl or self.default_ttl
        
        try:
            # キャッシュ確認
            cached_data = self.redis_client.get(cache_key)
            if cached_data:
                logger.info(f"キャッシュヒット: {object_key}")
                return json.loads(cached_data)
            
            logger.info(f"キャッシュミス、S3から取得: {object_key}")
            
            # S3から取得
            response = self.s3_client.get_object(
                Bucket=bucket_name,
                Key=object_key
            )
            
            content = response['Body'].read()
            
            result = {
                'content': content.decode('utf-8', errors='ignore'),  # テキストファイル想定
                'metadata': {
                    'content_type': response.get('ContentType', ''),
                    'content_length': response.get('ContentLength', 0),
                    'last_modified': response.get('LastModified', '').isoformat(),
                    'etag': response.get('ETag', '')
                },
                'cached_at': datetime.utcnow().isoformat()
            }
            
            # キャッシュに保存
            self.redis_client.setex(
                cache_key, 
                ttl, 
                json.dumps(result, default=str)
            )
            
            return result
            
        except redis.RedisError as e:
            logger.warning(f"Redis エラー、キャッシュなしで取得: {str(e)}")
            # キャッシュエラー時は直接S3から取得
            return self._get_object_direct(bucket_name, object_key)
        except Exception as e:
            logger.error(f"オブジェクト取得エラー: {str(e)}")
            raise
    
    def invalidate_cache(self, bucket_name: str, object_key: str) -> bool:
        """
        キャッシュ無効化
        """
        cache_key = self._generate_cache_key(bucket_name, object_key)
        try:
            return bool(self.redis_client.delete(cache_key))
        except redis.RedisError as e:
            logger.error(f"キャッシュ無効化エラー: {str(e)}")
            return False
```

---

## 🔍 トラブルシューティング

### 診断スクリプト

```python
import boto3
import requests
from botocore.exceptions import ClientError, NoCredentialsError
import subprocess
import sys

class S3AccessDiagnostics:
    def __init__(self):
        self.results = []
        
    def run_all_diagnostics(self):
        """
        全診断実行
        """
        print("=== EC2からS3アクセス診断開始 ===\n")
        
        # 1. EC2メタデータ確認
        self.check_ec2_metadata()
        
        # 2. IAMロール確認
        self.check_iam_role()
        
        # 3. AWS認証情報確認
        self.check_aws_credentials()
        
        # 4. ネットワーク接続確認
        self.check_network_connectivity()
        
        # 5. S3アクセステスト
        self.test_s3_access()
        
        # 6. 権限テスト
        self.test_permissions()
        
        print("\n=== 診断結果サマリー ===")
        self.print_summary()
    
    def check_ec2_metadata(self):
        """
        EC2メタデータサービス確認
        """
        print("1. EC2メタデータサービス確認")
        try:
            # IMDSv2トークン取得
            token_response = requests.put(
                'http://169.254.169.254/latest/api/token',
                headers={'X-aws-ec2-metadata-token-ttl-seconds': '21600'},
                timeout=2
            )
            
            if token_response.status_code == 200:
                token = token_response.text
                
                # インスタンス情報取得
                metadata_response = requests.get(
                    'http://169.254.169.254/latest/meta-data/instance-id',
                    headers={'X-aws-ec2-metadata-token': token},
                    timeout=2
                )
                
                if metadata_response.status_code == 200:
                    instance_id = metadata_response.text
                    print(f"   ✅ EC2インスタンス: {instance_id}")
                    self.results.append(("EC2メタデータ", True, f"インスタンス: {instance_id}"))
                else:
                    print(f"   ❌ メタデータ取得失敗: {metadata_response.status_code}")
                    self.results.append(("EC2メタデータ", False, "メタデータ取得失敗"))
            else:
                print(f"   ❌ IMDSトークン取得失敗: {token_response.status_code}")
                self.results.append(("EC2メタデータ", False, "IMDSトークン取得失敗"))
                
        except requests.exceptions.RequestException as e:
            print(f"   ❌ EC2メタデータサービスにアクセスできません: {str(e)}")
            self.results.append(("EC2メタデータ", False, f"アクセス不可: {str(e)}"))
        
        print()
    
    def check_iam_role(self):
        """
        IAMロール確認
        """
        print("2. IAMロール確認")
        try:
            token_response = requests.put(
                'http://169.254.169.254/latest/api/token',
                headers={'X-aws-ec2-metadata-token-ttl-seconds': '21600'},
                timeout=2
            )
            
            if token_response.status_code == 200:
                token = token_response.text
                
                # IAMロール情報取得
                iam_response = requests.get(
                    'http://169.254.169.254/latest/meta-data/iam/security-credentials/',
                    headers={'X-aws-ec2-metadata-token': token},
                    timeout=2
                )
                
                if iam_response.status_code == 200:
                    role_name = iam_response.text
                    print(f"   ✅ IAMロール: {role_name}")
                    
                    # 認証情報取得
                    creds_response = requests.get(
                        f'http://169.254.169.254/latest/meta-data/iam/security-credentials/{role_name}',
                        headers={'X-aws-ec2-metadata-token': token},
                        timeout=2
                    )
                    
                    if creds_response.status_code == 200:
                        creds = creds_response.json()
                        print(f"   ✅ AccessKeyId: {creds['AccessKeyId'][:8]}...")
                        print(f"   ✅ 有効期限: {creds['Expiration']}")
                        self.results.append(("IAMロール", True, f"ロール: {role_name}"))
                    else:
                        print(f"   ❌ 認証情報取得失敗: {creds_response.status_code}")
                        self.results.append(("IAMロール", False, "認証情報取得失敗"))
                else:
                    print(f"   ❌ IAMロールが設定されていません")
                    self.results.append(("IAMロール", False, "IAMロール未設定"))
        except Exception as e:
            print(f"   ❌ IAMロール確認エラー: {str(e)}")
            self.results.append(("IAMロール", False, f"確認エラー: {str(e)}"))
        
        print()
    
    def check_aws_credentials(self):
        """
        AWS認証情報確認
        """
        print("3. AWS認証情報確認")
        try:
            sts = boto3.client('sts')
            identity = sts.get_caller_identity()
            
            print(f"   ✅ Account: {identity['Account']}")
            print(f"   ✅ User/Role ARN: {identity['Arn']}")
            print(f"   ✅ User ID: {identity['UserId']}")
            
            self.results.append(("AWS認証", True, f"Account: {identity['Account']}"))
            
        except NoCredentialsError:
            print("   ❌ AWS認証情報が見つかりません")
            self.results.append(("AWS認証", False, "認証情報なし"))
        except Exception as e:
            print(f"   ❌ 認証情報確認エラー: {str(e)}")
            self.results.append(("AWS認証", False, f"エラー: {str(e)}"))
        
        print()
    
    def check_network_connectivity(self):
        """
        ネットワーク接続確認
        """
        print("4. ネットワーク接続確認")
        
        # S3エンドポイント接続テスト
        endpoints = [
            "s3.amazonaws.com",
            "s3.ap-northeast-1.amazonaws.com"
        ]
        
        for endpoint in endpoints:
            try:
                response = requests.get(f"https://{endpoint}", timeout=5)
                print(f"   ✅ {endpoint}: 接続OK ({response.status_code})")
                self.results.append((f"接続-{endpoint}", True, "接続OK"))
            except Exception as e:
                print(f"   ❌ {endpoint}: 接続NG ({str(e)})")
                self.results.append((f"接続-{endpoint}", False, f"接続NG: {str(e)}"))
        
        print()
    
    def test_s3_access(self):
        """
        基本的なS3アクセステスト
        """
        print("5. S3アクセステスト")
        try:
            s3 = boto3.client('s3')
            
            # バケット一覧取得テスト
            response = s3.list_buckets()
            bucket_count = len(response['Buckets'])
            print(f"   ✅ バケット一覧取得成功: {bucket_count}個")
            self.results.append(("S3アクセス", True, f"バケット: {bucket_count}個"))
            
        except ClientError as e:
            error_code = e.response['Error']['Code']
            print(f"   ❌ S3アクセスエラー: {error_code}")
            self.results.append(("S3アクセス", False, f"エラー: {error_code}"))
        except Exception as e:
            print(f"   ❌ S3アクセス予期しないエラー: {str(e)}")
            self.results.append(("S3アクセス", False, f"予期しないエラー: {str(e)}"))
        
        print()
    
    def test_permissions(self, test_bucket=None):
        """
        権限テスト
        """
        print("6. S3権限テスト")
        
        if not test_bucket:
            print("   ℹ️  テストバケット名が指定されていません。権限テストをスキップします。")
            return
        
        s3 = boto3.client('s3')
        
        # GetObject権限テスト
        try:
            s3.head_object(Bucket=test_bucket, Key='test-key')
            print(f"   ✅ {test_bucket}: HeadObject 権限OK")
            self.results.append((f"権限-{test_bucket}", True, "HeadObject OK"))
        except ClientError as e:
            error_code = e.response['Error']['Code']
            if error_code == 'NotFound':
                print(f"   ✅ {test_bucket}: GetObject 権限OK (オブジェクト未存在)")
                self.results.append((f"権限-{test_bucket}", True, "GetObject OK"))
            elif error_code == 'Forbidden':
                print(f"   ❌ {test_bucket}: GetObject 権限NG")
                self.results.append((f"権限-{test_bucket}", False, "GetObject 権限なし"))
            else:
                print(f"   ❌ {test_bucket}: 権限テストエラー: {error_code}")
                self.results.append((f"権限-{test_bucket}", False, f"エラー: {error_code}"))
        
        print()
    
    def print_summary(self):
        """
        結果サマリー出力
        """
        success_count = sum(1 for _, success, _ in self.results if success)
        total_count = len(self.results)
        
        print(f"成功: {success_count}/{total_count}")
        print()
        
        print("詳細:")
        for test_name, success, details in self.results:
            status = "✅" if success else "❌"
            print(f"  {status} {test_name}: {details}")
        
        print()
        
        if success_count == total_count:
            print("🎉 すべてのテストが成功しました！")
        else:
            print("⚠️  いくつかの項目で問題が検出されました。")
            print("   上記の❌項目を確認して修正してください。")

# 使用方法
if __name__ == "__main__":
    diagnostics = S3AccessDiagnostics()
    
    # テストバケット指定（オプション）
    test_bucket = input("権限テスト用バケット名（Enter でスキップ）: ").strip() or None
    
    diagnostics.run_all_diagnostics()
    if test_bucket:
        diagnostics.test_permissions(test_bucket)
```

### 一般的な問題と解決方法

| 問題 | 症状 | 解決方法 |
|------|------|----------|
| **認証エラー** | NoCredentialsError | IAMロールの設定確認、インスタンスプロファイルの確認 |
| **アクセス拒否** | AccessDenied | IAMポリシーの権限確認、バケットポリシーの確認 |
| **オブジェクト未存在** | NoSuchKey | オブジェクトキーの確認、バケット名の確認 |
| **ネットワークエラー** | ConnectTimeoutError | セキュリティグループ、NACLの確認、VPCエンドポイント設定 |
| **スロットリング** | Throttling | リクエスト頻度の調整、指数バックオフの実装 |

---

## 🎯 まとめ

本ガイドでは、EC2インスタンスからS3オブジェクトを安全かつ効率的に取得する方法を包括的に説明しました。

### 🔑 重要なポイント

1. **セキュリティファースト**: IAMロールによる一時的認証情報の使用
2. **最小権限の原則**: 必要最小限の権限のみ付与
3. **エラーハンドリング**: 包括的なエラー処理とリトライ機能
4. **パフォーマンス最適化**: 接続プール、並列処理、キャッシング
5. **監視とロギング**: 適切なログ出力と監視設定

### 🚀 次のステップ

- CloudWatch監視の設定
- X-Ray分散トレーシングの導入  
- AWS Config によるコンプライアンス監視
- AWS GuardDuty による脅威検出の有効化

---

*このガイドが、安全で効率的なS3アクセス実装の参考になれば幸いです！* 🎉