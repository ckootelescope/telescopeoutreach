const https=require('https'),fs=require('fs'),path=require('path');
const env={};fs.readFileSync(path.join(__dirname,'..','.env'),'utf-8').split('\n').forEach(l=>{const i=l.indexOf('=');if(i>0)env[l.slice(0,i).trim()]=l.slice(i+1).trim();});
function req(o,b){return new Promise((res,rej)=>{const r=https.request(o,x=>{let d='';x.on('data',c=>d+=c);x.on('end',()=>res({s:x.statusCode,b:d}))});r.on('error',rej);if(b)r.write(b);r.end();});}
async function token(){const body=new URLSearchParams({client_id:env.GMAIL_CLIENT_ID,client_secret:env.GMAIL_CLIENT_SECRET,refresh_token:env.GMAIL_REFRESH_TOKEN,grant_type:'refresh_token'}).toString();
const r=await req({hostname:'oauth2.googleapis.com',path:'/token',method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'}},body);return JSON.parse(r.b).access_token;}
async function main(){
 const t=await token();
 const targets=JSON.parse(fs.readFileSync(path.join(__dirname,'..','_audit_targets.json'),'utf8'));
 const out=[];
 for(const tg of targets){
  const q='in:sent from:calvin@telescopepartners.com to:'+tg.email;
  const r=await req({hostname:'gmail.googleapis.com',path:'/gmail/v1/users/me/messages?maxResults=30&q='+encodeURIComponent(q),method:'GET',headers:{Authorization:'Bearer '+t}});
  const ms=(JSON.parse(r.b).messages)||[];
  const dates=[];
  for(const m of ms){
   const rr=await req({hostname:'gmail.googleapis.com',path:'/gmail/v1/users/me/messages/'+m.id+'?format=metadata&metadataHeaders=Date',method:'GET',headers:{Authorization:'Bearer '+t}});
   if(rr.s!==200)continue;
   const j=JSON.parse(rr.b);
   dates.push(new Date(Number(j.internalDate)-7*3600e3).toISOString().slice(0,10));
  }
  dates.sort();
  out.push({...tg,sends:dates.length,first:dates[0]||null,last:dates[dates.length-1]||null,dates});
  console.error('.'+tg.company);
 }
 fs.writeFileSync(path.join(__dirname,'..','_audit_out.json'),JSON.stringify(out,null,1));
 console.log('done',out.length);
}
main().catch(e=>{console.error('ERR',e.message);process.exit(1);});
