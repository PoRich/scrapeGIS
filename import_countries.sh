#!/bin/bash
export PGHOST=localhost
export PGPORT=5432
export PGUSER=reiq
export PGPASSWORD=$1
export PGDATABASE=reiq
export COUNTY_FIPS='42045'
export STAGING_FOLDER='/Users/Rich/Downloads/kx-world-country-boundaries-SHP'

if [ -z $PGPASSWORD ]; then
    echo "You must set PGPASSWORD environment variable to the hostname of the PostgreSQL server to operate on."
    exit 1
fi

# download ownership data (shp)
# https://koordinates.com/layer/1103-world-country-boundaries/
# original source http://www.diva-gis.org/data/DataServer.htm#Administrative%20boundaries

cd ${STAGING_FOLDER}

# echo "ogr2ogr -f \"PostgreSQL\" PG:\"host=${PGHOST} port=${PGPORT} user=${PGUSER} dbname=${PGDATABASE} password=${PGPASSWORD}\" $i -nln pcl_data.c${COUNTY_FIPS}_gis -t_srs "EPSG:4269" -nlt PROMOTE_TO_MULTI  -lco GEOMETRY_NAME=the_geom -skipfailures"

shp2pgsql -s 4326:4269 -g 'the_geom' world-country-boundaries pcl_data.world | psql -h localhost -p 63333 -d reiq -U reiq 

# $ sh county_scripts/42045_delaware/02_import_42045_gis.sh