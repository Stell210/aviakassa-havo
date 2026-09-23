const fs = require('fs');
const path = require('path');

const serverPath = path.join(__dirname, 'server.js');
const source = fs.readFileSync(serverPath, 'utf8');

const iataMatch = source.match(/const IATA_BY_CITY=\{[\s\S]*?\n\};/);
const fnMatch = source.match(/function parseFlightDetails\(text\)\{[\s\S]*?\n\}\n\nfunction parseRouteOverride/);

if (!iataMatch) throw new Error('IATA_BY_CITY block not found');
if (!fnMatch) throw new Error('parseFlightDetails block not found');

const fn = fnMatch[0].replace(/\nfunction parseRouteOverride[\s\S]*$/, '');
eval(iataMatch[0] + '\n' + fn);

const cases = [
  ['Москва Душанбе 29.09.26', '2026-09-29'],
  ['Москва Душанбе 26.09', '2026-09-26'],
  ['Москва Душанбе 29 сент', '2026-09-29'],
  ['Москва Душанбе 29 сентября', '2026-09-29'],
  ['Москва Душанбе 29.09.2026', '2026-09-29']
];

for (const [input, expectedDate] of cases) {
  const result = parseFlightDetails(input);
  if (result.from_city !== 'москва' || result.to_city !== 'душанбе' || result.departure_date !== expectedDate) {
    throw new Error(`FAILED: ${input} => ${JSON.stringify(result)}`);
  }
  console.log(`PASS: ${input} => ${result.from_city} -> ${result.to_city}, ${result.departure_date}`);
}

console.log(`OK: ${cases.length} flight-date cases passed.`);
