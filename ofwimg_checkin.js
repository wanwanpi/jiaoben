/*
 * OFWIMG Daily Check-in for Loon
 * Requires Loon 3.5.1(983)+
 *
 * Flow:
 *   refresh_token -> access_token -> daily-claim
 *
 * The refresh token returned by /api/auth/refresh is rotated and persisted.
 */

const API = "https://api.ofwimg.com";
const STORE_KEY = "OFWIMG_refresh_token_v1";

const arg = $argument || {};
const userId = arg.userId || "";
const deviceId = arg.deviceId || "";
const timezone = arg.timezone || "Asia/Shanghai";

function notify(title, subtitle, body) {
  try {
    $notification.post(title, subtitle || "", body || "");
  } catch (e) {
    console.log("[OFWIMG] notification error: " + e);
  }
}

function getStoredRefreshToken() {
  try {
    return $persistentStore.read(STORE_KEY) || "";
  } catch (e) {
    console.log("[OFWIMG] persistentStore.read error: " + e);
    return "";
  }
}

function saveRefreshToken(token) {
  if (!token) return false;
  try {
    return !!$persistentStore.write(token, STORE_KEY);
  } catch (e) {
    console.log("[OFWIMG] persistentStore.write error: " + e);
    return false;
  }
}

function post(url, headers, body) {
  return new Promise((resolve, reject) => {
    $httpClient.post(
      {
        url: url,
        headers: headers || {},
        body: body || ""
      },
      (error, response, responseBody) => {
        if (error) {
          reject(error);
          return;
        }
        resolve({
          status: response ? response.status : 0,
          headers: response ? response.headers : {},
          body: responseBody || ""
        });
      }
    );
  });
}

function parseJSON(text) {
  try {
    return JSON.parse(text);
  } catch (e) {
    return null;
  }
}

function maskToken(token) {
  if (!token) return "(empty)";
  if (token.length <= 10) return "***";
  return token.slice(0, 4) + "..." + token.slice(-4);
}

async function refreshAccessToken(refreshToken) {
  const body = JSON.stringify({
    refresh_token: refreshToken
  });

  const result = await post(
    API + "/api/auth/refresh",
    {
      "Content-Type": "application/json",
      "Accept": "*/*",
      "X-User-Id": userId,
      "X-Device-Id": deviceId,
      "User-Agent": "Snapery/42"
    },
    body
  );

  const data = parseJSON(result.body);

  if (result.status < 200 || result.status >= 300 || !data || !data.access_token) {
    const detail = data
      ? (data.message || data.error || data.detail || ("HTTP " + result.status))
      : ("HTTP " + result.status + "，返回内容无法解析");
    throw new Error("Token 刷新失败：" + detail);
  }

  // The service rotates refresh_token. Always persist the newest one.
  if (data.refresh_token) {
    saveRefreshToken(data.refresh_token);
  }

  return data.access_token;
}

async function dailyClaim(accessToken) {
  const result = await post(
    API + "/api/user/credits/daily-claim",
    {
      "Content-Type": "application/json",
      "Accept": "*/*",
      "Authorization": "Bearer " + accessToken,
      "X-User-Id": userId,
      "X-Timezone": timezone,
      "X-Credits-Grant-Mode": "manual-v1",
      "X-Device-Id": deviceId,
      "User-Agent": "Snapery/42"
    },
    ""
  );

  const data = parseJSON(result.body);

  if (result.status === 200 && data) {
    return data;
  }

  const detail = data
    ? (data.message || data.error || data.detail || ("HTTP " + result.status))
    : ("HTTP " + result.status);
  throw new Error("签到请求失败：" + detail);
}

(async () => {
  try {
    if (!userId || !deviceId) {
      notify("OFWIMG 签到", "", "请先在插件设置中填写 User ID 和 Device ID");
      return;
    }

    const argumentToken = arg.refreshToken || "";
    const storedToken = getStoredRefreshToken();
    const refreshToken = storedToken || argumentToken;

    if (!refreshToken) {
      notify(
        "OFWIMG 签到",
        "缺少 Refresh Token",
        "请在插件设置中填写首次抓包得到的 Refresh Token"
      );
      return;
    }

    console.log("[OFWIMG] refresh token: " + maskToken(refreshToken));

    const accessToken = await refreshAccessToken(refreshToken);
    console.log("[OFWIMG] access token refreshed");

    const data = await dailyClaim(accessToken);

    if (data.already_claimed === true) {
      const credits = data.credits != null ? data.credits : "?";
      notify(
        "OFWIMG 签到",
        "今天已经签到",
        "当前积分：" + credits
      );
      return;
    }

    const granted = data.granted_credits != null ? data.granted_credits : 0;
    const credits = data.credits != null ? data.credits : "?";

    notify(
      "OFWIMG 签到成功",
      "获得 " + granted + " 积分",
      "当前积分：" + credits
    );

    console.log(
      "[OFWIMG] success, granted=" + granted +
      ", credits=" + credits
    );
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    console.log("[OFWIMG] ERROR: " + msg);
    notify("OFWIMG 签到失败", "", msg);
  } finally {
    $done();
  }
})();
