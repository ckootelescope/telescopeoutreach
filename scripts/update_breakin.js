const https = require('https');
const fs = require('fs');

const env = {};
fs.readFileSync('.env', 'utf-8').split('\n').forEach(l => {
  const [k,...v] = l.split('=');
  if (k && v.length) env[k.trim()] = v.join('=').trim();
});

function getAccessToken() {
  return new Promise((resolve) => {
    const postData = new URLSearchParams({
      client_id: env.GMAIL_CLIENT_ID, client_secret: env.GMAIL_CLIENT_SECRET,
      refresh_token: env.GMAIL_REFRESH_TOKEN, grant_type: 'refresh_token'
    }).toString();
    const req = https.request({
      hostname: 'oauth2.googleapis.com', path: '/token', method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': postData.length }
    }, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(JSON.parse(d).access_token)); });
    req.write(postData); req.end();
  });
}

function batchUpdate(token, requests) {
  return new Promise((resolve) => {
    const sheetId = '1-cjKaFsrXyUjUmZbKcEKr4g9u8ATjVeY0kb8v23CvQk';
    const body = JSON.stringify({ requests });
    const req = https.request({
      hostname: 'sheets.googleapis.com',
      path: '/v4/spreadsheets/' + sheetId + ':batchUpdate',
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(JSON.parse(d))); });
    req.write(body); req.end();
  });
}

function updateValues(token, range, values) {
  return new Promise((resolve) => {
    const sheetId = '1-cjKaFsrXyUjUmZbKcEKr4g9u8ATjVeY0kb8v23CvQk';
    const encodedRange = encodeURIComponent(range);
    const body = JSON.stringify({ range, values, majorDimension: 'ROWS' });
    const req = https.request({
      hostname: 'sheets.googleapis.com',
      path: '/v4/spreadsheets/' + sheetId + '/values/' + encodedRange + '?valueInputOption=USER_ENTERED',
      method: 'PUT',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(JSON.parse(d))); });
    req.write(body); req.end();
  });
}

