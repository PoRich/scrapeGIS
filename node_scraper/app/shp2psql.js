const db = require('../db')
const exec = require('child_process').exec;
const format = require('pg-format');
const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');
const puppeteer = require('puppeteer');
const unzip = require('unzip');


// GLOBAL HELPER FUNCTIONS 
/** locates files in a directory (regex_pattern for shp file= '.+.shp$') */
const findFile = function(dir, regex_pattern) {
    return new Promise((resolve, reject) =>{
        fs.readdir(dir, function (err, files) {
            if (err){
                return console.log(`Unable to read filepath ${dir}; error: ` + err);
            }
            files.forEach(function(file) {
                const re = new RegExp(regex_pattern, 'i');
                if (re.exec(file)){
                    resolve(file);  
                }
            })
        });
    });
}


module.exports = {
    // generates folder path name (does not clear folder)
    async getDestination(county_fsip, tableName){
        return new Promise((resolve, reject) => {
            const app_folder = path.dirname(path.parse(__dirname).dir);  // 2 levels up
            const staging_folder = path.join(app_folder, 'tmp', `${county_fsip}_${tableName}_tmp`);  // specific tmp folder 
            const destination = path.join(staging_folder, `${tableName}.zip`)
            exec(`mkdir ${staging_folder}`)
            process.chdir(path.join(app_folder, 'tmp'))
            console.log(`Created destination file path: ${destination}`)
            resolve(destination);
        })
    },
    // creates an empty temporary folder path 
    async prepTmpPath(county_fsip, tableName){
        return new Promise((resolve, reject) => {
            const app_folder = path.dirname(path.parse(__dirname).dir);  // 2 levels up
            const staging_folder = path.join(app_folder, 'tmp', `${county_fsip}_${tableName}_tmp`);  // specific tmp folder 
            const destination = path.join(staging_folder, `${tableName}.zip`)
            exec(`mkdir ${staging_folder}`)
            process.chdir(path.join(app_folder, 'tmp'))
            exec(`rm -r ${staging_folder}/*`)
            console.log(`Created destination file path: ${destination}`)
            setTimeout(function(){
                resolve(destination);}, 1000)
        })
    },
    /** downloads a file using HTTP(S).request */
    rDownload(url, destination){  // convention is for tblName = `${COUNTY_CODE}_${TABLE_NAME}`;
        return new Promise((resolve, reject) => {
            console.log(`HTTP.Request downloading ${url} to ${destination}...`);

            try{
                const request = url.slice(0,5) == 'https' ? https.get(url, {setTimeout:60000}) : http.get(url, {setTimeout:60000}) 
                let file = fs.createWriteStream(destination);
                
                request.on('response', (response) => {
                        response.pipe(file);
                        file.on('finish', () => {  // TODO, check that this is not terminating prematurely 
                            console.log("rDownload attempt completed!");
                            file.close();
                            resolve(destination);
                        });
                    }
                ).on('error', (err)=>{
                    fs.unlink(destination);
                    console.log(`HTTP.Request failed: ${err}`)
                    reject(err.message);
                });
            } catch (e){
                console.log(`rDownload failed with err: ${e}`)
            } 
        }); 
    }, 

    // downloads shp file via Puppeteer with tableName as ${COUNTY_CODE}_${DESCRIPTION}
    async pDownload(url, destination){
        const staging_folder = path.dirname(destination);
        console.log(`Puppeteer downloading ${url} to ${staging_folder}...`);
        try {
            const browser = await puppeteer.launch({headless: false});
            const page = await browser.newPage();

            await page.setDefaultNavigationTimeout(1000*60*3);  // 3 min default timeout
            await page._client.send('Page.setDownloadBehavior',
                {behavior: 'allow', downloadPath: staging_folder});
            try{
                await page.goto(url);  // puppeteer may crash after starting download 
            } catch (e) {
                console.log(`Puppeteer crashed ${e}`)
            }
            // await page.waitFor(60000);  // 1 minute to start downloading (default is 30 seconds)
            await browser.close();
            return(destination);
        } catch (e) { // need to check file because download may still be valid
            console.log(`Puppeteer failed with error ${e.message}`)
            await browser.close();
            return(e.message)
        }
    },
    /** checks downloaded file (ASSUMES THERE IS ONLY ONE FILE IN THE FOLDER)
     * returns 0 if error; returns 1 if download pending; returns file path to zip file */
    async checkDownload(destination){ // destination is location of the file  
        try{ // assumes the given name of the file may be wrong 
            try{
                if(fs.statSync(destination, (e,s)=> {console.log(s)}).isDirectory()){
                    var folder = destination        
                } else{
                    folder = path.parse(destination).dir
                }
            } catch (e) {
                console.log(`Invalid destination path ${e.message}`)
                folder = path.parse(destination).dir
            }
            
            const fileNames = fs.readdirSync(folder);  // access the file from disk
            var zipFilePath = path.join(folder, fileNames[0]); // should only be one file
            var zipFileStats = fs.statSync(zipFilePath, (err, stat)=>{return stat})
    
            const num_files = await fileNames.length;
            let file_size = zipFileStats.size
            console.log(`${num_files} files found; file is ${file_size/(1000000)} Mb; download speed is ~${downloadSpeed} Mb/s`)
                if (num_files == 1 && zipFileStats.size > 0){  //if files were downloaded, TODO set min to 10kbs
                    var zipFileStats2 = fs.statSync(zipFilePath, (err, stat)=>{return stat})
                    var downloadSpeed = (zipFileStats2.size - zipFileStats.size) / 1000000
                    if (downloadSpeed > 0) {
                        console.log(`Download still in process... please wait`)
                        return 1 
                    }
                    else { console.log("Download complete!"); return zipFilePath}
                } else if (num_files == 0) { console.log('No file downloaded (expecting exactly one file)');
                } else if (num_files > 1) { console.log('More than 1 file downloaded, please check folder (expecting exactly one file)');
                } else {console.log('No valid file downloaded; (file has no data)'); return}
            } catch (e){ console.log(`error reading file path: ${e}`); return}
    }, 
    /** unzips a specified file to the same directory */
    unzipFile(zipFilePath) {
        let stagingFolder = path.parse(zipFilePath).dir
        return new Promise((resolve, reject) => {
            try{
                //get the first file in the folder path (in case the destination name is wrong)
                const fileNames = fs.readdirSync(stagingFolder);  // access the file from disk
                zipFilePath = path.join(stagingFolder, fileNames[0]); // should only be one file
                console.log(`Unzipping '${zipFilePath}'...`);
                //Note: the archive is unzipped to the directory it resides in
                fs.createReadStream(zipFilePath)
                    .pipe(unzip.Extract({ path: path.dirname(zipFilePath) }))
                    //when ready return file name, so can use it to load a file to the db...
                    .on('close', async ()=>{
                        var shpFileName = await findFile(path.parse(zipFilePath).dir, '.+.shp$')
                        let shpFilePath = path.join(stagingFolder, shpFileName)
                        console.log(`Unzipped!`);
                        resolve(shpFilePath)  // return file with *.shp extension
                    }).on('error', (error)=>{
                        console.log(`Unzip failed: ${error}`)
                        // remove garbage files
                        process.chdir(path.dirname(stagingFolder)) 
                        exec(`rm -r ${stagingFolder}/*`)
                        reject(error.message)
                    });
            } catch (e) { // mostly likely error in downloading the file
                console.log(`Unzip failed ${e}`)
                // remove garbage files
                process.chdir(path.dirname(stagingFolder)) 
                exec(`rm -r ${stagingFolder}/*`)
                reject(e.message)
            }
        });
    }, 
    /** checks if database is ready for data import */
    dbPrecheck(shpFilePath) {
        return new Promise((resolve, reject) => {
            console.log('Checking database schema...');
            try{ // TODO, this doesn't appear to be creating schema 
                db.query(`CREATE SCHEMA IF NOT EXISTS $1;`, process.env.PGSCHEMA)
                    .then((res)=> {console.log(`res`)})
                console.log('Database ready!')
                resolve(shpFilePath)
            } catch (err){
                reject(err.message);
            }
        });
    }, 
    /** loads a shapefile to a database */
    dbLoad(shpFilePath) {
        return new Promise((resolve, reject) => {
            // extract table name from file path 
            let parsedPath = path.parse(shpFilePath)
            var tableName = path.parse(path.dirname(shpFilePath)).name.replace('_tmp','')
            let stagingFolder = parsedPath.dir
            console.log('Loading shapefile...');
            process.chdir(stagingFolder);   // need to be in stagingFolder to execute command 
            
            // if ERROR: Geometry type (MultiPolygon) does not match column type (Polygon)
            // let fmt_cmd = format('ogr2ogr -f "PostgreSQL" PG:"host=%1$s port=%2$s user=%3$s dbname=%4$s" %5$I -s_srs EPSG:4326 -t_srs EPSG:4326 -nln %6$s.%7$s -overwrite -lco GEOMETRY_NAME=the_geom -nlt MULTIPOLYGON;',
            
            let fmt_cmd = format('ogr2ogr -f "PostgreSQL" PG:"host=%1$s port=%2$s user=%3$s dbname=%4$s" %5$I -s_srs EPSG:4326 -t_srs EPSG:4326 -nln %6$s.%7$s -overwrite -lco GEOMETRY_NAME=the_geom;',
                `${process.env.PGHOST}`, `${process.env.PGPORT}`, `${process.env.PGUSER}`, `${process.env.PGDATABASE}`, `${parsedPath.base}`, `${process.env.PGSCHEMA}`, `${tableName}`)
            //let fmt_cmd = "ogr2ogr -f "PostgreSQL" PG:"host=localhost port=5432 user=parcel_data dbname=parcels" "unsafe.shp" -s_srs EPSG:4326 -t_srs EPSG:4326 -nln parcel_data.c42101_unsafe_violations -overwrite -lco GEOMETRY_NAME=the_geom;"
            //console.log(`Executing command: "${fmt_cmd}" from current working directory: ${process.cwd()}`);
            exec(fmt_cmd, (err, stdout, stderr) => {
                /*  //1 minute timer on deleting temp folders
                setTimeout(function(){
                    process.chdir(path.dirname(stagingFolder));
                    exec(`rm -r ${stagingFolder}`)
                }, 60000)  
                */
                if(err){
                    reject(err.message);
                    return;
                }
                console.log(stdout || stderr);
                resolve(shpFilePath);
            })
        });
    }, 
    /** counts imported records */
    dbLoadTest(shpFilePath) {
        return new Promise((resolve, reject) => {
            // extract table name from file path 
            var tableName = path.parse(path.dirname(shpFilePath)).name.replace('_tmp','')
            console.log('Verifying import...');
            try{
                var sql_cmd = format('SELECT Count(*) as rec_count FROM %I;', `${tableName}`)
                db.query(sql_cmd, (err, res) =>{
                    if (res.rows[0].rec_count){
                        console.log(`Imported ${res.rows[0].rec_count} records!`);
                    }
                    if (err){
                        console.log(`Select count failed: ${err.stack}`)
                    }
                })

                sql_cmd = format('CREATE INDEX %s ON %I USING gist(the_geom);', `${process.env.PGSCHEMA}_${tableName}_gist`, `${tableName}`)
                db.query(sql_cmd).then(console.log(`Index Created`))
                    .catch(e => console.log(`Error creating index: ${e.stack}`));

                sql_cmd = format('VACUUM ANALYZE %I;', `${tableName}`)
                //console.log(`sql_cmd1: ${sql_cmd}`)
                db.query(sql_cmd).then(console.log(`Vacuum analyzed`))
                    .catch(e => console.log(`Error Vacuum analyzing: ${e.stack}`));
            } catch (err){
                reject(err.message);
            }
        });
    }, 
   
}
