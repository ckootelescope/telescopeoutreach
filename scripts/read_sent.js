const https=require('https'),fs=require('fs'),path=require('path');
const env={};fs.readFileSync(path.join(__dirname,'..','.env'),'utf-8').split('\n').forEach(l=>{const i=l.indexOf('=');if(i>0)env[l.slice(0,i).trim()]=l.slice(i+1).trim();});
function req(o,b){return new Promise((res,rej)=>{const r=https.request(o,x=>{let d='';x.on('data',c=>d+=c);x.on('end',()=>res({s:x.statusCode,b:d}))});r.on('error',rej);if(b)r.write(b);r.end();});}
async function token(){const body=new URLSearchParams({client_id:env.GMAIL_CLIENT_ID,client_secret:env.GMAIL_CLIENT_SECRET,refresh_token:env.GMAIL_REFRESH_TOKEN,grant_type:'refresh_token'}).toString();
const r=await req({hostname:'oauth2.googleapis.com',path:'/token',method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'}},body);
if(r.s!==200)throw new Error(r.b);return JSON.parse(r.b).access_token;}
async function main(){
 const t=await token(); const q=process.argv[2]||'in:sent after:2026/07/29';
 let pageToken=null, ids=[];
 do{
  const p='/gmail/v1/users/me/messages?maxResults=500&q='+encodeURIComponent(q)+(pageToken?'&pageToken='+pageToken:'');
  const r=await req({hostname:'gmail.googleapis.com',path:p,method:'GET',headers:{Authorization:'Bearer '+t}});
  if(r.s!==200){console.error(r.s,r.b.slice(0,500));process.exit(1);}
  const j=JSON.parse(r.b); (j.messages||[]).forEach(m=>ids.push(m.id)); pageToken=j.nextPageToken;
 }while(pageToken);
 console.error('messages',ids.length);
 const out=[];
 for(let i=0;i<ids.length;i++){
  const p='/gmail/v1/users/me/messages/'+ids[i]+'?format=metadata&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date&metadataHeaders=From&metadataHeaders=In-Reply-To';
  const r=await req({hostname:'gmail.googleapis.com',path:p,method:'GET',headers:{Authorization:'Bearer '+t}});
  if(r.s!==200){console.error('skip',ids[i],r.s);continue;}
  const j=JSON.parse(r.b); const h={}; (j.payload.headers||[]).forEach(x=>h[x.name.toLowerCase()]=x.value);
  out.push({id:j.id,threadId:j.threadId,ts:Number(j.internalDate),date:new Date(Number(j.internalDate)).toISOString(),to:h.to||'',subject:h.subject||'',from:h.from||'',inReplyTo:h['in-reply-to']||''});
 }
 fs.writeFileSync(path.join(__dirname,'..','_sent_read.json'),JSON.stringify(out,null,1));
 console.error('wrote _sent_read.json', out.length);
}
main().catch(e=>{console.error('ERR',e.message);process.exit(1);});
