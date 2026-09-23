const fs = require('fs');
const path = require('path');
const config = require('./config.json');
const scenarios = require('./scenarios.json');
const { connect } = require('./lib/browser');
const { submitGift } = require('./lib/gift');
const { loadProcessor, creditCard, bankAccount } = require('./lib/processor');
const { invoiceItems, compareInvoice } = require('./lib/verify');

const ROOT = __dirname;

function parseArgs(argv) {
  const args = {
    sandbox: process.env.SANDBOX || '',
    processor: process.env.PROCESSOR || 'transfirst',
    verify: false,
    references: [],
    scenarios: [],
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--sandbox') {
      args.sandbox = argv[index + 1] || '';
      index += 1;
    } else if (arg.startsWith('--sandbox=')) {
      args.sandbox = arg.slice('--sandbox='.length);
    } else if (arg === '--processor') {
      args.processor = argv[index + 1] || '';
      index += 1;
    } else if (arg.startsWith('--processor=')) {
      args.processor = arg.slice('--processor='.length);
    } else if (arg === '--verify') {
      args.verify = true;
    } else if (arg.startsWith('--')) {
      throw new Error(`Unknown option: ${arg}`);
    } else if (args.verify) {
      args.references.push(arg);
    } else {
      args.scenarios.push(arg);
    }
  }
  if (!/^[A-Za-z0-9]+$/.test(args.sandbox)) {
    const error = new Error('Pass --sandbox <name>, for example --sandbox tsystest02');
    error.usage = true;
    throw error;
  }
  return args;
}

function siteUrl(sandbox) {
  return config.siteUrl.replaceAll('{sandbox}', sandbox);
}

function selectedScenarios(names) {
  if (!names.length) return scenarios;
  const chosen = scenarios.filter((scenario) => names.includes(scenario.id));
  const missing = names.filter((name) => !scenarios.some((scenario) => scenario.id === name));
  if (missing.length) throw new Error(`Unknown scenario: ${missing.join(', ')}`);
  return chosen;
}

function assertPaymentValues(processor, chosen) {
  for (const scenario of chosen) {
    if (scenario.method === 'card') creditCard(processor, scenario.card || 'success');
    else bankAccount(processor, scenario.account || 'success');
  }
}

function judge(result, scenario, invoice, config) {
  const mismatches = [];
  const expect = scenario.expect || {};
  if (expect.outcome === 'decline') {
    if (result.referenceNumber) mismatches.push(`decline returned ${result.referenceNumber}`);
    if (expect.message && !result.message.includes(expect.message)) mismatches.push(`message "${result.message}"`);
    return mismatches;
  }
  if (!result.referenceNumber) mismatches.push(result.message || 'no reference number');
  if (expect.payable != null && result.payable !== Number(expect.payable)) {
    mismatches.push(`payable ${result.payable} != ${expect.payable}`);
  }
  if (expect.className && result.designationType && result.designationType !== expect.className) {
    mismatches.push(`billing class ${result.designationType} != ${expect.className}`);
  }
  mismatches.push(...compareInvoice(invoice && invoice[0], expect, config));
  return mismatches;
}

async function verifyOnly(page, references) {
  if (!page.url().includes('/s/')) {
    await page.goto(config.baseUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(3000);
  }
  const rows = [];
  for (const referenceNumber of references) {
    const lines = await invoiceItems(page, referenceNumber);
    const line = (lines && lines[0]) || null;
    rows.push({
      referenceNumber,
      found: Boolean(line),
      frequency: line && line.BillingFrequency__c,
      className: line && line.Class__r && line.Class__r.Name,
      unitPrice: line && line.UnitPrice__c,
      missionUnit: line && line.MissionUnit__r && line.MissionUnit__r.Name,
      missionUnitCode: line && line.MissionUnit__r && line.MissionUnit__r.Mission_Unit_Code__c,
      tributeType: line && line.Tribute_Type__c,
      remarks: line && line.Remarks__c,
      opportunityId: line && line.Opportunity__c,
    });
    console.log(JSON.stringify(rows[rows.length - 1]));
  }
  return rows;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  config.baseUrl = siteUrl(args.sandbox);
  config.processor = loadProcessor(ROOT, args.processor);
  const chosen = args.verify ? [] : selectedScenarios(args.scenarios);
  if (!args.verify) assertPaymentValues(config.processor, chosen);
  const port = process.env.TSYS_CDP_PORT || '9333';
  const { page, webdriver } = await connect(port);
  console.log(config.baseUrl);
  if (args.verify) {
    if (!args.references.length) throw new Error('Pass one or more reference numbers after --verify');
    await verifyOnly(page, args.references);
    process.exit(0);
  }

  const resultsDir = path.join(ROOT, 'results');
  fs.mkdirSync(resultsDir, { recursive: true });
  const report = {
    startedAt: new Date().toISOString(),
    sandbox: args.sandbox,
    processor: config.processor.id,
    baseUrl: config.baseUrl,
    webdriver,
    gifts: [],
  };

  for (const scenario of chosen) {
    process.stdout.write(`\n${scenario.id} ... `);
    try {
      const result = await submitGift(page, config, scenario);
      let invoice = null;
      if (result.referenceNumber) invoice = await invoiceItems(page, result.referenceNumber);
      const mismatches = judge(result, scenario, invoice, config);
      const row = {
        id: scenario.id,
        pass: mismatches.length === 0,
        mismatches,
        ...result,
        invoice: invoice && invoice[0] ? {
          frequency: invoice[0].BillingFrequency__c,
          className: invoice[0].Class__r && invoice[0].Class__r.Name,
          unitPrice: invoice[0].UnitPrice__c,
          missionUnitCode: invoice[0].MissionUnit__r && invoice[0].MissionUnit__r.Mission_Unit_Code__c,
          tributeType: invoice[0].Tribute_Type__c || null,
          remarks: invoice[0].Remarks__c || null,
          opportunityId: invoice[0].Opportunity__c,
        } : null,
      };
      report.gifts.push(row);
      console.log(row.pass ? `pass ${result.referenceNumber || result.message}` : `FAIL ${mismatches.join('; ')}`);
    } catch (error) {
      report.gifts.push({ id: scenario.id, pass: false, mismatches: [error.message], message: error.message });
      console.log(`FAIL ${error.message}`);
    }
  }

  const stamp = report.startedAt.replace(/[:.]/g, '-');
  const file = path.join(resultsDir, `report-${stamp}.json`);
  fs.writeFileSync(file, JSON.stringify(report, null, 2));
  const failed = report.gifts.filter((gift) => !gift.pass);
  console.log(`\n${report.gifts.length - failed.length}/${report.gifts.length} passed`);
  console.log(file);
  process.exit(failed.length ? 1 : 0);
}

main().catch((error) => {
  console.error(error.usage ? error.message : error);
  process.exit(1);
});
