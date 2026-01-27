// ========================================
// Lambda ハンドラ関数
// CloudFront 経由でのみアクセス可能な API エンドポイント
// ========================================

// handler: Lambda が実行するメイン関数
// event: リクエスト情報が含まれるオブジェクト
// 戻り値: HTTP レスポンス形式のオブジェクト
export const handler = async (event: any) => {
  // 受信したイベントをログに出力（デバッグ用）
  // CloudWatch Logs で確認できる
  console.log('Event:', JSON.stringify(event, null, 2));

  // HTTP レスポンスを返す
  return {
    // statusCode: HTTP ステータスコード（200 = 成功）
    statusCode: 200,

    // headers: レスポンスヘッダー
    headers: {
      // Content-Type: レスポンスの形式を指定
      'Content-Type': 'application/json',
    },

    // body: レスポンスボディ（JSON 文字列として返す）
    body: JSON.stringify({
      // メッセージ
      message: 'Hello from Lambda Function URL with OAC!',

      // 現在時刻（ISO 8601 形式）
      timestamp: new Date().toISOString(),

      // リクエスト情報（オプション）
      requestContext: {
        // アクセス元の IP アドレス
        sourceIp: event.requestContext?.http?.sourceIp,
        // ユーザーエージェント（ブラウザ/クライアント情報）
        userAgent: event.requestContext?.http?.userAgent,
      },
    }),
  };
};
