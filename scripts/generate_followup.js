const fs = require('fs');
const path = require('path');
 
function parseArgs() {
  const args = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i].replace('--', '').replace(/-/g, '_');
    args[key] = argv[i + 1];
  }
  return args;
}
 
function dateToCron(dateStr, hourUTC) {
  if (hourUTC === undefined) hourUTC = 15;
  const parts = dateStr.split('-').map(Number);
  const month = parts[1];
  const day = parts[2];
  const minute = Math.floor(Math.random() * 30) + 10;
  return minute + ' ' + hourUTC + ' ' + day + ' ' + month + ' *';
}
 
function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}
 
function main() {
  const args = parseArgs();
  const companySlug = slugify(args.company);
  const templatePath = path.join(__dirname, '..', 'templates', 'followup_template.yml');
  const template = fs.readFileSync(templatePath, 'utf8');
 
  var emails = [
    { number: '2', body: args.email2_body, date: args.email2_date },
    { number: '3', body: args.email3_body, date: args.email3_date }
  ];
 
  for (var i = 0; i < emails.length; i++) {
    var email = emails[i];
    if (!email.body || !email.date) {
      console.log('Skipping Email ' + email.number + ' - no body or date');
      continue;
    }
 
    var workflowFilename = 'followup_' + companySlug + '_email' + email.number + '.yml';
    var cronSchedule = dateToCron(email.date);
 
    var workflow = template;
    workflow = workflow.replace(/CRON_SCHEDULE/g, cronSchedule);
    workflow = workflow.replace(/COMPANY_NAME_VALUE/g, args.company);
    workflow = workflow.replace(/COMPANY_NAME/g, args.company);
    workflow = workflow.replace(/FOUNDER_NAME_VALUE/g, args.founder);
    workflow = workflow.replace(/FOUNDER_EMAIL_VALUE/g, args.email);
    workflow = workflow.replace(/COMPANY_DOMAIN_VALUE/g, args.domain);
    workflow = workflow.replace(/THREAD_ID_VALUE/g, args.thread_id || '');
    workflow = workflow.replace(/MESSAGE_ID_VALUE/g, args.message_id || '');
    workflow = workflow.replace(/EMAIL_SUBJECT_VALUE/g, args.subject);
    workflow = workflow.replace(/EMAIL_BODY_VALUE/g, email.body);
    workflow = workflow.replace(/EMAIL_NUMBER_VALUE/g, email.number);
    workflow = workflow.replace(/COMPANY_SLUG/g, companySlug);
    workflow = workflow.replace(/WORKFLOW_FILENAME/g, workflowFilename);
 
    var outputPath = path.join(__dirname, '..', '.github', 'workflows', workflowFilename);
    fs.writeFileSync(outputPath, workflow);
    console.log('Created: .github/workflows/' + workflowFilename);
    console.log('  Schedule: ' + email.date + ' (cron: ' + cronSchedule + ' UTC)');
    console.log('  Target: ' + args.founder + ' (' + args.email + ')');
  }
  console.log('Done!');
}
 
main();
