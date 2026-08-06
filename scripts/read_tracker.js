const https = require('https');
const fs = require('fs');
const path = require('path');
const envPath = path.join(__dirname, '..', '.env');
const env = {};
fs.readFileSync(envPath,'utf-8').split('\n').forEach(l=>{const i=l.indexOf('=');if(i>0)env[l.slice(0,i).trim()]=l.slice(i+1).trim();});
const SHEET_ID = '1Sk9HndYNzXj_tHg8-T4EGqSqkPk1QKXH2UOQt23s7CA';
function req(o,b){return new Promise((res,rej)=>{const r=https.request(o,x=>{let d='';x.on('data',c=>d+=c);x.on('end',()=>res({statusCode:x.statusCode,body:d}))});r.on('error',rej);if(b)r.write(b);r.end();});}
async function token(){const b=new URLSearchParams({client_id:env.GMAIL_CLIENT_ID,client_secret:env.GMAIL_CLIENT_SECRET,refresh_token:env.GMAIL_REFRESH_TOKEN,grant_type:'refresh_token'}).toString();
const r=await req({hostname:'oauth2.googleapis.com',path:'/token',method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'}},b);
if(r.statusCode!==200)throw new Error(r.body);return JSON.parse(r.body).access_token;}
async function main(){
 const t=await token();
 const tab = process.argv[2] || 'Activity Log';
 if(tab==='--tabs'){
   const r=await req({hostname:'sheets.googleapis.com',path:'/v4/spreadsheets/'+SHEET_ID+'?fields=sheets.properties',method:'GET',headers:{Authorization:'Bearer '+t}});
   console.log(r.body); return;
 }
 const r=await req({hostname:'sheets.googleapis.com',path:'/v4/spreadsheets/'+SHEET_ID+'/values/'+encodeURIComponent(tab+'!A:J'),method:'GET',headers:{Authorization:'Bearer '+t}});
 if(r.statusCode!==200){console.error(r.statusCode,r.body);process.exit(1);}
 const v=JSON.parse(r.body).values||[];
 console.log('ROWS',v.length);
 console.log(JSON.stringify(v.slice(0,2)));
 fs.writeFileSync(path.join(__dirname,'..','_tracker_read.json'),JSON.stringify(v));
 console.log('written to _tracker_read.json');
}
main().catch(e=>{console.error('ERR',e.message);process.exit(1);});
