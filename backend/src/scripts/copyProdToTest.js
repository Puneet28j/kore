/**
 * copyProdToTest.js
 *
 * Copies ALL collections from the production MongoDB database to the test
 * MongoDB database. Production is NEVER written to — only read operations
 * (.find, .countDocuments, .indexes, .listCollections) are called on it.
 * The test database is fully overwritten (each collection is dropped then
 * repopulated from production data).
 *
 * Usage (run from backend/ directory):
 *   node src/scripts/copyProdToTest.js            ← live copy
 *   node src/scripts/copyProdToTest.js --dry-run  ← report sizes only, no writes
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });
const mongoose = require("mongoose");

// ── Configuration ─────────────────────────────────────────────────────────────
// URIs are hardcoded (not from .env) so there is no risk of accidentally
// pointing at the wrong cluster via an environment variable override.
const PROD_URI =
  "mongodb+srv://auraerpcw:auraerpcw@cluster0.2hbbrn6.mongodb.net/ttcartproduction?appName=Cluster0";
const TEST_URI =
  "mongodb+srv://kore:kore@cluster0.xegng8z.mongodb.net/?appName=Cluster0";

const BATCH_SIZE = 500;
const DRY_RUN = process.argv.includes("--dry-run");

// ── Logging helpers ───────────────────────────────────────────────────────────
const ts = () => new Date().toISOString();
const log = (msg) => console.log(`[${ts()}]  ${msg}`);
const warn = (msg) => console.warn(`[${ts()}] WARN  ${msg}`);
const err = (msg) => console.error(`[${ts()}] ERROR ${msg}`);

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  // 1. Connect to both clusters
  log("Connecting to PRODUCTION…");
  const prodConn = await mongoose.createConnection(PROD_URI).asPromise();
  log(`  Connected → ${prodConn.db.databaseName} @ ${prodConn.host}`);

  log("Connecting to TEST…");
  const testConn = await mongoose.createConnection(TEST_URI).asPromise();
  log(`  Connected → ${testConn.db.databaseName} @ ${testConn.host}`);

  log(
    DRY_RUN
      ? "Mode: DRY RUN — no data will be written to test."
      : "Mode: LIVE COPY — test collections will be dropped and repopulated."
  );
  log("─".repeat(72));

  const prodDb = prodConn.db;
  const testDb = testConn.db;

  // 2. Discover all collections from production
  const allCollections = await prodDb.listCollections().toArray();
  // Only process regular collections (skip views)
  const collections = allCollections.filter((c) => c.type === "collection");
  log(`Found ${collections.length} collection(s) in production.\n`);

  let totalDocs = 0;
  let totalErrors = 0;

  // 3. Process each collection
  for (const colMeta of collections) {
    const name = colMeta.name;
    const prodCol = prodDb.collection(name);
    const testCol = testDb.collection(name);

    try {
      const count = await prodCol.countDocuments();
      totalDocs += count;

      if (DRY_RUN) {
        log(`[DRY RUN] ${name}: ${count} document(s)`);
        continue;
      }

      log(`Copying "${name}" (${count} doc(s))…`);

      // Drop test collection; ignore if it doesn't exist yet
      try {
        await testCol.drop();
        log(`  Dropped existing "${name}" in test.`);
      } catch (dropErr) {
        if (dropErr.codeName !== "NamespaceNotFound") throw dropErr;
      }

      // Stream docs from prod in batches and insert into test
      const cursor = prodCol.find({});
      let batch = [];
      let inserted = 0;

      for await (const doc of cursor) {
        batch.push(doc);
        if (batch.length >= BATCH_SIZE) {
          await testCol.insertMany(batch, { ordered: false });
          inserted += batch.length;
          log(`  …${inserted}/${count} inserted`);
          batch = [];
        }
      }

      if (batch.length) {
        await testCol.insertMany(batch, { ordered: false });
        inserted += batch.length;
      }

      // Recreate production indexes on the test collection (skip _id)
      const prodIndexes = (await prodCol.indexes()).filter(
        (ix) => ix.name !== "_id_"
      );
      if (prodIndexes.length) {
        await testCol.createIndexes(prodIndexes);
        log(`  Recreated ${prodIndexes.length} index(es).`);
      }

      log(`  Done: ${inserted} doc(s) copied.\n`);
    } catch (colErr) {
      err(`Failed on collection "${name}": ${colErr.message}\n`);
      totalErrors++;
    }
  }

  // 4. Summary
  log("─".repeat(72));
  if (DRY_RUN) {
    log(
      `DRY RUN complete. ${collections.length} collection(s) | ${totalDocs} total doc(s).`
    );
  } else {
    log(
      `Copy complete. ${collections.length} collection(s) | ${totalDocs} total doc(s).`
    );
    if (totalErrors)
      warn(`${totalErrors} collection(s) had errors — check logs above.`);
  }

  // 5. Disconnect cleanly
  await prodConn.close();
  await testConn.close();
  log("Disconnected from both databases.");

  process.exit(totalErrors > 0 ? 1 : 0);
})().catch((fatalErr) => {
  err(`Fatal: ${fatalErr.message}`);
  process.exit(1);
});
