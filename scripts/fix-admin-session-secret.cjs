const fs = require('fs');
const path = '/home/ubuntu/jarbou3-delivery/server/admin-web.ts';
let source = fs.readFileSync(path, 'utf8');
const pattern = /function adminPassword\(\) \{\n  const password = process\.env\.ADMIN_SITE_PASSWORD;\n  if \(!password \|\| password\.length < 16\) throw new Error\("ADMIN_SITE_PASSWORD_NOT_CONFIGURED"\);\n  return password;\n\}\n\nfunction sign\(value: string\) \{\n  return createHmac\("sha256", adminPassword\(\)\)\.update\(value\)\.digest\("base64url"\);\n\}/;
const replacement = `function sessionSigningSecret() {
  const secret = process.env.ADMIN_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.ADMIN_SITE_PASSWORD;
  if (!secret || secret.length < 16) throw new Error("ADMIN_SESSION_SECRET_NOT_CONFIGURED");
  return secret;
}

function sign(value: string) {
  return createHmac("sha256", sessionSigningSecret()).update(value).digest("base64url");
}`;
if (!pattern.test(source)) throw new Error('admin session signing block not found');
source = source.replace(pattern, replacement);
source = source.replaceAll('error.message === "ADMIN_SITE_PASSWORD_NOT_CONFIGURED"', 'error.message === "ADMIN_SESSION_SECRET_NOT_CONFIGURED"');
fs.writeFileSync(path, source);
console.log('Admin sessions now use a stable server secret, independent of the mutable admin password.');
