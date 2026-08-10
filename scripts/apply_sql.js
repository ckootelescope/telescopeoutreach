const fs=require('fs');const {connect}=require('./db');
(async()=>{
  const files=process.argv.slice(2);
  const c=await connect();
  for(const f of files){
    const sql=fs.readFileSync(f,'utf-8');
    try{ await c.query(sql); console.log('applied: '+f); }
    catch(e){ console.error('FAILED '+f+': '+e.message); await c.end(); process.exit(1); }
  }
  const t=await c.query("select table_name from information_schema.tables where table_schema='public' order by 1");
  const v=await c.query("select table_name from information_schema.views where table_schema='public' order by 1");
  console.log('tables: '+t.rows.map(x=>x.table_name).join(', '));
  console.log('views:  '+v.rows.map(x=>x.table_name).join(', '));
  await c.end();
})().catch(e=>{console.error('ERR '+e.message);process.exit(1);});
