const FREQUENCIES = {
  once: '#radio-once',
  monthly: '#radio-monthly',
  quarterly: '#radio-quarterly',
  annually: '#radio-annually',
  semiannual: '#radio-semi-annually',
};

async function clickButton(page, pattern) {
  const clicked = await page.locator('button').evaluateAll((buttons, source) => {
    const matcher = new RegExp(source, 'i');
    const button = [...buttons].reverse().find((candidate) => matcher.test((candidate.innerText || '').replace(/\s+/g, ' ').trim()));
    if (!button) return '';
    button.click();
    return (button.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  }, pattern);
  if (!clicked) throw new Error(`Button not found: ${pattern}`);
  return clicked;
}

async function fillPlaceholder(page, placeholder, value) {
  const input = page.locator(`input[placeholder="${placeholder}"]`).last();
  await input.waitFor({ state: 'attached', timeout: 15000 });
  await input.click({ force: true });
  await input.fill(value);
}

async function selectFrequency(page, frequency) {
  const selector = FREQUENCIES[frequency];
  if (!selector) throw new Error(`Unknown frequency: ${frequency}`);
  await page.locator(selector).evaluate((element) => {
    const more = document.querySelector('#radio-more');
    if (element.id !== 'radio-once' && element.id !== 'radio-monthly' && more) more.click();
    element.click();
    element.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

async function chooseRecipient(page, config) {
  await page.locator('button').evaluateAll((buttons) => {
    const reset = buttons.find((button) => (button.innerText || '').trim() === 'RESET FORM');
    if (reset) reset.click();
  });
  await page.waitForTimeout(600);
  const search = page.locator('input[placeholder*="Location"]');
  await search.click({ force: true });
  await search.fill(config.designation.search);
  await search.press('Enter');
  const recipient = page.getByText(config.designation.recipient).first();
  await recipient.waitFor({ timeout: 20000 });
  await recipient.click();
  await page.waitForTimeout(1000);
}

async function setTribute(page, tribute) {
  await page.locator('span.option-value, button, span').evaluateAll((elements) => {
    const tributeControl = elements.find((element) => (element.innerText || '').trim() === 'Tribute');
    if (tributeControl) tributeControl.click();
  });
  await page.locator('input[placeholder="First Name*"]').waitFor({ state: 'attached', timeout: 8000 });
  await page.locator('input[value="In Honor Of"]').check({ force: true });
  await page.locator('input[placeholder="First Name*"]').fill(tribute.first);
  await page.locator('input[placeholder="Last Name*"]').fill(tribute.last);
  await clickButton(page, '^SAVE$');
  await page.waitForTimeout(800);
}

async function setCoverFee(page, coverFee) {
  if (coverFee !== false) return;
  const boxes = page.locator('input[type="checkbox"]');
  const count = await boxes.count();
  for (let index = 0; index < count; index += 1) {
    const info = await boxes.nth(index).evaluate((element) => {
      const host = element.getRootNode() && element.getRootNode().host;
      const text = ((host && host.innerText) || '').replace(/\s+/g, ' ');
      return { checked: element.checked, text };
    });
    if (/processing fee/i.test(info.text) && info.checked) {
      await boxes.nth(index).click({ force: true });
      await page.waitForTimeout(600);
      return;
    }
  }
  throw new Error('Processing-fee checkbox was not found');
}

async function selectSavings(page) {
  const radios = page.locator('input[type="radio"]');
  const count = await radios.count();
  for (let index = 0; index < count; index += 1) {
    const value = await radios.nth(index).evaluate((element) => `${element.value} ${element.id}`);
    if (!/sav/i.test(value)) continue;
    const id = await radios.nth(index).getAttribute('id');
    const label = page.locator(`label[for="${id}"]`);
    if (await label.count()) await label.click({ force: true });
    else await radios.nth(index).evaluate((element) => element.click());
    return;
  }
  throw new Error('Savings account option was not found');
}

function money(text, label) {
  const match = text.match(new RegExp(`${label}:\\s*\\$([0-9,.]+)`));
  return match ? Number(match[1].replace(/,/g, '')) : null;
}

function outcomeMessage(text) {
  const decline = text.match(/Refer to card issuer[^\n]*/);
  if (decline) return decline[0].replace(/\s+/g, ' ').trim();
  const captcha = text.match(/Captcha verification failed/);
  if (captcha) return 'Captcha verification failed';
  const unable = text.match(/unable to process your donation[^\n]*/i);
  if (unable) return unable[0].replace(/\s+/g, ' ').trim();
  const thanks = text.match(/Thank you[\s\S]{0,60}/);
  if (thanks) return thanks[0].replace(/\s+/g, ' ').trim();
  return '';
}

async function submitGift(page, config, scenario) {
  const home = config.baseUrl.endsWith('/') ? config.baseUrl : `${config.baseUrl}/`;
  await page.goto(home, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(4000);

  if (scenario.amountPreset) {
    await page.locator(`button[name="${scenario.amountPreset}"]`).click();
  } else {
    await page.locator('#other').click();
    await page.locator('#other').fill(String(scenario.amount));
    await page.locator('#other').blur();
  }
  await selectFrequency(page, scenario.frequency);
  await page.waitForTimeout(300);
  await clickButton(page, 'NEXT');
  await page.waitForURL(/gift-designation/, { timeout: 30000 });
  await page.waitForTimeout(1200);
  await chooseRecipient(page, config);
  if (scenario.designation && scenario.designation !== 'Operating') {
    await page.locator('select').filter({ hasText: 'Camp Scholarship' }).first().selectOption({ label: scenario.designation });
  }
  if (scenario.tribute) await setTribute(page, scenario.tribute);
  await clickButton(page, '^NEXT$');
  await page.waitForURL(/gift-billing/, { timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.locator('button[name="contact-detail"]').click();

  const email = scenario.email || `tsys02.${scenario.id}.${Date.now()}@example.com`;
  await fillPlaceholder(page, 'First Name', scenario.first);
  await fillPlaceholder(page, 'Last Name', scenario.last);
  await fillPlaceholder(page, 'name@email.com', email);
  await fillPlaceholder(page, 'Street', config.address.street);
  await fillPlaceholder(page, 'City', config.address.city);
  await fillPlaceholder(page, 'Postal Code', config.address.postalCode);
  await page.locator('select').filter({ hasText: config.address.state }).last().selectOption({ label: config.address.state });

  await page.locator('button[name="payment-detail"]').click();
  await page.waitForTimeout(500);
  if (scenario.method === 'card') {
    await page.locator('a.slds-tabs_default__link').evaluateAll((links) => {
      const credit = links.find((link) => (link.innerText || '').trim() === 'CREDIT CARD');
      if (credit) credit.click();
    });
    await page.waitForTimeout(600);
    const number = scenario.card === 'decline' ? config.card.declineNumber : config.card.successNumber;
    await fillPlaceholder(page, 'Cardholder Name', `${scenario.first} ${scenario.last}`);
    await fillPlaceholder(page, 'Card #', number);
    await fillPlaceholder(page, 'Expiration Month', config.card.expMonth);
    await fillPlaceholder(page, 'Expiration Year', config.card.expYear);
    await fillPlaceholder(page, 'Security Code', config.card.cvv);
    await setCoverFee(page, scenario.coverFee);
  } else {
    await page.locator('a.slds-tabs_default__link').evaluateAll((links) => {
      const bank = links.find((link) => (link.innerText || '').trim() === 'BANK ACCOUNT');
      if (bank) bank.click();
    });
    const account = scenario.account === 'decline' ? config.ach.declineAccount : config.ach.successAccount;
    await fillPlaceholder(page, 'Account Owner Name', `${scenario.first} ${scenario.last}`);
    await fillPlaceholder(page, 'Account #', account);
    await fillPlaceholder(page, 'Confirm Account #', account);
    await fillPlaceholder(page, 'Routing #', config.ach.routing);
    await fillPlaceholder(page, 'Confirm Routing #', config.ach.routing);
    if (scenario.accountType === 'Savings') await selectSavings(page);
  }

  const summary = await page.locator('body').innerText();
  await clickButton(page, 'SUBMIT YOUR GIFT');
  let text = '';
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await page.waitForTimeout(1500);
    text = await page.locator('body').innerText();
    if (/referenceNumber=/.test(page.url()) || /Thank you|Refer to card issuer|Captcha verification failed|unable to process your donation/i.test(text)) break;
  }
  const referenceNumber = (page.url().match(/referenceNumber=([^&]+)/) || [])[1] || '';
  return {
    email,
    referenceNumber,
    url: page.url(),
    payable: money(summary, 'Total Amount Payable'),
    dueToday: money(summary, 'Total Due Today'),
    fee: money(summary, 'Processing fee'),
    giftLine: ((summary.match(/\$[0-9,.]+\/[^\n]+/) || [''])[0]).trim(),
    designationType: ((summary.match(/Operating|Camp Scholarship|Capital|Capernaum|Multiethnic|WyldLife|YoungLives|Young Life College/) || [''])[0]),
    message: outcomeMessage(text),
  };
}

module.exports = { submitGift };
