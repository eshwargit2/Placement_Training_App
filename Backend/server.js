const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS for all incoming frontend origins
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ==========================================================================
// FIREBASE DATABASE INITIALIZATION (VERCEL ENV & LOCAL FILE SUPPORT)
// ==========================================================================
let firebaseAdmin = null;
let firestoreDb = null;
let databaseMode = 'local_fallback';

function getFirebaseCredentials() {
  // Option 1: Direct JSON string in Vercel Environment Variables
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    try {
      const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON.trim();
      // Handle base64 encoded or raw string
      if (raw.startsWith('{')) {
        return JSON.parse(raw);
      } else {
        const decoded = Buffer.from(raw, 'base64').toString('utf-8');
        return JSON.parse(decoded);
      }
    } catch (e) {
      console.error('Error parsing FIREBASE_SERVICE_ACCOUNT_JSON env var:', e.message);
    }
  }

  // Option 2: Individual Environment Variables (Vercel standard)
  if (process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
    return {
      projectId: process.env.FIREBASE_PROJECT_ID || 'vmkvec-cse-training',
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
    };
  }

  // Option 3: Local JSON File on Disk (Local Development)
  if (process.env.FIREBASE_SERVICE_ACCOUNT && fs.existsSync(path.resolve(__dirname, process.env.FIREBASE_SERVICE_ACCOUNT))) {
    return require(path.resolve(__dirname, process.env.FIREBASE_SERVICE_ACCOUNT));
  }
  const files = fs.readdirSync(__dirname);
  const matched = files.find(f => f.includes('firebase-adminsdk') && f.endsWith('.json'));
  if (matched) return require(path.join(__dirname, matched));
  if (fs.existsSync(path.join(__dirname, 'serviceAccountKey.json'))) return require(path.join(__dirname, 'serviceAccountKey.json'));

  return null;
}

try {
  const credentials = getFirebaseCredentials();
  if (credentials) {
    const admin = require('firebase-admin');

    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(credentials),
        databaseURL: process.env.FIREBASE_DATABASE_URL
      });
    }

    firebaseAdmin = admin;
    firestoreDb = admin.firestore();
    databaseMode = 'firebase_firestore';
    console.log('✅ Firebase Admin SDK connected successfully to Firestore.');
  } else {
    console.log('ℹ️ No Firebase credentials found. Running in local fallback store mode.');
  }
} catch (err) {
  console.warn('⚠️ Firebase Admin initialization error, using local database store:', err.message);
}

// Local Storage Helper
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'assessments.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify([], null, 2), 'utf-8');
}

function getLocalAssessments() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    return JSON.parse(raw || '[]');
  } catch (e) {
    return [];
  }
}

function saveLocalAssessments(arr) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(arr, null, 2), 'utf-8');
}

// ==========================================================================
// API ROUTES
// ==========================================================================

// 1. Health Check
app.get('/api/health', (req, res) => {
  const localCount = getLocalAssessments().length;
  res.json({
    status: 'online',
    timestamp: new Date().toISOString(),
    databaseMode,
    storedAssessmentsCount: localCount
  });
});

