const puppeteerFirefox = require('puppeteer-firefox');
const targetUri = "https://phl.carto.com/api/v2/sql?q=SELECT+*+FROM+business_licenses&filename=business_licenses&format=shp&skipfields=cartodb_id";
const staging_folder = "/Users/Rich/CSprojects/scrapeGIS/tmp/c42101_business_licenses_tmp/";

(async () => {
  const browser = await puppeteerFirefox.launch({headless:false});
  const page = await browser.newPage();
  await page.setDefaultNavigationTimeout(1000*60*3);  // 3 min default timeout
  await page._client.send('Page.setDownloadBehavior',
      {behavior: 'allow', downloadPath: staging_folder});
  await page.goto(url); 
  await browser.close();
})();