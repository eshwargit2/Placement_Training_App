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

const os = require('os');

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
      let raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON.trim();
      // Remove wrapping single or double quotes if present
      if ((raw.startsWith("'") && raw.endsWith("'")) || (raw.startsWith('"') && raw.endsWith('"'))) {
        raw = raw.slice(1, -1).trim();
      }
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
  try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT && fs.existsSync(path.resolve(__dirname, process.env.FIREBASE_SERVICE_ACCOUNT))) {
      return require(path.resolve(__dirname, process.env.FIREBASE_SERVICE_ACCOUNT));
    }
    const files = fs.readdirSync(__dirname);
    const matched = files.find(f => f.includes('firebase-adminsdk') && f.endsWith('.json'));
    if (matched) return require(path.join(__dirname, matched));
    if (fs.existsSync(path.join(__dirname, 'serviceAccountKey.json'))) return require(path.join(__dirname, 'serviceAccountKey.json'));
  } catch (err) {
    // Ignore read directory errors in read-only serverless environments
  }

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

// Local Storage Helper (Using os.tmpdir() for Serverless Environments)
const isServerless = !!process.env.VERCEL;
const DATA_DIR = isServerless ? os.tmpdir() : path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'assessments.json');
const STUDENTS_FILE = path.join(DATA_DIR, 'students.json');

try {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify([], null, 2), 'utf-8');
  }
  if (!fs.existsSync(STUDENTS_FILE)) {
    fs.writeFileSync(STUDENTS_FILE, JSON.stringify({}, null, 2), 'utf-8');
  }
} catch (e) {
  console.warn('Storage directory initialization notice:', e.message);
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
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(arr, null, 2), 'utf-8');
  } catch (e) {
    console.warn('Local save notice:', e.message);
  }
}

function getLocalStudents() {
  try {
    const raw = fs.readFileSync(STUDENTS_FILE, 'utf-8');
    return JSON.parse(raw || '{}');
  } catch (e) {
    return {};
  }
}

function saveLocalStudents(map) {
  try {
    fs.writeFileSync(STUDENTS_FILE, JSON.stringify(map, null, 2), 'utf-8');
  } catch (e) {
    console.warn('Local student save notice:', e.message);
  }
}

// Normalize student ID helper (e.g., student010 -> 10, "10" -> 10, 10 -> 10)
function parseStudentNumericId(u) {
  if (u === null || u === undefined) return null;
  const str = String(u).trim();
  const match = str.match(/^student(\d+)$/i);
  if (match) return parseInt(match[1], 10);
  if (/^\d+$/.test(str)) return parseInt(str, 10);
  return str;
}

// Helper to return all possible key variations for a student (e.g. 'student010', '10', 'student10')
function getStudentCandidateKeys(rawId) {
  const keys = new Set();
  if (rawId === null || rawId === undefined) return [];
  const s = String(rawId).trim().toLowerCase();
  if (s) keys.add(s);
  const num = parseStudentNumericId(rawId);
  if (typeof num === 'number' && !isNaN(num)) {
    keys.add(String(num));
    keys.add(`student${String(num).padStart(3, '0')}`);
    keys.add(`student${num}`);
  }
  return Array.from(keys);
}

// ==========================================================================
// API ROUTES
// ==========================================================================

// Root Route
app.get('/', (req, res) => {
  res.json({
    message: 'VMKVEC Placement Training Backend API is running.',
    status: 'online',
    databaseMode,
    endpoints: [
      '/api/health',
      '/api/auth/login',
      '/api/student/profile',
      '/api/student/:id/dashboard',
      '/api/assessments',
      '/api/admin/assessments',
      '/api/admin/students'
    ]
  });
});

// 1. Health Check
app.get('/api/health', (req, res) => {
  const localCount = getLocalAssessments().length;
  const localStudentCount = Object.keys(getLocalStudents()).length;
  res.json({
    status: 'online',
    timestamp: new Date().toISOString(),
    databaseMode,
    storedAssessmentsCount: localCount,
    storedStudentsCount: localStudentCount
  });
});

// ==========================================================================
// AUTHENTICATION & STUDENT PROFILE ENDPOINTS (FIREBASE FIRESTORE PERSISTENT)
// ==========================================================================

