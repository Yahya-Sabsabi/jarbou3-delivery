const fs = require('fs');
const path = '/home/ubuntu/jarbou3-delivery/tests/account-recovery-completion.test.ts';
let source = fs.readFileSync(path, 'utf8');
const marker = '      if (table === "account_verification_requests") {';
const addition = '      if (table === "account_login_security") {\n        const deleted = { eq: async () => ({ error: null }) };\n        return { delete: () => deleted };\n      }\n';
if (!source.includes(marker)) throw new Error('test table marker not found');
source = source.replace(marker, addition + marker);
fs.writeFileSync(path, source);
console.log('Updated recovery test mock for persistent login security.');
