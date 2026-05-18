#!/usr/bin/env node

/**
 * push_followups.js
 * 
 * Run with: node push_followups.js
 * 
 * Reads cadence.json and pushes any new follow-up workflow files
 * to the telescopeoutreach GitHub repo.
 * 
 * Requires: GH_PAT environment variable or .env file with your GitHub PAT
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// Load .env if exists
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const [key, ...vals] = line.split('=');
    if (key && vals.length) process.env[key.trim()] = vals.join('=').trim();
  });
}

const GH_PAT = process.env.GH_PAT;
const REPO_OWNER = 'ckootelescope';
const REPO_NAME = 'telescopeoutreach';

if (!GH_PAT) {
  console.error('ERROR: GH_PAT not set. Create a .env file with GH_PAT=your_token');
  process.exit(1);
}

function githubRequest(method, apiPath, body) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path: apiPath,
      method: method,
      headers: {
        'Authorization': `Bearer ${GH_PAT}`,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'telescope-outreach',
        'X-GitHub-Api-Version': '2022-11-28'
      }
    };
    if (body) options.headers['Content-Type'] = 'application/json';

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ statusCode: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ statusCode: res.statusCode, data: data });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function getFileSha(filePath) {
  const res = await githubRequest('GET', `/repos/${REPO_OWNER}/${REPO_NAME}/contents/${filePath}`);
  if (res.statusCode === 200) return res.data.sha;
  return null;
}

async function pushFile(filePath, content, commitMessage) {
  const base64Content = Buffer.from(content).toString('base64');
  const sha = await getFileSha(filePath);
  
  const body = {
    message: commitMessage,
    content: base64Content
  };
  if (sha) body.sha = sha;

  const res = await githubRequest('PUT', `/repos/${REPO_OWNER}/${REPO_NAME}/contents/${filePath}`, body);
  
  if (res.statusCode === 200 || res.statusCode === 201) {
    console.log(`  ✅ Pushed: ${filePath}`);
    return true;
  } else {
    console.error(`  ❌ Failed: ${filePath} (${res.statusCode})`);
    console.error(`     ${JSON.stringify(res.data)}`);
    return false;
  }
}

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function dateToCron(dateStr, hourUTC = 15) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const minute = Math.floor(Math.random() * 30) + 10;
  return `${minute} ${hourUTC} ${day} ${month} *`;
}

function generateWorkflow(cadence, emailNum) {
  const slug = slugify(cadence.company);
  const email = emailNum === 2 ? cadence.email2 : cadence.email3;
  const workflowFilename = `followup_${slug}_email${emailNum}.yml`;
  const cron = dateToCron(email.date);

  return `name: "Follow-up: ${emailNum} - ${cadence.company}"

on:
  schedule:
    - cron: '${cron}'
  workflow_dispatch:

jobs:
  send-followup:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repo
        uses: actions/checkout@v4

      - name: Run follow-up script
        id: followup
        env:
          GMAIL_CLIENT_ID: \${{ secrets.GMAIL_CLIENT_ID }}
          GMAIL_CLIENT_SECRET: \${{ secrets.GMAIL_CLIENT_SECRET }}
          GMAIL_REFRESH_TOKEN: \${{ secrets.GMAIL_REFRESH_TOKEN }}
          GMAIL_SENDER_EMAIL: \${{ secrets.GMAIL_SENDER_EMAIL }}
          COMPANY_NAME: "${cadence.company}"
          FOUNDER_NAME: "${cadence.founder}"
          FOUNDER_EMAIL: "${cadence.founderEmail}"
          COMPANY_DOMAIN: "${cadence.domain}"
          ORIGINAL_THREAD_ID: "${cadence.threadId}"
          ORIGINAL_MESSAGE_ID: "${cadence.messageId}"
          EMAIL_SUBJECT: "${cadence.subject}"
          EMAIL_BODY: "${email.body.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"
          EMAIL_NUMBER: "${emailNum}"
        run: node scripts/send_followup.js

      - name: Cancel remaining cadence
        if: steps.followup.outputs.result == 'REPLIED' || steps.followup.outputs.result == 'BOUNCED'
        uses: actions/github-script@v7
        with:
          script: |
            const result = '\${{ steps.followup.outputs.result }}';
            const company = '${slug}';
            console.log(result + ': Cleaning up remaining workflows for ' + company);
            const { data: contents } = await github.rest.repos.getContent({
              owner: context.repo.owner, repo: context.repo.repo, path: '.github/workflows'
            });
            const companyFiles = contents.filter(f => f.name.startsWith('followup_' + company + '_'));
            for (const file of companyFiles) {
              await github.rest.repos.deleteFile({
                owner: context.repo.owner, repo: context.repo.repo, path: file.path,
                message: '[auto] ' + result + ' - cancel cadence for ' + company, sha: file.sha
              });
            }

      - name: Clean up this workflow
        if: steps.followup.outputs.result == 'DRAFT_CREATED' || steps.followup.outputs.result == 'REPLIED' || steps.followup.outputs.result == 'BOUNCED'
        uses: actions/github-script@v7
        with:
          script: |
            const { data: file } = await github.rest.repos.getContent({
              owner: context.repo.owner, repo: context.repo.repo, path: '.github/workflows/${workflowFilename}'
            });
            await github.rest.repos.deleteFile({
              owner: context.repo.owner, repo: context.repo.repo, path: '.github/workflows/${workflowFilename}',
              message: '[auto] completed - Email ${emailNum} for ${cadence.company}', sha: file.sha
            });`;
}

async function main() {
  console.log('\n🚀 Telescope Outreach — Pushing Follow-up Workflows\n');

  const cadenceFile = path.join(__dirname, 'cadences.json');
  if (!fs.existsSync(cadenceFile)) {
    console.error('ERROR: cadences.json not found. Create it first.');
    process.exit(1);
  }

  const cadences = JSON.parse(fs.readFileSync(cadenceFile, 'utf8'));
  console.log(`Found ${cadences.length} cadence(s) to push.\n`);

  let pushed = 0;
  let failed = 0;

  for (const cadence of cadences) {
    const slug = slugify(cadence.company);
    console.log(`📧 ${cadence.company} (${cadence.founderEmail})`);

    if (cadence.email2) {
      const workflow = generateWorkflow(cadence, 2);
      const filename = `followup_${slug}_email2.yml`;
      const success = await pushFile(
        `.github/workflows/${filename}`,
        workflow,
        `[outreach] schedule Email 2 for ${cadence.company}`
      );
      if (success) pushed++; else failed++;
    }

    if (cadence.email3) {
      const workflow = generateWorkflow(cadence, 3);
      const filename = `followup_${slug}_email3.yml`;
      const success = await pushFile(
        `.github/workflows/${filename}`,
        workflow,
        `[outreach] schedule Email 3 for ${cadence.company}`
      );
      if (success) pushed++; else failed++;
    }

    console.log('');
  }

  console.log(`\n✅ Done! ${pushed} workflow(s) pushed, ${failed} failed.\n`);
  
  // Archive processed cadences
  const archivePath = path.join(__dirname, 'cadences_pushed.json');
  let archive = [];
  if (fs.existsSync(archivePath)) {
    archive = JSON.parse(fs.readFileSync(archivePath, 'utf8'));
  }
  archive.push(...cadences.map(c => ({ ...c, pushedAt: new Date().toISOString() })));
  fs.writeFileSync(archivePath, JSON.stringify(archive, null, 2));
  
  // Clear the active cadences file
  fs.writeFileSync(cadenceFile, '[]');
  console.log('Cadences archived and queue cleared.');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
