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

function getValues(token, range) {
  return new Promise((resolve) => {
    const sheetId = '1-cjKaFsrXyUjUmZbKcEKr4g9u8ATjVeY0kb8v23CvQk';
    const req = https.request({
      hostname: 'sheets.googleapis.com',
      path: '/v4/spreadsheets/' + sheetId + '/values/' + encodeURIComponent(range),
      method: 'GET',
      headers: { Authorization: 'Bearer ' + token }
    }, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(JSON.parse(d))); });
    req.end();
  });
}

function updateValues(token, range, values) {
  return new Promise((resolve) => {
    const sheetId = '1-cjKaFsrXyUjUmZbKcEKr4g9u8ATjVeY0kb8v23CvQk';
    const body = JSON.stringify({ range, values, majorDimension: 'ROWS' });
    const req = https.request({
      hostname: 'sheets.googleapis.com',
      path: '/v4/spreadsheets/' + sheetId + '/values/' + encodeURIComponent(range) + '?valueInputOption=USER_ENTERED',
      method: 'PUT',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(JSON.parse(d))); });
    req.write(body); req.end();
  });
}

const oneLiners = {
  "Cotool": "Security operations AI agents",
  "RiskFront": "AI compliance risk assessment",
  "WiseBee": "AI cybersecurity threat detection",
  "Entangl": "Data center design verification",
  "Advance": "Insurance premium fund management",
  "ControlTheory": "Edge observability platform",
  "Freeflow": "P&C insurance workflow automation",
  "Hunted Labs": "Software supply chain security",
  "APIContext": "API monitoring and governance",
  "Corgea": "AI code vulnerability remediation",
  "DiversiFi": "3PL shipment optimization software",
  "Faction": "Manufacturing quoting and procurement AI",
  "Corvera": "CPG supply chain automation",
  "Contractor Commerce": "HVAC contractor e-commerce platform",
  "LaborUp": "Manufacturing skilled labor recruiting",
  "Soff": "AI procurement automation",
  "Turgon": "Enterprise data migration AI",
  "FlowGen Labs": "SAP S/4HANA migration automation",
  "Astrada": "Real-time card data API",
  "Boon": "Construction takeoff and bidding AI",
  "Cedar": "AI housing development planning",
  "Structured": "Construction document review AI",
  "TwinKnowledge": "Construction document quality AI",
  "Bixby": "Construction submittal review AI",
  "MeltPlan": "Pre-construction code compliance AI",
  "Wyre": "Construction scope generation AI",
  "Kay": "Insurance back-office automation",
  "Arcovo": "AI digital employees platform",
  "Constructable": "Construction project management platform",
  "Flycore": "Autonomous drone security",
  "Candid Wholesale": "B2B wholesale management platform",
  "RepSpark": "B2B wholesale e-commerce platform",
  "Streamlined": "",
  "Procode": "Surgical billing AI copilot",
  "Walkway": "Attractions revenue management AI",
  "Magenta": "Manufacturing compliance automation",
  "Archouse": "Hospice admissions operations platform",
  "Noxus": "AI customer operations automation",
  "Eddifi": "Public benefits screening platform",
  "Helmet Security": "Agentic AI security platform",
  "CodeComply": "Building code compliance AI",
  "UserJourneys": "AI session replay analysis",
  "Simple": "AI voice phone agents",
  "Anchor Browser": "Cloud browser for AI agents",
  "Arga Labs": "PR staging environments",
  "Complement": "Manufacturing operations analytics AI",
  "Alpharun": "AI sales coaching platform",
  "Resourcly": "Manufacturing inventory optimization",
  "TruthSystems": "AI governance compliance agents",
  "Lumari": "AI supply chain procurement",
  "Burnt": "Data verification infrastructure",
  "Procure": "AI procurement automation",
  "Synth": "Coding agent optimization",
  "Prediko": "Shopify inventory forecasting",
  "Corvus": "Surgical referral automation",
  "Nexcade": "Freight forwarding AI agents",
  "Reform": "Conversion-focused form builder",
  "Peasy": "SMB marketing automation",
  "Clipp": "Food supply chain digitization",
  "Zoey": "B2B wholesale ecommerce",
  "Abundant": "AI testing and evaluation",
  "Agentuity": "AI agent deployment platform",
  "Airrived": "Cybersecurity AI copilot",
  "Alcor Labs": "Wearable AI for assembly",
  "Ando": "AI workforce scheduling",
  "Applied": "AI customer service agents",
  "Archestra.ai": "Enterprise AI agent management",
  "Archimetis": "Refinery operations AI",
  "arva": "AML compliance automation",
  "Ashler Construction": "AI for engineering firms",
  "Beagle Labs": "Insurance claims AI",
  "BravoTran": "Freight payables automation",
  "Cadastral": "CRE workflow automation",
  "Candid": "EPC project AI agent",
  "Cara": "Insurance AI platform",
  "centrum ai": "Supply chain risk management",
  "Cleavr": "AI accounts receivable automation",
  "Continuum": "Financial advisor AI copilot",
  "Corbel": "Equipment sales AI assistant",
  "Cross Check": "Compliance audit automation",
  "Designverse.ai": "Design-to-code AI platform",
  "Discern Security": "Security policy management",
  "Dux Development": "Vulnerability management platform",
  "Echelon": "ServiceNow development AI",
  "EM1": "Emergency management AI",
  "Examen Solutions": "CRE document intelligence",
  "Ferry": "Manufacturing execution system",
  "Fireproof": "Fire department records management",
  "Flight Science": "Airline operations optimization",
  "FreshX": "Refrigerated freight marketplace",
  "Frugal AI": "Cloud cost optimization",
  "Get Blaise": "Insurance AI assistant",
  "Grand": "AI credit risk intelligence",
  "Grantd": "Equity compensation management",
  "Hammr": "Construction payroll platform",
  "Hey Archie": "AI accounting assistant",
  "Hilt": "Data governance and DLP",
  "Inscora": "Cyber insurance readiness for MSPs",
  "Intellectible": "Services revenue operations automation",
  "IntelliGRC": "Cybersecurity compliance management",
  "Intropy AI": "Parts distributor AI platform",
  "Kinfolk": "AI HR helpdesk for Slack",
  "Kinth": "AI parametric CAD design",
  "Kudwa": "AI finance consolidation platform",
  "Lantern": "Distributor demand forecasting",
  "Lava": "AI billing and gateway",
  "Loophole Labs": "Cloud workload portability infra",
  "luzid.io": "Enterprise software implementation AI",
  "Maestro Tech": "AI mortgage origination",
  "Manifest": "AI agency time tracking",
  "Marble AI": "Hospital inventory tracking",
  "MEGA": "AI debt collection agents",
  "Mendo": "Enterprise gen AI adoption",
  "Mentium": "Logistics payment automation",
  "midship.ai": "AI SOX audit automation",
  "MilagroAI": "AI medical coding",
  "Nebula": "AI agent memory infra",
  "Nebulock": "AI threat hunting platform",
  "neuronfactory": "Construction workflow AI",
  "Olympian": "AI receptionist for home services",
  "Origami": "AI B2B lead generation",
  "Packsmith": "E-commerce fulfillment platform",
  "pathwork diagnostics": "Insurance distribution AI",
  "PensarAI": "AI vulnerability management",
  "Plasma": "AI restaurant POS system",
  "PrimePoint": "Construction drawing analysis AI",
  "PromptArmor": "AI risk management platform",
  "Prox": "Logistics workflow automation",
  "pulllogic": "AI supply chain planning",
  "Qued": "Freight appointment scheduling",
  "Ranger AI": "Industrial RFP automation",
  "Rapta": "Manufacturing quality control AI",
  "Rectangle Labs": "Shipment data API",
  "Regulis AI": "Trucking compliance automation",
  "Reviva": "EHR for cash-pay practices",
  "SAMMY Labs": "AI documentation management",
  "Sevii": "Autonomous cyber threat remediation",
  "Signalcore AI": "AI system evaluation infra",
  "StitcherAI": "Cloud spend data integration",
  "Swarm": "AI user testing simulation",
  "Sybilion": "Supply chain procurement intelligence",
  "systemzero": "AI CFO operating system",
  "Technova": "Supply chain IoT monitoring",
  "Tenkara": "Manufacturing procurement automation",
  "Tero": "Observability data control plane",
  "Tex Software": "Heavy equipment market intelligence",
  "Thirdlaw": "Runtime AI safety platform",
  "tofu": "Hiring fraud detection",
  "Triage": "LLM security and observability",
  "unkey.dev": "API key management platform",
  "uno.ai": "AI-powered GRC automation",
  "Usul": "AI for government contract discovery",
  "VALLOR": "AI procurement contract management",
  "Vidoc Security Lab": "Code vulnerability detection platform",
  "Woodrow AI": "AI agent for enterprise finance",
  "Workfabric AI": "Enterprise context engine for AI",
  "Zalion": "AI procurement agents",
  "Zeit AI": "AI-powered business data analytics",
  "ZeroDrift": "Financial communications compliance enforcement",
  "Zolvo": "AI commercial lending automation",
  "chrt": "Time-critical shipping logistics platform",
  "Sapien": "AI financial analysis platform",
  "Atomic Insights": "Wealth manager money movement automation",
  "Ai Lean": "Self-storage lien management automation",
  "RAYVN": "Critical event management software",
  "GoodDay": "ERP for Shopify brands",
  "eCourtDate": "Court notifications and juror management",
  "Scopito": "AI infrastructure inspection analytics",
  "eHawk": "Criminal justice supervision software",
  "VoiceRun": "Enterprise voice application platform",
  "Kepler": "Verifiable AI for enterprise decisions",
  "Cloneable": "Industrial expert knowledge automation",
  "Ubico": "Automated outbound sales engagement",
  "Mirror Security": "Encrypted AI data processing",
  "Tandem": "AI for mechanical CAD design",
  "Nao": "Open-source AI analytics agents",
  "Hoop": "Secure data access gateway",
  "Complir": "Product regulatory compliance automation",
  "Verita": "AI talent matching network",
  "Conduit": "Robot and machine orchestration platform",
  "Intermezzo": "Global payroll API platform",
  "Bearing": "Physical security operations management",
  "Harmony": "AI agents for manufacturing operations",
  "Flamingo": "Open-source MSP operations platform",
  "Lexful": "AI documentation for MSPs",
  "Cleric": "AI production incident root-cause analysis",
  "Cavtera": "Construction data operations platform",
  "symmetRE": "Commercial real estate reporting software",
  "Edwin": "AI treasury for local governments",
  "Alpa": "Restaurant financial management platform",
  "Alguna": "Usage-based billing and pricing",
  "Internet Backyard": "Financial ops for compute providers",
  "RamAIn": "AI UI task automation",
  "Quash": "AI-driven credit risk assessment",
  "BalancedTrust": "Bank risk and compliance automation",
  "Kotini": "Estate agent onboarding and compliance",
  "JustWin": "AI government bid response automation",
  "Rama": "AI for electronics component distributors",
  "Petra Security": "Microsoft 365 threat detection",
  "Domu": "AI-powered debt collection automation",
  "Certo": "Consumer product compliance automation",
  "Trace": "AI workflow orchestration layer"
};

async function main() {
  const token = await getAccessToken();

  // Read current companies from column C
  const result = await getValues(token, "'Monthly Break-In'!C3:C250");
  const companies = (result.values || []).map(r => r[0] || '');
  const actualCount = companies.filter(c => c !== '').length;
  console.log('Companies in sheet: ' + actualCount);

  // Build one-liner values matched by company name
  const values = companies.map(company => {
    if (!company) return [''];
    const liner = oneLiners[company] || '';
    if (!liner) console.log('No one-liner for: ' + company);
    return [liner];
  });

  // Write to column E, covering all rows including clearing overflow
  const range = "'Monthly Break-In'!E3:E" + (3 + values.length - 1);
  const writeResult = await updateValues(token, range, values);
  console.log('Written: ' + (writeResult.updatedCells || 0) + ' cells to ' + (writeResult.updatedRange || ''));

  const filled = values.filter(v => v[0] !== '').length;
  console.log('Filled: ' + filled + '/' + actualCount);
}

main().catch(e => console.error(e));
