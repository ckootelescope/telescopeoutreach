const https=require('https'),fs=require('fs'),path=require('path');
const env={};fs.readFileSync(path.join(__dirname,'..','.env'),'utf-8').split('\n').forEach(l=>{const i=l.indexOf('=');if(i>0)env[l.slice(0,i).trim()]=l.slice(i+1).trim();});
function req(o,b){return new Promise((res,rej)=>{const r=https.request(o,x=>{let d='';x.on('data',c=>d+=c);x.on('end',()=>res({s:x.statusCode,b:d}))});r.on('error',rej);if(b)r.write(b);r.end();});}
async function token(){const body=new URLSearchParams({client_id:env.GMAIL_CLIENT_ID,client_secret:env.GMAIL_CLIENT_SECRET,refresh_token:env.GMAIL_REFRESH_TOKEN,grant_type:'refresh_token'}).toString();
const r=await req({hostname:'oauth2.googleapis.com',path:'/token',method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'}},body);
if(r.s!==200)throw new Error(r.b);return JSON.parse(r.b).access_token;}
async function main(){
 const [cmd,sheetId,arg3,arg4]=process.argv.slice(2);
 const t=await token();
 if(cmd==='tabs'){
  const r=await req({hostname:'sheets.googleapis.com',path:'/v4/spreadsheets/'+sheetId+'?fields=sheets.properties',method:'GET',headers:{Authorization:'Bearer '+t}});
  if(r.s!==200){console.error(r.s,r.b.slice(0,400));process.exit(1);}
  JSON.parse(r.b).sheets.forEach(s=>console.log(s.properties.sheetId+'  |  '+s.properties.title+'  |  rows '+s.properties.gridProperties.rowCount+' cols '+s.properties.gridProperties.columnCount));
  return;
 }
 if(cmd==='read'){
  const r=await req({hostname:'sheets.googleapis.com',path:'/v4/spreadsheets/'+sheetId+'/values/'+encodeURIComponent(arg3),method:'GET',headers:{Authorization:'Bearer '+t}});
  if(r.s!==200){console.error(r.s,r.b.slice(0,400));process.exit(1);}
  const v=JSON.parse(r.b).values||[];
  fs.writeFileSync(path.join(__dirname,'..','_sheet_read.json'),JSON.stringify(v));
  console.log('rows',v.length);
  v.slice(0,Number(arg4||8)).forEach((row,i)=>console.log(i+': '+JSON.stringify(row)));
  return;
 }
 if(cmd==='append'){
  const rows=JSON.parse(fs.readFileSync(arg4,'utf8'));
  const body=JSON.stringify({values:rows});
  const p='/v4/spreadsheets/'+sheetId+'/values/'+encodeURIComponent(arg3)+':append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS';
  const r=await req({hostname:'sheets.googleapis.com',path:p,method:'POST',headers:{Authorization:'Bearer '+t,'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}},body);
  if(r.s<200||r.s>=300){console.error(r.s,r.b.slice(0,600));process.exit(1);}
  console.log('appended',rows.length,'rows ->',JSON.parse(r.b).updates.updatedRange);
  return;
 }
 if(cmd==='update'){
  const rows=JSON.parse(fs.readFileSync(arg4,'utf8'));
  const body=JSON.stringify({values:rows});
  const p='/v4/spreadsheets/'+sheetId+'/values/'+encodeURIComponent(arg3)+'?valueInputOption=USER_ENTERED';
  const r=await req({hostname:'sheets.googleapis.com',path:p,method:'PUT',headers:{Authorization:'Bearer '+t,'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}},body);
  if(r.s<200||r.s>=300){console.error(r.s,r.b.slice(0,600));process.exit(1);}
  console.log('updated ->',JSON.parse(r.b).updatedRange);
  return;
 }
 console.error('usage: tabs|read|append|update');
}
main().catch(e=>{console.error('ERR',e.message);process.exit(1);});
