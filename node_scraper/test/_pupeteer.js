// puppeteer-extra is a drop-in replacement for puppeteer,
// it augments the installed puppeteer with plugin functionality
const puppeteer = require('puppeteer-extra')

// add stealth plugin and use defaults (all evasion techniques)
const StealthPlugin = require('puppeteer-extra-plugin-stealth')
puppeteer.use(StealthPlugin())

// puppeteer usage as normal
puppeteer.launch({ 
  headless: true, 
  ignoreHTTPSErrors: true,
  args: [`--proxy-server=http://proxy-server.scraperapi.com:8001`],
 }).then(async browser => {
  console.log('Running tests..')
  const page = await browser.newPage()
/*
  await page.authenticate({
    username: 'scraperapi',
    password: '5fa9ed494209abb506dd2ccf7a61d4e2'
  })
*/
  await page.goto('https://bot.sannysoft.com')
  await page.waitForTimeout(5000)
  await page.screenshot({ path: './screenshots/pupeteer-bot.png', fullPage: true })
  console.log(`All done, check the screenshot. ✨`)
  /*
  console.log('Visiting loopnet..')
  await page.goto('https://loopnet.com');
  await page.click('li.search-types--for-sale button', {delay: 13})
  await page.type('input[name="geography"]', `Philadelphia, PA`, {delay: 20});
  await page.click('button.do-search', {delay: 17});
  await page.waitForTimeout(5000)
  await page.screenshot({ path: './screenshots/pupeteer-loopnet.png', fullPage: true })
  console.log('All done..')
*/
  return await browser.close()
})