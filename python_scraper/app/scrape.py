import datetime
import json
import logging
import pandas as pd
import pdb
import os
import re 
import requests
import shutil
from sqlalchemy import create_engine, text
import subprocess
import sys
import traceback

logging.basicConfig(level=logging.DEBUG, format='%(asctime)s - %(levelname)s - [%(lineno)d]  %(message)s')
#logging.basicConfig(filename='c42101_scraper_log.txt', level=logging.DEBUG, format='%(asctime)s - %(levelname)s - %(message)s')
#logging.disable(logging.DEBUG)
app_dir = os.getenv('APPDIR') 
bash_scraper_dir = os.path.join(app_dir, 'bash_scraper')  # execute download_shp in parent directory
staging_dir=os.path.join(app_dir, 'tmp')
error_log = os.path.join(app_dir, 'python_scraper', 'logs', 'error_log.txt')
DATABASE_URL = os.environ.get('DATABASE_URL')

SCHEMA = 'pcl_data'  # schema for staging raw parcel data 

#TODO 1) unzip functionality for json or csv file 
#TODO 2) functionality for shp file 

# class for downloading information into postgres database 
class Table: 
    def __init__(self, county_code, name, url, file_type, unzip=False, if_exists='replace'):
        # convention is 'c' (denoting county) + FSIP number   
        self.table_name = f"c{county_code}_{name}" 
        self.file_type = file_type  #TODO SHP files
        self.file_name = f'{self.table_name}.{self.file_type}'
        self.url = url
        self.unzip = unzip  # TODO 
        self.if_exists = if_exists
        

    def download_file(self):
        with requests.get(self.url, stream=True) as r:
            with open(self.file_name, 'wb') as f:
                shutil.copyfileobj(r.raw, f)
        return self.file_name

    # scrape assessment and opa property database
    def scrape(self, max_attempts=5):
        # downloads data into database, replaces existing database if exists
        assert self.file_type in ['csv', 'json'], 'file_type must be csv or json'
        if self.file_type == 'json':
            func = self.scrape_json
        elif self.file_type == 'csv':
            func = self.scrape_csv
        self.repeat_attempts(max_attempts, func)  
     
    # attempts a function max_attempts; function should return errror as -1
    def repeat_attempts(self, max_attempts, func, *args, **kwargs):
        attempts, outcome = 1, -1  #-1=error, 0=success
        while (outcome == -1) and (attempts <= max_attempts):
            logging.debug(f'Attempt {func}({args}) attempt #{attempts} of {max_attempts}')
            outcome = func(*args, **kwargs)
            if outcome == 0:
                logging.debug(f'{func}({args}) completed on {attempts} attempt')
                # should break the while loop
            elif outcome == -1 and attempts == max_attempts:
                # maximum attempts were unsuccessful
                err_message = f'{func}({args}) failed after {max_attempts} unsuccessful attempts'
                logging.error(err_message)
                with open(error_log, 'w') as err_log:
                    err_log.write(err_message)
            attempts += 1

    def handle_err(self, func, e, traceback):
        err_message = f'{func} failed attempting {self.table_name} with err {e}: {traceback}'
        logging.error(err_message)
        with open(error_log, 'w') as err_log:
            err_log.write(err_message)

    def scrape_json(self):
        try:
            logging.debug(f'Scraping {self.table_name} via api...')
            response = requests.get(self.url)
            rjson = response.json()  # convert to json
            self.df = pd.DataFrame(rjson['rows'])  # load rows (not metadata) into dataframe
            self.save_df()
        except Exception as e:
            self.handle_err(self.scrape_json, e, traceback.format_exc())
            return -1
        return 

    def scrape_csv(self):
        try:
            logging.debug(f'Scraping {self.table_name} via csv...')
            self.df = pd.read_csv(self.url)  # download csv
            self.save_df()
        except Exception as e:
            self.handle_err(self.scrape_csv, e, traceback.format_exc())
            return -1
        return 

    def save_df(self):  # saves data to database
        logging.debug(f'Saving {self.table_name} to database...')
        engine = create_engine(DATABASE_URL)
        self.df['last_updated_utc'] = datetime.datetime.utcnow()  # add time stamp UTC
        self.df.to_sql(self.table_name, con=engine, schema=SCHEMA, if_exists=self.if_exists)  # dump into database
        # update metadata 
        with engine.connect() as con:
            s = text("update tools.meta set (last_updated, next_update)=(now(), now()::date + internal_update_freq) where _schema=:schema and _table=:table")
            con.execute(s, schema=SCHEMA, table=self.table_name)
        return


''' TODO - shp
def scrape_shp(url_dict):
    for table, shp_url in url_dict.items():
        cmd = f"bash download_shp.sh {COUNTY_CODE}_{table} {shp_url}"
        logging.debug(f'executing cmd {cmd} bash directory:{bash_scraper_dir}')
        subprocess.Popen(cmd.split(), cwd=bash_scraper_dir)
    return 0'''

