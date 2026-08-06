const https=require('https'),fs=require('fs'),path=require('path');
const env={};fs.readFileSync(path.join(__dirname,'..','.env'),'utf-8').split('\n').forEach(l=>{const i=l.indexOf('=');if(i>0)env[l.slice(0,i).trim()]=l.slice(i+1).trim();});
function req(o,b){return new Promise((res,rej)=>{const r=https.request(o,x=>{let d='';x.on('data',c=>d+=c);x.on('end',()=>res({s:x.statusCode,b:d}))});r.on('error',rej);if(b)r.write(b);r.end();});}
async function token(){const body=new URLSearchParams({client_id:env.GMAIL_CLIENT_ID,client_secret:env.GMAIL_CLIENT_SECRET,refresh_token:env.GMAIL_REFRESH_TOKEN,grant_type:'refresh_token'}).toString();
const r=await req({hostname:'oauth2.googleapis.com',path:'/token',method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'}},body);return JSON.parse(r.b).access_token;}
function walk(p,acc){if(!p)return acc;if(p.mimeType==='text/plain'&&p.body&&p.body.data)acc.push(Buffer.from(p.body.data,'base64').toString('utf8'));(p.parts||[]).forEach(x=>walk(x,acc));return acc;}
async function main(){
 const t=await token();
 for(const id of process.argv.slice(2)){
  const r=await req({hostname:'gmail.googleapis.com',path:'/gmail/v1/users/me/messages/'+id+'?format=full',method:'GET',headers:{Authorization:'Bearer '+t}});
  const j=JSON.parse(r.b);const h={};(j.payload.headers||[]).forEach(x=>h[x.name.toLowerCase()]=x.value);
  console.log('TO: '+h.to+'\nSUBJ: '+h.subject+'\n---');
  console.log(walk(j.payload,[]).join('\n').split(/Best,\s*\nCalvin/)[0].trim());
 }
}
main().catch(e=>{console.error('ERR',e.message);process.exit(1);});
