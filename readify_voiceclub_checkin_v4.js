/*
 * Readify manual-token check-in for Loon
 * No MITM and no automatic token capture.
 * Fill the LPX plugin arguments with values copied from your own Readify request.
 */
const TAG = "[Readify]";
const API = "https://readifyapp.voiceclub.cn/api/campaigns/streaks";
const args = typeof $argument !== "undefined" && $argument ? $argument : {};
const token = String(args.readify_token || "").trim();
const userId = String(args.user_id || "").trim();
const deviceId = String(args.readify_device_id || "").trim();
const campaignId = String(args.campaign_id || "").trim();

function finish(message) {
  console.log(TAG + " " + message);
  if (typeof $done === "function") $done();
}

if (!token || !userId || !deviceId || !campaignId) {
  finish("参数不完整。请在插件参数中填写 readify_token、user_id、readify_device_id、campaign_id。");
} else {
  const request = {
    url: API,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json, text/plain, */*",
      "Origin": "https://readifyapp.voiceclub.cn",
      "Referer": "https://readifyapp.voiceclub.cn/activity/check-in/7DayChallenge?immersive=1",
      "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) readifyapp",
      "x-token": token,
      "x-user-id": userId,
      "x-device-id": deviceId
    },
    body: JSON.stringify({ campaignId: campaignId }),
    timeout: 30000
  };

  console.log(TAG + " 开始每日签到");
  console.log(TAG + " Campaign: " + campaignId);
  console.log(TAG + " Token 来源: 插件参数（手动填写）");

  const send = (attempt) => {
    $httpClient.post(request, (error, response, data) => {
      if (error) {
        if (attempt < 2) {
          console.log(TAG + " 请求失败，准备重试：" + error);
          send(attempt + 1);
          return;
        }
        finish("请求失败: " + error);
        return;
      }
      const status = response ? response.status : "unknown";
      let json = null;
      try { json = data ? JSON.parse(data) : null; } catch (_) {}
      if (status < 200 || status >= 300) {
        finish("HTTP " + status + "，响应: " + String(data || "").slice(0, 800));
        return;
      }
      if (json) {
        console.log(TAG + " HTTP " + status + "，响应: " + JSON.stringify(json));
        if (json.code === 0) {
          const info = json.data || {};
          finish(info.streakedToday ? "签到状态：今日已签到。" : (json.message || "请求成功，请核对返回数据。"));
        } else {
          finish("接口返回业务错误：" + (json.message || JSON.stringify(json)));
        }
      } else {
        finish("HTTP " + status + "，返回内容: " + String(data || "").slice(0, 800));
      }
    });
  };
  send(1);
}
