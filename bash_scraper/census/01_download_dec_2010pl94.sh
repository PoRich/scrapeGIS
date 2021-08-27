#!/bin/bash

# Source: https://github.com/censusreporter/census-postgres-scripts/blob/master/02_download_dec_2010_pl94.sh
# Download Decennial 2010 Census Redistricting data (PL94-171)
mkdir -p /tmp/census/dec2010_pl94
cd /tmp/census/dec2010_pl94

# reject us2010.npl.zip as we only care about blocks and don't need state-spanning geographies
wget --recursive --continue --accept=*.zip --reject=us2010.npl.zip \
     --no-parent --cut-dirs=3 --no-host-directories \
     -e robots=off \
     --directory-prefix=/tmp/census/dec2010_pl94 \
    https://census-backup.b-cdn.net/census_2010/01-Redistricting_File--PL_94-171/
