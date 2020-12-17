if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config();}
const Shp2psql= require('./routes/shp2psql.js');

// catch uncaught exceptions
process.on('uncaughtException', err =>{
    console.error('There was an uncaught err', err)
    process.exit(1) //mandatory (as per the Node.js docs)
})

// workhorse function downloads, unzips, inserts into psql 
const scrape_shp = async function (county_code, description, url) {
    var d = await Shp2psql.prepTmpPath(county_code, description)

    let records = await Shp2psql.rDownload(url, d) // first attempt 
        .catch(err => {
            console.log(`HTTP(S).Request failed w/ error ${err}`)
            Shp2psql.pDownload(url, d) // backup attempt
                .catch(err => {
                    console.log(`Puppeteer also failed: ${err}; DOWNLOAD MANUALLY`)
                })
        })
        .then(Shp2psql.checkDownload) // checks for valid file 
        .then(Shp2psql.unzipFile)
        .then(Shp2psql.dbPrecheck)
        .then(Shp2psql.dbLoad)
        .then(Shp2psql.dbLoadTest);
    return records
};


// creates folders, unzips, inserts into psql [FOR MANUAL DOWNLOADS]
const zip2psql = async function (county_code, desscription, url=undefined) {
    var d = await Shp2psql.getDestination(county_code, desscription)

    let records = await Shp2psql.unzipFile(d)
        .then(Shp2psql.dbPrecheck)
        .then(Shp2psql.dbLoad)
        .then(Shp2psql.dbLoadTest);
    return records
};

/* TODOs
1. Add timeout for Requests
2. test pDownoad - weird puppeteer error browser, test HTTPrequest
3. figure out some sort of file test logic between download and unzip - probably involves 
checking if the file is downloading and if so adding a delay
*/