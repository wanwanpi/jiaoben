/*
 * Readify / VoiceClub 每日签到
 * Loon Script
 *
 * 功能：
 * 1. 每天由 Loon Cron 执行签到
 * 2. 自动从 readifyapp.voiceclub.cn 的正常请求中捕获最新 x-token / x-user-id
 * 3. 使用插件参数中的 Token 作为备用 Token
 * 4. 签到结果通过 Loon 日志和通知显示
 */

const STORE_TOKEN = "readify_voiceclub_x_token";
const STORE_USER_ID = "readify_voiceclub_user_id";

const DEFAULT_CAMPAIGN = "reading-streak-7d-202607";
const API_URL = "https://readifyapp.voiceclub.cn/api/campaigns/streaks";

function getHeader(headers, name) {
  if (!headers) return "";
  const target = String(name).toLowerCase();
  for (const key in headers) {
    if (String(key).toLowerCase() === target) return String(headers[key] || "");
  }
  return "";
}

function notify(title, subtitle, body) {
  try {
    $notification.post(title, subtitle, body);
  } catch (e) {}
}

function finish() {
  try { $done(); } catch (e) {}
}

/* HTTP 请求阶段：自动保存最新认证信息 */
if (typeof $request !== "undefined" && $request) {
  const token = getHeader($request.headers, "x-token");
  const userId = getHeader($request.headers, "x-user-id");

  if (token) {
    $persistentStore.write(token, STORE_TOKEN);
    console.log("[Readify] 已捕获并保存最新 x-token");
  }
  if (userId) {
    $persistentStore.write(userId, STORE_USER_ID);
    console.log("[Readify] 已捕获并保存 x-user-id");
  }

  finish();
} else {
  /* Cron：执行签到 */
  const arg = (typeof $argument === "object" && $argument) ? $argument : {};

  const configuredToken = String(arg.token || "").trim();
  const configuredUserId = String(arg.user_id || "").trim();
  const campaignId = String(arg.campaign_id || DEFAULT_CAMPAIGN).trim();

  const storedToken = String($persistentStore.read(STORE_TOKEN) || "").trim();
  const storedUserId = String($persistentStore.read(STORE_USER_ID) || "").trim();

  const token = storedToken || configuredToken;
  const userId = storedUserId || configuredUserId;

  console.log("[Readify] 开始每日签到");
  console.log("[Readify] Campaign: " + campaignId);
  console.log("[Readify] Token 来源: " + (storedToken ? "自动捕获" : (configuredToken ? "插件参数" : "无")));

  if (!token) {
    console.log("[Readify] 错误：没有 x-token");
    notify("Readify 签到", "执行失败", "没有找到 x-token。请打开 Readify 并访问一次签到/活动页面，让插件自动捕获 Token。");
    finish();
  } else {
    const headers = {
      "Content-Type": "application/json",
      "Accept": "application/json, text/plain, */*",
      "X-Token": token,
      "X-App-Name": "readifyai",
      "X-Lang": "zh-Hans",
      "X-Client-Region": "CN",
      "X-Client-Sys-Region": "CN",
      "X-User-Agent": "iOS/3.5.1",
      "X-OS": "27.0",
      "X-V": "v1",
      "X-Time-Zone": "Asia/Shanghai",
      "Origin": "https://readifyapp.voiceclub.cn",
      "Referer": "https://readifyapp.voiceclub.cn/activity/check-in/7DayChallenge?immersive=1",
      "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) readify version/3.5.1 platform/ios timezone/Asia/Shanghai lang/zh-Hans theme/light region/CN"
    };

    if (userId) headers["X-User-Id"] = userId;

    const body = JSON.stringify({
      campaignId: campaignId
    });

    $httpClient.post({
      url: API_URL,
      headers: headers,
      body: body,
      timeout: 15
    }, function(error, response, data) {
      if (error) {
        console.log("[Readify] 请求失败: " + error);
        notify("Readify 签到", "请求失败", String(error));
        finish();
        return;
      }

      console.log("[Readify] HTTP: " + (response ? response.status : "unknown"));

      let json;
      try {
        json = JSON.parse(data || "{}");
      } catch (e) {
        console.log("[Readify] 返回内容不是 JSON: " + String(data || "").slice(0, 500));
        notify("Readify 签到", "返回异常", "服务器返回了无法解析的内容");
        finish();
        return;
      }

      console.log("[Readify] Response: " + JSON.stringify(json));

      if (json.code !== 0) {
        const msg = json.message || json.msg || "服务器返回错误";
        console.log("[Readify] 签到失败: " + msg);

        if (/token|unauthor|auth|expired|login/i.test(msg)) {
          notify("Readify 签到", "Token 失效", msg + "；打开 Readify 活动页面一次即可重新捕获 Token。");
        } else {
          notify("Readify 签到", "签到失败", msg);
        }

        finish();
        return;
      }

      const d = json.data || {};
      const result = d.checkInResult || "";
      const today = d.streakedToday === true;
      const currentDay = d.currentDay != null ? d.currentDay : "?";

      if (result === "CHECKED_IN" || today) {
        const text = "今日已签到，第 " + currentDay + " 天";
        console.log("[Readify] " + text);
        notify("Readify 签到", "签到成功", text);
      } else if (d.canCheckIn === false) {
        const text = "当前不可签到；服务器状态：" + result;
        console.log("[Readify] " + text);
        notify("Readify 签到", "无需签到", text);
      } else {
        const text = "接口返回成功，但未确认签到结果：" + JSON.stringify(d);
        console.log("[Readify] " + text);
        notify("Readify 签到", "请检查", text.slice(0, 180));
      }

      finish();
    });
  }
}
