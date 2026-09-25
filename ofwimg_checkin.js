/*
 * OFWIMG 每日签到 - Loon Script v4
 * ES5兼容版
 * 自动处理 Refresh Token 轮换
 */
(function () {
    var args = $argument || {};
    if (typeof args === "string") {
        try { args = JSON.parse(args); } catch (e) { args = {}; }
    }

    var userId = args.userId || "";
    var deviceId = args.deviceId || "";
    var timezone = args.timezone || "Asia/Shanghai";
    var api = "https://api.ofwimg.com";

    var tokenStoreKey = "OFWIMG_refresh_token_v4";
    var inputStoreKey = "OFWIMG_input_token_v4";

    var inputToken = args.refreshToken || "";
    var savedToken = "";
    var lastInputToken = "";

    try {
        savedToken = $persistentStore.read(tokenStoreKey) || "";
        lastInputToken = $persistentStore.read(inputStoreKey) || "";
    } catch (e) {}

    var refreshToken = "";
    var tokenSource = "";

    if (!inputToken) {
        refreshToken = savedToken;
        tokenSource = "持久化存储";
    } else if (!lastInputToken) {
        refreshToken = inputToken;
        tokenSource = "插件参数（首次）";
    } else if (inputToken === lastInputToken) {
        refreshToken = savedToken || inputToken;
        tokenSource = savedToken ? "服务器轮换 Token" : "插件参数";
    } else {
        refreshToken = inputToken;
        tokenSource = "插件参数（检测到新 Token）";
    }

    function log(s) { console.log("[OFWIMG] " + s); }

    function notify(t, s, b) {
        if (typeof $notification !== "undefined" && $notification.post) {
            $notification.post(t || "", s || "", b || "");
        }
    }

    function mask(t) {
        if (!t) return "未设置";
        if (t.length <= 10) return "***";
        return t.substring(0, 5) + "..." + t.substring(t.length - 4);
    }

    function writeStore(k, v) {
        try { $persistentStore.write(v, k); } catch (e) {}
    }

    function saveToken(t) {
        if (!t) return;
        writeStore(tokenStoreKey, t);
        if (inputToken) writeStore(inputStoreKey, inputToken);
        log("已保存服务器最新 Refresh Token：" + mask(t));
    }

    function refresh(callback) {
        log("Token 来源：" + tokenSource);
        log("使用 Refresh Token：" + mask(refreshToken));

        $httpClient.post({
            url: api + "/api/auth/refresh",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "x-user-id": userId,
                "x-device-id": deviceId,
                "x-timezone": timezone
            },
            body: JSON.stringify({ refresh_token: refreshToken })
        }, function (error, response, body) {
            if (error) { callback(String(error)); return; }

            var json = {};
            try { json = body ? JSON.parse(body) : {}; }
            catch (e) { callback("服务器返回内容不是有效 JSON"); return; }

            var status = response && response.status ? response.status : 0;
            if (status < 200 || status >= 300) {
                callback(json.message || json.error || ("HTTP " + status));
                return;
            }

            if (!json.access_token) {
                callback("服务器没有返回 Access Token");
                return;
            }

            callback(null, json);
        });
    }

    function claim(accessToken) {
        log("正在执行每日签到...");

        $httpClient.post({
            url: api + "/api/user/credits/daily-claim",
            headers: {
                "Accept": "application/json",
                "Authorization": "Bearer " + accessToken,
                "x-user-id": userId,
                "x-device-id": deviceId,
                "x-timezone": timezone,
                "x-credits-grant-mode": "manual-v1"
            }
        }, function (error, response, body) {
            if (error) {
                notify("OFWIMG 签到失败", "", String(error));
                $done();
                return;
            }

            var json = {};
            try { json = body ? JSON.parse(body) : {}; }
            catch (e) {
                notify("OFWIMG 签到失败", "", "服务器返回内容异常");
                $done();
                return;
            }

            var status = response && response.status ? response.status : 0;
            if (status < 200 || status >= 300) {
                var msg = json.message || json.error || ("HTTP " + status);
                log("签到失败：" + msg);
                notify("OFWIMG 签到失败", "", msg);
                $done();
                return;
            }

            if (json.already_claimed || json.daily_claimed_today) {
                var c1 = json.credits !== undefined ? "当前积分：" + json.credits : "";
                log("今天已经签到" + (c1 ? "，" + c1 : ""));
                notify("OFWIMG 每日签到", "今天已经签到", c1);
                $done();
                return;
            }

            var granted = json.granted_credits !== undefined ?
                "本次获得 " + json.granted_credits + " 积分" : "签到成功";
            var c2 = json.credits !== undefined ? "当前积分：" + json.credits : "";

            log("签到成功：" + granted + (c2 ? "，" + c2 : ""));
            notify("OFWIMG 每日签到成功", granted, c2);
            $done();
        });
    }

    if (!userId) {
        notify("OFWIMG 签到失败", "", "缺少 User ID，请在插件参数中填写。");
        $done(); return;
    }
    if (!deviceId) {
        notify("OFWIMG 签到失败", "", "缺少 Device ID，请在插件参数中填写。");
        $done(); return;
    }
    if (!refreshToken) {
        notify("OFWIMG 签到失败", "", "缺少 Refresh Token，请填写最新 Token。");
        $done(); return;
    }

    if (inputToken) writeStore(inputStoreKey, inputToken);

    log("开始执行 OFWIMG 每日签到");
    log("正在刷新 Access Token...");

    refresh(function (error, json) {
        if (error) {
            log("Refresh Token 已失效：" + error);
            if (error === "refresh_token_revoked" || error === "refresh_token_expired") {
                notify("OFWIMG Token 已失效", "", "请重新抓取最新 Refresh Token 后填入插件参数。");
            } else {
                notify("OFWIMG Token 刷新失败", "", error);
            }
            $done();
            return;
        }

        log("Access Token 刷新成功");

        if (json.refresh_token) {
            saveToken(json.refresh_token);
        } else {
            saveToken(refreshToken);
        }

        claim(json.access_token);
    });
})();
