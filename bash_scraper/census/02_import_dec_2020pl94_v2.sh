#!/bin/bash
# Source: https://github.com/censusreporter/census-postgres-scripts/blob/master/03_import_dec_2020_pl94.sh

export PGHOST=localhost
export PGUSER=reiq
export PGPASSWORD=$1
export PGDATABASE=reiq

if [ -z $PGHOST ]; then
    echo "You must set PGHOST environment variable to the hostname of the PostgreSQL server to operate on."
    exit 1
fi

# Clone the import scripts from git (copied scripts mannually into ./census-postgres folder)
# cd /home/rsun/CSprojects
# sudo apt-get -y install csvkit
# git clone git://github.com/censusreporter/census-postgres.git

# DATA_DIR=/tmp/census/dec2020_pl94
DATA_DIR=/tmp/census/dec2020_pl94/redo

# Create the schema
# cd /home/rsun/CSprojects/census-postgres/dec2020_pl94
cd /home/rsun/CSprojects/scrapeGIS/bash_scraper/census/census-postgres/dec2020_pl94


# Slurp in the actual data
# We're doing the COPY FROM STDIN so we don't have to be a psql superuser
# Only load blocks (SUMLEV 750)
echo "Importing geoheader"
# for i in `ls ${DATA_DIR}/*geo2020.pl`; do
for i in `find ${DATA_DIR} -name *geo2020.pl`; do
    echo `basename $i`
    # expecting pipe delimited, no header row - but after csvgrep, delim is comma and header has been added
    # cat $i | csvgrep -H -d \| -c 3 -m 750 | psql -v ON_ERROR_STOP=1 -q -c "COPY dec2020_pl94.geoheader FROM STDIN WITH CSV HEADER ENCODING 'latin1';"
    cat $i | csvgrep -H -d \| -e cp1252 -v -c 3 -m 750 | psql -v ON_ERROR_STOP=1 -q -c "COPY dec2020_pl94.geoheader FROM STDIN WITH CSV HEADER ENCODING 'latin1';"

    if [ $? != 0 ]; then
        echo "Failed importing geoheader $i."
        exit 1
    fi
done

'''
echo "Creating real tables from import tables"
psql -v ON_ERROR_STOP=1 -q -f 02_select_seq_into_tables.sql
if [ $? != 0 ]; then
    echo "Failed creating real tables from import tables."
    # exit 1
fi
'''