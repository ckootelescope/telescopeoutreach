const fs=require('fs'),path=require('path');
function parseCSV(text){
  const rows=[];let row=[],field='',q=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(q){
      if(c==='"'){ if(text[i+1]==='"'){field+='"';i++;} else q=false; }
      else field+=c;
    } else {
      if(c==='"')q=true;
      else if(c===','){row.push(field);field='';}
      else if(c==='\r'){}
      else if(c==='\n'){row.push(field);rows.push(row);row=[];field='';}
      else field+=c;
    }
  }
  if(field.length||row.length){row.push(field);rows.push(row);}
  return rows;
}
const src=path.join(__dirname,'..','data','activity_log.csv');
const rows=parseCSV(fs.readFileSync(src,'utf8')).filter(r=>r.some(c=>String(c).trim()));
fs.writeFileSync(path.join(__dirname,'..','_tracker_read.json'),JSON.stringify(rows));
console.log('rows parsed (incl header): '+rows.length);
console.log('header: '+JSON.stringify(rows[0]));
const acts={};rows.slice(1).forEach(r=>{acts[r[5]||'(blank)']=(acts[r[5]||'(blank)']||0)+1});
console.log('actions: '+JSON.stringify(acts));
