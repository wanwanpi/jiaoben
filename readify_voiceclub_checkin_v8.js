/*
 * Readify daily check-in for Loon v8
 * Cron-only script.
 * Plugin arguments have priority over persistent storage.
 */
const BASE="https://readifyapp.voiceclub.cn";
const TOKEN_PATH="/api/users/tokens";
const CHECKIN_PATH="/api/campaigns/streaks";

const KEY_TOKEN="readify_v8_x_token";
const KEY_REFRESH="readify_v8_x_refresh_token";
const KEY_USER="readify_v8_x_user_id";
const KEY_DEVICE="readify_v8_x_device_id";
const KEY_CAMPAIGN="readify_v8_campaign_id";
const KEY_TOKEN_EXPIRE="readify_v8_token_expire";
const KEY_REFRESH_EXPIRE="readify_v8_refresh_expire";

function log(s){console.log("[Readify] "+s);}
function readStore(k){try{return $persistentStore.read(k)||"";}catch(e){return "";}}
function writeStore(k,v){try{return $persistentStore.write(String(v||""),k);}catch(e){return false;}}
function arg(k){try{if($argument&&typeof $argument==="object")return $argument[k]==null?"":String($argument[k]);}catch(e){}return "";}
function value(k,sk){return arg(k)||readStore(sk)||"";}
function parseJson(s){try{return JSON.parse(s||"{}");}catch(e){return null;}}
function saveTokens(d){
  if(!d||typeof d!=="object")return false;
  let changed=false;
  if(d.userToken){writeStore(KEY_TOKEN,d.userToken);changed=true;}
  if(d.refreshToken){writeStore(KEY_REFRESH,d.refreshToken);changed=true;}
  if(d.userTokenExpire)writeStore(KEY_TOKEN_EXPIRE,d.userTokenExpire);
  if(d.refreshTokenExpire)writeStore(KEY_REFRESH_EXPIRE,d.refreshTokenExpire);
  return changed;
}
function mask(s){s=String(s||"");return s.length<=10?(s?"***":"(空)"):s.slice(0,6)+"..."+s.slice(-4);}
function finish(m){log(m);try{$done({});}catch(e){}}

function run(){
  const token=value("x_token",KEY_TOKEN);
  const refresh=value("x_refresh_token",KEY_REFRESH);
  const userId=value("x_user_id",KEY_USER);
  const deviceId=value("x_device_id",KEY_DEVICE);
  const campaignId=value("campaign_id",KEY_CAMPAIGN)||"reading-streak-7d-202607";

  if(!token||!refresh||!userId||!deviceId)
    return finish("缺少参数：请填写 x_token、x_refresh_token、x_user_id、x_device_id");

  writeStore(KEY_TOKEN,token);writeStore(KEY_REFRESH,refresh);
  writeStore(KEY_USER,userId);writeStore(KEY_DEVICE,deviceId);writeStore(KEY_CAMPAIGN,campaignId);

  log("开始每日签到");
  log("Campaign: "+campaignId);
  log("Token 来源："+(arg("x_token")?"插件参数":"持久化存储"));
  log("Refresh Token："+mask(refresh));
  log("开始请求 Token 刷新接口");

  const headers={
    "x-app-name":"readifyai","x-os":"27.0","x-device-id":deviceId,"x-v":"v1",
    "x-user-id":userId,"x-token":token,"x-refresh-token":refresh,
    "Accept":"application/json","Content-Type":"application/json"
  };

  const start=Date.now();
  $httpClient.post({
    url:BASE+TOKEN_PATH,
    headers:headers,
    body:JSON.stringify({}),
    timeout:30
  },function(error,response,body){
    const elapsed=Date.now()-start;

    if(error||!response)
      return finish("Token 刷新请求失败（"+elapsed+"ms）："+String(error||"无响应"));

    log("Token 刷新 HTTP "+response.status+"（"+elapsed+"ms）");
    const obj=parseJson(body);

    if(response.status<200||response.status>=300)
      return finish("Token 刷新 HTTP "+response.status+"，响应："+String(body||"").slice(0,800));

    if(!obj||Number(obj.code)!==0||!obj.data||!obj.data.userToken)
      return finish("Token 刷新业务失败，响应："+String(body||"").slice(0,800));

    saveTokens(obj.data);
    log("Token 刷新成功，开始请求签到接口");

    const checkHeaders={
      "x-app-name":"readifyai","x-os":"27.0","x-device-id":deviceId,"x-v":"v1",
      "x-user-id":userId,"x-token":obj.data.userToken,
      "Accept":"application/json","Content-Type":"application/json"
    };
    const cs=Date.now();

    $httpClient.post({
      url:BASE+CHECKIN_PATH,
      headers:checkHeaders,
      body:JSON.stringify({campaignId:campaignId}),
      timeout:30
    },function(err2,resp2,body2){
      const ce=Date.now()-cs;
      if(err2||!resp2)return finish("签到请求失败（"+ce+"ms）："+String(err2||"无响应"));
      const result=parseJson(body2);
      log("签到 HTTP "+resp2.status+"（"+ce+"ms），响应："+String(body2||"").slice(0,1000));

      if(resp2.status>=200&&resp2.status<300&&result&&Number(result.code)===0)
        return finish("签到接口执行成功");
      if(result&&Number(result.code)===240010)
        return finish("当前活动暂不可进入下一轮；请以 App 页面状态为准");
      if(result&&Number(result.code)===200000)
        return finish("Token 无效：服务端返回 Invalid user token");
      finish("签到接口返回业务错误或 HTTP 错误");
    });
  });
}
run();
