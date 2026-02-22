const fs = require('fs');
const path = require('path');

function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach((file) => {
        file = path.join(dir, file);
        if (fs.statSync(file).isDirectory()) {
            results = results.concat(walk(file));
        } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
            results.push(file);
        }
    });
    return results;
}

const files = walk('packages/desktop-client/src/components');
let totalReplaced = 0;

files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    let original = content;

    const tags = ['Link'];

    for (const tag of tags) {
        const searchStr = `<${tag}`;
        let parts = content.split(searchStr);

        if (parts.length > 1) {
            for (let i = 1; i < parts.length; i++) {
                let part = parts[i];

                let braceDepth = 0;
                let j = 0;
                let inString = false;
                let stringChar = '';

                for (; j < part.length; j++) {
                    const char = part[j];
                    if (inString) {
                        if (char === stringChar && part[j - 1] !== '\\') inString = false;
                        continue;
                    }
                    if (char === '"' || char === "'" || char === "`") {
                        inString = true;
                        stringChar = char;
                        continue;
                    }
                    if (char === '{') braceDepth++;
                    if (char === '}') braceDepth--;
                    if (char === '>' && braceDepth === 0) break;
                }

                let insideTag = part.substring(0, j);
                let outsideTag = part.substring(j);

                // REVERT onPress back to onClick for Link components
                insideTag = insideTag.replace(/\bonPress\b/g, 'onClick');

                parts[i] = insideTag + outsideTag;
            }
            content = parts.join(searchStr);
        }
    }

    if (content !== original) {
        fs.writeFileSync(file, content);
        console.log('Modified:', file);
        totalReplaced++;
    }
});

console.log('Completed. Files modified:', totalReplaced);
