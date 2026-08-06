const https=require('https'),fs=require('fs'),path=require('path');
const env={};fs.readFileSync(path.join(__dirname,'..','.env'),'utf-8').split('\n').forEach(l=>{const i=l.indexOf('=');if(i>0)env[l.slice(0,i).trim()]=l.slice(i+1).trim();});
function req(o,b){return new Promise((res,rej)=>{const r=https.request(o,x=>{let d='';x.on('data',c=>d+=c);x.on('end',()=>res({s:x.statusCode,b:d}))});r.on('error',rej);if(b)r.write(b);r.end();});}
async function token(){const body=new URLSearchParams({client_id:env.GMAIL_CLIENT_ID,client_secret:env.GMAIL_CLIENT_SECRET,refresh_token:env.GMAIL_REFRESH_TOKEN,grant_type:'refresh_token'}).toString();
const r=await req({hostname:'oauth2.googleapis.com',path:'/token',method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'}},body);
if(r.s!==200)throw new Error(r.b);return JSON.parse(r.b).access_token;}
function walk(p,acc){if(!p)return acc;if(p.mimeType==='text/plain'&&p.body&&p.body.data)acc.push(Buffer.from(p.body.data,'base64').toString('utf8'));(p.parts||[]).forEach(x=>walk(x,acc));return acc;}
async function main(){
 const t=await token(); const tg=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
 const out=[];
 for(const x of tg){
  const r=await req({hostname:'gmail.googleapis.com',path:'/gmail/v1/users/me/messages/'+x.msgId+'?format=full',method:'GET',headers:{Authorization:'Bearer '+t}});
  if(r.s!==200){console.error('skip',x.email);continue;}
  const j=JSON.parse(r.b);
  let body=walk(j.payload,[]).join('\n');
  body=body.split(/Best,\s*\nCalvin/)[0].replace(/\r/g,'').trim();
  out.push({...x,body});
  console.log('=== '+x.email+' | '+x.subject+' | '+x.sentPT);
  console.log(body.slice(0,700));
  console.log('');
 }
 fs.writeFileSync(path.join(__dirname,'..','_bodies.json'),JSON.stringify(out,null,1));
}
main().catch(e=>{console.error('ERR',e.message);process.exit(1);});
