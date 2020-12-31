/** NOTE: RUN THIS FILE FROM THE APP DIR AS 'node app/whitepages.js'
 * 
 * https://github.com/berstend/puppeteer-extra/wiki/Newbie-Guide-To-Scraping-With-Puppeteer
 * TODO - read about proxy and IP-based blocking rules, understand browser fingerprint
 */

// puppeteer-extra is a drop-in replacement for puppeteer,
// it augments the installed puppeteer with plugin functionality.
// Any number of plugins can be added through `puppeteer.use()`
const puppeteer = require('puppeteer-extra')
puppeteer.use(require('puppeteer-extra-plugin-repl')())
require('dotenv').config()
const db = require('../db')
// Add adblocker plugin to block all ads and trackers (saves bandwidth)
const AdblockerPlugin = require('puppeteer-extra-plugin-adblocker')
puppeteer.use(AdblockerPlugin({ blockTrackers: true }))

// User-Agent helper
const preparePageForTests = async (page) => {
const userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.88 Safari/537.36';
await page.setUserAgent(userAgent);

// set screen resolution
await page.setViewport({
    width: 1366,
    height: 768   
 });
}

// database helper function
async function save(uri, f,m,l){
    try{
        await db.query('BEGIN');
        const queryText = 'INSERT INTO tools.whitepages(uri, f, m, l) VALUES($1, $2, $3, $4) RETURNING wp_id';
        const res = await db.query(queryText, [uri, f, m, l]);
        // add more queries here
        await db.query('COMMIT');
    } catch (e) {
        await db.query('ROLLBACK');
        throw e
    }
}

// scrape sub directory links; input is an array of urls for main top-level directory
async function getSubdir(mainDir, page){
    // visit each page
    for (let l of mainDir){
        try {
            await page.goto(l, { waitUntil: 'networkidle2'} );
            console.log(`opened the page: ${l}`);
        } catch(error) {
            console.log(error);
            console.log(`failed to open the page ${l}`);
        }
        /// scroll a little for convincability 
        await page._client.send("Input.synthesizeScrollGesture", {
            x: 0,
            y: 0,
            xDistance: 0,
            yDistance: -100,
            })

        let payload = []; 
        const subUrlSelector = 'ul[class="unstyled site-map-directory-listings"]';
        await page.waitForSelector(subUrlSelector, {timeout: 0});
        await page.$eval(subUrlSelector, subLinks => {
            let children = subLinks.childNodes;
            let len = children.length;
            for (let i=1; i<len; i=i+2){
                payload.push(children[i].firstElementChild.href);
                console.log(`pushing url: ${children[i].firstElementChild.href}`);
            }
        })
        console.log(`saving links from ${l}`);
        save(payload); 
    }
}

(async () =>{
    // start browser
    let browser = await puppeteer.launch({headless: true});
    // open new page 
    let page = await browser.newPage();
    await preparePageForTests(page);

    // get top-level directory links 
    // top level links saved in tools.whitepages with l='main_dir' 
    var pageURL = 'https://www.whitepages.com/person';

    try {
        // ty to go to URL
        await page.goto(pageURL, { waitUntil: 'networkidle2'} );
        console.log(`opened the page ${pageURL}`);
    } catch (error) {
        console.log(`failed to open the page: ${pageURL} with error: ${error}`);
    }
    
    // Find all links for each letter of the alphabet 
    // NOTE: puppeteer requires [ ] notation on CSS selectors (NOT: 'a.pearl--text.text-decoration-none')
    const linkDirectorySelector = 'a[class="pearl--text text-decoration-none"]' 
    await page.waitForSelector(linkDirectorySelector, {timeout: 0});

    /// scroll to the bottom (for dynamically loading websites and more convincing bot)
    let scrollToBottom = () => window.scrollTo(0, document.body.scrollHeight * 0.9);
    await page.evaluate(scrollToBottom);
    //await page.waitFor(500);
    
    // Get top-level directory links
    // NOTE: $eval is the same as document.querySelector; $$eval is the same as document.querySelectorAll
    
    const links = await page.$$eval(linkDirectorySelector, dirLinks => {
        const topLinks = []    
        dirLinks = [...dirLinks] // convert to array
        dirLinks.forEach(function(l){
            if(l.innerText.match(/^\b[A-Z]\b$/) ){  //links innerHTML matches A B C etc...
                    topLinks.push(l.href);
                }
        });
        console.log(topLinks);        
        return topLinks;
    });

    console.log(`saving links ${links}`);

    await save(links, 'na', 'na', 'na');
    
    
    


    /*
    // load links from db
    db.query('SELECT uri::text[] FROM tools.whitepages WHERE l=$1',['main_dir']).then(res =>{
        let links = res.rows[0]['uri'];
        console.log(links[0]);
        // visit each link to find sub-directory links 
        getSubdir(links, page)
        }).catch( (e) => console.log(`error ${e.stack}`));
    */
   
    // Start an interactive REPL here with the `page` instance.
    //await page.repl()
    // Afterwards start REPL with the `browser` instance.
    //await browser.repl()
    
    await browser.close();
    process.exit()
    })();
    

    /* // PART III GET THE ACTUAL NAMES 
    await page.goto(subDir[1], { waitUntil: 'networkidle2'});
    
    const names = await page.evaluate(() => {
        
        let nChildren = document.querySelector('ul[class="unstyled site-map-directory-listings"]').childNodes;  // want text > baseURI
        const nLen = document.querySelector('ul[class="unstyled site-map-directory-listings"]').childNodes.length;
        console.log(nChildren)
        const payload = []
        console.log(nChildren)
        for (let i=1; i<nLen; i = i+2){
            payload.push(nChildren[i].firstElementChild.innerText)
        }
        await browser.close();
        return {payload}
    });

    console.log(names)
    */
    