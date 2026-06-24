const SHEET_ID = '1Sk9HndYNzXj_tHg8-T4EGqSqkPk1QKXH2UOQt23s7CA';
const API_KEY = 'tscope_og_2026_kx9m';
const ACTIVITY_TAB = 'Activity Log';
const WEEKLY_TAB = 'Weekly Summary';
const TRENDS_TAB = 'Trends';

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
    'Week Starting', 'Companies Outreached', 'Replies', 'Conversion Rate',
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
      if (data.event === 'REPLIED' && _hasReplied(sheet, data.domain || '', data.company || '')) {
        return _json({ status: 'skipped', reason: 'REPLIED already exists for ' + (data.company || data.domain) });
      }
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
      const repliedDomains = _getRepliedDomains(sheet);
      const rows = data.entries.filter(en => {
        if (en.event === 'REPLIED') {
          const key = (en.domain || en.company || '').toLowerCase();
          if (repliedDomains.has(key)) return false;
          repliedDomains.add(key);
        }
        return true;
      }).map(en => [
        en.timestamp || new Date().toISOString(),
        en.company || '', en.domain || '', en.founder || '', en.email || '',
        en.event || '', en.email_stage || '', en.thread_id || '', en.notes || ''
      ]);
      if (rows.length === 0) return _json({ status: 'ok', count: 0, note: 'all entries skipped (duplicate REPLIED)' });
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

  const twOutreach = _uniqueCompanies(thisWeek.filter(r => r['Email Stage'] === 'Email 1'), 'SENT');
  const pwOutreach = _uniqueCompanies(prevWeek.filter(r => r['Email Stage'] === 'Email 1'), 'SENT');
  const twReplies = _uniqueCompanies(thisWeek, 'REPLIED');
  const pwReplies = _uniqueCompanies(prevWeek, 'REPLIED');
  const twE2Sent = _uniqueCompanies(thisWeek.filter(r => r['Email Stage'] === 'Email 2'), 'SENT');
  const twE3Sent = _uniqueCompanies(thisWeek.filter(r => r['Email Stage'] === 'Email 3'), 'SENT');

  const allCompanies = [...new Set(rows.map(r => r.Company))];

  const sent = new Set(rows.filter(r => r.Action === 'SENT' || r.Action === 'FOLLOWUP_SCHEDULED').map(r => r.Company));
  const done = new Set(rows.filter(r => ['REPLIED', 'BOUNCED', 'CANCELLED'].includes(r.Action)).map(r => r.Company));
  const activeCadences = [...sent].filter(c => !done.has(c)).map(company => {
    const cd = rows.filter(r => r.Company === company);
    const actions = cd.map(r => ({ action: r.Action, stage: r['Email Stage'] }));
    const last = cd[cd.length - 1];
    let stage = 'E1 Drafted';
    if (actions.some(a => a.action === 'SENT' && a.stage === 'Email 3')) stage = 'Awaiting Reply';
    else if (actions.some(a => a.action === 'FOLLOWUP_DRAFTED' && a.stage === 'Email 3')) stage = 'E3 Drafted';
    else if (actions.some(a => a.action === 'SENT' && a.stage === 'Email 2')) stage = 'Awaiting E3';
    else if (actions.some(a => a.action === 'FOLLOWUP_DRAFTED' && a.stage === 'Email 2')) stage = 'E2 Drafted';
    else if (actions.some(a => a.action === 'SENT')) stage = 'Awaiting E2';
    else if (actions.some(a => a.action === 'DRAFT_CREATED')) stage = 'E1 Drafted';
    const nextScheduled = cd.filter(r => r.Action === 'FOLLOWUP_SCHEDULED')
      .sort((a, b) => { const sa = a['Email Stage'] || ''; const sb = b['Email Stage'] || ''; return sa.localeCompare(sb); })[0];
    const nextDate = nextScheduled ? nextScheduled.Notes : '';
    return { company, founder: last.Founder, stage, nextDate };
  });

  const replyRows = rows.filter(r => r.Action === 'REPLIED');
  const seenReplyCompanies = new Set();
  const uniqueReplyRows = replyRows.filter(r => {
    if (seenReplyCompanies.has(r.Company)) return false;
    seenReplyCompanies.add(r.Company);
    return true;
  });

  const replies = uniqueReplyRows.map(r => {
    const cd = rows.filter(s => s.Company === r.Company);
    const sentRow = cd.find(s => s.Action === 'SENT' && s['Email Stage'] === 'Email 1');
    if (!sentRow) return { company: r.Company, founder: r.Founder, repliedTo: r['Email Stage'] || 'Email 1', days: null, date: r.Timestamp };
    const days = (new Date(r.Timestamp) - new Date(sentRow.Timestamp)) / (1000 * 60 * 60);
    let repliedTo = 'Email 1';
    if (cd.some(s => (s.Action === 'SENT' || s.Action === 'FOLLOWUP_DRAFTED') && s['Email Stage'] === 'Email 3' && new Date(s.Timestamp) < new Date(r.Timestamp))) repliedTo = 'Email 3';
    else if (cd.some(s => (s.Action === 'SENT' || s.Action === 'FOLLOWUP_DRAFTED') && s['Email Stage'] === 'Email 2' && new Date(s.Timestamp) < new Date(r.Timestamp))) repliedTo = 'Email 2';
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
  const fE2Sent = _uniqueCompanies(rows.filter(r => r['Email Stage'] === 'Email 2'), 'SENT');
  const fE3 = _uniqueCompanies(rows.filter(r => r['Email Stage'] === 'Email 3'), 'FOLLOWUP_DRAFTED');
  const fE3Sent = _uniqueCompanies(rows.filter(r => r['Email Stage'] === 'Email 3'), 'SENT');
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
    ['E2 Sent', twE2Sent, '', '', ''],
    ['E3 Sent', twE3Sent, '', '', ''],
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
    ['E2 Sent', fE2Sent, '', '', ''],
    ['E3 Drafted', fE3, '', '', ''],
    ['E3 Sent', fE3Sent, '', '', ''],
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

  const sectionNames = ['TELESCOPE OUTREACH DASHBOARD', 'THIS WEEK', 'OVERVIEW', 'CADENCE FUNNEL', 'REPLIES', 'ACTIVE CADENCES'];
  sectionNames.forEach(name => {
    const idx = output.findIndex(r => r[0] === name);
    if (idx >= 0) {
      ws.getRange(idx + 1, 1, 1, 5).setFontWeight('bold').setFontSize(name === 'TELESCOPE OUTREACH DASHBOARD' ? 14 : 11);
    }
  });
  const colHeaders = output.reduce((acc, r, i) => {
    if (r[0] === 'Company' && (r[1] === 'Founder')) acc.push(i + 1);
    return acc;
  }, []);
  colHeaders.forEach(r => ws.getRange(r, 1, 1, 5).setFontWeight('bold'));
  ws.getRange(2, 1).setFontColor('#888888').setFontSize(9);

  snapshotWeeklyTrends(rows);

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

function snapshotWeeklyTrends(rows) {
  if (!rows) rows = _getActivityRows();
  const ss = SpreadsheetApp.openById(SHEET_ID);

  let ts = ss.getSheetByName(TRENDS_TAB);
  if (!ts) {
    ts = ss.insertSheet(TRENDS_TAB);
    ts.getRange('A1:L1').setValues([[
      'Week Starting', 'Outreach', 'Replies', 'Conversion %',
      'E1 Drafted', 'E1 Sent', 'E2 Drafted', 'E2 Sent', 'E3 Drafted', 'E3 Sent',
      'Bounced', 'Blocked'
    ]]);
    ts.getRange('A1:L1').setFontWeight('bold').setBackground('#1a1a2e').setFontColor('#ffffff');
    ts.setFrozenRows(1);
  }

  const allDates = rows.map(r => new Date(r.Timestamp));
  if (allDates.length === 0) return;

  const minDate = new Date(Math.min.apply(null, allDates));
  const maxDate = new Date(Math.max.apply(null, allDates));
  const firstMonday = _mondayOf(minDate);
  const lastMonday = _mondayOf(maxDate);

  const weeks = [];
  var cur = new Date(firstMonday);
  while (cur <= lastMonday) {
    weeks.push(new Date(cur));
    cur.setDate(cur.getDate() + 7);
  }

  var weeklyData = weeks.map(function(ws) {
    var we = new Date(ws);
    we.setDate(we.getDate() + 7);
    var wr = rows.filter(function(r) { var d = new Date(r.Timestamp); return d >= ws && d < we; });
    var outreach = _uniqueCompanies(wr.filter(function(r) { return r['Email Stage'] === 'Email 1'; }), 'SENT');
    var convos = _uniqueCompanies(wr, 'REPLIED');
    var conv = outreach > 0 ? (convos / outreach * 100).toFixed(1) + '%' : '0.0%';
    return [
      ws.toISOString().split('T')[0],
      outreach, convos, conv,
      _uniqueCompanies(wr, 'DRAFT_CREATED'),
      _uniqueCompanies(wr.filter(function(r) { return r['Email Stage'] === 'Email 1'; }), 'SENT'),
      _uniqueCompanies(wr.filter(function(r) { return r['Email Stage'] === 'Email 2'; }), 'FOLLOWUP_DRAFTED'),
      _uniqueCompanies(wr.filter(function(r) { return r['Email Stage'] === 'Email 2'; }), 'SENT'),
      _uniqueCompanies(wr.filter(function(r) { return r['Email Stage'] === 'Email 3'; }), 'FOLLOWUP_DRAFTED'),
      _uniqueCompanies(wr.filter(function(r) { return r['Email Stage'] === 'Email 3'; }), 'SENT'),
      wr.filter(function(r) { return r.Action === 'BOUNCED'; }).length,
      wr.filter(function(r) { return r.Action === 'GUARDRAIL_BLOCKED'; }).length
    ];
  });

  var lastRow = ts.getLastRow();
  if (lastRow > 1) ts.getRange(2, 1, lastRow - 1, 12).clear();

  if (weeklyData.length > 0) {
    ts.getRange(2, 1, weeklyData.length, 12).setValues(weeklyData);
  }

  var monthStart = weeklyData.length + 3;
  var months = {};
  weeklyData.forEach(function(w) {
    var d = new Date(w[0]);
    var key = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2);
    if (!months[key]) months[key] = { outreach: 0, replies: 0, e1d: 0, e1s: 0, e2d: 0, e2s: 0, e3d: 0, e3s: 0, bounced: 0, blocked: 0 };
    months[key].outreach += w[1];
    months[key].replies += w[2];
    months[key].e1d += w[4];
    months[key].e1s += w[5];
    months[key].e2d += w[6];
    months[key].e2s += w[7];
    months[key].e3d += w[8];
    months[key].e3s += w[9];
    months[key].bounced += w[10];
    months[key].blocked += w[11];
  });

  ts.getRange(monthStart, 1, 1, 12).setValues([['MONTHLY ROLLUP', '', '', '', '', '', '', '', '', '', '', '']]);
  ts.getRange(monthStart, 1, 1, 12).setFontWeight('bold').setFontSize(11);
  monthStart++;
  ts.getRange(monthStart, 1, 1, 12).setValues([[
    'Month', 'Outreach', 'Replies', 'Conversion %',
    'E1 Drafted', 'E1 Sent', 'E2 Drafted', 'E2 Sent', 'E3 Drafted', 'E3 Sent',
    'Bounced', 'Blocked'
  ]]);
  ts.getRange(monthStart, 1, 1, 12).setFontWeight('bold');
  monthStart++;

  var monthKeys = Object.keys(months).sort();
  var monthRows = monthKeys.map(function(k) {
    var m = months[k];
    var conv = m.outreach > 0 ? (m.replies / m.outreach * 100).toFixed(1) + '%' : '0.0%';
    return [k, m.outreach, m.replies, conv, m.e1d, m.e1s, m.e2d, m.e2s, m.e3d, m.e3s, m.bounced, m.blocked];
  });

  if (monthRows.length > 0) {
    ts.getRange(monthStart, 1, monthRows.length, 12).setValues(monthRows);
  }

  ts.setColumnWidth(1, 120);
  for (var i = 2; i <= 12; i++) ts.setColumnWidth(i, 100);

  Logger.log('Trends snapshot updated: ' + weeklyData.length + ' weeks, ' + monthKeys.length + ' months.');
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

function _hasReplied(sheet, domain, company) {
  const domains = _getRepliedDomains(sheet);
  const key = (domain || company || '').toLowerCase();
  return domains.has(key);
}

function _getRepliedDomains(sheet) {
  const data = sheet.getDataRange().getValues();
  const domains = new Set();
  for (let i = 1; i < data.length; i++) {
    if (data[i][5] === 'REPLIED') {
      const key = (data[i][2] || data[i][1] || '').toLowerCase();
      if (key) domains.add(key);
    }
  }
  return domains;
}

function logJune2Batch() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(ACTIVITY_TAB);
  const rows = [];

  const sent = [
    ['ZeroDrift','zerodrift.ai','Kumesh','kumesh@zerodrift.ai','19e8984272069ae0','2026-06-02T18:06:40Z'],
    ['DesignVerse','designverse.ai','Andrei','andrei@designverse.ai','19e898317e41f044','2026-06-02T18:05:30Z'],
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

  sent.forEach(([co,dom,fn,em,tid,ts]) => {
    rows.push([ts,co,dom,fn,em,'SENT','Email 1',tid,'']);
  });

  sent.filter(([co]) => co !== 'DesignVerse').forEach(([co,dom,fn,em,tid,ts]) => {
    rows.push([ts,co,dom,fn,em,'FOLLOWUP_SCHEDULED','Email 2',tid,'Jun 4']);
    rows.push([ts,co,dom,fn,em,'FOLLOWUP_SCHEDULED','Email 3',tid,'Jun 7']);
    rows.push([ts,co,dom,fn,em,'FOLLOWUP_SCHEDULED','Email 4',tid,'Jun 9']);
    rows.push([ts,co,dom,fn,em,'LINKEDIN_REMINDER_SET','',tid,'Connect Jun 5, Message Jun 8']);
  });

  rows.push(['2026-06-02T18:09:16Z','DesignVerse','designverse.ai','Andrei','andrei@designverse.ai','REPLIED','Email 1','19e898317e41f044','Planning Series A $40-50M by Sept']);

  const lastRow = sheet.getLastRow();
  sheet.getRange(lastRow + 1, 1, rows.length, 9).setValues(rows);
  Logger.log('June 2 batch: ' + rows.length + ' rows logged.');
}

function _json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

