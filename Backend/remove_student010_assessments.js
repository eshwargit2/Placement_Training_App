const path = require('path');
const fs = require('fs');
const admin = require('firebase-admin');

const backendDir = __dirname;
const files = fs.readdirSync(backendDir);
const matched = files.find(f => f.includes('firebase-adminsdk') && f.endsWith('.json'));
const credsPath = path.join(backendDir, matched || 'serviceAccountKey.json');

let db = null;
if (fs.existsSync(credsPath)) {
  const creds = require(credsPath);
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(creds) });
  }
  db = admin.firestore();
}

async function removeAllAssessmentsForStudent010() {
  console.log('=====================================================');
  console.log('🗑️  REMOVING ALL ASSESSMENTS FOR STUDENT010');
  console.log('=====================================================');

  const candidateKeys = ['student010', '10', 10, 'student10'];

  // 1. Clean from Firebase Firestore
  if (db) {
    try {
      console.log('Checking Firestore assessments collection...');
      const snap = await db.collection('assessments').get();
      let deleteCount = 0;
      const batch = db.batch();

      snap.forEach(doc => {
        const d = doc.data() || {};
        const u = String(d.username || '').toLowerCase().trim();
        const sId = String(d.studentId || '').toLowerCase().trim();
        const sName = String(d.studentName || '').toLowerCase().trim();

        if (u === 'student010' || u === 'student10' || sId === '10' || sId === 'student010' || sId === 'student10' || d.studentId === 10) {
          batch.delete(doc.ref);
          deleteCount++;
          console.log(`- Queued deletion for assessment doc ID: ${doc.id} (Day ${d.day}, Score: ${d.score}/${d.total})`);
        }
      });

      if (deleteCount > 0) {
        await batch.commit();
        console.log(`✓ Deleted ${deleteCount} assessments from Firestore assessments collection.`);
      } else {
        console.log('No matching assessments found in Firestore assessments collection.');
      }

      // Also clean student's subcollection
      for (const k of ['student010', '10', 'student10']) {
        try {
          const subSnap = await db.collection('students').doc(String(k)).collection('assessments').get();
          for (const sDoc of subSnap.docs) {
            await sDoc.ref.delete();
            console.log(`✓ Deleted student subcollection assessment: students/${k}/assessments/${sDoc.id}`);
          }
        } catch (subErr) {}
      }

      // Reset total attempts in student doc if exists
      for (const k of ['student010', '10', 'student10']) {
        try {
          const sRef = db.collection('students').doc(String(k));
          const sDoc = await sRef.get();
          if (sDoc.exists) {
            await sRef.update({
              attempts: [],
              attemptsCount: 0,
              scores: [],
              daysCompleted: [],
              updatedAt: new Date().toISOString(),
              updatedAtDisplay: new Date().toLocaleString()
            });
            console.log(`✓ Reset attempts in students/${k}`);
          }
        } catch (e) {}
      }

    } catch (fbErr) {
      console.error('Firestore removal error:', fbErr.message);
    }
  }

  // 2. Clean from local Backend/data/assessments.json
  const aPath = path.join(backendDir, 'data', 'assessments.json');
  if (fs.existsSync(aPath)) {
    try {
      const local = JSON.parse(fs.readFileSync(aPath, 'utf-8'));
      const beforeCount = local.length;
      const filtered = local.filter(a => {
        const u = String(a.username || '').toLowerCase().trim();
        const sId = String(a.studentId || '').toLowerCase().trim();
        return !(u === 'student010' || u === 'student10' || sId === '10' || sId === 'student010' || a.studentId === 10);
      });
      fs.writeFileSync(aPath, JSON.stringify(filtered, null, 2), 'utf-8');
      console.log(`✓ Cleaned local assessments.json: removed ${beforeCount - filtered.length} records. Remaining: ${filtered.length}`);
    } catch (e) {
      console.error('Error cleaning local assessments.json:', e.message);
    }
  }

  console.log('=====================================================');
  console.log('✅ ALL ASSESSMENTS FOR STUDENT010 SUCCESSFULLY PURGED');
  console.log('=====================================================');
}

removeAllAssessmentsForStudent010()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
