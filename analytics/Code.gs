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

function refreshDashboard() {
  const rows = _getActivityRows();
  const now = new Date();

  const weekStart = _mondayOf(now);
  const prevWeekStart = new Date(weekStart);
  prevWeekStart.setDate(prevWeekStart.getDate() - 7);

  const thisWeek = rows.filter(r => new Date(r.Timestamp) >= weekStart);
  const prevWeek = rows.filter(r => { const d = new Date(r.Timestamp); return d >= prevWeekStart && d < weekStart; });

  const twOutreach = _uniqueCompanies(thisWeek, 'SENT');
  const pwOutreach = _uniqueCompanies(prevWeek, 'SENT');
  const twReplies = _uniqueCompanies(thisWeek, 'REPLIED');
  const pwReplies = _uniqueCompanies(prevWeek, 'REPLIED');

  const allCompanies = [...new Set(rows.map(r => r.Company))];

  const sent = new Set(rows.filter(r => r.Action === 'SENT' || r.Action === 'FOLLOWUP_SCHEDULED').map(r => r.Company));
  const done = new Set(rows.filter(r => ['REPLIED', 'BOUNCED', 'CANCELLED'].includes(r.Action)).map(r => r.Company));
  const activeCadences = [...sent].filter(c => !done.has(c)).map(company => {
    const cd = rows.filter(r => r.Company === company);
    const actions = cd.map(r => ({ action: r.Action, stage: r['Email Stage'] }));
    const last = cd[cd.length - 1];
    let stage = 'E1 Drafted';
    if (actions.some(a => a.action === 'FOLLOWUP_DRAFTED' && a.stage === 'Email 3')) stage = 'E3 Drafted';
    else if (actions.some(a => a.action === 'FOLLOWUP_DRAFTED' && a.stage === 'Email 2')) stage = 'E2 Drafted';
    else if (actions.some(a => a.action === 'SENT')) stage = 'Awaiting E2';
    else if (actions.some(a => a.action === 'DRAFT_CREATED')) stage = 'E1 Drafted';
    const nextScheduled = cd.filter(r => r.Action === 'FOLLOWUP_SCHEDULED')
      .sort((a, b) => { const sa = a['Email Stage'] || ''; const sb = b['Email Stage'] || ''; return sa.localeCompare(sb); })[0];
    const nextDate = nextScheduled ? nextScheduled.Notes : '';
    return { company, founder: last.Founder, stage, nextDate };
  });

  const replyRows = rows.filter(r => r.Action === 'REPLIED');

  const replies = replyRows.map(r => {
    const cd = rows.filter(s => s.Company === r.Company);
    const sentRow = cd.find(s => s.Action === 'SENT' && s['Email Stage'] === 'Email 1');
    if (!sentRow) return { company: r.Company, founder: r.Founder, repliedTo: r['Email Stage'] || 'Email 1', days: null, date: r.Timestamp };
    const days = (new Date(r.Timestamp) - new Date(sentRow.Timestamp)) / (1000 * 60 * 60);
    let repliedTo = 'Email 1';
    if (cd.some(s => s.Action === 'FOLLOWUP_DRAFTED' && s['Email Stage'] === 'Email 3' && new Date(s.Timestamp) < new Date(r.Timestamp))) repliedTo = 'Email 3';
    else if (cd.some(s => s.Action === 'FOLLOWUP_DRAFTED' && s['Email Stage'] === 'Email 2' && new Date(s.Timestamp) < new Date(r.Timestamp))) repliedTo = 'Email 2';
    return { company: r.Company, founder: r.Founder, repliedTo, days, date: r.Timestamp };
  });

  let avgReplyDays = '--';
  const replyTimes = replies.filter(r => r.days !== null);
  if (replyTimes.length) avgReplyDays = (replyTimes.reduce((a, b) => a + b.days, 0) / replyTimes.length / 24).toFixed(1) + 'd';

  const bounced = rows.filter(r => r.Action === 'BOUNCED').length;
  const blocked = rows.filter(r => r.Action === 'GUARDRAIL_BLOCKED').length;
  const fEntered = allCompanies.length;
  const fE1Drafted = _uniqueCompanies(rows, 'DRAFT_CREATED');
  const fE1Sent = _uniqueCompanies(rows.filter(r => r['Email Stage'] === 'Email 1'), 'SENT');
  const fE2 = _uniqueCompanies(rows.filter(r => r['Email Stage'] === 'Email 2'), 'FOLLOWUP_DRAFTED');
  const fE3 = _uniqueCompanies(rows.filter(r => r['Email Stage'] === 'Email 3'), 'FOLLOWUP_DRAFTED');
  const fReplied = _uniqueCompanies(rows, 'REPLIED');
  const rate = twOutreach > 0 ? (twReplies / twOutreach * 100).toFixed(1) + '%' : '0.0%';

  const ss = SpreadsheetApp.openById(SHEET_ID);
  let ws = ss.getSheetByName(WEEKLY_TAB);
  if (!ws) ws = ss.insertSheet(WEEKLY_TAB);
  ws.clear();

  const output = [
    ['TELESCOPE OUTREACH DASHBOARD', '', '', '', ''],
    ['Updated: ' + now.toLocaleString(), '', '', '', ''],
    ['', '', '', '', ''],
    ['THIS WEEK', '', 'vs Last Week', '', ''],
    ['Companies Outreached', twOutreach, pwOutreach, _delta(twOutreach, pwOutreach), ''],
    ['Replies', twReplies, pwReplies, _delta(twReplies, pwReplies), ''],
    ['Conversion Rate', rate, '', '', ''],
    ['', '', '', '', ''],
    ['OVERVIEW', '', '', '', ''],
    ['Total Companies', allCompanies.length, '', '', ''],
    ['Active Cadences', activeCadences.length, '', '', ''],
    ['Bounced', bounced, '', '', ''],
    ['Guardrail Blocked', blocked, '', '', ''],
    ['Avg Time to Reply', avgReplyDays, '', '', ''],
    ['', '', '', '', ''],
    ['CADENCE FUNNEL', '', '', '', ''],
    ['Entered', fEntered, '', '', ''],
    ['E1 Drafted', fE1Drafted, '', '', ''],
    ['E1 Sent', fE1Sent, '', '', ''],
    ['E2 Drafted', fE2, '', '', ''],
    ['E3 Drafted', fE3, '', '', ''],
    ['Replied', fReplied, '', '', ''],
    ['', '', '', '', ''],
    ['REPLIES', '', '', '', ''],
    ['Company', 'Founder', 'Replied To', 'Time to Reply', 'Date']
  ];

  replies.forEach(r => {
    const timeStr = r.days !== null ? (r.days < 24 ? r.days.toFixed(1) + 'h' : (r.days / 24).toFixed(1) + 'd') : '--';
    const dateStr = r.date ? new Date(r.date).toLocaleDateString() : '';
    output.push([r.company, r.founder, r.repliedTo, timeStr, dateStr]);
  });

  output.push(['', '', '', '', '']);
  output.push(['ACTIVE CADENCES', '', '', '', '']);
  const cadenceHeaderRow = output.length + 1;
  output.push(['Company', 'Founder', 'Stage', 'Next Follow-up', '']);

  activeCadences.forEach(c => {
    output.push([c.company, c.founder, c.stage, c.nextDate, '']);
  });

  ws.getRange(1, 1, output.length, 5).setValues(output);

  ws.setColumnWidth(1, 200);
  ws.setColumnWidth(2, 160);
  ws.setColumnWidth(3, 130);
  ws.setColumnWidth(4, 130);
  ws.setColumnWidth(5, 110);

  const sectionHeaders = [1, 4, 9, 16, 24];
  sectionHeaders.forEach(r => {
    ws.getRange(r, 1, 1, 5).setFontWeight('bold').setFontSize(r === 1 ? 14 : 11);
  });
  ws.getRange(25, 1, 1, 5).setFontWeight('bold');
  const acHeader = output.findIndex(r => r[0] === 'ACTIVE CADENCES') + 1;
  if (acHeader > 0) {
    ws.getRange(acHeader, 1, 1, 5).setFontWeight('bold').setFontSize(11);
    ws.getRange(acHeader + 1, 1, 1, 5).setFontWeight('bold');
  }
  ws.getRange(2, 1).setFontColor('#888888').setFontSize(9);

  Logger.log('Dashboard refreshed: ' + replies.length + ' replies, ' + activeCadences.length + ' active cadences.');
}

