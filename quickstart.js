#!/usr/bin/env node

/**
 * Quick Start Script for Phase 2 Testing
 * 
 * This script demonstrates how to use the distributed command executor.
 * 
 * Usage:
 *   node quickstart.js [--test-zip] [--server http://localhost:3000]
 */

import https from "https";
import http from "http";
import { execSync } from "child_process";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

const args = process.argv.slice(2);
const serverIndex = args.indexOf("--server");
const SERVER = serverIndex !== -1 ? args[serverIndex + 1] : "http://localhost:3000";
const CREATE_TEST_ZIP = args.includes("--test-zip");

console.log("\n🚀 CMD Executor - Phase 2 Quick Start\n");
console.log(`📡 Server: ${SERVER}\n`);

// ============================================================================
// Utilities
// ============================================================================

const httpRequest = (method, url, data) => {
    return new Promise((resolve, reject) => {
        const isHttps = url.startsWith("https");
        const client = isHttps ? https : http;
        const urlObj = new URL(url);

        const options = {
            method,
            hostname: urlObj.hostname,
            port: urlObj.port || (isHttps ? 443 : 80),
            path: urlObj.pathname + urlObj.search,
            headers: {
                "Content-Type": "application/json",
            },
        };

        let body = "";

        const req = client.request(options, (res) => {
            res.on("data", (chunk) => {
                body += chunk;
            });

            res.on("end", () => {
                try {
                    resolve({
                        statusCode: res.statusCode,
                        body: body ? JSON.parse(body) : null,
                    });
                } catch {
                    resolve({
                        statusCode: res.statusCode,
                        body: null,
                        raw: body,
                    });
                }
            });
        });

        req.on("error", reject);

        if (data) {
            req.write(JSON.stringify(data));
        }

        req.end();
    });
};

// ============================================================================
// Main
// ============================================================================

const main = async () => {
    try {
        // Step 1: Create test ZIP if requested
        let testZipPath = null;
        if (CREATE_TEST_ZIP) {
            console.log("📦 Creating test ZIP file...");

            // Create a simple test project
            const testDir = "/tmp/test-project-demo";
            execSync(`mkdir -p ${testDir}`, { shell: true });

            // Create package.json
            writeFileSync(
                join(testDir, "package.json"),
                JSON.stringify(
                    {
                        name: "test-project",
                        version: "1.0.0",
                        scripts: {
                            test: "echo 'Running tests...' && exit 0",
                        },
                    },
                    null,
                    2
                )
            );

            // Create a test script
            writeFileSync(
                join(testDir, "test.sh"),
                `#!/bin/bash
echo "=== Test Results ==="
echo "Current directory: $(pwd)"
echo "Files:"
ls -la
echo ""
echo "System info:"
echo "OS: $(uname -s)"
echo "Cores: $(nproc 2>/dev/null || sysctl -n hw.ncpu)"
echo ""
echo "✓ Test completed successfully!"
`
            );

            // Create ZIP
            execSync(`cd ${testDir} && zip -r ../test-project.zip .`, {
                shell: true,
            });

            testZipPath = "/tmp/test-project.zip";
            console.log("✓ Test ZIP created at: " + testZipPath + "\n");
        }

        // Step 2: List existing workers
        console.log("👥 Fetching registered workers...");
        const workersRes = await httpRequest("GET", `${SERVER}/api/workers/register`);

        if (workersRes.statusCode === 200) {
            const workers = workersRes.body.workers || [];
            console.log(`✓ Found ${workers.length} worker(s):\n`);

            workers.forEach((w) => {
                console.log(`  • ${w.workerId}`);
                console.log(`    Host: ${w.hostname} | OS: ${w.os} | CPU: ${w.cpuCount}`);
                console.log(`    Status: ${w.status} | Last heartbeat: ${new Date(w.lastHeartbeat).toISOString()}`);
            });
            console.log("");
        } else {
            console.log("⚠ Could not fetch workers\n");
        }

        // Step 3: List existing jobs
        console.log("📋 Fetching job history...");
        const jobsRes = await httpRequest("GET", `${SERVER}/api/jobs/create`);

        if (jobsRes.statusCode === 200) {
            const jobs = jobsRes.body.jobs || [];
            console.log(`✓ Found ${jobs.length} job(s)\n`);

            jobs.slice(0, 5).forEach((j) => {
                console.log(`  • ${j.jobId}`);
                console.log(`    Status: ${j.status} | Worker: ${j.workerId || "unassigned"}`);
                console.log(`    Created: ${new Date(j.createdAt).toISOString()}`);
            });

            if (jobs.length > 5) {
                console.log(`  ... and ${jobs.length - 5} more`);
            }
            console.log("");
        }

        // Step 4: Create a test job
        console.log("📝 Creating a test job...");

        const jobData = {
            command: CREATE_TEST_ZIP
                ? "npm test"
                : "echo 'Hello from worker!' && echo 'Current directory:' && pwd",
            fileUrl: "/uploads/test-project.zip",
            filename: "test-project.zip",
        };

        const createRes = await httpRequest(
            "POST",
            `${SERVER}/api/jobs/create`,
            jobData
        );

        if (createRes.statusCode !== 200) {
            console.log("❌ Failed to create job");
            console.log(createRes.body);
            return;
        }

        const jobId = createRes.body.jobId;
        console.log(`✓ Job created: ${jobId}\n`);

        // Step 5: Poll for job status
        console.log("⏳ Waiting for job completion (max 30 seconds)...\n");

        let completed = false;
        let attempts = 0;
        const maxAttempts = 60;

        while (!completed && attempts < maxAttempts) {
            await new Promise((resolve) => setTimeout(resolve, 500));

            const statusRes = await httpRequest(
                "GET",
                `${SERVER}/api/jobs/status?jobId=${jobId}`
            );

            if (statusRes.statusCode === 200) {
                const job = statusRes.body;

                if (job.status === "completed" || job.status === "failed") {
                    completed = true;

                    console.log(`\n✓ Job ${job.status.toUpperCase()}\n`);
                    console.log("Job Details:");
                    console.log(`  ID: ${job.jobId}`);
                    console.log(`  Status: ${job.status}`);
                    console.log(`  Worker: ${job.workerId}`);
                    console.log(`  Exit Code: ${job.exitCode}`);

                    if (job.stdout) {
                        console.log(`\n📤 STDOUT:\n${job.stdout}`);
                    }

                    if (job.stderr) {
                        console.log(`\n❌ STDERR:\n${job.stderr}`);
                    }

                    if (job.errorMessage) {
                        console.log(`\n⚠ Error: ${job.errorMessage}`);
                    }

                    const duration =
                        (job.completedAt - job.startedAt) / 1000;
                    console.log(`\n⏱ Execution time: ${duration.toFixed(2)}s`);
                } else {
                    process.stdout.write(`  [${new Date().toLocaleTimeString()}] Status: ${job.status} (${job.workerId || "pending"})\r`);
                    attempts++;
                }
            }
        }

        if (!completed) {
            console.log("\n⚠ Job did not complete within 30 seconds");
            console.log(`Check status later: ${SERVER}/api/jobs/status?jobId=${jobId}`);
        }

        console.log("\n✨ Quick start demo complete!\n");
        console.log("Next steps:");
        console.log("  1. Start a worker: node worker-agent.js --server " + SERVER);
        console.log("  2. Open web UI: " + SERVER);
        console.log("  3. Upload a ZIP file and run commands\n");
    } catch (error) {
        console.error("❌ Error:", error.message);
        process.exit(1);
    }
};

main();
