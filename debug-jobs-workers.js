#!/usr/bin/env node

/**
 * Debug script to check job and worker state
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const WORK_DIR = path.join(os.homedir(), '.cmd-executor-worker');
const JOBS_FILE = path.join(WORK_DIR, '..', 'cmd-executor-jobs.json');
const WORKERS_FILE = path.join(WORK_DIR, '..', 'cmd-executor-workers.json');

// Try /tmp paths as fallback
const TMP_JOBS = '/tmp/cmd-executor-jobs.json';
const TMP_WORKERS = '/tmp/cmd-executor-workers.json';

console.log('===== DIAGNOSTICS =====\n');

// Check jobs
console.log('📋 JOBS:');
for (const jobsPath of [JOBS_FILE, TMP_JOBS]) {
    if (fs.existsSync(jobsPath)) {
        try {
            const data = JSON.parse(fs.readFileSync(jobsPath, 'utf8'));
            console.log(`  Found: ${jobsPath}`);
            console.log(`  Total jobs: ${data.length || 0}`);

            if (data && data.length > 0) {
                const byStatus = {};
                data.forEach(job => {
                    byStatus[job.status] = (byStatus[job.status] || 0) + 1;
                });
                console.log(`  By status:`, byStatus);

                const recent = data.slice(-3);
                console.log(`  Last 3 jobs:`);
                recent.forEach(job => {
                    console.log(`    - ${job.jobId}: ${job.status} (assigned: ${job.assignedAgentId || 'none'})`);
                });
            }
        } catch (e) {
            console.log(`  Error reading ${jobsPath}: ${e.message}`);
        }
        break;
    }
}

console.log('\n🔧 WORKERS:');
for (const workersPath of [WORKERS_FILE, TMP_WORKERS]) {
    if (fs.existsSync(workersPath)) {
        try {
            const data = JSON.parse(fs.readFileSync(workersPath, 'utf8'));
            console.log(`  Found: ${workersPath}`);
            console.log(`  Total workers: ${data.length || 0}`);

            if (data && data.length > 0) {
                const byStatus = {};
                data.forEach(worker => {
                    byStatus[worker.status] = (byStatus[worker.status] || 0) + 1;
                });
                console.log(`  By status:`, byStatus);

                data.forEach(worker => {
                    console.log(`    - ${worker.workerId}:`);
                    console.log(`      Status: ${worker.status}`);
                    console.log(`      CPU: ${worker.cpuUsage || 0}% / ${worker.cpuCount}`);
                    console.log(`      RAM: ${worker.ramFreeMb}MB free / ${worker.ramTotalMb}MB total`);
                    console.log(`      Reserved: ${worker.reservedCpu} CPU, ${worker.reservedRamMb}MB RAM`);
                    console.log(`      Current jobs: ${worker.currentJobIds?.length || 0}`);
                    console.log(`      Last heartbeat: ${new Date(worker.lastHeartbeat || 0).toISOString()}`);
                });
            }
        } catch (e) {
            console.log(`  Error reading ${workersPath}: ${e.message}`);
        }
        break;
    }
}

console.log('\n' + '='.repeat(50));
