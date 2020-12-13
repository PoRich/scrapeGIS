const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');
const unzip = require('unzip');
const pg = require('pg');
const exec = require('child_process').exec;


// top-level function for export 
const load = async function(tableName, downloadUrl){
    /** Create temp staging folder for downloads */
    // Note: by default, the name of the folder is the fileName_tmp 
    const app_folder = path.dirname(path.parse(__dirname).dir)  // 2 levels up
    const tmp_folder = path.join(app_folder, 'tmp')  // general tmp folder 
    const staging_folder = path.join(tmp_folder, `${tableName}_tmp`)  // specific tmp folder 
    const destination = path.join(staging_folder, `${tableName}.zip`);  // default destination is app_folder/tmp

    // todo dbCredentials as env variable, schemaName
    const dbCredentials = {
        host: '127.0.0.1',
        port: 5432,
        user: 'postgres',  // needs to have create database, schema privileges 
        password: '',
        database: 'parcels'
    };
    const schemaName = 'parcel_data';  // default schema for raw scraped data 

    /** a simplistic progress indicator */
    const progressIndicator = function(){
        var p = 0;
        let chars = '|/-\\';
        return {
            next (){
                process.stdout.write(`${chars[p]}\r`);
                p++;
                if(p >= chars.length){
                    p = 0;
                }
            },
            reset(){
                p = 0;
                process.stdout.write('\r');
            }
        }
    }();

    const makeFolder = async (folderName) => {exec(`mkdir ${folderName}`)};

   // sleep function to allow enough time to create a folder 
   const sleep = function(ms) {
       return new Promise(resolve => setTimeout(resolve, ms));
   }


    /** downloads a file */
    const download = function(url){  // convention is for tblName = `${COUNTY_CODE}_${TABLE_NAME}`;
        return new Promise((resolve, reject) => {
            console.log(`Downloading ${url} to ${destination}...`);
            let file = fs.createWriteStream(destination);
            if(url.slice(0,5) == 'https') {
                https.get(url, function(response){
                    response.on('data', (chunk)=>{ progressIndicator.next() });
                    response.pipe(file);
                    file.on('finish', () => {  // TODO, check that this is not terminating prematurely 
                        progressIndicator.reset();
                        console.log("File downloaded!");
                        file.close();
                        resolve(destination);
                    });
                }).on('error', (err)=>{
                    fs.unlink(destination);
                    reject(err.message);
                });
            } 
            else{
                http.get(url, function(response){
                    response.on('data', (chunk)=>{ progressIndicator.next() });
                    response.pipe(file);
                    file.on('finish', () => {
                        progressIndicator.reset();
                        console.log("File downloaded!");
                        file.close();
                        resolve(destination);
                    });
                }).on('error', (err)=>{
                    fs.unlink(destination);
                    reject(err.message);
                });
            }
        }); 
    }

    /** unzips a specified file to the same directory */
    const unzipFile = function(zipFile){
        return new Promise((resolve, reject) => {
            console.log(`Unzipping '${zipFile}'...`);

            //Note: the archive is unzipped to the directory it resides in
            fs.createReadStream(zipFile)
                .on('data', (chunk)=>{ progressIndicator.next() })
                .pipe(unzip.Extract({ path: path.dirname(zipFile) }))
                //when ready return file name, so can use it to load a file to the db...
                .on('close', ()=>{
                    progressIndicator.reset();
                    console.log('Unzipped!');
                    resolve(findFile(path.parse(zipFile).dir, '.+.shp$'))  // return file with *.shp extension
                });
        });
    }

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
                        //console.log(`found file ${file}`);
                        resolve(file);  
                    }
                    //console.log(file);
                })
            });
        });
    }

    /** checks if database is ready for data import */
    const dbCheckup = function(shp){
        return new Promise((resolve, reject) => {
            console.log('Checking up the database...');

            let client = new pg.Client(dbCredentials);

            client.connect((err) => {
                if(err){
                    reject(err.message);
                    return;
                }

                client.query(`CREATE SCHEMA IF NOT EXISTS ${schemaName};`, (err, result) => {
                    if(err){
                        reject(err.message);
                    }
                    else {
                        client.end();
                        console.log('Database ready!');
                        
                        resolve(shp);
                    }
                });
            });      
        });
}

    /** loads a shapefile to a database */
    const dbLoad = function(shp){
        return new Promise((resolve, reject) => {
            console.log('Loading shapefile...');
            process.chdir(staging_folder);   // need to be in staging_folder to execute command 
            

            let dbc = dbCredentials;
            let cmd = `ogr2ogr -f "PostgreSQL" PG:"host=${dbc.host} port=${dbc.port} user=${dbc.user} dbname=${dbc.database}" "${shp}" -s_srs EPSG:4326 -t_srs EPSG:4326 -nln ${schemaName}.${tableName} -overwrite -lco GEOMETRY_NAME=the_geom`;
            //let cmd = `ogr2ogr -f "PostgreSQL" PG:"host=localhost port=5432 user=postgres dbname=parcels" real_estate_tax_delinquencies.shp -s_srs EPSG:4326 -t_srs EPSG:4326 -nln parcel_data.c42101_re_tax_delinquencies -overwrite -lco GEOMETRY_NAME=the_geom`
            console.log(`Executing command: ${cmd} from current working directory: ${process.cwd()}`);
            exec(cmd, (err, stdout, stderr) => {
                if(err){
                    reject(err.message);
                    return;
                }
                console.log(stdout || stderr);
                resolve();
            });
        });
    }

    /** counts imported records */
    const dbLoadTest = function(){
        return new Promise((resolve, reject) => {
            console.log('Verifying import...');

            let client = new pg.Client(dbCredentials);

            client.connect((err) => {
                if(err){
                    reject(err.message);
                    return;
                }
                
                client.query(`SELECT Count(*) as rec_count FROM ${schemaName}.${tableName};`, (err, result) => {
                    if(err){
                        reject(err.message);
                    }
                    else {
                        
                        console.log(`Imported ${result.rows[0].rec_count} records!`);
                        resolve(result.rows[0].rec_count);  // return # of records imported 
                    }
                });

                // create index 
                client.query(`CREATE INDEX ${schemaName}_${tableName}_the_geom_gist ON ${schemaName}.${tableName} USING gist(the_geom);`, (err, result) => {
                    if(err){
                        reject(err.message);
                    }
                    else {

                        console.log(`Index Created`);
                    }
                });

                // vacuum 
                client.query(`VACUUM ANALYZE ${schemaName}.${tableName};`, (err, result) => {
                    if(err){
                        reject(err.message);
                    }
                    else {
                        client.end();
                        console.log(`Vacuum analyzed`);
                    }
                });

                

            });      
        });
    }

    // Run chained functions 
        makeFolder(staging_folder);
        await sleep(2000); // allow time (ms) to create folder before downloading to it
        process.chdir(staging_folder)
        download(downloadUrl)
            .then(unzipFile)
            .then(dbCheckup)
            .then(dbLoad)
            .then(dbLoadTest)
            .catch(err => console.log(`Oops, an error has occured: ${err}`))
    
    // remove all downloaded files from staging folder 
    process.chdir(tmp_folder) 

    await sleep(2000); // allow time (ms) to load files before deleting 
    exec(`rm -r ${staging_folder}`)
}  // end of top-level function for export 

exports.load = load;