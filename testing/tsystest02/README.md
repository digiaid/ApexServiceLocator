# tsystest02 gift tests

Guest checkout against the Young Life tsystest02 giving site. That sandbox uses a Tsys TXP TransFirst mock:

- A card number ending in `00` is approved. A card number ending in `01` is declined.
- An ACH account ending in `00` is approved. The routing number is `121212121`. An account ending in `01` is declined.

Successful gifts come back with a `YL…` reference number. The confirmation page loads that number through `YL_giftConfirmationController.getInvoiceItems`, which returns the `RP_InvoiceLine__c` (mission unit, class, frequency, amount, tribute). This package submits the gift, then checks that invoice line. Declines are checked on the billing page and are not given a reference number.

`rp_paymenttransaction__c` is not readable by the community guest, so these tests do not assert that object.

## Setup

```bash
cd testing/tsystest02
npm install
```

The runner starts a normal Google Chrome with a remote debugging port and attaches to it. Playwright’s own browser sets `navigator.webdriver`, and this site then rejects the gift with “Captcha verification failed”. Set `CHROME_PATH` if Chrome is not on the default path. Set `TSYS_CDP_PORT` (default `9333`) to attach to a Chrome you already started.

## Run

From `testing/tsystest02`:

```bash
npm test
node run.js cc-onetime-fee ach-decline
node run.js --verify YL0017738056
```

`npm test` runs every scenario in `scenarios.json` and writes `results/report-*.json`. Each run creates real guest gifts in the sandbox. Results, `node_modules`, and the Chrome profile are not committed.

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

Edit `config.json` for the site URL, designation search, address, and the mock card and ACH numbers. Edit `scenarios.json` to add or drop cases.
