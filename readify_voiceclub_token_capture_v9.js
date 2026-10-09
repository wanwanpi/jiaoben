/*
 * Readify token response capture v9
 * Captures userToken + refreshToken from /api/users/tokens responses and persists them.
 */
const PREFIX = "readify_v9_";
function log(s) { if (typeof $notify === "function") $notify("Readify v9", "", s); else console.log("[Readify v9] " + s); }
function save(k, v) {
  if (v !== undefined && v !== null && String(v).length) $persistentStore.write(String(v), PREFIX + k);
}
try {
  const body = ($response && $response.body) ? JSON.parse($response.body) : null;
  if (body && body.code === 0 && body.data) {
    if (body.data.userToken) save("x_token", body.data.userToken);
    if (body.data.refreshToken) save("x_refresh_token", body.data.refreshToken);
    if (body.data.userTokenExpire) save("user_token_expire", body.data.userTokenExpire);
    if (body.data.refreshTokenExpire) save("refresh_token_expire", body.data.refreshTokenExpire);
    log("已捕获并保存最新 Token。");
  } else {
    console.log("[Readify v9] Token 响应未包含可保存的成功数据。");
  }
} catch (e) {
  console.log("[Readify v9] 解析 Token 响应失败：" + e);
}