function cleanupUnsent() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(ACTIVITY_TAB);
  const remove = [
    'Galini', 'Candor Security', 'Tangibly', 'AI Score', 'Didit',
    'FleetDefender', 'PurpleLens', 'Novee', 'Infact', 'Sandbar',
    'Plural', 'Technova Industries', 'ComplyStream', 'Haladir', 'PRE Security'
  ];
  const data = sheet.getDataRange().getValues();
  const rowsToDelete = [];
  for (let i = data.length - 1; i >= 1; i--) {
    if (remove.includes(data[i][1])) rowsToDelete.push(i + 1);
  }
  rowsToDelete.forEach(r => sheet.deleteRow(r));
  Logger.log('Removed ' + rowsToDelete.length + ' rows for ' + remove.length + ' unsent companies.');
}

function _delta(current, previous) {
  const diff = current - previous;
  if (diff > 0) return '↑ ' + diff;
  if (diff < 0) return '↓ ' + Math.abs(diff);
  return '→ 0';
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

function backfillLatest() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(ACTIVITY_TAB);
  const rows = [];

  const newSent = [
    ['ControlTheory', 'controltheory.com', 'Bob', 'bob@controltheory.com', '19e3d1750c4351a5', '2026-05-18T21:56:39Z'],
    ['Freeflow', 'freeflow.ai', 'Jason', 'jason@freeflow.ai', '19e3cced39f867a7', '2026-05-18T20:37:28Z'],
    ['Hunted Labs', 'huntedlabs.io', 'Hayden', 'hayden@huntedlabs.io', '19e3cc42c3bddbb6', '2026-05-18T20:25:50Z'],
    ['APIContext', 'apicontext.com', 'Mayur Upadhyaya', 'mayur@apicontext.com', '19e3d12592b0d401', '2026-05-18T21:51:13Z'],
    ['DataWhisper', 'datawhisper.co.uk', 'Luis Lancos', 'lancos@datawhisper.co.uk', '19e3d85697cf24f5', '2026-05-18T23:56:54Z'],
    ['Corgea', 'corgea.com', 'Ahmad Sadeddin', 'ahmad@corgea.com', '19e3d884ef4aa17c', '2026-05-19T00:00:04Z'],
    ['Compuvi', 'compuvi.com', 'Ataberk Ciftlikli', 'ataberk@compuvi.com', '19e3d8608598459e', '2026-05-18T23:57:35Z']
  ];

  newSent.forEach(([co, dom, fn, em, tid, ts]) => {
    rows.push([ts, co, dom, fn, em, 'SENT', 'Email 1', tid, '']);
    rows.push([ts, co, dom, fn, em, 'FOLLOWUP_SCHEDULED', 'Email 2', tid, 'May 20']);
    rows.push([ts, co, dom, fn, em, 'FOLLOWUP_SCHEDULED', 'Email 3', tid, 'May 25']);
  });

  rows.push(['2026-05-18T22:31:29Z', 'CrunchAtlas', 'crunchatlas.com', 'Ben', 'ben@crunchatlas.com', 'REPLIED', 'Email 1', '19e3c50bd6d6639e', 'Replied to Email 1']);

  const lastRow = sheet.getLastRow();
  sheet.getRange(lastRow + 1, 1, rows.length, 9).setValues(rows);
  Logger.log('Backfilled ' + rows.length + ' rows (7 sent + 1 reply).');
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

