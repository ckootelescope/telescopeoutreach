const SHEET_ID = '1Sk9HndYNzXj_tHg8-T4EGqSqkPk1QKXH2UOQt23s7CA';
const API_KEY = 'tscope_og_2026_kx9m';
const ACTIVITY_TAB = 'Activity Log';
const WEEKLY_TAB = 'Weekly Summary';

function setupSheet() {
  const ss = SpreadsheetApp.openById(SHEET_ID);

  let activity = ss.getSheetByName(ACTIVITY_TAB);
  if (!activity) activity = ss.insertSheet(ACTIVITY_TAB);
  activity.clear();
  activity.getRange('A1:I1').setValues([[
    'Timestamp', 'Company', 'Domain', 'Founder', 'Email', 'Action', 'Email Stage', 'Thread ID', 'Notes'
  ]]);
  activity.getRange('A1:I1').setFontWeight('bold').setBackground('#1a1a2e').setFontColor('#ffffff');
  activity.setFrozenRows(1);
  activity.setColumnWidths(1, 1, 180);
  activity.setColumnWidths(2, 2, 140);
  activity.setColumnWidths(4, 1, 140);
  activity.setColumnWidths(6, 1, 170);

  let weekly = ss.getSheetByName(WEEKLY_TAB);
  if (!weekly) weekly = ss.insertSheet(WEEKLY_TAB);
  weekly.clear();
  weekly.getRange('A1:I1').setValues([[
    'Week Starting', 'Companies Outreached', 'Conversations', 'Conversion Rate',
    'Emails Sent (E1)', 'Emails Sent (E2)', 'Emails Sent (E3)', 'Bounced', 'Guardrail Blocked'
  ]]);
  weekly.getRange('A1:I1').setFontWeight('bold').setBackground('#1a1a2e').setFontColor('#ffffff');
  weekly.setFrozenRows(1);

  const sheet1 = ss.getSheetByName('Sheet1');
  if (sheet1) ss.deleteSheet(sheet1);

  Logger.log('Sheet setup complete.');
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    if (data.api_key !== API_KEY) {
      return _json({ error: 'Unauthorized' });
    }

    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sheet = ss.getSheetByName(ACTIVITY_TAB);

    if (data.action === 'log') {
      sheet.appendRow([
        data.timestamp || new Date().toISOString(),
        data.company || '',
        data.domain || '',
        data.founder || '',
        data.email || '',
        data.event || '',
        data.email_stage || '',
        data.thread_id || '',
        data.notes || ''
      ]);
      return _json({ status: 'ok' });
    }

    if (data.action === 'batch_log') {
      const rows = data.entries.map(en => [
        en.timestamp || new Date().toISOString(),
        en.company || '', en.domain || '', en.founder || '', en.email || '',
        en.event || '', en.email_stage || '', en.thread_id || '', en.notes || ''
      ]);
      const lastRow = sheet.getLastRow();
      sheet.getRange(lastRow + 1, 1, rows.length, 9).setValues(rows);
      return _json({ status: 'ok', count: rows.length });
    }

    return _json({ error: 'Unknown action' });
  } catch (err) {
    return _json({ error: err.message });
  }
}

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Dashboard')
    .setTitle('Telescope Outreach Dashboard')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function getDashboardData() {
  const rows = _getActivityRows();
  const now = new Date();

  const weekStart = _mondayOf(now);
  const prevWeekStart = new Date(weekStart);
  prevWeekStart.setDate(prevWeekStart.getDate() - 7);

  const thisWeek = rows.filter(r => new Date(r.Timestamp) >= weekStart);
  const prevWeek = rows.filter(r => { const d = new Date(r.Timestamp); return d >= prevWeekStart && d < weekStart; });

  const twOutreach = _uniqueCompanies(thisWeek, 'SENT');
  const pwOutreach = _uniqueCompanies(prevWeek, 'SENT');
  const twConvos = _uniqueCompanies(thisWeek, 'REPLIED');
  const pwConvos = _uniqueCompanies(prevWeek, 'REPLIED');

  const allCompanies = [...new Set(rows.map(r => r.Company))];

  const funnel = {
    entered: allCompanies.length,
    email1Sent: _uniqueCompanies(rows.filter(r => r['Email Stage'] === 'Email 1'), 'SENT'),
    email1Drafted: _uniqueCompanies(rows, 'DRAFT_CREATED'),
    email2: _uniqueCompanies(rows.filter(r => r['Email Stage'] === 'Email 2'), 'FOLLOWUP_DRAFTED'),
    email3: _uniqueCompanies(rows.filter(r => r['Email Stage'] === 'Email 3'), 'FOLLOWUP_DRAFTED'),
    replied: _uniqueCompanies(rows, 'REPLIED')
  };

  const scheduled = new Set(rows.filter(r => r.Action === 'FOLLOWUP_SCHEDULED').map(r => r.Company));
  const done = new Set(rows.filter(r => ['REPLIED', 'BOUNCED', 'CANCELLED'].includes(r.Action)).map(r => r.Company));
  const activeCadences = [...scheduled].filter(c => !done.has(c)).map(company => {
    const cd = rows.filter(r => r.Company === company);
    const last = cd[cd.length - 1];
    return {
      company, domain: last.Domain, founder: last.Founder,
      lastAction: last.Action, lastStage: last['Email Stage'],
      lastDate: last.Timestamp
    };
  });

  const replyRows = rows.filter(r => r.Action === 'REPLIED');
  let avgTimeToReply = null;
  if (replyRows.length > 0) {
    const times = replyRows.map(r => {
      const sentRow = rows.find(s => s.Company === r.Company && s.Action === 'SENT' && s['Email Stage'] === 'Email 1');
      if (!sentRow) return null;
      return (new Date(r.Timestamp) - new Date(sentRow.Timestamp)) / (1000 * 60 * 60 * 24);
    }).filter(Boolean);
    if (times.length) avgTimeToReply = (times.reduce((a, b) => a + b, 0) / times.length).toFixed(1);
  }

  return {
    weekly: {
      outreach: twOutreach, prevOutreach: pwOutreach,
      conversations: twConvos, prevConversations: pwConvos,
      rate: twOutreach > 0 ? (twConvos / twOutreach * 100).toFixed(1) : '0.0'
    },
    funnel,
    activeCadences,
    guardrailBlocked: rows.filter(r => r.Action === 'GUARDRAIL_BLOCKED').length,
    bounced: rows.filter(r => r.Action === 'BOUNCED').length,
    totalCompanies: allCompanies.length,
    avgTimeToReply
  };
}

