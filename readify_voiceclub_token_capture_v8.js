/*
 * Readify Token Capture for Loon v8
 * Only handles http-response /api/users/tokens.
 */
const TOKEN_PATH = "/api/users/tokens";
const KEY_TOKEN = "readify_v8_x_token";
const KEY_REFRESH = "readify_v8_x_refresh_token";
const KEY_TOKEN_EXPIRE = "readify_v8_token_expire";
const KEY_REFRESH_EXPIRE = "readify_v8_refresh_expire";

function log(s){ console.log("[Readify-Capture] " + s); }
function writeStore(k,v){ try{return $persistentStore.write(String(v||""),k);}catch(e){return false;} }
function parseJson(s){ try{return JSON.parse(s||"{}");}catch(e){return null;} }
function done(msg){ log(msg); try{$done({});}catch(e){} }

const url=($request&&$request.url)||"";
if(url.indexOf(TOKEN_PATH)<0){
  done("非 Token 接口，跳过");
}else{
  const obj=parseJson($response&&$response.body);
  if(!obj||Number(obj.code)!==0||!obj.data){
    done("Token 响应无可用凭据，不更新本地 Token");
  }else{
    let changed=false;
    if(obj.data.userToken){writeStore(KEY_TOKEN,obj.data.userToken);changed=true;}
    if(obj.data.refreshToken){writeStore(KEY_REFRESH,obj.data.refreshToken);changed=true;}
    if(obj.data.userTokenExpire)writeStore(KEY_TOKEN_EXPIRE,obj.data.userTokenExpire);
    if(obj.data.refreshTokenExpire)writeStore(KEY_REFRESH_EXPIRE,obj.data.refreshTokenExpire);
    done(changed?"已保存 App 返回的新 Token/Refresh Token":"响应成功，但没有新的 Token 字段");
  }
}
