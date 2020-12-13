Philadelphia Assessments API does not return valid json (as of Dec 2020); attempt csv download first 

Data Documentation: 
Data sourced from https://www.opendataphilly.org/dataset
* Office of Property Assessments   https://metadata.phila.gov/#home/datasetdetails/5543865f20583086178c4ee5/representationdetails/55d624fdad35c7e854cb21a4/?view_287_page=2
* Assessments                       https://metadata.phila.gov/#home/datasetdetails/5543865f20583086178c4ee5/representationdetails/55d62f07ee9c74144746ccfd/
* Land Use                          https://metadata.phila.gov/#home/datasetdetails/5543864420583086178c4e74/representationdetails/55438a7f9b989a05172d0cf3/
* Dept of Records Property Parcels  https://metadata.phila.gov/#home/datasetdetails/5543867020583086178c4f2a/representationdetails/55438aba9b989a05172d0d61/
* RTT Summary                       https://metadata.phila.gov/#home/datasetdetails/5a04b8d39202605970a7457d/representationdetails/5a04b8d39202605970a74581/
* RE Tax Delinquencies              https://metadata.phila.gov/#home/datasetdetails/57d9643afab162fe2708224e/representationdetails/57d9643cfab162fe27082252/
* Business Licenses                 https://metadata.phila.gov/#home/datasetdetails/5543865a20583086178c4ed2/representationdetails/57e53953dfc5d2be6083dae2/
* Building Permits                  https://metadata.phila.gov/#home/datasetdetails/5543868920583086178c4f8f/representationdetails/55438add9b989a05172d0d97/
* L&I violations                    https://metadata.phila.gov/#home/datasetdetails/5543ca7a5c4ae4cd66d3ff86/representationdetails/5571b1bde4fb1d91393c215c/
* Unsafe violations                 https://metadata.phila.gov/#home/datasetdetails/5543ca7a5c4ae4cd66d3ff86/representationdetails/57d2fcd1af067d7747870ee5/
* Dangerous violations              https://metadata.phila.gov/#home/datasetdetails/5543ca7a5c4ae4cd66d3ff86/representationdetails/57d2fcd1af067d7747870ee5/

Command line run: 
### To scrape both tables, do not pass any table_name
```python scrape.py  [table_name optional]```

### to download shp files run
```bash download_shp.sh [table name] [download_URL] [optional SRID default is 4326]```

## Installation, the download_shp.sh script requires:
1. Execution permissions: ```chmod +x DOR_script.sh```
2. Existance of .env with ```PGPORT```, ```PGHOST```, ```PGUSER```, ```PGPASSWORD```, ```APPDIR``` defined 
3. Verifying that shp download urls have not changed (TBC)


## PROJECTION SRID = 4326 (As of Dec 2020) 
### Each of the following data sets have had SRIDs verifid based on PRJ files:  
GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["Degree",0.017453292519943295]]
* land_use                
* dept_of_records         
* RTT_SUMMARY             
* re_tax_delinquencies    
* business_licenses       
* building permits        
* li_violations           