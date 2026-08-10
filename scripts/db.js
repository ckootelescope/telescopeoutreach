const fs=require('fs'),path=require('path');
const {Client}=require('pg');
function url(){
  const env={};
  fs.readFileSync(path.join(__dirname,'..','.env'),'utf-8').split(/\r?\n/).forEach(l=>{const i=l.indexOf('=');if(i>0)env[l.slice(0,i).trim()]=l.slice(i+1).trim();});
  const u=env.SUPABASE_DB_URL||env.DATABASE_URL;
  if(!u)throw new Error('SUPABASE_DB_URL not set in .env');
  return u;
}
async function connect(){
  const c=new Client({connectionString:url(),ssl:{rejectUnauthorized:false}});
  await c.connect();
  return c;
}
module.exports={connect,url};
if(require.main===module){
  (async()=>{
    const c=await connect();
    const r=await c.query("select current_database() db, current_user usr, split_part(version(),',',1) ver, now()::date today");
    console.log(JSON.stringify(r.rows[0],null,1));
    const t=await c.query("select table_name from information_schema.tables where table_schema='public' order by 1");
    console.log('existing public tables: '+(t.rows.length?t.rows.map(x=>x.table_name).join(', '):'(none)'));
    await c.end();
  })().catch(e=>{console.error('CONNECTION FAILED: '+e.message);process.exit(1);});
}
