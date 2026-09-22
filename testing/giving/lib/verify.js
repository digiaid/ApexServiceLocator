async function auraContext(page) {
  return page.evaluate(() => {
    const sources = `${document.documentElement.innerHTML}\n${[...document.scripts].map((script) => script.src).join('\n')}`;
    const encodedFwuid = sources.match(/fwuid%22%3A%22([^%"']+)/);
    const plainFwuid = sources.match(/"fwuid":"([^"]+)"/);
    const loadedMatch = sources.match(/1712_[A-Za-z0-9_-]+/);
    let fwuid = '';
    if (encodedFwuid) fwuid = decodeURIComponent(encodedFwuid[1]);
    else if (plainFwuid) fwuid = plainFwuid[1];
    return { fwuid, loaded: loadedMatch ? loadedMatch[0] : '' };
  });
}

async function invoiceItems(page, referenceNumber) {
  const { fwuid, loaded } = await auraContext(page);
  if (!fwuid || !loaded) throw new Error('Could not read the Aura context from the page');
  return page.evaluate(async ({ fwuid, loaded, referenceNumber }) => {
    const context = {
      mode: 'PROD',
      fwuid,
      app: 'siteforce:communityApp',
      loaded: { 'APPLICATION@markup://siteforce:communityApp': loaded },
      dn: [],
      globals: {},
      uad: true,
    };
    const message = {
      actions: [{
        id: '1;a',
        descriptor: 'apex://YL_giftConfirmationController/ACTION$getInvoiceItems',
        callingDescriptor: 'markup://c:YL_GiftConfirmation',
        params: { referenceNumber },
      }],
    };
    const body = new URLSearchParams({
      message: JSON.stringify(message),
      'aura.context': JSON.stringify(context),
      'aura.pageURI': `/s/gift-confirmation?referenceNumber=${referenceNumber}`,
      'aura.token': 'null',
    });
    const response = await fetch('/s/sfsites/aura?r=9&other.YL_giftConfirmationController.getInvoiceItems=1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      body,
      credentials: 'include',
    });
    const payload = JSON.parse(await response.text());
    const action = payload.actions && payload.actions[0];
    if (!action || action.state !== 'SUCCESS') {
      const error = action && action.error && action.error[0];
      throw new Error(error ? JSON.stringify(error).slice(0, 400) : 'getInvoiceItems failed');
    }
    return action.returnValue;
  }, { fwuid, loaded, referenceNumber });
}

function compareInvoice(line, expect, config) {
  const mismatches = [];
  if (!line) {
    mismatches.push('no invoice line');
    return mismatches;
  }
  if (expect.frequency && line.BillingFrequency__c !== expect.frequency) {
    mismatches.push(`frequency ${line.BillingFrequency__c} != ${expect.frequency}`);
  }
  if (expect.className && line.Class__r && line.Class__r.Name !== expect.className) {
    mismatches.push(`class ${line.Class__r && line.Class__r.Name} != ${expect.className}`);
  }
  if (expect.payable != null && Number(line.UnitPrice__c) !== Number(expect.payable)) {
    mismatches.push(`unit price ${line.UnitPrice__c} != ${expect.payable}`);
  }
  const code = line.MissionUnit__r && line.MissionUnit__r.Mission_Unit_Code__c;
  if (code !== config.designation.missionUnitCode) {
    mismatches.push(`mission unit ${code} != ${config.designation.missionUnitCode}`);
  }
  if (expect.tributeType && line.Tribute_Type__c !== expect.tributeType) {
    mismatches.push(`tribute ${line.Tribute_Type__c} != ${expect.tributeType}`);
  }
  if (expect.remarks && line.Remarks__c !== expect.remarks) {
    mismatches.push(`remarks ${line.Remarks__c} != ${expect.remarks}`);
  }
  return mismatches;
}

module.exports = { invoiceItems, compareInvoice };
