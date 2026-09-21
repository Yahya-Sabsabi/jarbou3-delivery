const fs=require('fs'); const path='/home/ubuntu/jarbou3-delivery/components/jarbou3-app.tsx'; let s=fs.readFileSync(path,'utf8');
s=s.replace(', chooseFooter: { color: "#6E9184", fontSize: 10, fontWeight: "700", textAlign: "center", letterSpacing: 0.5 }, choosePressed: { opacity: 0.78, transform: [{ scale: 0.985 }] }', '');
s=s.replace('chooseFooter: { color: "#9AA69F", fontSize: 10, fontWeight: "700", textAlign: "center" }', 'chooseFooter: { color: "#6E9184", fontSize: 10, fontWeight: "700", textAlign: "center", letterSpacing: 0.5 }');
fs.writeFileSync(path,s); console.log('Removed duplicate onboarding style properties.');
