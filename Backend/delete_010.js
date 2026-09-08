const path = require('path');
const fs = require('fs');
const admin = require('firebase-admin');

const backendDir = 'd:/Eshu/placement Training/Training Practice App/Main App/Backend';
const files = fs.readdirSync(backendDir);
const matched = files.find(f => f.includes('firebase-adminsdk') && f.endsWith('.json'));
const creds = require(path.join(backendDir, matched || 'serviceAccountKey.json'));

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(creds) });
}

const db = admin.firestore();

async function deleteStudent010Now() {
  console.log('--- DELETING STUDENT010 FROM FIRESTORE ---');
  const candidateKeys = ['student010', '10', 'student10'];

  for (const key of candidateKeys) {
    try {
      await db.collection('students').doc(key).delete();
      console.log(`✓ Deleted students/${key}`);
    } catch (e) {}

    try {
      const sub = await db.collection('students').doc(key).collection('assessments').get();
      for (const d of sub.docs) {
        await d.ref.delete();
      }
    } catch (e) {}
  }

  // Check if any remain
  const q = await db.collection('students').where('username', '==', 'student010').get();
  for (const doc of q.docs) {
    await doc.ref.delete();
    console.log(`✓ Deleted student doc by username match: ${doc.id}`);
  }

  // Clean from Backend/data/students.json
  const sPath = path.join(backendDir, 'data', 'students.json');
  try {
    const local = JSON.parse(fs.readFileSync(sPath, 'utf-8'));
    candidateKeys.forEach(k => delete local[k]);
    fs.writeFileSync(sPath, JSON.stringify(local, null, 2), 'utf-8');
    console.log('✓ Cleaned students.json');
  } catch (e) {}

  console.log('=== STUDENT 010 PERMANENTLY REMOVED ===');
}

deleteStudent010Now().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
