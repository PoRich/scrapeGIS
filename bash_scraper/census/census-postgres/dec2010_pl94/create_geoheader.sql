-- https://raw.githubusercontent.com/censusreporter/census-postgres/master/dec2010_pl94/create_geoheader.sql

DROP TABLE IF EXISTS dec2010_pl94.geoheader;
CREATE TABLE dec2010_pl94.geoheader (
	FILEID varchar(6),
	STUSAB varchar(2),
	SUMLEV varchar(3),
	GEOCOMP varchar(2),
	CHARITER varchar(3),
	CIFSN varchar(2),
	LOGRECNO varchar(7),
	REGION varchar(1),
	DIVISION varchar(1),
	STATE varchar(2),
	COUNTY varchar(3),
	COUNTYCC varchar(2),
	COUNTYSC varchar(2),
	COUSUB varchar(5),
	COUSUBCC varchar(2),
	COUSUBSC varchar(2),
	PLACE varchar(5),
	PLACECC varchar(2),
	PLACESC varchar(2),
	TRACT varchar(6),
	BLKGRP varchar(1),
	BLOCK varchar(4),
	IUC varchar(2),
	CONCIT varchar(5),
	CONCITCC varchar(2),
	CONCITSC varchar(2),
	AIANHH varchar(4),
	AIANHHFP varchar(5),
	AIANHHCC varchar(2),
	AIHHTLI varchar(1),
	AITSCE varchar(3),
	AITS varchar(5),
	AITSCC varchar(2),
	TTRACT varchar(6),
	TBLKGRP varchar(1),
	ANRC varchar(5),
	ANRCCC varchar(2),
	CBSA varchar(5),
	CBSASC varchar(2),
	METDIV varchar(5),
	CSA varchar(3),
	NECTA varchar(5),
	NECTASC varchar(2),
	NECTADIV varchar(5),
	CNECTA varchar(3),
	CBSAPCI varchar(1),
	NECTAPCI varchar(1),
	UA varchar(5),
	UASC varchar(2),
	UATYPE varchar(1),
	UR varchar(1),
	CD varchar(2),
	SLDU varchar(3),
	SLDL varchar(3),
	VTD varchar(6),
	VTDI varchar(1),
	RESERVE2 varchar(3),
	ZCTA5 varchar(5),
	SUBMCD varchar(5),
	SUBMCDCC varchar(2),
	SDELM varchar(5),
	SDSEC varchar(5),
	SDUNI varchar(5),
	AREALAND varchar(14),
	AREAWATR varchar(14),
	NAME varchar(90),
	FUNCSTAT varchar(1),
	GCUNI varchar(1),
	POP100 varchar(9),
	HU100 varchar(9),
	INTPTLAT varchar(11),
	INTPTLON varchar(12),
	LSADC varchar(2),
	PARTFLAG varchar(1),
	RESERVE3 varchar(6),
	UGA varchar(5),
	STATENS varchar(8),
	COUNTYNS varchar(8),
	COUSUBNS varchar(8),
	PLACENS varchar(8),
	CONCITNS varchar(8),
	AIANHHNS varchar(8),
	AITSNS varchar(8),
	ANRCNS varchar(8),
	SUBMCDNS varchar(8),
	CD113 varchar(2),
	CD114 varchar(2),
	CD115 varchar(2),
	SLDU2 varchar(3),
	SLDU3 varchar(3),
	SLDU4 varchar(3),
	SLDL2 varchar(3),
	SLDL3 varchar(3),
	SLDL4 varchar(3),
	AIANHHSC varchar(2),
	CSASC varchar(2),
	CNECTASC varchar(2),
	MEMI varchar(1),
	NMEMI varchar(1),
	PUMA varchar(5),
	RESERVED varchar(18)
)
WITH (autovacuum_enabled = FALSE, toast.autovacuum_enabled = FALSE);

CREATE INDEX geoheader_join_idx on dec2010_pl94.geoheader (LOGRECNO, STUSAB);
