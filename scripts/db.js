const fs=require('fs'),path=require('path');
const {Client}=require('pg');
function url(){
  const env={};
  fs.readFileSync(path.join(__dirname,'..','.env'),'utf-8').split(/\r?\n/).forEach(l=>{const i=l.indexOf('=');if(i>0)env[l.slice(0,i).trim()]=l.slice(i+1).trim();});
  const u=env.SUPABASE_DB_URL||env.DATABASE_URL;
  if(!u)throw new Error('SUPABASE_DB_URL not set in .env');
  return u;
}
async function raw(){
  // Several scripts hold this open while sweeping Gmail, which can idle the
  // socket long enough for the pooler to drop it. Keepalive stops that showing
  // up as an unhandled ECONNRESET halfway through a run.
  const c=new Client({
    connectionString:url(),
    ssl:{rejectUnauthorized:false},
    keepAlive:true,
    keepAliveInitialDelayMillis:10000,
    statement_timeout:60000,
  });
  // pg emits 'error' on the client for connection-level failures; without a
  // listener node treats it as fatal and kills the process mid-run.
  c.on('error',e=>console.error('db connection error: '+e.message));
  await c.connect();
  return c;
}
// Keepalive alone is not enough: mark_sent and sync_replies sweep Gmail for
// minutes between queries and the pooler still drops the socket, which surfaces
// as ECONNRESET on the next query and loses the whole run. Reconnect once and
// replay that query instead.
const DEAD=/ECONNRESET|Connection terminated|not queryable|server closed|socket hang up|ETIMEDOUT|EPIPE/i;
async function connect(){
  let c=await raw(), depth=0;
  const track=sql=>{
    const s=String(sql||'').trim().toLowerCase();
    if(/^begin\b|^start\s+transaction\b/.test(s))depth++;
    else if(/^commit\b|^rollback\b/.test(s))depth=Math.max(0,depth-1);
  };
  return {
    async query(sql,...rest){
      try{const r=await c.query(sql,...rest);track(sql);return r;}
      catch(e){
        // Mid-transaction the reconnect would silently drop every uncommitted
        // write and let the rest of the script run as if it had landed. Fail
        // loudly instead; new_cadence and migrate depend on that.
        if(!DEAD.test(e&&e.message||'')||depth>0)throw e;
        console.error('db reconnecting after: '+e.message);
        try{await c.end();}catch(_){}
        c=await raw();
        const r=await c.query(sql,...rest);track(sql);return r;
      }
    },
    async end(){try{await c.end();}catch(_){}},
    get client(){return c;},
  };
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
