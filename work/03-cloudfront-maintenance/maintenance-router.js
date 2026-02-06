'use strict';

/**
 * CloudFront Lambda@Edge - Maintenance Router Function
 *
 * このLambda@Edge関数は、メンテナンスモード時のリクエストルーティングを制御します。
 *
 * 処理フロー:
 * 1. メンテナンスモードが無効なら、通常サイト（Main Site）へルーティング
 * 2. WAFがX-Maintenance-Bypassヘッダーを追加している場合、通常サイトへルーティング
 * 3. 現在時刻がメンテナンス時間内の場合、Sorryページへルーティング
 * 4. メンテナンス時間外の場合、通常サイトへルーティング
 */

// 環境変数（CDKデプロイ時に設定）
const MAIN_SITE_BUCKET = process.env.MAIN_SITE_BUCKET || 'main-site-bucket.s3.ap-northeast-1.amazonaws.com';
const SORRY_PAGE_BUCKET = process.env.SORRY_PAGE_BUCKET || 'sorry-page-bucket.s3.ap-northeast-1.amazonaws.com';
const MAINTENANCE_MODE_ENABLED = process.env.MAINTENANCE_MODE_ENABLED === 'true';
const MAINTENANCE_START_TIME = process.env.MAINTENANCE_START_TIME || '2025-12-25T00:00:00+09:00';
const MAINTENANCE_END_TIME = process.env.MAINTENANCE_END_TIME || '2025-12-25T06:00:00+09:00';

exports.handler = async (event) => {
    const request = event.Records[0].cf.request;
    const headers = request.headers;

    console.log('Maintenance Router - Request received', {
        uri: request.uri,
        maintenanceMode: MAINTENANCE_MODE_ENABLED,
        headers: JSON.stringify(headers)
    });

    // 1. メンテナンスモードが無効なら、通常サイトへ
    if (!MAINTENANCE_MODE_ENABLED) {
        console.log('Maintenance mode is disabled - routing to main site');
        return routeToMainSite(request);
    }

    // 2. WAFによるIPバイパスチェック（X-Maintenance-Bypassヘッダー）
    if (headers['x-maintenance-bypass']) {
        console.log('IP bypass detected (X-Maintenance-Bypass header present) - routing to main site');
        return routeToMainSite(request);
    }

    // 3. 現在時刻が日本時間でメンテナンス時間内かチェック
    const now = new Date();
    const startTime = new Date(MAINTENANCE_START_TIME);
    const endTime = new Date(MAINTENANCE_END_TIME);

    console.log('Time check', {
        now: now.toISOString(),
        nowJST: formatJST(now),
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString()
    });

    if (now >= startTime && now < endTime) {
        // メンテナンス時間内 → sorryページへ
        console.log('Current time is within maintenance window - routing to sorry page');
        return routeToSorryPage(request);
    } else {
        // メンテナンス時間外 → メインサイトへ
        console.log('Current time is outside maintenance window - routing to main site');
        return routeToMainSite(request);
    }
};

/**
 * Main Siteオリジンへルーティング
 */
function routeToMainSite(request) {
    request.origin = {
        s3: {
            domainName: MAIN_SITE_BUCKET,
            region: 'ap-northeast-1',
            authMethod: 'origin-access-control',
            path: ''
        }
    };
    // URIはそのまま保持（ユーザーがリクエストしたパス）
    console.log('Routed to Main Site:', request.origin.s3.domainName);
    return request;
}

/**
 * Sorry Pageオリジンへルーティング
 */
function routeToSorryPage(request) {
    request.origin = {
        s3: {
            domainName: SORRY_PAGE_BUCKET,
            region: 'ap-northeast-1',
            authMethod: 'origin-access-control',
            path: ''
        }
    };
    // 全てのリクエストをsorryページのindex.htmlへ
    request.uri = '/index.html';
    console.log('Routed to Sorry Page:', request.origin.s3.domainName);
    return request;
}

/**
 * 日本時間（JST）フォーマット（ログ用）
 */
function formatJST(date) {
    return new Intl.DateTimeFormat('ja-JP', {
        timeZone: 'Asia/Tokyo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    }).format(date);
}
