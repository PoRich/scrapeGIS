require('dotenv').config();
const puppeteer = require('puppeteer-extra')
const colors = require('colors/safe')

// add stealth plugin and use defaults (all evasion techniques)
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

/** Run the following in terminal to stop Tor
$ brew services start tor
*/

(async() => {
  // https://scrapingant.com/free-proxies/
  const proxies = {
    // free proxies
      'session_1': 'http://208.127.25.69:8080', 
      'session_2': 'http://34.94.0.168:80', 
      'session_3': 'http://3.130.124.100:8080',
      'tor': 'socks5://127.0.0.1:9050',
    // premium proxies
      'scraperAPI': 'http://proxy-server.scraperapi.com:8001', 
  };

  const userAgents = {
      'ua_1': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.88 Safari/537.36',
      'ua_2': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/74.0.3729.169 Safari/537.36',
      // https://developers.google.com/search/docs/advanced/crawling/overview-google-crawlers?hl=en&visit_id=637604091037642027-4078757252&rd=1
      'google': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/41.0.2272.118 Safari/537.36 (compatible; Google-Read-Aloud; +https://developers.google.com/search/docs/advanced/crawling/overview-google-crawlers)'
  };

  const args = [`--proxy-server=${proxies.tor}`]
    
  const browser = await puppeteer.launch({
    headless: false,
    ignoreHTTPSErrors: args[0] === '--proxy-server=http://proxy-server.scraperapi.com:8001' ? true : false, 
    // args: args,
  });
  
  const page = await browser.newPage();

  // if using scraperAPI proxy 
  if (args[0] === '--proxy-server=http://proxy-server.scraperapi.com:8001'){
    await page.authenticate({
      username: 'scraperapi',
      password: process.env.SCRAPERAPI, // '5fa9ed494209abb506dd2ccf7a61d4e2' // 
    })
  }

  //await page.setUserAgent(userAgents.ua_2);

 
  await page.setViewport({ width: 1920, height: 1080 });

  /*
  // disable css, fonts, images to reduce bandwidth and increase speed
  await page.setRequestInterception(true);
  page.on('request', (req) => {
      if(req.resourceType() == 'stylesheet' || 
         req.resourceType() == 'font' || 
         req.resourceType() === 'image'){
          req.abort();
        }
      else {
          req.continue();
        }
    });
  


// check if Tor is running 
await page.goto('https://check.torproject.org/');
const isUsingTor = await page.$eval('body', el =>
  el.innerHTML.includes('Congratulations. This browser is configured to use Tor')
  );

if (!isUsingTor){
  console.log(colors.red.bold('Not using Tor. Closing... '));
  return await browser.close();
}

console.log(colors.green.bold('Using Tor. Contuing... '))

  await page.goto('https://httpbin.org/ip');
  await page.screenshot({ path: './screenshots/proxy-ip-test.png', fullPage: true })
  console.log(`All done with IP screenshot. ✨`)
  
  await page.goto('https://httpbin.org/anything');
  await page.screenshot({ path: './screenshots/proxy-header-test.png', fullPage: true })
  console.log(`All done with HEADER screenshot. ✨`)

  await page.goto('https://bot.sannysoft.com')
  await page.waitForTimeout(5000)
  await page.screenshot({ path: './screenshots/proxy-bot-test.png', fullPage: true })
  console.log(`All done with BOT screenshot. ✨`)
*/
  await page.goto('https://www.loopnet.com/search/commercial-real-estate/chicago-il/for-sale/1')
  //await page.goto('https://www.loopnet.com/')
  await page.waitForTimeout(5000)
  await page.screenshot({ path: './screenshots/proxy-loopnet.png', fullPage: true })
  console.log(`All done with loopnet screenshot. ✨`)

  await browser.close();
  return;
})();

/** Run the following in terminal to stop Tor
$ brew services stop tor
*/

// ================ Basic Best Practices ================
// https://www.scrapehero.com/how-to-prevent-getting-blacklisted-while-scraping/
// https://stackoverflow.com/questions/51731848/how-to-avoid-being-detected-as-bot-on-puppeteer-and-phantomjs
// https://www.scraperapi.com/blog/5-tips-for-web-scraping/

// ================ Frameworks  ================
// https://www.scrapehero.com/open-source-javascript-web-scraping-tools-and-frameworks/

// ================ Tor + Puppeteer ================
// https://medium.com/@jsilvax/running-puppeteer-with-tor-45cc449e5672
// note: on mac, torrc.sample is in /usr/local/etc/tor

// ================ Proxy Rotation ================
// https://scrapingant.com/blog/how-to-use-rotating-proxies-with-puppeteer
// https://stackoverflow.com/questions/67569465/webscraper-being-blocked-how-to-make-a-puppeteer-ip-address-rotation

// ================ Google Cache ================
// http://webcache.googleusercontent.com/search?q=cache:https://www.loopnet.com/search/commercial-real-estate/philadelphia-pa/for-lease/



 
  // set extra headers
  //await page.setExtraHTTPHeaders({
    //'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8', 
 /*   
    'Accept-Encoding': 'gzip, deflate, br',
    'Accept-Language': 'en-US,en;q=0.5',
    'Cache-Control': 'max-age=0',
    'Connection': 'keep-alive',
    'DNT': '1',
    'Host': 'www.loopnet.com',
    'Referer': 'https://loopnet.com',
    'Sec-GPC': '1',
    'Upgrade-Insecure-Requests': '1',
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.14; rv:89.0) Gecko/20100101 Firefox/89.0'
  })
*/