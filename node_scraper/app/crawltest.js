//https://justmarkup.com/articles/2019-01-04-using-puppeteer-to-crawl-pages-and-save-them-as-markdown-files/

const puppeteer = require('puppeteer');

(async() => {
    // start the browser
    const browser = await puppeteer.launch({headless: false, args: ['--no-sandbox'] });
    // open a new page
    const page = await browser.newPage();
    const pageURL = 'https://justmarkup.com';
    try {
        // try to go to URL
        await page.goto(pageURL);
        console.log(`opened the page: ${pageURL}`);
    } catch (error) {
        console.log(`failed to open the page: ${pageURL} with the error: ${error}`);
    }

    // Find all links to articles
    const postsSelector = '.main #teaser_tem li a';
    await page.waitForSelector(postsSelector, { timeout: 0 });
    const postUrls = await page.$$eval(postsSelector, postLinks => postLinks.map(link => link.href));

    // Visit each page one by one
    for (let postUrl of postUrls) {

        // open the page
        try {
            await page.goto(postUrl);
            console.log('opened the page: ', postUrl);
        } catch (error) {
            console.log(error);
            console.log('failed to open the page: ', postUrl);
        }

        // get the pathname
        let pagePathname = await page.evaluate(() => location.pathname);
        pagePathname = pagePathname.replace(/\//g, "-");
        console.log('got the pathname:', pagePathname);

        // get the title of the post
        const titleSelector = '.article h1';
        await page.waitForSelector(titleSelector);
        const pageTitle = await page.$eval(titleSelector, titleSelector => titleSelector.outerHTML);
        console.log('found the title', pageTitle);

        // get the content of the page
        const contentSelector = '.article .entry-content';
        await page.waitForSelector(contentSelector, { timeout: 0 });
        const pageContent = await page.$eval(contentSelector, contentSelector => contentSelector.innerHTML);
        console.log('found the content: ', pageContent);

    }

    // all done, close the browser
    await browser.close();

    process.exit()
})();