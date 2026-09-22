const fs=require('fs');
const s=fs.readFileSync('/mnt/data/workdate/server.js','utf8');
const iata=s.match(/const IATA_BY_CITY=\{[\s\S]*?\n\};/)[0];
const fn=s.match(/function parseFlightDetails\(text\)\{[\s\S]*?\n\}\nasync function aiAnalyze/)[0].replace(/\nasync function aiAnalyze[\s\S]*$/,'');
eval(iata+'\n'+fn);
for(const x of ['Москва Душанбе 29.09.26','Москва Душанбе 26.09','Москва Душанбе 29 сент','Москва Душанбе 29 сентября','Москва Душанбе 29.09.2026']) console.log(x,'=>',parseFlightDetails(x));
