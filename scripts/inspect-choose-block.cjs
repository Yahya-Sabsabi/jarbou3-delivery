const fs = require('fs');
const source = fs.readFileSync('/home/ubuntu/jarbou3-delivery/components/jarbou3-app.tsx', 'utf8');
const start = source.indexOf('if (stage === "choose")');
const end = source.indexOf('if (stage === "form")', start);
console.log(JSON.stringify({start, end, snippet: source.slice(start, end)}));
