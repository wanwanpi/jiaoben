/*
 * OFWIMG 每日签到 - Loon Script
 * 功能：刷新 Access Token、自动保存轮换后的 Refresh Token、执行每日签到
 * 参数：userId, deviceId, refreshToken, timezone
 *
 * Token 优先级：
 * 1. 插件参数中的 refreshToken（用于替换失效 Token）
 * 2. $persistentStore 中保存的 Token
 */

const args = typeof $argument === "string" ? $argument : ($argument || {});

const userId = args.userId || "";
const deviceId = args.deviceId || "";
const timezone = args.timezone || "Asia/Shanghai";
const STORE_KEY = "OFWIMG_refresh_token_v2";
const API = "https://api.ofwimg.com";

// 关键修复：插件参数中的新 Token 优先于持久化旧 Token
const parameterRefreshToken = args.refreshToken || "";
let refreshToken = parameterRefreshToken || $persistentStore.read(STORE_KEY) || "";

function notify(title, subtitle, body) {
  if (typeof $notification !== "undefined" && $notification.post) {
    $notification.post(title, subtitle || "", body || "");
  }
}

function maskToken(token) {
  if (!token) return "未设置";
  if (token.length <= 10) return "***";
  return token.slice(0, 5) + "..." + token.slice(-4);
}

function log(message) {
  console.log("[OFWIMG] " + message);
}

function request(options) {
  return new Promise((resolve, reject) => {
    $httpClient.post(options, (error, response, data) => {
      if (error) return reject(error);

      let json = null;
      try {
        json = data ? JSON.parse(data) : {};
      } catch (_) {}

      resolve({
        status: response ? response.status : 0,
        data: data || "",
        json
      });
    });
  });
}

function saveRefreshToken(token) {
  if (!token) return;
  refreshToken = token;
  $persistentStore.write(token, STORE_KEY);
  log("已保存新的 Refresh Token：" + maskToken(token));
}

async function main() {
  if (!userId) {
    notify("OFWIMG 签到失败", "", "缺少 User ID，请在插件参数中填写。");
    return;
  }

  if (!deviceId) {
    notify("OFWIMG 签到失败", "", "缺少 Device ID，请在插件参数中填写。");
    return;
  }

  if (!refreshToken) {
    notify("OFWIMG 签到失败", "", "缺少 Refresh Token，请在插件参数中填写。");
    return;
  }

  log("使用 Refresh Token：" + maskToken(refreshToken));
  log(parameterRefreshToken ? "Token 来源：插件参数" : "Token 来源：持久化存储");

  // 1. Refresh Token -> Access Token
  const refreshResult = await request({
    url: `${API}/api/auth/refresh`,
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "x-user-id": userId,
      "x-device-id": deviceId,
      "x-timezone": timezone
    },
    body: JSON.stringify({ refresh_token: refreshToken })
  });

  if (refreshResult.status < 200 || refreshResult.status >= 300 || !refreshResult.json) {
    const msg = refreshResult.json?.message ||
                refreshResult.json?.error ||
                `HTTP ${refreshResult.status}`;

    if (msg === "refresh_token_revoked" || msg === "refresh_token_expired") {
      notify(
        "OFWIMG Token 已失效",
        "请重新填写 Refresh Token",
        `服务器返回：${msg}\n当前使用：${maskToken(refreshToken)}`
      );
      log("Refresh Token 已失效：" + msg);
    } else {
      notify("OFWIMG Token 刷新失败", "", msg);
      log("Token 刷新失败：" + msg);
    }
    return;
  }

  const accessToken = refreshResult.json.access_token;
  const newRefreshToken = refreshResult.json.refresh_token;

  if (!accessToken) {
    notify("OFWIMG Token 刷新失败", "", "服务器没有返回 Access Token。");
    return;
  }

  log("Access Token 刷新成功");

  // Refresh Token 可能发生轮换，自动保存服务器返回的新 Token
  if (newRefreshToken) {
    saveRefreshToken(newRefreshToken);
  }

  // 2. Daily Claim
  const claimResult = await request({
    url: `${API}/api/user/credits/daily-claim`,
    headers: {
      "Accept": "application/json",
      "Authorization": `Bearer ${accessToken}`,
      "x-user-id": userId,
      "x-device-id": deviceId,
      "x-timezone": timezone,
      "x-credits-grant-mode": "manual-v1"
    }
  });

  if (claimResult.status < 200 || claimResult.status >= 300) {
    const msg = claimResult.json?.message ||
                claimResult.json?.error ||
                `HTTP ${claimResult.status}`;
    notify("OFWIMG 签到失败", "", msg);
    log("签到失败：" + msg);
    return;
  }

  const data = claimResult.json || {};

  if (data.already_claimed || data.daily_claimed_today) {
    const credits = data.credits !== undefined
      ? `当前积分：${data.credits}` : "";
    notify("OFWIMG 每日签到", "今天已经签到", credits);
    log("今天已经签到" + (credits ? "，" + credits : ""));
    return;
  }

  const granted = data.granted_credits !== undefined
    ? `本次获得 ${data.granted_credits} 积分`
    : "签到成功";

  const credits = data.credits !== undefined
    ? `当前积分：${data.credits}` : "";

  notify("OFWIMG 每日签到成功", granted, credits);
  log("签到成功：" + granted + (credits ? "，" + credits : ""));
}

(async () => {
  try {
    await main();
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    log("异常：" + msg);
    notify("OFWIMG 签到异常", "", msg);
  } finally {
    $done();
  }
})();
