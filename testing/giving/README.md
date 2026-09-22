# Sandbox gift tests

Guest checkout against a Young Life sandbox giving site. Pass the sandbox name; the site URL is `https://young-life--{sandbox}.sandbox.my.site.com/s/`.

These scenarios were written for the tsystest02 Tsys TXP TransFirst mock:

- A card number ending in `00` is approved. A card number ending in `01` is declined.
- An ACH account ending in `00` is approved. The routing number is `121212121`. An account ending in `01` is declined.

Another sandbox can use the same runner. If its processor rules differ, change the card and ACH numbers in `config.json` and the expectations in `scenarios.json`.

Successful gifts come back with a `YL…` reference number. The confirmation page loads that number through `YL_giftConfirmationController.getInvoiceItems`, which returns the `RP_InvoiceLine__c` (mission unit, class, frequency, amount, tribute). This package submits the gift, then checks that invoice line. Declines are checked on the billing page and are not given a reference number.

`rp_paymenttransaction__c` is not readable by the community guest, so these tests do not assert that object.

## Setup

```bash
cd testing/giving
npm install
```

The runner starts a normal Google Chrome with a remote debugging port and attaches to it. Playwright’s own browser sets `navigator.webdriver`, and this site then rejects the gift with “Captcha verification failed”. Set `CHROME_PATH` if Chrome is not on the default path. Set `TSYS_CDP_PORT` (default `9333`) to attach to a Chrome you already started.

## Run

`--sandbox` is required. `tsystest02` is one sandbox name, not the only target.

```bash
node run.js --sandbox tsystest02
node run.js --sandbox tsystest02 cc-onetime-fee ach-decline
node run.js --sandbox tsystest02 --verify YL0017738056
```

`SANDBOX=tsystest02 node run.js` is the same as `--sandbox tsystest02`.

A full run writes `results/report-*.json` and creates real guest gifts in that sandbox. Results, `node_modules`, and the Chrome profile are not committed.

## Scenarios

| Id | Gift | Expected |
|---|---|---|
| `cc-onetime-fee` | $50 one-time card, fee left on | $51.75, Operating |
| `cc-monthly-fee` | $25 monthly card, fee on | $25.88, Monthly |
| `ach-onetime-checking` | $100 one-time checking | $100, no fee |
| `ach-quarterly-checking` | $75 quarterly checking | $75 |
| `cc-annual-tribute` | $100 annual card, In Honor of Pat Example | $103.50, tribute Honor |
| `cc-camp-scholarship` | $50 one-time card, Camp Scholarship | $51.75, class Camp Scholarship |
| `ach-semiannual-savings` | $40 semiannual savings | $40 |
| `cc-onetime-no-fee` | $50 one-time card, fee unchecked | $50 |
| `cc-decline` | card ending 01 | “Refer to card issuer” |
| `ach-decline` | account ending 01 | “Refer to card issuer” |

Every gift is a guest checkout to Boonville Young Life (IN113), 123 Test Lane, Colorado Springs, CO 80903. The card fee is 3.5% and the “I agree to cover processing fee” box is checked when Credit Card is selected.

Edit `config.json` for the site URL pattern, designation search, address, and the mock card and ACH numbers. Edit `scenarios.json` to add or drop cases.
