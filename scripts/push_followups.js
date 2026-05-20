const https = require("https");
const fs = require("fs");
const path = require("path");

const envPath = path.join(__dirname, "..", ".env");
const envLines = fs.readFileSync(envPath, "utf-8").split("\n");
const env = {};
envLines.forEach(line => {
  const idx = line.indexOf("=");
  if (idx > 0) env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
});

const PAT = env.GH_PAT;
const REPO = "ckootelescope/telescopeoutreach";
const template = fs.readFileSync(path.join(__dirname, "followup_template.yml"), "utf-8");

function api(method, apiPath, body) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: "api.github.com",
      path: "/repos/" + REPO + apiPath,
      method,
      headers: {
        Authorization: "Bearer " + PAT,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "telescopeoutreach"
      }
    };
    if (body) opts.headers["Content-Type"] = "application/json";
    const req = https.request(opts, res => {
      let d = "";
      res.on("data", c => d += c);
      res.on("end", () => {
        if (res.statusCode >= 400) reject(new Error(res.statusCode + ": " + d));
        else resolve(JSON.parse(d));
      });
    });
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function makeYaml(company, slug, founder, email, domain, threadId, subject, emailBody, emailNum, cronSchedule) {
  const fn = "followup_" + slug + "_email" + emailNum + ".yml";
  let y = template;
  y = y.replace("EMAIL_NUMBER - COMPANY_NAME", emailNum + " - " + company);
  y = y.replace("CRON_SCHEDULE", cronSchedule);
  y = y.replace("COMPANY_NAME_VALUE", company);
  y = y.replace("FOUNDER_NAME_VALUE", founder);
  y = y.replace("FOUNDER_EMAIL_VALUE", email);
  y = y.replace("COMPANY_DOMAIN_VALUE", domain);
  y = y.replace("THREAD_ID_VALUE", threadId);
  y = y.replace("MESSAGE_ID_VALUE", threadId);
  y = y.replace("EMAIL_SUBJECT_VALUE", subject);
  y = y.replace("EMAIL_BODY_VALUE", emailBody.replace(/"/g, '\\"'));
  y = y.replace(/EMAIL_NUMBER_VALUE/g, String(emailNum));
  y = y.replace("WORKFLOW_FILENAME", fn);
  y = y.replace("COMPANY_SLUG", slug);
  return { path: ".github/workflows/" + fn, content: y };
}

async function main() {
  const companies = JSON.parse(fs.readFileSync(process.argv[2], "utf-8"));
  const files = [];

  for (const c of companies) {
    if (c.email2) {
      files.push(makeYaml(c.company, c.slug, c.founder, c.email, c.domain, c.threadId, c.subject, c.email2, 2, c.cron2));
    }
    if (c.email3) {
      files.push(makeYaml(c.company, c.slug, c.founder, c.email, c.domain, c.threadId, c.subject, c.email3, 3, c.cron3));
    }
  }

  if (files.length === 0) { console.log("No files to push."); return; }

  console.log("Pushing " + files.length + " workflow files...");

  const ref = await api("GET", "/git/ref/heads/main");
  const sha = ref.object.sha;
  const tree = await api("GET", "/git/trees/" + sha);

  const treeItems = [];
  for (const f of files) {
    const blob = await api("POST", "/git/blobs", { content: f.content, encoding: "utf-8" });
    treeItems.push({ path: f.path, mode: "100644", type: "blob", sha: blob.sha });
    console.log("  " + f.path);
  }

  const newTree = await api("POST", "/git/trees", { base_tree: tree.sha, tree: treeItems });
  const names = companies.map(c => c.company).join(", ");
  const commit = await api("POST", "/git/commits", {
    message: "[outreach] schedule follow-ups for " + names,
    tree: newTree.sha,
    parents: [sha]
  });
  await api("PATCH", "/git/refs/heads/main", { sha: commit.sha });

  console.log("Done! Commit: " + commit.sha.slice(0, 7));
}

main().catch(e => { console.error("ERROR:", e.message); process.exit(1); });
