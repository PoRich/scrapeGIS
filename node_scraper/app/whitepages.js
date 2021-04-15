/** NOTE: RUN THIS FILE FROM THE APP DIR AS 'node app/whitepages.js'*/
const puppeteer = require('puppeteer-extra')  // Any number of plugins can be added through `puppeteer.use()`
const AdblockerPlugin = require('puppeteer-extra-plugin-adblocker')  // Add adblocker plugin to block all ads and trackers (saves bandwidth)
const db = require('../db')
//puppeteer.use(require('puppeteer-extra-plugin-repl')())
puppeteer.use(AdblockerPlugin({ blockTrackers: true }))
require('dotenv').config();

// Random num generator 
function rand_num(min, max) {  
    return Math.floor(
      Math.random() * (max - min) + min
    )
  }

// User-Agent helper
const preparePageForTests = async (page) => {
const userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.88 Safari/537.36';
await page.setUserAgent(userAgent);
await page.setViewport({  // set screen resolution
    width: 1366,
    height: 768   
 });
}

// database helper function
async function save(uri, depth, raw){
    try{
        await db.query('BEGIN');
        const queryText = 'INSERT INTO tools.whitepages(uri, depth, raw) VALUES($1, $2, $3) RETURNING wp_id';
        const res = await db.query(queryText, [uri, depth, raw]);
        // add more queries here
        await db.query('COMMIT');
    } catch (e) {
        await db.query('ROLLBACK');
        throw e
    }
}

// get top level links function
async function getDir(pageURL, page){
    // Find all links for each letter of the alphabet for whitepages.com/person
    try { // ty to go to URL
        await page.goto(pageURL, { waitUntil: 'networkidle2'} );
        console.log(`opened the page ${pageURL}`);
    } catch (error) {
        console.log(`failed to open the page: ${pageURL} with error: ${error}`);
    }
    // NOTE: puppeteer requires [ ] notation on CSS selectors (NOT: 'a.pearl--text.text-decoration-none')
    const linkDirectorySelector = 'a[class="pearl--text text-decoration-none"]' 
    await page.waitForSelector(linkDirectorySelector, {timeout: 0});
    
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
    return links
}


// scrape sub directory links; input a single url for main top-level directory
// (e.g., https://whitepages.com/ind/z-094)
async function getSubdir(url, page){
    // visit  page
    try {
        await page.goto(url, { waitUntil: 'networkidle2'} );
        console.log(`opened the page: ${url}`);
    } catch(error) {
        console.log(error);
        console.log(`failed to open the page ${url}`);
    }
    /// scroll a little for convincability 
    await page._client.send("Input.synthesizeScrollGesture", {
        x: 0,
        y: 0,
        xDistance: 0,
        yDistance: - rand_num(0,100),
        })

    const urlSelector = 'ul[class="unstyled site-map-directory-listings"]';
    await page.waitForSelector(urlSelector, {timeout: 0});
    const payload = await page.$eval(urlSelector, subLinks => {
        let container = []; 
        let children = subLinks.childNodes;
        let len = children.length;
        for (let i=1; i<len; i=i+2){
            container.push(children[i].firstElementChild.href);
            console.log(`pushing url: ${children[i].firstElementChild.href}`);
        }    
        return container
    });
    return payload;
}

// NOT WORKING, failing to find urlSelector=>evaluates to none
async function getSubdir2(url, page, urlSelector, getInnerText){
    // visit  page
    try {
        await page.goto(url, { waitUntil: 'networkidle2'} );
        console.log(`opened the page: ${url}`);
    } catch(error) {
        console.log(error);
        console.log(`failed to open the page ${url}`);
    }
    /// scroll a little for convincability 
    await page._client.send("Input.synthesizeScrollGesture", {
        x: 0,
        y: 0,
        xDistance: 0,
        yDistance: - rand_num(0,100),
        })

    console.log(`urlSelector ${urlSelector}`)
    await page.waitForSelector(urlSelector, {timeout: 0});

    //const payload = await page.$eval(urlSelector, subLinks => {
    const payload = await page.evaluate(() => {
        let children = document.querySelector('ul[class="unstyled site-map-directory-listings"]').childNodes; 
        //let children = subLinks.childNodes;
        let len = children.length;
        console.log(`children ${children}`)
        //console.log(`urlSelector ${urlSelector}`)
        let hrefs = []; 
        let html = [];
        
        for (let i=1; i<len; i=i+2){
            hrefs.push(children[i].firstElementChild.href);
            html.push(children[i].firstElementChild.innerText);
        }    
        return {hrefs, html}
    });

    if (getInnerText){
        return payload[1];
    } else {
        return payload[0];
    }
}


