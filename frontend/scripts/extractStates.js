/**
 * Extract SVG path data from india_map.svg and generate a TypeScript data file.
 * Run: node scripts/extractStates.js
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const svgPath = path.join(__dirname, '..', 'public', 'india_map.svg');
const outputPath = path.join(__dirname, '..', 'components', 'Admin', 'indiaStatesData.ts');

const content = fs.readFileSync(svgPath, 'utf-8');

// Extract all <path> elements — match across newlines
const pathRegex = /<path\s+id="([^"]+)"\s+name="([^"]+)"\s+d="([\s\S]*?)"\s*\/>/g;

let match;
const states = [];

while ((match = pathRegex.exec(content)) !== null) {
  states.push({
    id: match[1],
    name: match[2],
    d: match[3].replace(/\t/g, ' ').replace(/\n/g, ' ').replace(/\s+/g, ' ').trim()
  });
}

console.log(`Found ${states.length} state/UT paths`);

// Generate TypeScript output
let output = `// Auto-generated from public/india_map.svg using scripts/extractStates.js\n`;
output += `// Source: @svg-maps/india (viewBox: 0 0 612 696)\n`;
output += `// Do not edit manually.\n\n`;
output += `export interface IndiaState {\n  id: string;\n  name: string;\n  d: string;\n}\n\n`;
output += `export const SVG_VIEWBOX = "0 0 612 696";\n\n`;
output += `export const INDIA_STATES: IndiaState[] = [\n`;

for (const s of states) {
  const escapedD = s.d.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  output += `  { id: "${s.id}", name: "${s.name}", d: "${escapedD}" },\n`;
}

output += `];\n`;

fs.writeFileSync(outputPath, output, 'utf-8');
console.log(`Written to ${outputPath}`);
console.log('States:', states.map(s => `${s.id} (${s.name})`).join(', '));