function backfillData() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(ACTIVITY_TAB);

  const earlier = [
    ['Trouve AI', 'trouve.ai', 'Shafin Siddique', 'shafin@trouve.ai', '19e36fcd'],
    ['Kipling Secure', 'kiplingsecure.ai', 'Saurabh Sandhir', 'saurabh@kiplingsecure.ai', '19e36dcf'],
    ['Kroo', 'getkroo.com', 'Barry Chiu', 'barry@getkroo.com', '19e36d8c'],
    ['WorkHero', 'workhero.pro', 'Kyler Evitt', 'kyler@workhero.pro', '19e36a87']
  ];

  const rows = [];
  earlier.forEach(([co, dom, fn, em, tid]) => {
    rows.push(['2026-05-16T08:00:00Z', co, dom, fn, em, 'SENT', 'Email 1', tid, 'Backfilled']);
    rows.push(['2026-05-18T15:00:00Z', co, dom, fn, em, 'FOLLOWUP_SCHEDULED', 'Email 2', tid, 'May 19']);
    rows.push(['2026-05-18T15:00:00Z', co, dom, fn, em, 'FOLLOWUP_SCHEDULED', 'Email 3', tid, 'May 24']);
  });

  const batch2 = [
    ['APIContext', 'apicontext.com', 'Mayur Upadhyaya', 'mayur@apicontext.com'],
    ['DataWhisper', 'datawhisper.co.uk', 'Luis Lancos', 'lancos@datawhisper.co.uk'],
    ['PRE Security', 'presecurity.ai', 'John Peterson', 'john@presecurity.ai'],
    ['Haladir', 'haladir.com', 'Jibran Hutchins', 'jibran@haladir.com'],
    ['ComplyStream', 'complystream.com', 'Kartik Dabbiru', 'kartik@complystream.com'],
    ['Technova Industries', 'technova-industries.com', 'Aymen Azim', 'aymen@technova-industries.com'],
    ['Plural', 'plural.sh', 'Sam Weaver', 'sam@plural.sh'],
    ['Sandbar', 'sandbar.ai', 'Abe Goldstein', 'abe@sandbar.ai'],
    ['Infact', 'infact.io', 'Will Mason', 'will@infact.io'],
    ['Novee', 'novee.ai', 'Haris Khan', 'haris@novee.ai'],
    ['PurpleLens', 'purplelens.ai', 'Praveen Nettimi', 'praveen@purplelens.ai'],
    ['FleetDefender', 'fleetdefender.com', 'Terry Reinert', 'terry@fleetdefender.com'],
    ['Didit', 'didit.me', 'Alberto Rosas', 'alberto@didit.me'],
    ['AI Score', 'aiscore.ai', 'Alex Harland', 'alex@aiscore.ai'],
    ['Tangibly', 'tangibly.com', 'Tim Londergan', 'tim@tangibly.com'],
    ['Candor Security', 'candor.security', 'Adarsh Ambati', 'adarsh@candor.security'],
    ['Galini', 'galini.ai', 'Shaun Ayrton', 'shaunayrton@galini.ai'],
    ['Corgea', 'corgea.com', 'Ahmad Sadeddin', 'ahmad@corgea.com'],
    ['Compuvi', 'compuvi.com', 'Ataberk Ciftlikli', 'ataberk@compuvi.com']
  ];
  batch2.forEach(([co, dom, fn, em]) => {
    rows.push(['2026-05-18T17:00:00Z', co, dom, fn, em, 'DRAFT_CREATED', 'Email 1', '', 'Backfilled']);
  });

  const lastRow = sheet.getLastRow();
  sheet.getRange(lastRow + 1, 1, rows.length, 9).setValues(rows);
  Logger.log('Backfilled ' + rows.length + ' rows.');
}