// scrape sub directory links; input a single url for main top-level directory
async function getNames(url, page, gethtml=false) {
    // visit  page
    try {
        await page.goto(url, { waitUntil: 'networkidle2'} );
        console.log(`opened the page: ${url}`);
    } catch(error) {
        console.log(error);
        console.log(`failed to open the page ${url}`);
    }
    /// scroll a little for convincability 
    await page._client.send("Input.synthesizeScrollGesture", {
        x: 0,
        y: 0,
        xDistance: 0,
        yDistance: - rand_num(0,100),
        })

    const urlSelector = 'ul[class="unstyled site-map-directory-listings"]';
    await page.waitForSelector(urlSelector, {timeout: 0});
    const names = await page.evaluate(() => {
        let nChildren = document.querySelector(urlSelector).childNodes; 
        const payload = []
        for (let i=1; i<nChildren.length; i = i+2){
            if (gethtml == false){
                payload.push(nChildren[i].firstElementChild.href)
            } else{
                payload.push(nChildren[i].firstElementChild.innerText)
            }
        }
        return payload
    });
    return names
}


(async () =>{
    // start browser & open new page 
    let browser = await puppeteer.launch({headless: true});
    let page = await browser.newPage();
    await preparePageForTests(page);
/*
    // =================== PART 1A: get top-level directory links ===================
    // RUN THIS ONCE; aftwards, load from database 

    var pageURL = 'https://www.whitepages.com/person';
    var links = await getDir(pageURL, page);
    console.log(`saving links ${links}`);
    await save(links, 1, 'main_dir');
    
    // =================== PART 2: get mid-level directory links ===================
    // (e.g., https://whitepages.com/ind/z-094)
    // RUN THIS ONCE; aftwards, load from database 
    //----------- load links from db; top level links saved in tools.whitepages with l='main_dir' 
    console.log(`connecting to database at ${process.env.PGHOST}:${process.env.PGPORT}`);
    const res = await db.query('SELECT uri::text[] FROM tools.whitepages WHERE depth=$1', ['1'])
    const links = await res.rows[0]['uri'];
   
    console.log(`links loaded from database: ${links}`);
    // visit each link to find sub-directory links 
    for (let l of links) {        
        await page.waitForTimeout(rand_num(2000, 5000));
        var payload = await getSubdir(l, page);
        // To verify getSubdir2()
        //const subUrlSelector = 'ul[class="unstyled site-map-directory-listings"]';
        //var payload = await getSubdir2(l, page, subUrlSelector, false);
        console.log(`saving ${payload}`)
        save(payload, 2, 'none);
    }
    
    // =================== PART 3: scrape sub_level links  ===================
    //----------- load links from db; top level links saved in tools.whitepages with l='mid_dir' 
    console.log(`connecting to database at ${process.env.PGHOST}:${process.env.PGPORT}`);
    const midres = await db.query('SELECT unnest(uri::text[]) as uri FROM tools.whitepages WHERE depth=$1 order by 1', ['2']);
    let midlinks = []; 
    for (let r of midres.rows){ 
        midlinks.push(r['uri']);
    }  
    //console.log(midlinks);
    
    // scrape and save sub_dir links
    for (let l of midlinks){
        await page.waitForTimeout(rand_num(2000, 5000));
        //============ getSubdir function START (TODO understand why this won't work as a function)============
        await page.goto(l, { waitUntil: 'networkidle2'} )
        const subDir = await page.evaluate(() => {
            let children = document.querySelector('ul[class="unstyled site-map-directory-listings"]').childNodes;  
            const len = document.querySelector('ul[class="unstyled site-map-directory-listings"]').childNodes.length;
            const links = []
            const labels = []  
            console.log(children)
            for (let i=1; i<len; i = i+2){
                links.push(children[i].firstElementChild.href)
                labels.push(children[i].firstElementChild.innerText)
                }
            return [links, labels] 
            });
        //============ getSubdir function END ============
    console.log(`saving ${subDir[0]}`)  
    save(subDir[0], 3, subDir[1]);  // last link is wp_id=3770; depth 3
    }

    // unnest depth 3 uri's onto their own line as depth 4

    await db.query('insert into tools.whitepages (depth, uri) select '4', unnest(uri::text[]) as uri from tools.whitepages where depth=$1 ORDER BY uri', ['3']);
*/
    // =================== PART 4: scrape names  ======================================
    //----------- load links from db; top level links saved in tools.whitepages with l='mid_dir' 
    
    /* SQL commands to find where the scraper left off
    select wp_id, depth, raw from tools.whitepages where depth like 'b%' order by 1 desc limit 1000;
    -- latest data from depth w-024-062
    delete from tools.whitepages where depth='p-068-027' or depth='g-113-087';
    -- find uri for that depth (4154774)
    select wp_id, depth, uri from tools.whitepages where depth='4' and uri like '%r-001-001';
    
    4 processes
    1) Descending from Ds g-113-087 -> Ms              const nameRes = await db.query('SELECT uri FROM tools.whitepages WHERE depth=$1 and wp_id>=$2 ORDER BY 1', ['4', '4281143'])
    2) Ascending from Ws s-189-114 -> Ms               const nameRes = await db.query('SELECT uri FROM tools.whitepages WHERE depth=$1 and wp_id<= $2 ORDER BY 1 desc', ['4', '4542504'])
    3) Descending from Ms p-068-027 ->Z 4387119       const nameRes = await db.query('SELECT uri FROM tools.whitepages WHERE depth=$1 and wp_id>= $2 ORDER BY 1', ['4', '4461248'])
    4) Ascending from Ls h-110-101 ->A 4361951        const nameRes = await db.query('SELECT uri FROM tools.whitepages WHERE depth=$1 and wp_id<= $2 ORDER BY 1 desc', ['4', '4337068']) 
    5) Descending from Rs r-001-001 ->S              const nameRes = await db.query('SELECT uri FROM tools.whitepages WHERE depth=$1 and wp_id>= $2 ORDER BY 1', ['4', '4479847']) 
    */
   
    console.log(`connecting to database at ${process.env.PGHOST}:${process.env.PGPORT}`);
    const nameRes = await db.query('SELECT uri FROM tools.whitepages WHERE depth=$1 and wp_id< $2 ORDER BY 1 DESC', ['4', '4504415']) 
    let namelinks = []; 
    for (let r of nameRes.rows){ 
        namelinks.push(r['uri']);
    }  
    //console.log(namelinks);
    // scrape and save names
    for (let l of namelinks){
        // check uri has not already been scraped 
        var num_records = await db.query('select count(*) from tools.whitepages where depth=$1', [l.slice(-9, l.len)]);
        console.log(`${num_records.rows[0].count} records found in ${l.slice(-9, l.len)}`);
        if (num_records.rows[0].count == 0){
            //============ getName function START (TODO will this work as a function?)============
            try{
                console.log(`navigating to ${l}`)
                await page.goto(l, { waitUntil: 'networkidle2'} )
            } catch (e) {
                console.log(`unable to go to ${l}`)
                console.log(`retrying to navigating to ${l}`)
                await page.goto(l, { waitUntil: 'networkidle2'} )
            }  
            /*
            await page.waitForTimeout(rand_num(500, 2500));
            /// scroll a little for convincability 
            await page._client.send("Input.synthesizeScrollGesture", {
                x: 0,
                y: 0,
                xDistance: 0,
                yDistance: - rand_num(0,100),
                })
            */
            const subDir = await page.evaluate(() => {
                let children = document.querySelector('ul[class="unstyled site-map-directory-listings"]').childNodes;
                const len = document.querySelector('ul[class="unstyled site-map-directory-listings"]').childNodes.length;
                const labels = []  
                console.log(children)
                for (let i=1; i<len; i = i+2){
                    labels.push(children[i].firstElementChild.innerText)
                    }
                return labels
                });
            //============ getName function END ============
            subDir.forEach(name => {
                console.log(`saving ${name}`);
                save('', l.slice(-9, l.len), name);
            })
        } else {
            console.log(`${l} already scraped`);
        }
    }

    await browser.close();
    process.exit()
})();
