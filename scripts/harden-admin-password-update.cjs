const fs = require('fs');
const path = '/home/ubuntu/jarbou3-delivery/server/admin-web.ts';
let source = fs.readFileSync(path, 'utf8');
const oldBlock = '      const { data: updatedSettings, error } = await asService().from("admin_site_settings").update({ password_hash: passwordHash, password_set_at: now, updated_at: now }).eq("singleton", true).select("singleton").maybeSingle();\n      if (error) throw new Error(error.message);\n      if (!updatedSettings) throw new Error("SITE_PASSWORD_CONFIGURATION_ERROR");';
const newBlock = '      const { data: updatedSettings, error } = await asService().from("admin_site_settings").upsert({ singleton: true, password_hash: passwordHash, password_set_at: now, updated_at: now }, { onConflict: "singleton" }).select("singleton").single();\n      if (error) throw new Error(error.message);\n      if (!updatedSettings?.singleton) throw new Error("SITE_PASSWORD_CONFIGURATION_ERROR");';
if (!source.includes(oldBlock)) throw new Error('admin password block not found');
source = source.replace(oldBlock, newBlock);
fs.writeFileSync(path, source);
console.log('Admin password update now uses a verified singleton upsert.');
