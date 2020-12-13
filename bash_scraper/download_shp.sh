#!/bin/bash
# to run file: bash download_shp.sh [table name] [download_URL] [optional SRID (default 4326)]
TABLE=$1 #'c42101_DOR'
URL=$2 #'http://data-phl.opendata.arcgis.com/datasets/1c57dd1b3ff84449a4b0e3fb29d3cafd_0.zip'
# CWD="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"  #this is where you run the script from 
# CWD=dirname "$0"  # DEPENDS ON THE #! ON LINE 1 OF THIS SCRIPT!
TMPDIR=${APPDIR}/tmp/${TABLE} # DEPENDS ON APPDIR set in environmental variables
UNZIPTOOL=unzip
WGETTOOL=wget
export PGDATABASE=parcels
PSQL=${PGBIN}/psql
SHP2PGSQL=shp2pgsql

# if SRID is specified
if [ $3 ]  
then 
    SRID=$3
else 
    SRID=4326
fi

mkdir $TMPDIR
cd $TMPDIR

$WGETTOOL --connect-timeout=300 --server-response "${URL}"

ZIPFILE=$(find ./ -type f -name "*.zip")
$UNZIPTOOL -o -d $TMPDIR $ZIPFILE

${PSQL} -c "DROP TABLE IF EXISTS ${TABLE}"

SHPFILE=$(find ./ -type f -name "*.shp")
${SHP2PGSQL} -s $SRID -D -I -g the_geom $SHPFILE parcel_data.${TABLE} | ${PSQL} parcels
    ${PSQL} -c "CREATE INDEX parcel_data_${TABLE}_the_geom_gist ON parcel_data.${TABLE} USING gist(the_geom);"
    ${PSQL} -c "VACUUM ANALYZE parcel_data.${TABLE};" 

#cd ..
#rm -r $TMPDIR