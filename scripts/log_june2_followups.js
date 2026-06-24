const path = require('path');
const logTracker = path.join(__dirname, 'log_tracker.js');

const companies = [
  ['ZeroDrift','zerodrift.ai','Kumesh','kumesh@zerodrift.ai','19e8984272069ae0','2026-06-02T18:06:40Z'],
  ['Nox Metals','noxmetals.co','Zane','zane@noxmetals.co','19e89825e99d8247','2026-06-02T18:04:43Z'],
  ['Prox','useprox.com','Gregory','greg@useprox.com','19e898211b634709','2026-06-02T18:04:23Z'],
  ['Kinth','kinth.ai','Arhon','arhons@kinth.ai','19e898164025cefc','2026-06-02T18:03:39Z'],
  ['Nebula','trynebula.ai','Akshat','akshat@trynebula.ai','19e8981127019684','2026-06-02T18:03:18Z'],
  ['Reviva','joinreviva.com','Valerie','valerie@joinreviva.com','19e897eb1af20820','2026-06-02T18:00:42Z'],
  ['Fireproof','fireprooftech.com','Nate','nate@fireprooftech.com','19e897bea3679bc2','2026-06-02T17:57:40Z'],
  ['Onetera','onetera.com','Felix','felix@onetera.com','19e897aed29f06b7','2026-06-02T17:56:35Z'],
  ['Continuum','oncontinuum.com','Daniel','daniel@oncontinuum.com','19e897a4dc9c48e4','2026-06-02T17:55:54Z'],
  ['Qued','qued.com','Prasad','prasad@qued.com','19e897952f5d55b4','2026-06-02T17:54:50Z'],
  ['Paraglide','paraglide.ai','Rasmus','rasmus@paraglide.ai','19e897863fd55f60','2026-06-02T17:53:49Z'],
  ['Zeit','zeit-ai.com','Leopold','leopold@zeit-ai.com','19e8977b01447a2b','2026-06-02T17:53:03Z'],
  ['Olympian','getolympian.co','Brendan','brendan@getolympian.co','19e89769ecc2d869','2026-06-02T17:51:53Z'],
  ['Tero','usetero.com','Ben','ben@usetero.com','19e8976066e15661','2026-06-02T17:51:14Z'],
  ['Blue Pill','blue-pill.ai','Ankit','ad@blue-pill.ai','19e89746592d8f8b','2026-06-02T17:49:27Z'],
  ['ThirdLaw','thirdlaw.io','Ed','ed@thirdlaw.io','19e8973d6450046c','2026-06-02T17:48:51Z'],
  ['Ferry','deployferry.io','Ethan','ethan@deployferry.io','19e8972cb791998c','2026-06-02T17:47:42Z'],
  ['Pensar','pensarai.com','Kyle','kyle@pensarai.com','19e897259903516b','2026-06-02T17:47:13Z'],
  ['Frugal','frugal.co','Mike','mike@frugal.co','19e8971b871d14d5','2026-06-02T17:46:32Z'],
  ['SAMMY Labs','sammylabs.com','Joe','joe@sammylabs.com','19e8971243dda35b','2026-06-02T17:45:54Z'],
  ['Trace','trace.so','Tim','tim@trace.so','19e897040221c5f2','2026-06-02T17:44:56Z'],
  ['Archie','heyarchie.ai','Stuart','stuart@heyarchie.ai','19e896c54fdedeb4','2026-06-02T17:40:39Z'],
  ['Zalion','zalion.ai','Tim','tim.geyer@zalion.ai','19e896bd9ecf78e0','2026-06-02T17:40:07Z'],
  ['Tofu','hiretofu.com','Jason','jason@hiretofu.com','19e896b55ab3f8ba','2026-06-02T17:39:33Z']
];

const entries = [];
companies.forEach(([co, dom, fn, em, tid, ts]) => {
  entries.push({company:co,domain:dom,founder:fn,email:em,event:'FOLLOWUP_SCHEDULED',email_stage:'Email 2',thread_id:tid,timestamp:ts,notes:'Jun 4'});
  entries.push({company:co,domain:dom,founder:fn,email:em,event:'FOLLOWUP_SCHEDULED',email_stage:'Email 3',thread_id:tid,timestamp:ts,notes:'Jun 7'});
  entries.push({company:co,domain:dom,founder:fn,email:em,event:'FOLLOWUP_SCHEDULED',email_stage:'Email 4',thread_id:tid,timestamp:ts,notes:'Jun 9'});
  entries.push({company:co,domain:dom,founder:fn,email:em,event:'LINKEDIN_REMINDER_SET',email_stage:'',thread_id:tid,timestamp:ts,notes:'Connect Jun 5, Message Jun 8'});
});

process.argv = [process.argv[0], process.argv[1], JSON.stringify(entries)];
require(logTracker);
