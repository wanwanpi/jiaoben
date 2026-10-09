/*
 * Readify daily check-in v9
 * 1) x-refresh-token is manually supplied in plugin arguments.
 * 2) Initial x-token can be manually supplied; later tokens are persisted automatically.
 * 3) Refreshes token via /api/users/tokens using old x-token + x-refresh-token,
 *    saves returned userToken as latest x-token, then checks in using that token.
 */
const PREFIX = "readify_v9_";
const BASE = "https://readifyapp.voiceclub.cn";
const REFRESH_PATH = "/api/users/tokens";
const CHECKIN_PATH = "/api/campaigns/streaks";

function log(s) { console.log("[Readify v9] " + s); }
function stored(k) { try { return $persistentStore.read(PREFIX + k) || ""; } catch (_) { return ""; } }
function arg(k) {
  try {
    if (typeof $argument === "string" && $argument) {
      const m = $argument.match(new RegExp("(?:^|[,&])\\s*" + k + "\\s*=\\s*([^,&]*)"));
      if (m) return decodeURIComponent(m[1].replace(/\+/g, "%20"));
    }
  } catch (_) {}
  return "";
}
function get(k) {
  // Prefer latest automatically saved values; initial x-token and manual refresh token are fallbacks.
  return stored(k) || arg(k);
}
function save(k, v) {
  if (v !== undefined && v !== null && String(v).length) $persistentStore.write(String(v), PREFIX + k);
}
function request(method, url, headers, body) {
  return new Promise((resolve, reject) => {
    const opts = { url, headers, body: body || "" };
    $httpClient[method](opts, (err, resp, data) => {
      if (err) return reject(new Error(String(err)));
      resolve({ status: resp ? resp.status : 0, body: data || "" });
    });
  });
}
function commonHeaders(token, refreshToken, userId, deviceId) {
  const h = {
    "x-app-name": "readifyai",
    "x-client-sys-region": "CN",
    "x-lang": "zh-Hans",
    "x-user-agent": "iOS/3.5.3",
    "x-client-region": "CN",
    "x-os": "27.0",
    "x-device-id": deviceId,
    "x-v": "v1",
    "x-user-id": userId,
    "x-time-zone": "Asia/Shanghai",
    "Accept": "application/json",
    "Content-Type": "application/json"
  };
  if (token) h["x-token"] = token;
  if (refreshToken) h["x-refresh-token"] = refreshToken;
  return h;
}
async function run() {
  const initialToken = get("x_token");
  const refreshToken = get("x_refresh_token");
  const userId = get("x_user_id");
  const deviceId = get("x_device_id");
  const campaignId = get("campaign_id") || "reading-streak-7d-202607";
  if (!initialToken || !refreshToken || !userId || !deviceId) {
    log("参数不完整。请填写初始 x-token、x-refresh-token、x-user-id、x-device-id 后再运行。");
    return;
  }

  let latestToken = initialToken;
  // First try refreshing. This is the same flow seen in the latest HAR:
  // request carries old x-token + manually maintained x-refresh-token.
  try {
    const refreshHeaders = commonHeaders(initialToken, refreshToken, userId, deviceId);
    const rr = await request("post", BASE + REFRESH_PATH, refreshHeaders, "{}");
    let rd = {};
    try { rd = JSON.parse(rr.body || "{}"); } catch (_) {}
    if (rr.status >= 200 && rr.status < 300 && rd.code === 0 && rd.data && rd.data.userToken) {
      latestToken = rd.data.userToken;
      save("x_token", latestToken);
      if (rd.data.refreshToken) save("x_refresh_token", rd.data.refreshToken);
      if (rd.data.userTokenExpire) save("user_token_expire", rd.data.userTokenExpire);
      if (rd.data.refreshTokenExpire) save("refresh_token_expire", rd.data.refreshTokenExpire);
      log("Token 刷新成功，已保存最新 x-token。");
    } else {
      // A failed refresh may mean old x-token is still valid; try check-in with it.
      log("Token 刷新未成功（HTTP " + rr.status + "，code=" + (rd.code === undefined ? "未知" : rd.code) + "），尝试使用当前保存的 x-token 签到。");
    }
  } catch (e) {
    log("Token 刷新请求失败，尝试使用当前保存的 x-token 签到。");
  }

  try {
    const h = commonHeaders(latestToken, "", userId, deviceId);
    const body = JSON.stringify({ campaignId });
    const cr = await request("post", BASE + CHECKIN_PATH, h, body);
    let cd = {};
    try { cd = JSON.parse(cr.body || "{}"); } catch (_) {}
    if (cr.status >= 200 && cr.status < 300 && cd.code === 0) {
      const d = cd.data || {};
      log("签到请求成功：result=" + (d.checkInResult || "OK") +
          "，streakedToday=" + String(d.streakedToday) +
          "，currentDay=" + String(d.currentDay));
    } else {
      log("签到未成功：HTTP " + cr.status + "，code=" +
          (cd.code === undefined ? "未知" : cd.code) + "，message=" +
          (cd.message || "无返回说明"));
    }
  } catch (e) {
    log("签到请求失败：" + String(e));
  }
}
run();