function backfillMay18Sent() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(ACTIVITY_TAB);

  const batch3 = [
    ['MindFort', 'mindfort.ai', 'Brandon Veiseh', 'brandon@mindfort.ai', '19e3cb47118d6479'],
    ['Cotool', 'cotool.ai', 'Max Pollard', 'max@cotool.ai', '19e3cae7ded9b5d3'],
    ['RiskFront', 'riskfront.ai', 'Andy Bethurum', 'andy.bethurum@gmail.com', '19e3ca2599a580ef'],
    ['WiseBee', 'wisebee.ai', 'Stoyan Stoyanov', 'stoyan@wisebee.ai', '19e3c9b92b2f991c'],
    ['CognitiveView', 'cognitiveview.com', 'Dilip Mohapatra', 'dilip@cognitiveview.com', '19e3c5834fad039b'],
    ['Entangl', 'entangl.ai', 'Shapol', 'shapol@entangl.ai', '19e3c54ccf15048b'],
    ['CrunchAtlas', 'crunchatlas.com', 'Ben', 'ben@crunchatlas.com', '19e3c50bd6d6639e'],
    ['Advance', 'advancehq.com', 'Omer Rimoch', 'omer@advancehq.com', '19e3c34b27d9707e'],
    ['Dearborn Labs', 'dearbornlabs.com', 'Kyle Nakatsuji', 'kyle@dearbornlabs.com', '19e3c15a110f24ee'],
    ['Caribou', 'usecaribou.com', 'Juan Andrade', 'juan@usecaribou.com', '19e3be9fc5da6cb8'],
    ['Specmade', 'specmade.com', 'Matt Pierce', 'matt@specmade.com', '19e3be5d204d4ca1'],
    ['Assail AI', 'assailai.com', 'Alissa Knight', 'alissa.knight@assailai.com', '19e3be35d5296cb4']
  ];

  const rows = [];
  batch3.forEach(([co, dom, fn, em, tid]) => {
    rows.push(['2026-05-18T08:00:00Z', co, dom, fn, em, 'SENT', 'Email 1', tid, '']);
    rows.push(['2026-05-18T08:00:00Z', co, dom, fn, em, 'FOLLOWUP_SCHEDULED', 'Email 2', tid, 'May 20']);
    rows.push(['2026-05-18T08:00:00Z', co, dom, fn, em, 'FOLLOWUP_SCHEDULED', 'Email 3', tid, 'May 25']);
    rows.push(['2026-05-18T08:00:00Z', co, dom, fn, em, 'LINKEDIN_REMINDER_SET', '', tid, 'Calendar reminder created']);
  });

  rows.push(['2026-05-18T12:00:00Z', 'Trouve AI', 'trouve.ai', 'Shafin Siddique', 'shafin@trouve.ai', 'REPLIED', '', '19e36fcd', 'Cadence cancelled']);

  const lastRow = sheet.getLastRow();
  sheet.getRange(lastRow + 1, 1, rows.length, 9).setValues(rows);
  Logger.log('Backfilled ' + rows.length + ' rows for May 18 batch.');
}

function _getActivityRows() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(ACTIVITY_TAB);
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  const hdr = data[0];
  return data.slice(1).map(row => {
    const obj = {};
    hdr.forEach((h, i) => obj[h] = row[i]);
    return obj;
  });
}

function _uniqueCompanies(rows, action) {
  return new Set(rows.filter(r => r.Action === action).map(r => r.Company)).size;
}

function _mondayOf(d) {
  const m = new Date(d);
  const day = m.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  m.setDate(m.getDate() + diff);
  m.setHours(0, 0, 0, 0);
  return m;
}

function _json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
