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

  // Split by <Button, <Link, etc., then find the next closing tag or '>', 
  // keeping track of brace nesting {} to safely skip arrow functions.

  const tags = ['Button', 'Link', 'ActionableGridListItem', 'AttentionQueueWidget', 'DonutGraph', 'BarGraph', 'CalendarGraph', 'StackedBarGraph', 'Checkbox'];

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
            if (char === stringChar && part[j - 1] !== '\\') {
              inString = false;
            }
            continue;
          }

          if (char === '"' || char === "'" || char === "`") {
            inString = true;
            stringChar = char;
            continue;
          }

          if (char === '{') braceDepth++;
          if (char === '}') braceDepth--;

          // Found the end of the opening tag !
          if (char === '>' && braceDepth === 0) {
            break;
          }
        }

        // now part.substring(0, j) is the inside of the opening tag
        let insideTag = part.substring(0, j);
        let outsideTag = part.substring(j);

        insideTag = insideTag.replace(/\bonClick\b/g, 'onPress');

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
