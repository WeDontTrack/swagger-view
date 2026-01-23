// Quick test of the analyzer
// Run with: node test-analyzer.js
const { SpecAnalyzer } = require('./out/specAnalyzer');
const yaml = require('js-yaml');
const fs = require('fs');

// Load the example file
const yamlContent = fs.readFileSync('./example-with-unused.yaml', 'utf8');
const spec = yaml.load(yamlContent);

console.log('Loaded spec:', spec.info.title);
console.log('');

// Analyze
const analyzer = new SpecAnalyzer(spec);
const result = analyzer.analyze();

console.log('Analysis Results:');
console.log('=================');
console.log('Total Definitions:', result.totalDefinitions);
console.log('Total References:', result.totalReferences);
console.log('Unused Count:', result.unusedDefinitions.length);
console.log('');

if (result.unusedDefinitions.length > 0) {
    console.log('Unused Definitions:');
    result.unusedDefinitions.forEach((def, index) => {
        console.log(`${index + 1}. [${def.type}] ${def.name} - ${def.path}`);
    });
} else {
    console.log('✅ No unused definitions found!');
}

