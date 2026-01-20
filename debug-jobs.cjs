#!/usr/bin/env node
/**
 * Debug script to check job registry
 */
const fs = require('fs');
const path = require('path');

// Try multiple possible paths
const possiblePaths = [
  '.jobs-registry.json',
  '.jobs-registry',
  '.registry/.jobs-registry.json',
  'jobs-registry.json',
];

console.log('Looking for job registry files...\n');

for (const filePath of possiblePaths) {
  const fullPath = path.join(process.cwd(), filePath);
  const exists = fs.existsSync(fullPath);
  console.log(`${exists ? '✅' : '❌'} ${fullPath}`);

  if (exists) {
    try {
      const data = fs.readFileSync(fullPath, 'utf8');
      const jobs = JSON.parse(data);
      console.log('  Jobs found:', Object.keys(jobs).length);
      Object.entries(jobs).forEach(([jobId, job]) => {
        console.log(`    - ${jobId}: status=${job.status}, assigned=${job.assignedAgentId}`);
      });
    } catch (err) {
      console.error('  Error reading:', err.message);
    }
  }
}
