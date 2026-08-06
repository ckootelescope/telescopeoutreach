const https=require('https'),fs=require('fs'),path=require('path');
const env={};fs.readFileSync(path.join(__dirname,'..','.env'),'utf-8').split('\n').forEach(l=>{const i=l.indexOf('=');if(i>0)env[l.slice(0,i).trim()]=l.slice(i+1).trim();});
function req(o,b){return new Promise((res,rej)=>{const r=https.request(o,x=>{let d='';x.on('data',c=>d+=c);x.on('end',()=>res({s:x.statusCode,b:d}))});r.on('error',rej);if(b)r.write(b);r.end();});}
async function token(){const body=new URLSearchParams({client_id:env.GMAIL_CLIENT_ID,client_secret:env.GMAIL_CLIENT_SECRET,refresh_token:env.GMAIL_REFRESH_TOKEN,grant_type:'refresh_token'}).toString();
const r=await req({hostname:'oauth2.googleapis.com',path:'/token',method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'}},body);
if(r.s!==200)throw new Error(r.b);return JSON.parse(r.b).access_token;}
async function search(t,q){
 const p='/gmail/v1/users/me/messages?maxResults=20&q='+encodeURIComponent(q);
 const r=await req({hostname:'gmail.googleapis.com',path:p,method:'GET',headers:{Authorization:'Bearer '+t}});
 if(r.s!==200){console.error('ERR',r.s,r.b.slice(0,200));return [];}
 return JSON.parse(r.b).messages||[];
}
async function meta(t,id){
 const p='/gmail/v1/users/me/messages/'+id+'?format=metadata&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date';
 const r=await req({hostname:'gmail.googleapis.com',path:p,method:'GET',headers:{Authorization:'Bearer '+t}});
 if(r.s!==200)return null; const j=JSON.parse(r.b);const h={};(j.payload.headers||[]).forEach(x=>h[x.name.toLowerCase()]=x.value);
 return {date:new Date(Number(j.internalDate)).toISOString().slice(0,10),to:h.to,subject:h.subject};
}
async function main(){
 const t=await token();
 const targets=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
 const out={};
 for(const tg of targets){
  const q='in:sent from:calvin@telescopepartners.com to:'+tg.domain+' before:'+tg.before;
  const ms=await search(t,q);
  const details=[];
  for(const m of ms.slice(0,6)){const d=await meta(t,m.id); if(d)details.push(d);}
  out[tg.domain]={count:ms.length,details};
  console.log(tg.domain.padEnd(26),'prior sends by Calvin:',ms.length, details.map(d=>d.date+' '+d.subject).slice(0,3).join(' ;; '));
 }
 fs.writeFileSync(path.join(__dirname,'..','_prior_check.json'),JSON.stringify(out,null,1));
}
main().catch(e=>{console.error('ERR',e.message);process.exit(1);});