// 1.1 Server Login Validation
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password, role } = req.body || {};
    const u = String(username || '').trim();
    const p = String(password || '').trim();
    const r = String(role || 'student').toLowerCase();

    if (!u || !p) {
      return res.status(400).json({ success: false, error: 'Username and password are required.' });
    }

    // Admin Login Verification
    if (r === 'admin' || r === 'trainer') {
      const uLower = u.toLowerCase();
      if ((uLower === 'admin' || uLower === 'trainer') &&
          (p === 'Trainer@Admin555' || p === 'Admin@555' || p === 'admin123')) {
        return res.json({
          success: true,
          role: 'admin',
          user: { name: 'System Admin', id: 'ADMIN', username: uLower }
        });
      }
      return res.status(401).json({ success: false, error: 'Invalid admin credentials.' });
    }

    // Student Login Verification
    const uLower = u.toLowerCase();
    const numericId = parseStudentNumericId(uLower);
    const candidateKeys = getStudentCandidateKeys(uLower);

    let studentData = null;

    // 1. Query Firebase Firestore if connected across candidate keys
    if (firestoreDb) {
      try {
        for (const key of candidateKeys) {
          const studentDocRef = firestoreDb.collection('students').doc(key);
          const docSnap = await studentDocRef.get();

          if (docSnap.exists) {
            const d = docSnap.data();
            if (!studentData) {
              studentData = d;
            } else {
              // Merge with richer profile if available
              studentData = Object.assign({}, studentData, d);
            }
          }
        }

        if (!studentData) {
          const querySnap = await firestoreDb.collection('students')
            .where('username', 'in', candidateKeys.slice(0, 10)).limit(1).get();
          if (!querySnap.empty) {
            studentData = querySnap.docs[0].data();
          }
        }
      } catch (fbErr) {
        console.warn('Firebase login query error:', fbErr.message);
      }
    }

    // 2. Fallback to local students store if not in Firestore
    if (!studentData) {
      const localStudents = getLocalStudents();
      for (const key of candidateKeys) {
        if (localStudents[key]) {
          studentData = localStudents[key];
          break;
        }
      }
    }

    // 3. Handle Existing Student Account
    if (studentData) {
      const expectedPassword = studentData.password || uLower;
      if (p !== expectedPassword && p !== 'student123' && p !== uLower) {
        return res.status(401).json({ success: false, error: 'Invalid password. Please try again.' });
      }

      const isCompleted = (studentData.profileCompleted !== undefined) ? !!studentData.profileCompleted : (!!studentData.name && !!studentData.rollNumber);

      return res.json({
        success: true,
        role: 'student',
        databaseMode,
        user: {
          id: studentData.id || numericId,
          username: studentData.username || uLower,
          name: studentData.name || '',
          department: studentData.department || 'Computer Science and Engineering (CSE)',
          year: studentData.year || '4th Year',
          rollNumber: studentData.rollNumber || '',
          reg: studentData.reg || `REG${String(numericId).padStart(3, '0')}`,
          batch: studentData.batch || 'BATCH-A',
          profileCompleted: isCompleted,
          lastActive: studentData.lastActive || null
        }
      });
    }

    // 4. Handle Standard Student ID (e.g. student001 to student100) on First-Time Login
    const isStandardPattern = /^student\d{1,3}$/i.test(uLower);
    if (isStandardPattern) {
      if (p !== uLower && p !== 'student123') {
        return res.status(401).json({ success: false, error: 'Invalid password. For default student accounts, password matches username.' });
      }

      const initialProfile = {
        id: numericId,
        username: uLower,
        password: uLower,
        name: '',
        department: 'Computer Science and Engineering (CSE)',
        year: '3rd Year',
        rollNumber: '',
        reg: `REG${String(numericId).padStart(3, '0')}`,
        batch: 'BATCH-A',
        profileCompleted: false,
        createdAt: new Date().toISOString()
      };

      // Save initial profile in Firestore
      if (firestoreDb) {
        try {
          await firestoreDb.collection('students').doc(uLower).set(initialProfile, { merge: true });
          console.log(`[Firebase Firestore] Created initial student record for ${uLower}`);
        } catch (fbErr) {
          console.error('Firestore student creation error:', fbErr.message);
        }
      }

      // Save in local fallback
      const localStudents = getLocalStudents();
      localStudents[uLower] = initialProfile;
      saveLocalStudents(localStudents);

      return res.json({
        success: true,
        role: 'student',
        databaseMode,
        user: {
          id: initialProfile.id,
          username: initialProfile.username,
          name: initialProfile.name,
          department: initialProfile.department,
          year: initialProfile.year,
          rollNumber: initialProfile.rollNumber,
          reg: initialProfile.reg,
          batch: initialProfile.batch,
          profileCompleted: false
        }
      });
    }

    return res.status(401).json({ success: false, error: 'Student username not found in database.' });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// 1.2 Save / Update Student Profile in Firebase Firestore
