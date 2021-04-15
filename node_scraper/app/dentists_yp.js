// https://www.yellowpages.com/devon-pa/dentists
// https://www.yellowpages.com/levittown-pa/dentists

'select statefp, name from tiger.state;'
'select p.gid as g_id, s.stusps as state_abbr, p.name as city from tiger.place p join tiger.state s using(statefp)'
