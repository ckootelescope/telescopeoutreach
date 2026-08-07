const https=require('https'),fs=require('fs'),path=require('path');
const env={};fs.readFileSync(path.join(__dirname,'..','.env'),'utf-8').split('\n').forEach(l=>{const i=l.indexOf('=');if(i>0)env[l.slice(0,i).trim()]=l.slice(i+1).trim();});
function req(o,b){return new Promise((res,rej)=>{const r=https.request(o,x=>{let d='';x.on('data',c=>d+=c);x.on('end',()=>res({s:x.statusCode,b:d}))});r.on('error',rej);if(b)r.write(b);r.end();});}
async function token(){const body=new URLSearchParams({client_id:env.GMAIL_CLIENT_ID,client_secret:env.GMAIL_CLIENT_SECRET,refresh_token:env.GMAIL_REFRESH_TOKEN,grant_type:'refresh_token'}).toString();
const r=await req({hostname:'oauth2.googleapis.com',path:'/token',method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'}},body);return JSON.parse(r.b).access_token;}
function walk(p,acc){if(!p)return acc;if(p.mimeType==='text/plain'&&p.body&&p.body.data)acc.push(Buffer.from(p.body.data,'base64').toString('utf8'));(p.parts||[]).forEach(x=>walk(x,acc));return acc;}
async function main(){
 const t=await token();
 const tg=JSON.parse(fs.readFileSync(path.join(__dirname,'..','_e4_targets.json'),'utf8'));
 const out=[];
 for(const x of tg){
  const r=await req({hostname:'gmail.googleapis.com',path:'/gmail/v1/users/me/messages?maxResults=20&q='+encodeURIComponent('in:sent from:calvin@telescopepartners.com to:'+x.email),method:'GET',headers:{Authorization:'Bearer '+t}});
  const ms=(JSON.parse(r.b).messages)||[];
  let best=null;
  for(const m of ms){
   const rr=await req({hostname:'gmail.googleapis.com',path:'/gmail/v1/users/me/messages/'+m.id+'?format=full',method:'GET',headers:{Authorization:'Bearer '+t}});
   if(rr.s!==200)continue;
   const j=JSON.parse(rr.b);const h={};(j.payload.headers||[]).forEach(y=>h[y.name.toLowerCase()]=y.value);
   const ts=Number(j.internalDate);
   const body=walk(j.payload,[]).join('\n').split(/Best,\s*\nCalvin/)[0].replace(/\r/g,'').trim();
   if(!best||ts<best.ts)best={ts,subject:h.subject,body,threadId:j.threadId};
  }
  out.push({...x,e1Subject:best&&best.subject,e1:best?best.body.replace(/\n+/g,' ').slice(0,900):null});
  console.error('.'+x.company);
 }
 fs.writeFileSync(path.join(__dirname,'..','_e4_ctx.json'),JSON.stringify(out,null,1));
 out.forEach(o=>{console.log('=== '+o.company+' | '+(o.e1Subject||'?'));console.log(o.e1||'NO BODY');console.log('');});
}
main().catch(e=>{console.error('ERR',e.message);process.exit(1);});
