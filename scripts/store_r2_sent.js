const https=require('https'),fs=require('fs'),path=require('path');
const env={};fs.readFileSync(path.join(__dirname,'..','.env'),'utf-8').split('\n').forEach(l=>{const i=l.indexOf('=');if(i>0)env[l.slice(0,i).trim()]=l.slice(i+1).trim();});
function req(o,b){return new Promise((res,rej)=>{const r=https.request(o,x=>{let d='';x.on('data',c=>d+=c);x.on('end',()=>res({s:x.statusCode,b:d}))});r.on('error',rej);if(b)r.write(b);r.end();});}
async function token(){const body=new URLSearchParams({client_id:env.GMAIL_CLIENT_ID,client_secret:env.GMAIL_CLIENT_SECRET,refresh_token:env.GMAIL_REFRESH_TOKEN,grant_type:'refresh_token'}).toString();
const r=await req({hostname:'oauth2.googleapis.com',path:'/token',method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'}},body);return JSON.parse(r.b).access_token;}
function walk(p,acc){if(!p)return acc;if((p.mimeType==='text/html'||p.mimeType==='text/plain')&&p.body&&p.body.data)acc.push({mime:p.mimeType,txt:Buffer.from(p.body.data,'base64').toString('utf8')});(p.parts||[]).forEach(x=>walk(x,acc));return acc;}
const MAP=JSON.parse(fs.readFileSync(path.join(__dirname,'..','_r2_map.json'),'utf8'));
async function main(){
 const t=await token(); const out=[];
 for(const m of MAP){
  const q='in:sent from:calvin@telescopepartners.com to:'+m.email+' subject:"Sequoia Spinout" after:2026/08/05';
  const r=await req({hostname:'gmail.googleapis.com',path:'/gmail/v1/users/me/messages?maxResults=5&q='+encodeURIComponent(q),method:'GET',headers:{Authorization:'Bearer '+t}});
  const ms=JSON.parse(r.b).messages||[];
  if(!ms.length){console.error('NO MSG for '+m.slug);continue;}
  const rr=await req({hostname:'gmail.googleapis.com',path:'/gmail/v1/users/me/messages/'+ms[0].id+'?format=full',method:'GET',headers:{Authorization:'Bearer '+t}});
  const j=JSON.parse(rr.b);
  const parts=walk(j.payload,[]);
  const html=(parts.find(p=>p.mime==='text/html')||{}).txt||'';
  const plain=(parts.find(p=>p.mime==='text/plain')||{}).txt||'';
  const sentPT=new Date(Number(j.internalDate)-7*3600e3).toISOString().slice(0,10);
  const dp=path.join(__dirname,'..','research',m.slug+'.json');
  if(!fs.existsSync(dp)){console.error('NO DOSSIER '+m.slug);continue;}
  const d=JSON.parse(fs.readFileSync(dp,'utf8'));
  d.round2=d.round2||{};
  d.round2.email1_body_sent=(html||plain).split(/Best,\s*<?br|Best,\s*\nCalvin/)[0].trim();
  d.round2.sentDate=sentPT;
  d.round2.threadId=j.threadId;
  d.round2.messageId=j.id;
  d.founder=d.founder||m.founder; d.email=d.email||m.email; d.domain=d.domain||m.domain;
  fs.writeFileSync(dp,JSON.stringify(d,null,2)+'\n');
  out.push({slug:m.slug,sentPT,threadId:j.threadId,len:d.round2.email1_body_sent.length});
  console.log(m.slug.padEnd(16),sentPT,'thread',j.threadId,'body',d.round2.email1_body_sent.length+'ch');
 }
 fs.writeFileSync(path.join(__dirname,'..','_r2_stored.json'),JSON.stringify(out,null,1));
 console.log('stored',out.length,'of',MAP.length);
}
main().catch(e=>{console.error('ERR',e.message);process.exit(1);});