app.post('/api/student/profile', async (req, res) => {
  try {
    const payload = req.body || {};
    const username = String(payload.username || payload.studentId || '').trim().toLowerCase();

    if (!username) {
      return res.status(400).json({ success: false, error: 'Missing student identifier (username/studentId).' });
    }

    const numericId = parseStudentNumericId(username) || payload.id;

    const profileData = {
      id: numericId,
      username,
      name: String(payload.name || '').trim(),
      department: String(payload.department || 'Computer Science and Engineering (CSE)').trim(),
      year: String(payload.year || '3rd Year').trim(),
      rollNumber: String(payload.rollNumber || '').trim(),
      reg: payload.reg || `REG${String(numericId).padStart(3, '0')}`,
      batch: payload.batch || 'BATCH-A',
      profileCompleted: true,
      updatedAt: new Date().toISOString(),
      updatedAtDisplay: new Date().toLocaleString()
    };

    if (payload.password) {
      profileData.password = String(payload.password).trim();
    }

    // 1. Save to Firebase Firestore
    if (firestoreDb) {
      try {
        await firestoreDb.collection('students').doc(username).set(profileData, { merge: true });
        console.log(`[Firebase Firestore] Student profile saved successfully for ${username}`);
      } catch (fbErr) {
        console.error('Firestore save student profile error:', fbErr.message);
      }
    }

    // 2. Save to local fallback
    const localStudents = getLocalStudents();
    localStudents[username] = Object.assign(localStudents[username] || {}, profileData);
    saveLocalStudents(localStudents);

    return res.json({
      success: true,
      databaseMode,
      message: 'Student profile saved successfully in database.',
      user: profileData
    });
  } catch (error) {
    console.error('Error saving student profile:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// 1.3 Fetch Student Profile by ID / Username
app.get('/api/student/profile/:studentId', async (req, res) => {
  try {
    const sId = String(req.params.studentId || '').trim().toLowerCase();
    let studentData = null;

    if (firestoreDb) {
      try {
        const docRef = firestoreDb.collection('students').doc(sId);
        const docSnap = await docRef.get();
        if (docSnap.exists) {
          studentData = docSnap.data();
        } else {
          const querySnap = await firestoreDb.collection('students')
            .where('username', '==', sId).limit(1).get();
          if (!querySnap.empty) {
            studentData = querySnap.docs[0].data();
          }
        }
      } catch (e) {}
    }

    if (!studentData) {
      const localStudents = getLocalStudents();
      studentData = localStudents[sId] || null;
    }

    if (!studentData) {
      return res.status(404).json({ success: false, error: 'Student profile not found.' });
    }

    return res.json({
      success: true,
      databaseMode,
      student: studentData
    });
  } catch (error) {
    console.error('Error fetching student profile:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// 1.4 Fetch Complete Dashboard Data (Profile + Assessments) for Student
app.get('/api/student/:studentId/dashboard', async (req, res) => {
  try {
    const rawId = String(req.params.studentId || '').trim().toLowerCase();
    const candidateKeys = getStudentCandidateKeys(rawId);
    const numericId = parseStudentNumericId(rawId);
    let studentData = null;
    let attemptsMap = new Map();

    // 1. Fetch Student Profile & Subcollection Assessments from Firestore
    if (firestoreDb) {
      try {
        // Merge profile info across all candidate keys
        for (const key of candidateKeys) {
          const docSnap = await firestoreDb.collection('students').doc(key).get();
          if (docSnap.exists) {
            const d = docSnap.data();
            studentData = Object.assign({}, studentData || {}, d);
          }
        }

        // Check by query if profile not found by doc id
        if (!studentData) {
          const qSnap = await firestoreDb.collection('students')
            .where('username', 'in', candidateKeys.slice(0, 10)).limit(1).get();
          if (!qSnap.empty) {
            studentData = qSnap.docs[0].data();
          }
        }

        // Fetch subcollection assessments for all candidate keys
        for (const key of candidateKeys) {
          try {
            const subSnap = await firestoreDb.collection('students').doc(key)
              .collection('assessments').get();
            subSnap.forEach(d => {
              const data = d.data();
              if (data && (data.id || d.id)) attemptsMap.set(String(data.id || d.id), data);
            });
          } catch (subErr) {}
        }

        // Also query global assessments collection for any matching record
        const sRoll = String((studentData && studentData.rollNumber) || '').trim();
        const globalDocs = await firestoreDb.collection('assessments').get();
        globalDocs.forEach(d => {
          const a = d.data();
          if (!a) return;
          const aNum = parseStudentNumericId(a.studentId || a.username);
          const aSId = String(a.studentId || '').toLowerCase();
          const aUName = String(a.username || '').toLowerCase();
          const aRoll = String(a.rollNumber || '').trim();
          if (
            (typeof numericId === 'number' && typeof aNum === 'number' && numericId === aNum) ||
            candidateKeys.includes(aSId) ||
            candidateKeys.includes(aUName) ||
            (sRoll && aRoll && sRoll === aRoll)
          ) {
            attemptsMap.set(String(a.id || d.id), a);
          }
        });
      } catch (fbErr) {
        console.warn('Firestore dashboard query error:', fbErr.message);
      }
    }

    // 2. Fallback to Local Storage for Profile
    if (!studentData) {
      const localStudents = getLocalStudents();
      for (const key of candidateKeys) {
        if (localStudents[key]) {
          studentData = localStudents[key];
          break;
        }
      }
    }

    // 3. Merge with Local Assessments
    const sRollLocal = String((studentData && studentData.rollNumber) || '').trim();
    const localAssessments = getLocalAssessments();
    localAssessments.forEach(a => {
      if (!a) return;
      const aNum = parseStudentNumericId(a.studentId || a.username);
      const aSId = String(a.studentId || '').toLowerCase();
      const aUName = String(a.username || '').toLowerCase();
      const aRoll = String(a.rollNumber || '').trim();
      if (
        (typeof numericId === 'number' && typeof aNum === 'number' && numericId === aNum) ||
        candidateKeys.includes(aSId) ||
        candidateKeys.includes(aUName) ||
        (sRollLocal && aRoll && sRollLocal === aRoll)
      ) {
        if (!attemptsMap.has(String(a.id))) {
          attemptsMap.set(String(a.id), a);
        }
      }
    });

    const attempts = Array.from(attemptsMap.values());
    attempts.sort((a, b) => new Date(b.completedAt || 0) - new Date(a.completedAt || 0));

    return res.json({
      success: true,
      databaseMode,
      student: studentData,
      attempts: attempts
    });
  } catch (error) {
    console.error('Error loading student dashboard data:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// 1.5 Get All / Filtered Assessments API
app.get('/api/assessments', async (req, res) => {
  try {
    const { studentId, username, day } = req.query;
    let list = [];

    if (firestoreDb) {
      try {
        const snapshot = await firestoreDb.collection('assessments').orderBy('completedAt', 'desc').get();
        snapshot.forEach(doc => list.push(doc.data()));
      } catch (fbErr) {
        list = getLocalAssessments();
      }
    } else {
      list = getLocalAssessments();
    }

    if (studentId || username) {
      const targetId = studentId || username;
      const candidateKeys = getStudentCandidateKeys(targetId);
      const targetNum = parseStudentNumericId(targetId);
      list = list.filter(a => {
        const aNum = parseStudentNumericId(a.studentId || a.username);
        const aSId = String(a.studentId || '').toLowerCase();
        const aUName = String(a.username || '').toLowerCase();
        return (
          (typeof targetNum === 'number' && typeof aNum === 'number' && targetNum === aNum) ||
          candidateKeys.includes(aSId) ||
          candidateKeys.includes(aUName)
        );
      });
    }

    if (day && day !== 'all') {
      list = list.filter(a => String(a.day) === String(day));
    }

    return res.json({
      success: true,
      count: list.length,
      databaseMode,
      assessments: list
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// 2. Submit Assessment (Called by Student upon completing assessment)
app.post('/api/assessments', async (req, res) => {
  try {
    const payload = req.body;

    if (!payload || !payload.day || (!payload.studentId && !payload.username)) {
      return res.status(400).json({ success: false, error: 'Missing required assessment submission fields (day, studentId).' });
    }

    const numericId = parseStudentNumericId(payload.studentId || payload.username);
    const standardUsername = payload.username || (typeof numericId === 'number' ? `student${String(numericId).padStart(3, '0')}` : String(payload.studentId));

    const assessmentRecord = {
      id: payload.id || 'ASM_' + Date.now(),
      studentId: payload.studentId ?? numericId,
      studentName: payload.studentName || 'Unknown Student',
      username: standardUsername,
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
        // 1. Save in global 'assessments' collection
        await firestoreDb.collection('assessments').doc(assessmentRecord.id).set(assessmentRecord);

        // 2. Save in student-specific subcollection across all candidate keys
        const candidateKeys = getStudentCandidateKeys(standardUsername);
        for (const k of candidateKeys) {
          try {
            await firestoreDb.collection('students').doc(k)
              .collection('assessments').doc(assessmentRecord.id).set(assessmentRecord);
            await firestoreDb.collection('students').doc(k).set({
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
          } catch (kErr) {}
        }

        console.log(`[Firebase Firestore] Stored assessment ${assessmentRecord.id} under candidate student keys (${candidateKeys.join(', ')}) and global collection.`);
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

// 4. Admin API - Get Summary by Students (Live from Firebase Firestore + Assessments)
app.get('/api/admin/students', async (req, res) => {
  try {
    const studentMap = {};

    function resolveStudentKey(obj, fallbackId) {
      const u = obj.username || obj.studentId || obj.id || fallbackId;
      const num = parseStudentNumericId(u);
      if (typeof num === 'number' && !isNaN(num)) {
        return `student${String(num).padStart(3, '0')}`;
      }
      return String(u || '').toLowerCase().trim();
    }

    // 1. Fetch registered students from Firestore
    if (firestoreDb) {
      try {
        const studentDocsSnap = await firestoreDb.collection('students').get();
        studentDocsSnap.forEach(doc => {
          const s = doc.data();
          const sKey = resolveStudentKey(s, doc.id);
          const num = parseStudentNumericId(s.username || s.studentId || s.id || doc.id);
          const sId = (typeof num === 'number') ? num : (s.id || sKey);

          if (!studentMap[sKey]) {
            studentMap[sKey] = {
              studentId: sId,
              name: s.name || '',
              username: s.username || sKey,
              department: s.department || 'Computer Science and Engineering (CSE)',
              year: s.year || '4th Year',
              rollNumber: s.rollNumber || '',
              reg: s.reg || `REG${String(num || '000').padStart(3, '0')}`,
              profileCompleted: !!s.profileCompleted,
              attemptsCount: 0,
              daysCompleted: new Set(),
              scores: [],
              latestAttemptAt: s.updatedAtDisplay || s.lastActive || s.updatedAt || null
            };
          } else {
            // Merge with more complete fields if present
            if (!studentMap[sKey].name && s.name) studentMap[sKey].name = s.name;
            if (!studentMap[sKey].rollNumber && s.rollNumber) studentMap[sKey].rollNumber = s.rollNumber;
            if (s.profileCompleted) studentMap[sKey].profileCompleted = true;
            if (s.department && s.department !== 'CSE') studentMap[sKey].department = s.department;
            if (s.reg) studentMap[sKey].reg = s.reg;
          }
        });
      } catch (fbErr) {
        console.warn('Firebase students fetch error:', fbErr.message);
      }
    }

    // 2. Fetch local students
    const localStudents = getLocalStudents();
    Object.values(localStudents).forEach(s => {
      const sKey = resolveStudentKey(s, s.id || s.username);
      const num = parseStudentNumericId(s.username || s.studentId || s.id);
      const sId = (typeof num === 'number') ? num : (s.id || sKey);

      if (!studentMap[sKey]) {
        studentMap[sKey] = {
          studentId: sId,
          name: s.name || '',
          username: s.username || sKey,
          department: s.department || 'Computer Science and Engineering (CSE)',
          year: s.year || '4th Year',
          rollNumber: s.rollNumber || '',
          reg: s.reg || `REG${String(num || '000').padStart(3, '0')}`,
          profileCompleted: !!s.profileCompleted,
          attemptsCount: 0,
          daysCompleted: new Set(),
          scores: [],
          latestAttemptAt: s.updatedAtDisplay || s.lastActive || null
        };
      } else {
        if (!studentMap[sKey].name && s.name) studentMap[sKey].name = s.name;
        if (!studentMap[sKey].rollNumber && s.rollNumber) studentMap[sKey].rollNumber = s.rollNumber;
        if (s.profileCompleted) studentMap[sKey].profileCompleted = true;
      }
    });

    // 3. Fetch all assessments to compute performance statistics
    let assessmentList = [];
    if (firestoreDb) {
      try {
        const snap = await firestoreDb.collection('assessments').get();
        snap.forEach(d => assessmentList.push(d.data()));
      } catch (e) {
        assessmentList = getLocalAssessments();
      }
    } else {
      assessmentList = getLocalAssessments();
    }

    assessmentList.forEach(a => {
      const sKey = resolveStudentKey(a, a.username || a.studentId);
      const num = parseStudentNumericId(a.username || a.studentId);
      const sId = (typeof num === 'number') ? num : (a.studentId || sKey);

      if (!studentMap[sKey]) {
        studentMap[sKey] = {
          studentId: sId,
          name: a.studentName || '',
          username: a.username || sKey,
          department: a.department || 'Computer Science and Engineering (CSE)',
          year: a.year || '4th Year',
          rollNumber: a.rollNumber || '',
          reg: `REG${String(num || '000').padStart(3, '0')}`,
          profileCompleted: true,
          attemptsCount: 0,
          daysCompleted: new Set(),
          scores: [],
          latestAttemptAt: a.completedAtDisplay || a.completedAt
        };
      }
      studentMap[sKey].attemptsCount++;
      studentMap[sKey].daysCompleted.add(a.day);
      studentMap[sKey].scores.push(Number(a.percentage || 0));
      if (a.completedAtDisplay || a.completedAt) {
        studentMap[sKey].latestAttemptAt = a.completedAtDisplay || a.completedAt;
      }
      if (!studentMap[sKey].name && a.studentName) studentMap[sKey].name = a.studentName;
      if (!studentMap[sKey].rollNumber && a.rollNumber) studentMap[sKey].rollNumber = a.rollNumber;
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
        profileCompleted: s.profileCompleted,
        totalAttempts: s.attemptsCount,
        uniqueDaysCompleted: s.daysCompleted.size,
        averageScore: avgScore,
        latestActivity: s.latestAttemptAt
      };
    });

    students.sort((a, b) => {
      const numA = parseStudentNumericId(a.username || a.studentId);
      const numB = parseStudentNumericId(b.username || b.studentId);
      if (typeof numA === 'number' && typeof numB === 'number' && !isNaN(numA) && !isNaN(numB)) {
        return numA - numB;
      }
      return String(a.username || a.studentId).localeCompare(String(b.username || b.studentId), undefined, { numeric: true });
    });

    return res.json({
      success: true,
      databaseMode,
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
    const { studentId } = req.query;

    if (firestoreDb) {
      try {
        const docRef = firestoreDb.collection('assessments').doc(id);
        const docSnap = await docRef.get();
        const sId = studentId || (docSnap.exists ? (docSnap.data().username || docSnap.data().studentId) : null);

        await docRef.delete();

        if (sId) {
          const keys = getStudentCandidateKeys(sId);
          for (const k of keys) {
            try {
              await firestoreDb.collection('students').doc(k).collection('assessments').doc(id).delete();
            } catch (errSub) {}
          }
        }
      } catch (e) {
        console.error('Firestore delete error:', e.message);
      }
    }

    let list = getLocalAssessments();
    list = list.filter(a => String(a.id) !== String(id));
    saveLocalAssessments(list);

    return res.json({ success: true, message: `Assessment ${id} deleted successfully.` });
  } catch (error) {
    console.error('Error deleting assessment:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// 6.1 Admin API - Bulk Delete Assessments (All or by specific Date)
app.delete('/api/admin/assessments', async (req, res) => {
  try {
    const isAll = String(req.query.all || (req.body && req.body.all) || '').toLowerCase() === 'true';
    const targetDate = String(req.query.date || (req.body && req.body.date) || '').trim();

    if (!isAll && !targetDate) {
      return res.status(400).json({ success: false, error: 'Please specify either ?all=true or ?date=YYYY-MM-DD to delete assessment records.' });
    }

    let deletedCount = 0;

    if (firestoreDb) {
      try {
        if (isAll) {
          // 1. Delete ALL from global assessments collection
          const assessmentsSnap = await firestoreDb.collection('assessments').get();
          deletedCount = assessmentsSnap.size;
          for (let i = 0; i < assessmentsSnap.docs.length; i += 400) {
            const chunk = assessmentsSnap.docs.slice(i, i + 400);
            const batch = firestoreDb.batch();
            chunk.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
          }

          // 2. Delete ALL assessments from EVERY student subcollection in Firestore
          const studentsSnap = await firestoreDb.collection('students').get();
          for (const studentDoc of studentsSnap.docs) {
            try {
              const subSnap = await studentDoc.ref.collection('assessments').get();
              if (!subSnap.empty) {
                for (let j = 0; j < subSnap.docs.length; j += 400) {
                  const subChunk = subSnap.docs.slice(j, j + 400);
                  const subBatch = firestoreDb.batch();
                  subChunk.forEach(d => subBatch.delete(d.ref));
                  await subBatch.commit();
                }
              }
              await studentDoc.ref.set({
                lastAssessmentDay: null,
                lastScore: null
              }, { merge: true });
            } catch (sErr) {}
          }
        } else if (targetDate) {
          // Date-specific deletion
          const assessmentsSnap = await firestoreDb.collection('assessments').get();
          const docsToDelete = [];

          assessmentsSnap.forEach(doc => {
            const data = doc.data();
            const cDate = data.completedAt ? new Date(data.completedAt).toISOString().slice(0, 10) : '';
            const disp = String(data.completedAtDisplay || data.date || '');
            if (cDate === targetDate || (data.completedAt && data.completedAt.startsWith(targetDate)) || disp.includes(targetDate)) {
              docsToDelete.push({ id: doc.id, studentId: data.studentId || data.username });
            }
          });

          deletedCount = docsToDelete.length;

          for (let i = 0; i < docsToDelete.length; i += 400) {
            const chunk = docsToDelete.slice(i, i + 400);
            const batch = firestoreDb.batch();
            for (const item of chunk) {
              batch.delete(firestoreDb.collection('assessments').doc(item.id));
              if (item.studentId) {
                const keys = getStudentCandidateKeys(item.studentId);
                for (const k of keys) {
                  batch.delete(firestoreDb.collection('students').doc(k).collection('assessments').doc(item.id));
                }
              }
            }
            await batch.commit();
          }
        }

        console.log(`[Firebase Firestore] Bulk deleted ${deletedCount} assessment records (${isAll ? 'ALL' : 'Date: ' + targetDate})`);
      } catch (fbErr) {
        console.error('Firebase bulk delete error:', fbErr.message);
      }
    }

    // Local file synchronization
    let localList = getLocalAssessments();
    const initialLocalCount = localList.length;

    if (isAll) {
      deletedCount = Math.max(deletedCount, initialLocalCount);
      saveLocalAssessments([]);
    } else if (targetDate) {
      const remaining = localList.filter(a => {
        const cDate = a.completedAt ? new Date(a.completedAt).toISOString().slice(0, 10) : '';
        const disp = String(a.completedAtDisplay || a.date || '');
        const match = (cDate === targetDate || (a.completedAt && a.completedAt.startsWith(targetDate)) || disp.includes(targetDate));
        return !match;
      });
      const localDeleted = initialLocalCount - remaining.length;
      deletedCount = Math.max(deletedCount, localDeleted);
      saveLocalAssessments(remaining);
    }

    const message = isAll
      ? `Successfully deleted all ${deletedCount} assessment records from the database.`
      : `Successfully deleted ${deletedCount} assessment records for date ${targetDate}.`;

    return res.json({
      success: true,
      deletedCount,
      message
    });
  } catch (error) {
    console.error('Error during bulk assessment deletion:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// 7. Admin API - Delete Student Account and all associated data from Firebase
app.delete('/api/admin/student/:studentId', async (req, res) => {
  try {
    const rawId = String(req.params.studentId || '').trim().toLowerCase();
    if (!rawId) {
      return res.status(400).json({ success: false, error: 'Student ID or username is required.' });
    }

    const candidateKeys = getStudentCandidateKeys(rawId);
    const numericId = parseStudentNumericId(rawId);

    if (firestoreDb) {
      try {
        // 1. Delete ALL matching student profile documents and subcollections from Firestore
        for (const key of candidateKeys) {
          try {
            await firestoreDb.collection('students').doc(key).delete();
          } catch (e) {}

          try {
            const subSnap = await firestoreDb.collection('students').doc(key).collection('assessments').get();
            if (!subSnap.empty) {
              const batch = firestoreDb.batch();
              subSnap.forEach(doc => batch.delete(doc.ref));
              await batch.commit();
            }
          } catch (e) {}
        }

        // Query students where username or id matches
        const qSnap = await firestoreDb.collection('students')
          .where('username', 'in', candidateKeys.slice(0, 10)).get();
        if (!qSnap.empty) {
          for (const doc of qSnap.docs) {
            await doc.ref.delete();
          }
        }

        // 2. Delete from global assessments collection
        const globalSnap = await firestoreDb.collection('assessments').get();
        if (!globalSnap.empty) {
          const batchGlobal = firestoreDb.batch();
          let countG = 0;
          globalSnap.forEach(doc => {
            const data = doc.data();
            const aNum = parseStudentNumericId(data.studentId || data.username);
            const aSId = String(data.studentId || '').toLowerCase();
            const aUName = String(data.username || '').toLowerCase();
            if (
              (typeof numericId === 'number' && typeof aNum === 'number' && numericId === aNum) ||
              candidateKeys.includes(aSId) ||
              candidateKeys.includes(aUName)
            ) {
              batchGlobal.delete(doc.ref);
              countG++;
            }
          });
          if (countG > 0) {
            await batchGlobal.commit();
          }
        }

        console.log(`[Firebase Firestore] Deleted student account candidate keys (${candidateKeys.join(', ')}) and associated records.`);
      } catch (fbErr) {
        console.error('Firebase delete student error:', fbErr.message);
      }
    }

    // Clean from local storage store as well
    const localStudents = getLocalStudents();
    for (const key of candidateKeys) {
      delete localStudents[key];
    }
    saveLocalStudents(localStudents);

    let localAssessments = getLocalAssessments();
    localAssessments = localAssessments.filter(a => {
      const aNum = parseStudentNumericId(a.studentId || a.username);
      const aSId = String(a.studentId || '').toLowerCase();
      const aUName = String(a.username || '').toLowerCase();
      return !(
        (typeof numericId === 'number' && typeof aNum === 'number' && numericId === aNum) ||
        candidateKeys.includes(aSId) ||
        candidateKeys.includes(aUName)
      );
    });
    saveLocalAssessments(localAssessments);

    return res.json({
      success: true,
      message: `Student account ${rawId} and all associated records (${candidateKeys.join(', ')}) deleted successfully.`
    });
  } catch (error) {
    console.error('Error deleting student account:', error);
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