async function main() {
  const token = await getAccessToken();
  const tabSheetId = 20215153;

  // Companies to remove (replied/spoken to)
  const removeDomains = new Set([
    'kiplingsecure.ai','cognitiveview.com','xtrace.ai','heypesto.com','superpanel.io',
    'freshline.io','coolr.com','ashler.ai','blaxel.ai','compuvi.com','dearbornlabs.com',
    'fakto.ai','kaizntree.com','getkroo.com','modernindustrials.com','onetera.com',
    'paraglide.ai','pictionhealth.com','rodeocpg.com','sitewire.co',
    'blue-pill.ai','oasys.health','rexi.finance','deepidv.com','noxmetals.co'
  ]);

  // Current May companies [name, domain]
  const mayCompanies = [
    ['Cotool','cotool.ai'],['RiskFront','riskfront.ai'],['WiseBee','wisebee.ai'],
    ['Entangl','entangl.ai'],['Advance','advancehq.com'],['ControlTheory','controltheory.com'],
    ['Freeflow','freeflow.ai'],['Hunted Labs','huntedlabs.io'],['APIContext','apicontext.com'],['Corgea','corgea.com'],
    ['DiversiFi','diversifi.ai'],['Faction','faction.ai'],['Corvera','corvera.ai'],['Contractor Commerce','contractorcommerce.com'],
    ['LaborUp','laborup.com'],['Soff','soff.ai'],['Turgon','turgon.ai'],['FlowGen Labs','flowgenlabs.com'],
    ['Astrada','astrada.co'],['Boon','getboon.ai'],['Cedar','cedar.build'],['Structured','getstructured.ai'],
    ['TwinKnowledge','twinknowledge.com'],['Bixby','getbixby.com'],['MeltPlan','meltplan.com'],['Wyre','wyreai.io'],
    ['Kay','kay.ai'],['Arcovo','arcovo.ai'],['Constructable','constructable.ai'],
    ['Flycore','flycore.io'],['Candid Wholesale','candidwholesale.com'],
    ['RepSpark','repspark.com'],['Streamlined','streamlined.dev'],['Procode','procode.ai'],['Walkway','walkway.ai'],
    ['Magenta','magenta.ai'],['Archouse','archouse.io'],['Noxus','noxus.ai'],['Eddifi','eddifi.com'],
    ['Helmet Security','helmetsecurity.com'],['CodeComply','codecomply.ai'],['UserJourneys','userjourneys.com'],['Simple','simple.ai'],
    ['Anchor Browser','anchorbrowser.io'],['Arga Labs','argalabs.com'],['Complement','complement.ai'],['Alpharun','alpharun.com'],
    ['Resourcly','resourcly.io'],['TruthSystems','truthsystems.com'],['Lumari','lumari.ai'],['Burnt','burnt.com'],
    ['Procure','procure.ai'],['Synth','synth.run'],['Prediko','prediko.io'],['Corvus','corvus.ai'],
    ['Nexcade','nexcade.ai'],['Reform','reform.app'],
    ['Peasy','peasy.ai'],['Clipp','clipp.ai'],['Zoey','zoey.com'],['Abundant','abundant.ai'],
    ['Agentuity','agentuity.com'],['Airrived','airrived.ai'],['Alcor Labs','alcor-labs.com'],['Ando','ando.work'],
    ['Applied','appliedlabs.ai'],['Archestra.ai','archestra.ai'],['Archimetis','archimetis.ai'],['arva','arva.ai'],
    ['Ashler Construction','ashler.com'],['Beagle Labs','beaglelabs.ai'],
    ['BravoTran','bravotran.com'],['Cadastral','cadastral.ai'],['Candid','candidintelligence.com'],
    ['Cara','getcara.ai'],['centrum ai','centrum-ai.com'],['Cleavr','cleavr.fr'],
    ['Continuum','oncontinuum.com'],['Corbel','corbelpay.com'],['Cross Check','crossxcheck.com'],
    ['Designverse.ai','designverse.ai'],['Discern Security','discernsecurity.com'],['Dux Development','dux.io'],
    ['Echelon','echelonai.com'],['EM1','em1.com'],['Examen Solutions','examen.ai'],
    ['Ferry','deployferry.io'],['Fireproof','fireprooftech.ai'],['Flight Science','flightscience.ai'],['FreshX','getfreshx.com'],
    ['Frugal AI','frugal.co'],['Get Blaise','getblaise.com'],['Grand','heygrand.com'],['Grantd','grantdequity.com'],
    ['Hammr','hammr.com'],['Hey Archie','heyarchie.ai'],['Hilt','hilt.ai'],['Inscora','inscora.com'],
    ['Intellectible','intellectible.com'],['IntelliGRC','intelligrc.com'],['Intropy AI','intropy.ai'],
    ['Kinfolk','kinfolkhq.com'],['Kinth','kinth.ai'],
    ['Kudwa','kudwa.co'],['Lantern','lanternhq.com'],['Lava','lava.so'],['Loophole Labs','loopholelabs.io'],
    ['luzid.io','luzid.io'],['Maestro Tech','maestrotech.ai'],['Manifest','gomanifest.ai'],['Marble AI','marble-ai.com'],
    ['MEGA','mega.ai'],['Mendo','mendo.cloud'],['Mentium','mentium.io'],['midship.ai','midship.ai'],
    ['MilagroAI','milagroai.com'],
    ['Nebula','trynebula.ai'],['Nebulock','nebulock.io'],['neuronfactory','neuronfactory.ai'],
    ['Olympian','getolympian.co'],['Origami','origamiagents.com'],
    ['Packsmith','packsmith.ai'],['pathwork diagnostics','pathwork.com'],
    ['PensarAI','pensarai.com'],['Plasma','useplasma.ai'],
    ['PrimePoint','primepoint.ai'],['PromptArmor','promptarmor.com'],['Prox','useprox.com'],['pulllogic','pulllogic.com'],
    ['Qued','qued.com'],['Ranger AI','rangerx.ai'],['Rapta','rapta.ai'],['Rectangle Labs','rectanglehq.com'],
    ['Regulis AI','regulis.ai'],['Reviva','joinreviva.com'],
    ['SAMMY Labs','sammylabs.com'],['Sevii','sevii.com'],['Signalcore AI','signal-core.ai'],
    ['StitcherAI','stitcher.ai'],['Swarm','useswarm.co'],['Sybilion','sybilion.com'],
    ['systemzero','systemzero.co'],['Technova','technova-industries.com'],['Tenkara','tenkara.ai'],['Tero','usetero.com'],
    ['Tex Software','texsoftware.com'],['Thirdlaw','thirdlaw.io'],['tofu','hiretofu.com'],['Triage','triage-sec.com'],
    ['unkey.dev','unkey.com'],['uno.ai','uno.ai'],['Usul','usul.com'],['VALLOR','vallor.ai'],
    ['Vidoc Security Lab','vidocsecurity.com'],['Woodrow AI','woodrow.ai'],['Workfabric AI','workfabric.com'],
    ['Zalion','zalion.ai'],['Zeit AI','zeit-ai.com'],['ZeroDrift','zerodrift.ai'],['Zolvo','zolvo.com']
  ];

  // June companies to add
  const juneCompanies = [
    ['chrt','chrt.com'],['Sapien','sapien.ai'],['Atomic Insights','atomicinsights.io'],
    ['Ai Lean','ai-lean.com'],['RAYVN','rayvn.global'],['GoodDay','gooddaysoftware.com'],
    ['eCourtDate','ecourtdate.com'],['Scopito','scopito.com'],['eHawk','ehawksolutions.com'],
    ['VoiceRun','voicerun.com'],['Kepler','kepler.ai'],['Cloneable','cloneable.ai'],
    ['Ubico','ubico.io'],['Mirror Security','mirrorsecurity.io'],['Tandem','tandemai.io'],
    ['Nao','getnao.io'],['Hoop','hoop.dev'],['Complir','complir.io'],
    ['Verita','verita-ai.com'],['Conduit','conduit.inc'],['Intermezzo','intermezzo.ai'],
    ['Bearing','getyourbearing.com'],['Harmony','activateharmony.co'],['Flamingo','flamingo.run'],
    ['Lexful','lexful.ai'],['Cleric','cleric.ai'],['Cavtera','cavtera.com'],
    ['symmetRE','symmetre.com'],['Edwin','edwingov.com'],['Alpa','getalpa.com'],
    ['Alguna','alguna.com'],['Internet Backyard','internetbackyard.com'],['RamAIn','ramain.ai'],
    ['Quash','quash.ai'],['BalancedTrust','balanced-trust.com'],['Kotini','kotini.co.uk'],
    ['JustWin','justwin.ai'],['Rama','tryrama.com'],['Petra Security','petrasecurity.com'],
    ['Domu','domu.ai'],['Certo','askcerto.com'],['Trace','trace.so']
  ];

  // Filter June: skip if domain already in May list
  const mayDomains = new Set(mayCompanies.map(([n,d]) => d));
  const juneFiltered = juneCompanies.filter(([n,d]) => !mayDomains.has(d));

  console.log('May companies (after removing replied): ' + mayCompanies.length);
  console.log('June companies to add: ' + juneFiltered.length);

  // Build rows: #, Month, Company, Website (hyperlinked), One-Liner, Status
  const allRows = [];
  let num = 1;
  for (const [name, domain] of mayCompanies) {
    allRows.push([String(num++), 'May', name, domain, '', 'Cadence Complete']);
  }
  for (const [name, domain] of juneFiltered) {
    allRows.push([String(num++), 'June', name, domain, '', 'Active Cadence']);
  }

  console.log('Total rows: ' + allRows.length);

  // Clear existing data (rows 3 onward) then write new data
  const clearReq = {
    updateCells: {
      range: { sheetId: tabSheetId, startRowIndex: 2, startColumnIndex: 0, endColumnIndex: 7 },
      fields: 'userEnteredValue'
    }
  };
  await batchUpdate(token, [clearReq]);
  console.log('Cleared old data');

  // Write new data
  const range = "'Monthly Break-In'!A3:G" + (3 + allRows.length - 1);
  const result = await updateValues(token, range, allRows);
  console.log('Written: ' + (result.updatedCells || 0) + ' cells');
  console.log('Range: ' + (result.updatedRange || ''));

  // Now add hyperlinks for the website column (D)
  const hyperlinks = allRows.map(([num, month, name, domain], i) => ({
    repeatCell: {
      range: { sheetId: tabSheetId, startRowIndex: 2 + i, endRowIndex: 3 + i, startColumnIndex: 3, endColumnIndex: 4 },
      cell: { userEnteredValue: { formulaValue: '=HYPERLINK("https://' + domain + '","' + domain + '")' } },
      fields: 'userEnteredValue'
    }
  }));
  await batchUpdate(token, hyperlinks);
  console.log('Hyperlinks added');

  // Save domain list for one-liner research
  fs.writeFileSync('_breakin_domains.json', JSON.stringify(allRows.map(r => ({num: r[0], company: r[2], domain: r[3], month: r[1]})), null, 2));
}

main().catch(e => console.error(e));
