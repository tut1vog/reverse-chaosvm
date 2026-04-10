Run the headless scraper against a target URL.

Usage: /scrape <url>

Arguments:
  url - The URL or domain to check via urlsec.qq.com

The scraper solves the Tencent CAPTCHA without Puppeteer (using jsdom for vData generation)
and submits the ticket to urlsec.qq.com to get URL security results.

```bash
node scraper/cli.js --verbose $ARGUMENTS
```
