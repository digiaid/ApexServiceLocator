# Sandbox gift tests

Guest checkout against a Young Life sandbox giving site. Pass the sandbox name; the site URL is `https://young-life--{sandbox}.sandbox.my.site.com/s/`.

Card numbers, CVVs, bank accounts, and known pass or fail results live in one file per processor under `processors/`. The scenarios in `scenarios.json` were written for TransFirst: they look up the cards and accounts named `success` and `decline`.

`processors/transfirst.json` is the Tsys TXP TransFirst mock confirmed on tsystest02. A card or account ending in `00` is approved. Ending in `01` is declined. The ACH routing number is `121212121`.

`processors/transit.json` is TSYS TransIt. Its test cards and the amounts that pass, fail, or partially approve are the published TSYS test-host values. On that host the same card passes or fails based on the amount. Those values have not been confirmed on a Young Life sandbox, and the current scenarios do not use them.

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
node run.js --sandbox tsystest02 --processor transfirst cc-onetime-fee ach-decline
node run.js --sandbox tsystest02 --verify YL0017738056
```

`SANDBOX=tsystest02 node run.js` is the same as `--sandbox tsystest02`. `--processor` defaults to `transfirst`. `PROCESSOR=transit` selects `processors/transit.json`.

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

Edit `config.json` for the site URL pattern, designation search, and address. Add a processor by dropping another JSON file in `processors/` and passing its file name to `--processor`. Edit `scenarios.json` to add or drop cases. A scenario’s `card` or `account` value is the `id` inside the selected processor file.
