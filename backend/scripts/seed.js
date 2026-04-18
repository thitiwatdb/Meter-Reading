#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const pool = require('../config/db');

async function runSQL(filePath) {
  const sql = fs.readFileSync(filePath, 'utf8');
  console.log(`[db:seed] Running ${path.basename(filePath)}...`);
  await pool.query(sql);
  console.log(`[db:seed] ✅ Done ${path.basename(filePath)}`);
}

async function main() {
  try {
    const root = path.resolve(__dirname, '..', '..');
    const dbDir = path.join(root, 'db');

    const args = process.argv.slice(2);
    const mode = args[0] || ''; 

    const schemaFile = path.join(dbDir, '001_schema.sql');
    const seedFile = path.join(dbDir, '002_seed.sql');

    const filesToRun =
      mode === 'reset'
        ? [schemaFile, seedFile]
        : [seedFile];         

    for (const filePath of filesToRun) {
      if (!fs.existsSync(filePath)) {
        console.warn(`[db:seed] ⚠️  File not found: ${path.basename(filePath)}`);
        continue;
      }
      try {
        await runSQL(filePath);
      } catch (err) {
        const msg = String(err?.message || err);
        if (/must be owner|permission denied/i.test(msg)) {
          console.error(`[db:seed] Skipping ${path.basename(filePath)}: insufficient privileges.`);
          continue;
        }
        if (path.basename(filePath) === '002_seed.sql' && /relation .* does not exist/i.test(msg)) {
          console.error(`[db:seed] ${path.basename(filePath)} failed because tables are missing. Try "npm run db:reset".`);
          continue;
        }
        throw err;
      }
    }

    console.log('\n[db:seed] 🎉 All done.');
    process.exit(0);
  } catch (err) {
    console.error('[db:seed] ❌ Failed:', err.message || err);
    process.exit(1);
  }
}

main();