// 2. Submit Assessment (Called by Student upon completing assessment)
app.post('/api/assessments', async (req, res) => {
  try {
    const payload = req.body;

    if (!payload || !payload.day || !payload.studentId) {
      return res.status(400).json({ success: false, error: 'Missing required assessment submission fields (day, studentId).' });
    }

    const assessmentRecord = {
      id: payload.id || 'ASM_' + Date.now(),
      studentId: payload.studentId,
      studentName: payload.studentName || 'Unknown Student',
      username: payload.username || '',
      department: payload.department || 'CSE',
      year: payload.year || '4th Year',
      rollNumber: payload.rollNumber || '',
      day: Number(payload.day),
      topic: payload.topic || '',
      attemptNumber: Number(payload.attemptNumber || 1),
      score: Number(payload.score || 0),
      total: Number(payload.total || 5),
      percentage: Number(payload.percentage || 0),
      completed: true,
      timedOut: !!payload.timedOut,
      completedAt: payload.completedAt || new Date().toISOString(),
      completedAtDisplay: payload.completedAtDisplay || new Date().toLocaleString(),
      completionSeconds: Number(payload.completionSeconds || 0),
      strongAreas: payload.strongAreas || [],
      weakAreas: payload.weakAreas || [],
      // Full MCQ Question Breakdown
      mcqDetails: payload.mcqDetails || [],
      // Full 3 Coding Challenges Details
      program1: payload.program1 || '',
      program2: payload.program2 || '',
      program3: payload.program3 || '',
      program1Prompt: payload.program1Prompt || '',
      program2Prompt: payload.program2Prompt || '',
      program3Prompt: payload.program3Prompt || '',
      receivedAt: new Date().toISOString()
    };

    // Store in Firebase Firestore if configured
    if (firestoreDb) {
      try {
        const studentDocId = String(assessmentRecord.studentId || assessmentRecord.username || assessmentRecord.rollNumber || 'student');
        
        // 1. Save in global 'assessments' collection
        await firestoreDb.collection('assessments').doc(assessmentRecord.id).set(assessmentRecord);

        // 2. Save in student-specific subcollection: students/{studentDocId}/assessments/{assessmentId}
        await firestoreDb.collection('students').doc(studentDocId)
          .collection('assessments').doc(assessmentRecord.id).set(assessmentRecord);

        // 3. Update student parent summary document
        await firestoreDb.collection('students').doc(studentDocId).set({
          studentId: assessmentRecord.studentId,
          name: assessmentRecord.studentName,
          username: assessmentRecord.username,
          department: assessmentRecord.department,
          year: assessmentRecord.year,
          rollNumber: assessmentRecord.rollNumber,
          lastActive: assessmentRecord.completedAt,
          lastActiveDisplay: assessmentRecord.completedAtDisplay,
          lastAssessmentDay: assessmentRecord.day,
          lastScore: assessmentRecord.percentage
        }, { merge: true });

        console.log(`[Firebase Firestore] Stored assessment ${assessmentRecord.id} under student ${studentDocId} and global collection.`);
      } catch (fbErr) {
        console.error('Firebase save error, falling back to local file:', fbErr.message);
      }
    }

    // Always keep local copy synchronized
    const local = getLocalAssessments();
    const existingIdx = local.findIndex(a => a.id === assessmentRecord.id);
    if (existingIdx >= 0) {
      local[existingIdx] = assessmentRecord;
    } else {
      local.unshift(assessmentRecord);
    }
    saveLocalAssessments(local);

    console.log(`[API] Assessment received: Day ${assessmentRecord.day} by ${assessmentRecord.studentName} (${assessmentRecord.rollNumber}) - Score: ${assessmentRecord.percentage}%`);

    return res.status(201).json({
      success: true,
      id: assessmentRecord.id,
      databaseMode,
      message: 'Assessment submission successfully recorded and stored in database.'
    });
  } catch (error) {
    console.error('Error submitting assessment:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// 3. Admin API - Get All Assessments (with optional query filters)
app.get('/api/admin/assessments', async (req, res) => {
  try {
    const { day, studentId, dept, search } = req.query;
    let list = [];

    // Attempt Firebase Fetch
    if (firestoreDb) {
      try {
        const snapshot = await firestoreDb.collection('assessments').orderBy('completedAt', 'desc').get();
        snapshot.forEach(doc => list.push(doc.data()));
      } catch (fbErr) {
        console.warn('Firebase query failed, using local database:', fbErr.message);
        list = getLocalAssessments();
      }
    } else {
      list = getLocalAssessments();
    }

    // Apply filtering
    if (day && day !== 'all') {
      list = list.filter(a => String(a.day) === String(day));
    }
    if (studentId) {
      list = list.filter(a => String(a.studentId) === String(studentId));
    }
    if (dept && dept !== 'all') {
      list = list.filter(a => (a.department || '').toLowerCase() === dept.toLowerCase());
    }
    if (search) {
      const q = search.toLowerCase().trim();
      list = list.filter(a =>
        (a.studentName || '').toLowerCase().includes(q) ||
        (a.rollNumber || '').toLowerCase().includes(q) ||
        (a.topic || '').toLowerCase().includes(q) ||
        (a.username || '').toLowerCase().includes(q) ||
        `day ${a.day}`.toLowerCase().includes(q)
      );
    }

    return res.json({
      success: true,
      count: list.length,
      databaseMode,
      assessments: list
    });
  } catch (error) {
    console.error('Error fetching admin assessments:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// 4. Admin API - Get Summary by Students
app.get('/api/admin/students', async (req, res) => {
  try {
    const list = getLocalAssessments();
    const studentMap = {};

    list.forEach(a => {
      const sId = a.studentId || a.username || 'unknown';
      if (!studentMap[sId]) {
        studentMap[sId] = {
          studentId: a.studentId,
          name: a.studentName,
          username: a.username,
          department: a.department,
          year: a.year,
          rollNumber: a.rollNumber,
          attemptsCount: 0,
          daysCompleted: new Set(),
          scores: [],
          latestAttemptAt: a.completedAtDisplay || a.completedAt
        };
      }
      studentMap[sId].attemptsCount++;
      studentMap[sId].daysCompleted.add(a.day);
      studentMap[sId].scores.push(Number(a.percentage || 0));
    });

    const students = Object.values(studentMap).map(s => {
      const avgScore = s.scores.length ? Math.round(s.scores.reduce((a, b) => a + b, 0) / s.scores.length) : 0;
      return {
        studentId: s.studentId,
        name: s.name,
        username: s.username,
        department: s.department,
        year: s.year,
        rollNumber: s.rollNumber,
        totalAttempts: s.attemptsCount,
        uniqueDaysCompleted: s.daysCompleted.size,
        averageScore: avgScore,
        latestActivity: s.latestAttemptAt
      };
    });

    return res.json({
      success: true,
      totalStudents: students.length,
      students
    });
  } catch (error) {
    console.error('Error fetching students summary:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// 5. Admin API - Get All Assessments For a Specific Student
app.get('/api/admin/student/:studentId/assessments', async (req, res) => {
  try {
    const { studentId } = req.params;
    let studentAssessments = [];

    if (firestoreDb) {
      try {
        const snapshot = await firestoreDb.collection('students').doc(String(studentId))
          .collection('assessments').orderBy('completedAt', 'desc').get();
        snapshot.forEach(doc => studentAssessments.push(doc.data()));
      } catch (fbErr) {
        console.warn('Firebase student subcollection query error:', fbErr.message);
      }
    }

    if (!studentAssessments.length) {
      const list = getLocalAssessments();
      studentAssessments = list.filter(a => String(a.studentId) === String(studentId) || String(a.username) === String(studentId));
    }

    return res.json({
      success: true,
      studentId,
      count: studentAssessments.length,
      assessments: studentAssessments
    });
  } catch (error) {
    console.error('Error fetching student assessments:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// 6. Admin API - Get Single Assessment Full Details (MCQs + 3 Programs)
app.get('/api/admin/assessment/:id', async (req, res) => {
  try {
    const { id } = req.params;
    let record = null;

    if (firestoreDb) {
      try {
        const doc = await firestoreDb.collection('assessments').doc(id).get();
        if (doc.exists) {
          record = doc.data();
        }
      } catch (e) {}
    }

    if (!record) {
      const list = getLocalAssessments();
      record = list.find(a => String(a.id) === String(id));
    }

    if (!record) {
      return res.status(404).json({ success: false, error: 'Assessment submission not found.' });
    }

    return res.json({ success: true, assessment: record });
  } catch (error) {
    console.error('Error fetching single assessment details:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// 6. Admin API - Delete an Assessment Record
app.delete('/api/admin/assessment/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (firestoreDb) {
      try {
        await firestoreDb.collection('assessments').doc(id).delete();
      } catch (e) {}
    }

    let list = getLocalAssessments();
    list = list.filter(a => String(a.id) !== String(id));
    saveLocalAssessments(list);

    return res.json({ success: true, message: `Assessment ${id} deleted.` });
  } catch (error) {
    console.error('Error deleting assessment:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Start Server (when run directly)
if (require.main === module) {
  app.listen(PORT, () => {
    console.log('====================================================');
    console.log(`🚀 Placement Training Backend running on port ${PORT}`);
    console.log(`📡 API Endpoints:`);
    console.log(`   - POST http://localhost:${PORT}/api/assessments`);
    console.log(`   - GET  http://localhost:${PORT}/api/admin/assessments`);
    console.log(`   - GET  http://localhost:${PORT}/api/admin/students`);
    console.log(`   - GET  http://localhost:${PORT}/api/health`);
    console.log('====================================================');
  });
}

module.exports = app;
