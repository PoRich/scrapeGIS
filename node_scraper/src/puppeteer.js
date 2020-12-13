// TODO program not terminating  browser not closing 
//https://help.apify.com/en/articles/1929322-handling-file-download-with-puppeteer
const fs = require('fs');
const puppeteer = require('puppeteer');
const path = require('path');
const exec = require('child_process').exec;

const tableName = "c42101_re_tax_delinquencies";
const target_url = "https://phl.carto.com/api/v2/sql?q=SELECT+*+FROM+real_estate_tax_delinquencies&filename=real_estate_tax_delinquencies&format=shp&skipfields=cartodb_id";


(async () => {
// create staging folder for download
const makeFolder = async (folderName) => {exec(`mkdir ${folderName}`)};
const app_folder = path.dirname(path.parse(__dirname).dir)  // 2 levels up
const tmp_folder = path.join(app_folder, 'tmp')  // general tmp folder 
const staging_folder = path.join(tmp_folder, `${tableName}_tmp`)  // specific tmp folder 
makeFolder(staging_folder)

const browser = await puppeteer.launch({
    headless: false, 
    //slowMo: 250  // slows down by 250ms (for debugging)
  }); 
const page = await browser.newPage();

await page._client.send('Page.setDownloadBehavior',{behavior: 'allow', downloadPath: staging_folder})


// METHOD 1: DOWNLOADING AND ACCESSING FROM DISC

// trigger the download (navigate directly to download endpoint)
await page.goto(target_url, {waitUntil: 'networkidle2'});

// access the file from disk 
const fileNames = fs.readdirSync(staging_folder);  // downloads to be saved here
// pick the first file (assuming it is the only one)
const fileData = fs.readFileSync(`${staging_folder}/${fileNames[0]}`);

await browser.close();
})();