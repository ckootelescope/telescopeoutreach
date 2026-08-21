#!/usr/bin/env node
/**
 * Bulk-import sectors and companies into the market map.
 *
 * Usage:
 *   node scripts/market_import.js data.json [--apply]
 *
 * Input format (JSON):
 * {
 *   "sectors": [
 *     {
 *       "path": ["Construction", "Pre-Construction", "Takeoffs/Estimation"],
 *       "companies": [
 *         {
 *           "name": "Bobyard",
 *           "domain": "bobyard.com",
 *           "description": "AI takeoff estimation for HVAC",
 *           "latest_round": "Series A",
 *           "round_amount": "$12M",
 *           "notable_investors": "a]6z, Fifth Wall",
 *           "arr": "$3M",
 *           "arr_growth": "3x YoY",
 *           "headcount": 45,
 *           "note": "HVAC-focused"
 *         }
 *       ]
 *     }
 *   ]
 * }
 *
 * Each "path" array creates the full sector chain if it does not exist.
 * Companies are created and linked to the deepest sector in their path.
 * Existing sectors (matched by name + parent) are reused, not duplicated.
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

function loadEnv() {
  const env = {};
  fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf-8')
    .split(/\r?\n/)
    .forEach(l => {
      const i = l.indexOf('=');
      if (i > 0) env[l.slice(0, i).trim()] = l.slice(i + 1).trim();
    });
  return env;
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const file = args.find(a => !a.startsWith('-'));

  if (!file) {
    console.error('Usage: node scripts/market_import.js <file.json> [--apply]');
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
  const env = loadEnv();
  const client = new Client({
    connectionString: env.SUPABASE_DB_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  let sectorsCreated = 0;
  let companiesCreated = 0;
  let companiesSkipped = 0;

  for (const entry of data.sectors || []) {
    const sectorPath = entry.path || [];
    if (sectorPath.length === 0) continue;

    let parentId = null;
    for (let depth = 0; depth < sectorPath.length; depth++) {
      const name = sectorPath[depth];
      const q = parentId
        ? await client.query(
            'select id from market_sector where name = $1 and parent_id = $2',
            [name, parentId]
          )
        : await client.query(
            'select id from market_sector where name = $1 and parent_id is null',
            [name]
          );

      if (q.rows.length > 0) {
        parentId = q.rows[0].id;
        console.log(`  exists: ${sectorPath.slice(0, depth + 1).join(' > ')} (id ${parentId})`);
      } else {
        if (apply) {
          const sortQ = parentId
            ? await client.query(
                'select coalesce(max(sort_order), -1) + 1 as n from market_sector where parent_id = $1',
                [parentId]
              )
            : await client.query(
                'select coalesce(max(sort_order), -1) + 1 as n from market_sector where parent_id is null'
              );
          const sortOrder = sortQ.rows[0].n;
          const ins = await client.query(
            'insert into market_sector (name, parent_id, sort_order) values ($1, $2, $3) returning id',
            [name, parentId, sortOrder]
          );
          parentId = ins.rows[0].id;
        }
        sectorsCreated++;
        console.log(`  ${apply ? 'created' : 'would create'}: ${sectorPath.slice(0, depth + 1).join(' > ')}`);
      }
    }

    for (const co of entry.companies || []) {
      const existing = co.domain
        ? await client.query('select id from market_company where domain = $1', [co.domain])
        : { rows: [] };

      if (existing.rows.length > 0) {
        companiesSkipped++;
        console.log(`  skip (exists): ${co.name} (${co.domain})`);
        if (apply && parentId) {
          await client.query(
            'insert into market_company_sector (company_id, sector_id) values ($1, $2) on conflict do nothing',
            [existing.rows[0].id, parentId]
          );
        }
        continue;
      }

      if (apply && parentId) {
        const ins = await client.query(
          `insert into market_company (name, domain, description, latest_round, round_amount,
           notable_investors, arr, arr_growth, headcount, note)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id`,
          [
            co.name, co.domain || null, co.description || null,
            co.latest_round || null, co.round_amount || null,
            co.notable_investors || null, co.arr || null, co.arr_growth || null,
            co.headcount || null, co.note || null,
          ]
        );
        await client.query(
          'insert into market_company_sector (company_id, sector_id) values ($1, $2)',
          [ins.rows[0].id, parentId]
        );
      }
      companiesCreated++;
      console.log(`  ${apply ? 'created' : 'would create'}: ${co.name}${co.domain ? ` (${co.domain})` : ''}`);
    }
  }

  console.log(`\n${apply ? 'Done' : 'Dry run'}. Sectors: ${sectorsCreated}, Companies: ${companiesCreated}, Skipped: ${companiesSkipped}`);
  if (!apply && (sectorsCreated + companiesCreated) > 0) {
    console.log('Run with --apply to commit.');
  }

  await client.end();
}

main().catch(e => { console.error(e); process.exit(1); });
