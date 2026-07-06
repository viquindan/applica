const fs = require('fs');
const path = require('path');

const globalsPath = path.join(__dirname, 'src', 'app', 'globals.css');
const modernTablePath = path.join(__dirname, 'modern-table.css');

// Read globals.css as a buffer because of potential UTF-16LE corruption
const buffer = fs.readFileSync(globalsPath);
let content = buffer.toString('utf8');

// The UTF-16LE characters will look like "w\x00i\x00d\x00t\x00h\x00". Let's remove them.
// A simpler way: we appended `modern-table.css` which starts with `/* Append to globals.css */`
// Let's just find the last valid rule before the corruption.
// Looking at my view_file tool output before, the file had 331 lines.
// I will just read the original file line by line, and stop when I encounter null bytes.

const lines = content.split('\n');
let cleanLines = [];
for (const line of lines) {
  if (line.includes('\x00')) {
    break;
  }
  cleanLines.push(line);
}

// Ensure the last few lines are clean
const cleanText = cleanLines.join('\n').trim();

// Now read modern-table.css properly
const modernCSS = fs.readFileSync(modernTablePath, 'utf8');

// Write both back
fs.writeFileSync(globalsPath, cleanText + '\n\n' + modernCSS, 'utf8');

console.log('Fixed globals.css successfully.');
