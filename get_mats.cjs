const fs = require('fs');
const contents = fs.readFileSync('public/ferrari.glb');
const str = contents.toString('utf8', 0, 100000);
const names = [];
const regex = /"name"\s*:\s*"([^"]+)"/g;
let match;
while ((match = regex.exec(str)) !== null) {
  names.push(match[1]);
}
console.log(Array.from(new Set(names)).join('\n'));
