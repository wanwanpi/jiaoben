/*
 * Readify v9.1 token response capture
 * Persists latest userToken and refreshToken from /api/users/tokens response.
 */
const PREFIX = "readify_v9_1_";
function save(k, v) {
  if (v !== undefined && v !== null && String(v).length) {
    try { $persistentStore.write(String(v), PREFIX + k); } catch (_) {}
  }
}
try {
  const body = ($response && $response.body) ? JSON.parse($response.body) : null;
  if (body && body.code === 0 && body.data) {
    if (body.data.userToken) save("x_token", body.data.userToken);
    if (body.data.refreshToken) save("x_refresh_token", body.data.refreshToken);
    if (body.data.userTokenExpire) save("user_token_expire", body.data.userTokenExpire);
    if (body.data.refreshTokenExpire) save("refresh_token_expire", body.data.refreshTokenExpire);
    console.log("[Readify v9.1] 已保存 Token 刷新响应中的最新值。");
  } else {
    console.log("[Readify v9.1] 响应中没有可保存的成功 Token。");
  }
} catch (e) {
  console.log("[Readify v9.1] 捕获解析失败：" + e);
}
