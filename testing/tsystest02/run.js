const fs = require('fs');
const path = require('path');
const config = require('./config.json');
const scenarios = require('./scenarios.json');
const { connect } = require('./lib/browser');
const { submitGift } = require('./lib/gift');
const { invoiceItems, compareInvoice } = require('./lib/verify');

const ROOT = __dirname;

function selectedScenarios() {
  const names = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
  if (!names.length) return scenarios;
  const chosen = scenarios.filter((scenario) => names.includes(scenario.id));
  const missing = names.filter((name) => !scenarios.some((scenario) => scenario.id === name));
  if (missing.length) throw new Error(`Unknown scenario: ${missing.join(', ')}`);
  return chosen;
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
  const verifyFlag = process.argv.indexOf('--verify');
  const port = process.env.TSYS_CDP_PORT || '9333';
  const { page, webdriver } = await connect(port);
  if (verifyFlag !== -1) {
    const references = process.argv.slice(verifyFlag + 1).filter((arg) => !arg.startsWith('--'));
    if (!references.length) throw new Error('Pass one or more reference numbers after --verify');
    await verifyOnly(page, references);
    process.exit(0);
  }

  const resultsDir = path.join(ROOT, 'results');
  fs.mkdirSync(resultsDir, { recursive: true });
  const report = {
    startedAt: new Date().toISOString(),
    baseUrl: config.baseUrl,
    webdriver,
    gifts: [],
  };

  for (const scenario of selectedScenarios()) {
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
  console.error(error);
  process.exit(1);
});
