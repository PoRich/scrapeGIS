-- augment missing codes in source table 
UPDATE pcl_data.world set gmi_cntry = 'HKG' WHERE gid = 50;

ALTER TABLE addr.country_lookup add column the_geom geometry(MultiPolygon, 4269);

UPDATE addr.country_lookup c SET the_geom = _the_geom FROM 
(SELECT gmi_cntry, the_geom _the_geom FROM pcl_data.world) a 
WHERE a.gmi_cntry = c.alpha_3; -- 200 updated 

-- 49 territories not included
SELECT name, alpha_3 from addr.country_lookup where alpha_3 in 
(select alpha_3 from addr.country_lookup except SELECT gmi_cntry from pcl_data.world);
/*

                     name                     │ alpha_3 
══════════════════════════════════════════════╪═════════
 Åland Islands                                │ ALA
 American Samoa                               │ ASM
 Anguilla                                     │ AIA
 Aruba                                        │ ABW
 Bonaire, Sint Eustatius and Saba             │ BES
 Bouvet Island                                │ BVT
 British Indian Ocean Territory               │ IOT
 Cayman Islands                               │ CYM
 Christmas Island                             │ CXR
 Cocos (Keeling) Islands                      │ CCK
 Congo, Democratic Republic of the            │ COD
 Cook Islands                                 │ COK
 Curaçao                                      │ CUW
 French Southern Territories                  │ ATF
 Gibraltar                                    │ GIB
 Guam                                         │ GUM
 Guernsey                                     │ GGY
 Heard Island and McDonald Islands            │ HMD
 Holy See                                     │ VAT
 Isle of Man                                  │ IMN
 Jersey                                       │ JEY
 Marshall Islands                             │ MHL
 Mayotte                                      │ MYT
 Micronesia (Federated States of)             │ FSM
 Montenegro                                   │ MNE
 Montserrat                                   │ MSR
 Nauru                                        │ NRU
 Niue                                         │ NIU
 Norfolk Island                               │ NFK
 Palau                                        │ PLW
 Palestine, State of                          │ PSE
 Pitcairn                                     │ PCN
 Romania                                      │ ROU
 Saint Barthélemy                             │ BLM
 Saint Helena, Ascension and Tristan da Cunha │ SHN
 Saint Kitts and Nevis                        │ KNA
 Saint Martin (French part)                   │ MAF
 Saint Pierre and Miquelon                    │ SPM
 Serbia                                       │ SRB
 Sint Maarten (Dutch part)                    │ SXM
 South Georgia and the South Sandwich Islands │ SGS
 South Sudan                                  │ SSD
 Timor-Leste                                  │ TLS
 Tokelau                                      │ TKL
 Tuvalu                                       │ TUV
 United States Minor Outlying Islands         │ UMI
 Virgin Islands (British)                     │ VGB
 Virgin Islands (U.S.)                        │ VIR
 Wallis and Futuna                            │ WLF
(49 rows)


*/
