const fs = require('fs');
const path = '/home/ubuntu/jarbou3-delivery/server/routers.ts';
let source = fs.readFileSync(path, 'utf8');
const old = '        if (error || !data.session) {\n          console.warn(`[Jarbou3] Sign-in rejected: ${error?.code ?? "NO_SESSION"}`);\n          throw new Error(error?.code === "invalid_credentials" ? "SIGN_IN_PASSWORD_INVALID" : "SIGN_IN_FAILED");\n        }';
const next = '        if (error || !data.session) {\n          console.warn(`[Jarbou3] Sign-in rejected: ${error?.code ?? "NO_SESSION"}`);\n          if (error?.code === "invalid_credentials") recordLoginFailure(requestIp, phone);\n          throw new Error(error?.code === "invalid_credentials" ? "SIGN_IN_PASSWORD_INVALID" : "SIGN_IN_FAILED");\n        }';
if (!source.includes(old)) throw new Error('sign-in failure block not found');
source = source.replace(old, next);
fs.writeFileSync(path, source);
console.log('Failure attempts are now recorded before returning the generic password error.');
