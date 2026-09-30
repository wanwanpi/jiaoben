/*
 * Readify daily check-in for Loon
 * Parameters are passed from the plugin [Argument] section.
 * Token response capture: /api/users/tokens
 * Daily task: refresh token, then call /api/campaigns/streaks.
 */
const BASE = "https://readifyapp.voiceclub.cn";
const TOKEN_PATH = "/api/users/tokens";
const CHECKIN_PATH = "/api/campaigns/streaks";

const KEY_TOKEN = "readify_v7_x_token";
const KEY_REFRESH = "readify_v7_x_refresh_token";
const KEY_USER = "readify_v7_x_user_id";
const KEY_DEVICE = "readify_v7_x_device_id";
const KEY_CAMPAIGN = "readify_v7_campaign_id";
const KEY_TOKEN_EXPIRE = "readify_v7_token_expire";
const KEY_REFRESH_EXPIRE = "readify_v7_refresh_expire";

function log(s) { console.log("[Readify] " + s); }
function readStore(k) {
  try { return $persistentStore.read(k) || ""; } catch (e) { return ""; }
}
function writeStore(k, v) {
  try { return $persistentStore.write(String(v || ""), k); } catch (e) { return false; }
}
function arg(key) {
  try {
    if ($argument && typeof $argument === "object") return $argument[key] == null ? "" : String($argument[key]);
  } catch (e) {}
  return "";
}
function value(key, storeKey) { return readStore(storeKey) || arg(key) || ""; }
function parseJson(s) { try { return JSON.parse(s || "{}"); } catch (e) { return null; } }
function saveTokens(data) {
  if (!data || typeof data !== "object") return false;
  let changed = false;
  if (data.userToken) { writeStore(KEY_TOKEN, data.userToken); changed = true; }
  if (data.refreshToken) { writeStore(KEY_REFRESH, data.refreshToken); changed = true; }
  if (data.userTokenExpire) writeStore(KEY_TOKEN_EXPIRE, data.userTokenExpire);
  if (data.refreshTokenExpire) writeStore(KEY_REFRESH_EXPIRE, data.refreshTokenExpire);
  return changed;
}
function finish(message) {
  log(message);
  try { $done({}); } catch (e) {}
}

function captureTokenResponse() {
  const url = ($request && $request.url) || "";
  if (url.indexOf(TOKEN_PATH) < 0) return finish("非 Token 接口，跳过");
  const obj = parseJson($response && $response.body);
  if (!obj || Number(obj.code) !== 0 || !obj.data) {
    return finish("Token 响应未包含可用凭据，未更新本地 Token");
  }
  finish(saveTokens(obj.data) ? "已自动保存响应中的 userToken / refreshToken" : "响应成功，但未发现可更新的 Token 字段");
}

function refreshAndCheckIn() {
  const token = value("x_token", KEY_TOKEN);
  const refresh = value("x_refresh_token", KEY_REFRESH);
  const userId = value("x_user_id", KEY_USER);
  const deviceId = value("x_device_id", KEY_DEVICE);
  const campaignId = value("campaign_id", KEY_CAMPAIGN) || "reading-streak-7d-202607";

  if (!token || !refresh || !userId || !deviceId) {
    return finish("缺少参数，请打开插件参数填写 x_token、x_refresh_token、x_user_id、x_device_id。");
  }
  if (!readStore(KEY_TOKEN)) writeStore(KEY_TOKEN, token);
  if (!readStore(KEY_REFRESH)) writeStore(KEY_REFRESH, refresh);
  if (!readStore(KEY_USER)) writeStore(KEY_USER, userId);
  if (!readStore(KEY_DEVICE)) writeStore(KEY_DEVICE, deviceId);
  if (!readStore(KEY_CAMPAIGN)) writeStore(KEY_CAMPAIGN, campaignId);

  const headers = {
    "x-app-name": "readifyai",
    "x-os": "27.0",
    "x-device-id": deviceId,
    "x-v": "v1",
    "x-user-id": userId,
    "x-token": token,
    "x-refresh-token": refresh,
    "Accept": "application/json",
    "Content-Type": "application/json"
  };

  log("开始每日签到");
  log("Campaign: " + campaignId);
  log("先刷新 Token，再请求签到接口");

  $httpClient.post({ url: BASE + TOKEN_PATH, headers: headers, timeout: 30 }, function (error, response, body) {
    if (error || !response) return finish("Token 刷新请求失败：" + (error || "无响应"));
    const obj = parseJson(body);
    if (response.status < 200 || response.status >= 300) {
      return finish("Token 刷新 HTTP " + response.status + "，响应：" + String(body || "").slice(0, 500));
    }
    if (!obj || Number(obj.code) !== 0 || !obj.data || !obj.data.userToken) {
      return finish("Token 刷新失败，响应：" + String(body || "").slice(0, 500));
    }
    saveTokens(obj.data);
    log("Token 已更新，开始请求签到");

    const checkHeaders = {
      "x-app-name": "readifyai",
      "x-os": "27.0",
      "x-device-id": deviceId,
      "x-v": "v1",
      "x-user-id": userId,
      "x-token": obj.data.userToken,
      "Accept": "application/json",
      "Content-Type": "application/json"
    };
    $httpClient.post({
      url: BASE + CHECKIN_PATH,
      headers: checkHeaders,
      body: JSON.stringify({ campaignId: campaignId }),
      timeout: 30
    }, function (err2, resp2, body2) {
      if (err2 || !resp2) return finish("签到请求失败：" + (err2 || "无响应"));
      const result = parseJson(body2);
      log("HTTP " + resp2.status + "，响应：" + String(body2 || "").slice(0, 1000));
      if (resp2.status >= 200 && resp2.status < 300 && result && Number(result.code) === 0) {
        return finish("签到接口执行成功");
      }
      if (result && Number(result.code) === 240010) {
        return finish("当前活动暂不可进入下一轮；请以 App 页面状态为准");
      }
      finish("签到接口返回业务错误或 HTTP 错误");
    });
  });
}

if (typeof $response !== "undefined" && $response) captureTokenResponse();
else refreshAndCheckIn();
