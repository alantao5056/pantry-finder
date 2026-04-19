const fs = require('fs');
const path = require('path');

/**
 * Small tool to convert JSON file content to base64.
 * Usage: node tools/json-to-base64.js <path-to-json-file>
 */

const filePath = process.argv[2];

if (!filePath) {
  console.error('Error: Please provide a file path.');
  console.log('Usage: node tools/json-to-base64.js <path-to-json-file>');
  process.exit(1);
}

const absolutePath = path.resolve(filePath);

if (!fs.existsSync(absolutePath)) {
  console.error(`Error: File not found at ${absolutePath}`);
  process.exit(1);
}

try {
  const fileContent = fs.readFileSync(absolutePath, 'utf8');
  
  // Basic JSON validation
  try {
    JSON.parse(fileContent);
  } catch (e) {
    console.warn('Warning: The file content does not appear to be valid JSON.');
  }

  const base64Content = Buffer.from(fileContent).toString('base64');
  console.log(base64Content);
} catch (error) {
  console.error('Error reading or processing file:', error.message);
  process.exit(1);
}
