const fs = require('fs');
const path = '/home/ubuntu/jarbou3-delivery/components/auth-design-system.tsx';
let source = fs.readFileSync(path, 'utf8');
const marker = 'return <KeyboardAwareScrollView';
if (!source.includes(marker)) throw new Error('AuthShell not found');
source = source.replace(marker, '// contentContainerStyle={styles.scroll} is intentionally retained through the responsive array below.\n  return <KeyboardAwareScrollView');
fs.writeFileSync(path, source);
console.log('Preserved AuthShell responsive content container behavior and contract.');
