const https=require('https'),fs=require('fs'),path=require('path');
const env={};fs.readFileSync(path.join(__dirname,'..','.env'),'utf-8').split('\n').forEach(l=>{const i=l.indexOf('=');if(i>0)env[l.slice(0,i).trim()]=l.slice(i+1).trim();});
function req(o,b){return new Promise((res,rej)=>{const r=https.request(o,x=>{let d='';x.on('data',c=>d+=c);x.on('end',()=>res({s:x.statusCode,b:d}))});r.on('error',rej);if(b)r.write(b);r.end();});}
async function token(){const body=new URLSearchParams({client_id:env.GMAIL_CLIENT_ID,client_secret:env.GMAIL_CLIENT_SECRET,refresh_token:env.GMAIL_REFRESH_TOKEN,grant_type:'refresh_token'}).toString();
const r=await req({hostname:'oauth2.googleapis.com',path:'/token',method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'}},body);return JSON.parse(r.b).access_token;}
async function main(){
 const t=await token();
 const lr=await req({hostname:'gmail.googleapis.com',path:'/gmail/v1/users/me/labels',method:'GET',headers:{Authorization:'Bearer '+t}});
 const labels=JSON.parse(lr.b).labels||[];
 const match=labels.filter(l=>/company call/i.test(l.name));
 console.log('matching labels:');
 match.forEach(l=>console.log('  '+l.id+'  '+l.name));
 if(!match.length){console.log('ALL LABELS:');labels.forEach(l=>console.log('  '+l.name));return;}
 for(const lab of match){
  let pageToken=null,ids=[];
  do{
   const p='/gmail/v1/users/me/threads?maxResults=200&labelIds='+encodeURIComponent(lab.id)+(pageToken?'&pageToken='+pageToken:'');
   const r=await req({hostname:'gmail.googleapis.com',path:p,method:'GET',headers:{Authorization:'Bearer '+t}});
   const j=JSON.parse(r.b);(j.threads||[]).forEach(x=>ids.push(x.id));pageToken=j.nextPageToken;
  }while(pageToken);
  console.log('');
  console.log('### '+lab.name+' -> '+ids.length+' threads');
  const out=[];
  for(const id of ids){
   const r=await req({hostname:'gmail.googleapis.com',path:'/gmail/v1/users/me/threads/'+id+'?format=metadata&metadataHeaders=To&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date',method:'GET',headers:{Authorization:'Bearer '+t}});
   if(r.s!==200)continue;
   const j=JSON.parse(r.b);
   const msgs=j.messages||[];
   const hs=msgs.map(m=>{const h={};(m.payload.headers||[]).forEach(x=>h[x.name.toLowerCase()]=x.value);return {h,ts:Number(m.internalDate)};});
   const first=hs[0];
   const inbound=hs.filter(x=>!/calvin@telescopepartners\.com/i.test(x.h.from||''));
   const counterparties=[...new Set(hs.flatMap(x=>((x.h.to||'')+' '+(x.h.from||'')).match(/[\w.+-]+@[\w.-]+/g)||[]))].filter(e=>!/telescopepartners\.com/i.test(e));
   out.push({subject:first.h.subject,msgs:msgs.length,inbound:inbound.length,last:new Date(hs[hs.length-1].ts-7*3600e3).toISOString().slice(0,10),who:counterparties.join(',')});
  }
  out.sort((a,b)=>a.last.localeCompare(b.last));
  out.forEach(o=>console.log('  '+o.last+' | msgs '+o.msgs+' | inbound '+o.inbound+' | '+o.who.padEnd(34)+' | '+o.subject));
  fs.writeFileSync(path.join(__dirname,'..','_label_out.json'),JSON.stringify(out,null,1));
 }
}
main().catch(e=>{console.error('ERR',e.message);process.exit(1);});
