/*
 * Readify daily check-in v9.1
 * Robustly parses Loon $argument formats and supports both plugin arguments
 * and persistent storage. Manual x-refresh-token always wins over saved refresh token.
 */
const PREFIX = "readify_v9_1_";
const BASE = "https://readifyapp.voiceclub.cn";
function log(s) { console.log("[Readify v9.1] " + s); }

function parseArgs(raw) {
  const out = {};
  if (!raw) return out;
  // Loon may pass a JSON-like object or a comma-separated key=value string.
  if (typeof raw === "object") {
    Object.keys(raw).forEach(k => { out[k] = raw[k] == null ? "" : String(raw[k]); });
    return out;
  }
  const s = String(raw).trim();
  try {
    const parsed = JSON.parse(s);
    if (parsed && typeof parsed === "object") {
      Object.keys(parsed).forEach(k => { out[k] = parsed[k] == null ? "" : String(parsed[k]); });
      return out;
    }
  } catch (_) {}
  s.split(/[&,;\n]/).forEach(part => {
    const idx = part.indexOf("=");
    if (idx > -1) {
      const k = part.slice(0, idx).trim();
      let v = part.slice(idx + 1).trim();
      try { v = decodeURIComponent(v.replace(/\+/g, "%20")); } catch (_) {}
      out[k] = v;
    }
  });
  return out;
}
function stored(k) { try { return $persistentStore.read(PREFIX + k) || ""; } catch (_) { return ""; } }
function getArg(k, a) { return (a[k] === undefined || a[k] === null) ? "" : String(a[k]).trim(); }
function save(k, v) { if (v !== undefined && v !== null && String(v).length) { try { $persistentStore.write(String(v), PREFIX + k); } catch (_) {} } }

function request(method, url, headers, body) {
  return new Promise((resolve, reject) => {
    const opts = { url, headers, body: body || "" };
    $httpClient[method](opts, (err, resp, data) => {
      if (err) return reject(new Error(String(err)));
      resolve({ status: resp ? resp.status : 0, body: data || "" });
    });
  });
}
function headers(token, refresh, uid, did) {
  const h = {
    "x-app-name": "readifyai",
    "x-os": "27.0",
    "x-device-id": did,
    "x-v": "v1",
    "x-user-id": uid,
    "Accept": "application/json",
    "Content-Type": "application/json"
  };
  if (token) h["x-token"] = token;
  if (refresh) h["x-refresh-token"] = refresh;
  return h;
}
async function run() {
  const a = parseArgs(typeof $argument === "undefined" ? "" : $argument);
  // Current plugin inputs take priority for initial/manual values.
  const manualToken = getArg("x_token", a);
  const manualRefresh = getArg("x_refresh_token", a);
  const userId = getArg("x_user_id", a) || stored("x_user_id");
  const deviceId = getArg("x_device_id", a) || stored("x_device_id");
  const campaignId = getArg("campaign_id", a) || "reading-streak-7d-202607";

  // Latest saved access token wins after the first run. If none exists, use manually entered initial token.
  const token = stored("x_token") || manualToken;
  // Refresh token is explicitly user-maintained; use manual parameter first, then latest captured/saved token.
  const refreshToken = manualRefresh || stored("x_refresh_token");

  // Save IDs and initial token for future runs.
  if (userId) save("x_user_id", userId);
  if (deviceId) save("x_device_id", deviceId);
  if (token) save("x_token", token);
  if (refreshToken) save("x_refresh_token", refreshToken);

  const missing = [];
  if (!token) missing.push("x-token");
  if (!refreshToken) missing.push("x-refresh-token");
  if (!userId) missing.push("x-user-id");
  if (!deviceId) missing.push("x-device-id");
  if (missing.length) {
    log("缺少参数：" + missing.join(", ") + "。已解析到的参数名：" + Object.keys(a).join(", "));
    return;
  }

  log("参数读取成功，开始刷新 Token。");
  let latestToken = token;
  try {
    const rr = await request("post", BASE + "/api/users/tokens", headers(token, refreshToken, userId, deviceId), "{}");
    let rd = {};
    try { rd = JSON.parse(rr.body || "{}"); } catch (_) {}
    if (rr.status >= 200 && rr.status < 300 && rd.code === 0 && rd.data && rd.data.userToken) {
      latestToken = String(rd.data.userToken);
      save("x_token", latestToken);
      if (rd.data.refreshToken) save("x_refresh_token", rd.data.refreshToken);
      log("Token 刷新成功，最新 userToken 已保存为 x-token。");
    } else {
      log("刷新未成功：HTTP " + rr.status + "，code=" + (rd.code === undefined ? "未知" : rd.code) + "，message=" + (rd.message || "无说明") + "。继续尝试当前 x-token。");
    }
  } catch (e) {
    log("刷新请求失败：" + String(e) + "。继续尝试当前 x-token。");
  }

  try {
    const cr = await request("post", BASE + "/api/campaigns/streaks", headers(latestToken, "", userId, deviceId), JSON.stringify({campaignId}));
    let cd = {};
    try { cd = JSON.parse(cr.body || "{}"); } catch (_) {}
    if (cr.status >= 200 && cr.status < 300 && cd.code === 0) {
      const d = cd.data || {};
      log("签到请求成功：result=" + (d.checkInResult || "OK") + "，streakedToday=" + String(d.streakedToday) + "，currentDay=" + String(d.currentDay));
    } else {
      log("签到未成功：HTTP " + cr.status + "，code=" + (cd.code === undefined ? "未知" : cd.code) + "，message=" + (cd.message || "无说明"));
    }
  } catch (e) {
    log("签到请求失败：" + String(e));
  }
}
run();
