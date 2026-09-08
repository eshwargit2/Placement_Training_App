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
  if (!fs.existsSync(path.join(DATA_DIR, 'custom_assessments.json'))) {
    fs.writeFileSync(path.join(DATA_DIR, 'custom_assessments.json'), JSON.stringify([], null, 2), 'utf-8');
  }
} catch (e) {
  console.warn('Storage directory initialization notice:', e.message);
}

const CUSTOM_ASSESSMENTS_FILE = path.join(DATA_DIR, 'custom_assessments.json');

function getLocalCustomAssessments() {
  try {
    const raw = fs.readFileSync(CUSTOM_ASSESSMENTS_FILE, 'utf-8');
    return JSON.parse(raw || '[]');
  } catch (e) {
    return [];
  }
}

function saveLocalCustomAssessments(arr) {
  try {
    fs.writeFileSync(CUSTOM_ASSESSMENTS_FILE, JSON.stringify(arr, null, 2), 'utf-8');
  } catch (e) {
    console.warn('Local custom assessment save notice:', e.message);
  }
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

// Normalize student ID helper (e.g., student001 -> 1, or string)
function parseStudentNumericId(u) {
  const match = String(u || '').match(/^student(\d+)$/i);
  return match ? parseInt(match[1], 10) : u;
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
// STUDENT IDENTIFIER NORMALIZATION HELPERS
// ==========================================================================
function parseStudentNumericId(u) {
  if (u === null || u === undefined) return null;
  const str = String(u).trim();
  const match = str.match(/^student(\d+)$/i);
  if (match) return parseInt(match[1], 10);
  if (/^\d+$/.test(str)) return parseInt(str, 10);
  return null;
}

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

    let studentData = null;

    // 1. Query Firebase Firestore if connected
    if (firestoreDb) {
      try {
        const studentDocRef = firestoreDb.collection('students').doc(uLower);
        const docSnap = await studentDocRef.get();

        if (docSnap.exists) {
          studentData = docSnap.data();
        } else {
          // Check by query if doc ID was numeric
          const querySnap = await firestoreDb.collection('students')
            .where('username', '==', uLower).limit(1).get();
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
      studentData = localStudents[uLower] || null;
    }

    // 3. Handle Existing Student Account
    if (studentData) {
      const expectedPassword = studentData.password || uLower;
      if (p !== expectedPassword && p !== 'student123' && p !== uLower) {
        return res.status(401).json({ success: false, error: 'Invalid password. Please try again.' });
      }

      return res.json({
        success: true,
        role: 'student',
        databaseMode,
        user: {
          id: studentData.id || numericId,
          username: studentData.username || uLower,
          name: studentData.name || '',
          department: studentData.department || '',
          year: studentData.year || '',
          rollNumber: studentData.rollNumber || '',
          reg: studentData.reg || '',
          batch: studentData.batch || '',
          profileCompleted: !!studentData.profileCompleted,
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
      } catch (e) { }
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
    let studentData = null;
    let attempts = [];

    // 1. Fetch Student Profile from Firestore
    if (firestoreDb) {
      try {
        for (const k of candidateKeys) {
          const docSnap = await firestoreDb.collection('students').doc(k).get();
          if (docSnap.exists) {
            studentData = docSnap.data();
            break;
          }
        }

        const attemptsMap = new Map();

        // 1. Query global assessments collection by candidate username/studentId
        for (const k of candidateKeys) {
          const globalSnap = await firestoreDb.collection('assessments').where('username', '==', k).get();
          globalSnap.forEach(d => attemptsMap.set(d.id, d.data()));

          const num = parseStudentNumericId(k);
          if (typeof num === 'number') {
            const numSnap = await firestoreDb.collection('assessments').where('studentId', '==', num).get();
            numSnap.forEach(d => attemptsMap.set(d.id, d.data()));
          }
        }

        // 2. Fetch student's assessments from candidate subcollections
        for (const k of candidateKeys) {
          const subSnap = await firestoreDb.collection('students').doc(k)
            .collection('assessments').orderBy('completedAt', 'desc').get();
          subSnap.forEach(d => {
            attemptsMap.set(d.id, d.data());
          });
        }

        attempts = Array.from(attemptsMap.values()).sort((a, b) => new Date(b.completedAt || 0) - new Date(a.completedAt || 0));
      } catch (fbErr) {
        console.warn('Firestore dashboard query error:', fbErr.message);
      }
    }

    // 2. Fallback to Local Storage
    if (!studentData) {
      const localStudents = getLocalStudents();
      for (const k of candidateKeys) {
        if (localStudents[k]) {
          studentData = localStudents[k];
          break;
        }
      }
    }

    if (!attempts.length) {
      const localAssessments = getLocalAssessments();
      attempts = localAssessments.filter(a => {
        const aUser = String(a.username || '').toLowerCase();
        const aId = String(a.studentId || '').toLowerCase();
        return candidateKeys.includes(aUser) || candidateKeys.includes(aId);
      });
    }

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

// 2. Submit Assessment (Called by Student upon completing assessment)
app.post('/api/assessments', async (req, res) => {
  try {
    const payload = req.body;

    if (!payload || !payload.studentId || (!payload.day && !payload.customAssessmentId && !payload.topic)) {
      return res.status(400).json({ success: false, error: 'Missing required assessment submission fields (studentId, day/customAssessmentId).' });
    }

    const assessmentRecord = {
      id: payload.id || 'ASM_' + Date.now(),
      studentId: payload.studentId,
      studentName: payload.studentName || 'Unknown Student',
      username: payload.username || '',
      department: payload.department || 'CSE',
      year: payload.year || '4th Year',
      rollNumber: payload.rollNumber || '',
      day: payload.day !== undefined && payload.day !== null ? Number(payload.day) : null,
      topic: payload.topic || payload.examTitle || 'Assessment',
      examTitle: payload.examTitle || payload.topic || '',
      isCustomExam: !!payload.isCustomExam || !!payload.customAssessmentId,
      customAssessmentId: payload.customAssessmentId || null,
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
        const candidateKeys = getStudentCandidateKeys(assessmentRecord.username || assessmentRecord.studentId);

        // 1. Save in global 'assessments' collection
        await firestoreDb.collection('assessments').doc(assessmentRecord.id).set(assessmentRecord);

        // 2. Save in all student-specific candidate subcollections: students/{key}/assessments/{assessmentId}
        for (const cand of candidateKeys) {
          try {
            await firestoreDb.collection('students').doc(cand)
              .collection('assessments').doc(assessmentRecord.id).set(assessmentRecord);

            // 3. Update student summary document for this key
            await firestoreDb.collection('students').doc(cand).set({
              id: assessmentRecord.studentId,
              studentId: assessmentRecord.studentId,
              name: assessmentRecord.studentName,
              username: assessmentRecord.username || cand,
              department: assessmentRecord.department,
              year: assessmentRecord.year,
              rollNumber: assessmentRecord.rollNumber,
              lastActive: assessmentRecord.completedAt,
              lastActiveDisplay: assessmentRecord.completedAtDisplay,
              lastAssessmentDay: assessmentRecord.day,
              lastScore: assessmentRecord.percentage
            }, { merge: true });
          } catch (errKey) { }
        }

        console.log(`[Firebase Firestore] Stored assessment ${assessmentRecord.id} across candidate student keys and global collection.`);
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
        const map = new Map();

        // 1. Fetch from global assessments
        const snapshot = await firestoreDb.collection('assessments').orderBy('completedAt', 'desc').get();
        snapshot.forEach(doc => map.set(doc.id, doc.data()));

        // 2. Fetch any missing assessments from collectionGroup
        try {
          const cgSnap = await firestoreDb.collectionGroup('assessments').get();
          cgSnap.forEach(doc => {
            if (!map.has(doc.id)) {
              map.set(doc.id, doc.data());
            }
          });
        } catch (cgErr) { }

        list = Array.from(map.values()).sort((a, b) => new Date(b.completedAt || 0) - new Date(a.completedAt || 0));
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

    // 1. Fetch registered students from Firestore
    if (firestoreDb) {
      try {
        const studentDocsSnap = await firestoreDb.collection('students').get();
        studentDocsSnap.forEach(doc => {
          const s = doc.data();
          const sId = s.username || s.studentId || doc.id;
          studentMap[sId] = {
            studentId: s.id || sId,
            name: s.name || '',
            username: s.username || sId,
            department: s.department || '',
            year: s.year || '',
            rollNumber: s.rollNumber || '',
            profileCompleted: !!s.profileCompleted,
            attemptsCount: 0,
            daysCompleted: new Set(),
            scores: [],
            latestAttemptAt: s.updatedAtDisplay || s.lastActive || s.updatedAt || null
          };
        });
      } catch (fbErr) {
        console.warn('Firebase students fetch error:', fbErr.message);
      }
    }

    // 2. Fetch local students
    const localStudents = getLocalStudents();
    Object.values(localStudents).forEach(s => {
      const sId = s.username || s.studentId || s.id;
      if (!studentMap[sId]) {
        studentMap[sId] = {
          studentId: s.id || sId,
          name: s.name || '',
          username: s.username || sId,
          department: s.department || '',
          year: s.year || '',
          rollNumber: s.rollNumber || '',
          profileCompleted: !!s.profileCompleted,
          attemptsCount: 0,
          daysCompleted: new Set(),
          scores: [],
          latestAttemptAt: s.updatedAtDisplay || s.lastActive || null
        };
      } else if (!studentMap[sId].name && s.name) {
        studentMap[sId].name = s.name;
        studentMap[sId].rollNumber = s.rollNumber;
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
      const sId = a.username || a.studentId || 'unknown';
      if (!studentMap[sId]) {
        studentMap[sId] = {
          studentId: a.studentId,
          name: a.studentName || '',
          username: a.username || sId,
          department: a.department || '',
          year: a.year || '',
          rollNumber: a.rollNumber || '',
          profileCompleted: true,
          attemptsCount: 0,
          daysCompleted: new Set(),
          scores: [],
          latestAttemptAt: a.completedAtDisplay || a.completedAt
        };
      }
      studentMap[sId].attemptsCount++;
      studentMap[sId].daysCompleted.add(a.day);
      studentMap[sId].scores.push(Number(a.percentage || 0));
      if (a.completedAtDisplay || a.completedAt) {
        studentMap[sId].latestAttemptAt = a.completedAtDisplay || a.completedAt;
      }
      if (!studentMap[sId].name && a.studentName) studentMap[sId].name = a.studentName;
      if (!studentMap[sId].rollNumber && a.rollNumber) studentMap[sId].rollNumber = a.rollNumber;
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
      } catch (e) { }
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

// 6. Admin API - Delete an Assessment Record (Deletes from Global, All Candidate Subcollections, and CollectionGroup)
app.delete('/api/admin/assessment/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { studentId, username } = req.query;

    if (firestoreDb) {
      try {
        const docRef = firestoreDb.collection('assessments').doc(id);
        const docSnap = await docRef.get();
        const docData = docSnap.exists ? docSnap.data() : {};

        // Collect all student identifier candidates (e.g. 9, student009, student9)
        const candidateKeys = new Set();
        if (studentId) getStudentCandidateKeys(studentId).forEach(k => candidateKeys.add(k));
        if (username) getStudentCandidateKeys(username).forEach(k => candidateKeys.add(k));
        if (docData.studentId) getStudentCandidateKeys(docData.studentId).forEach(k => candidateKeys.add(k));
        if (docData.username) getStudentCandidateKeys(docData.username).forEach(k => candidateKeys.add(k));

        // 1. Delete from global 'assessments' collection
        await docRef.delete();

        // 2. Delete from all candidate student subcollections: students/{key}/assessments/{id}
        for (const cand of candidateKeys) {
          try {
            await firestoreDb.collection('students').doc(cand).collection('assessments').doc(id).delete();
          } catch (errSub) { }
        }

        // 3. Delete across all assessment subcollections using collectionGroup
        try {
          const cgSnap = await firestoreDb.collectionGroup('assessments').where('id', '==', id).get();
          if (!cgSnap.empty) {
            const batch = firestoreDb.batch();
            cgSnap.forEach(d => batch.delete(d.ref));
            await batch.commit();
          }
        } catch (cgErr) { }

        console.log(`[Firebase Firestore] Permanently deleted assessment ${id} from global and all student subcollections.`);
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

// 6.1 Admin API - Purge Assessments (by Date or All)
app.delete('/api/admin/assessments', async (req, res) => {
  try {
    const { date, all } = req.query;

    if (!date && !all) {
      return res.status(400).json({ success: false, error: 'Specify ?date=YYYY-MM-DD or ?all=true to purge assessments.' });
    }

    let deletedCount = 0;

    if (firestoreDb) {
      try {
        if (all === 'true') {
          // Purge all assessments from global collection
          const gSnap = await firestoreDb.collection('assessments').get();
          if (!gSnap.empty) {
            const batch = firestoreDb.batch();
            gSnap.forEach(d => batch.delete(d.ref));
            await batch.commit();
            deletedCount = gSnap.size;
          }

          // Purge all assessments from all student subcollections
          const cgSnap = await firestoreDb.collectionGroup('assessments').get();
          if (!cgSnap.empty) {
            const batch2 = firestoreDb.batch();
            cgSnap.forEach(d => batch2.delete(d.ref));
            await batch2.commit();
          }
        } else if (date) {
          // Purge records matching specific date
          const gSnap = await firestoreDb.collection('assessments').get();
          const toDelete = [];
          gSnap.forEach(d => {
            const data = d.data();
            const cDate = data.completedAt ? new Date(data.completedAt).toISOString().slice(0, 10) : "";
            const disp = String(data.completedAtDisplay || data.date || "");
            if (cDate === date || (data.completedAt && data.completedAt.startsWith(date)) || disp.includes(date)) {
              toDelete.push(d);
            }
          });

          if (toDelete.length) {
            const batch = firestoreDb.batch();
            toDelete.forEach(d => batch.delete(d.ref));
            await batch.commit();
            deletedCount = toDelete.length;
          }

          // Also delete from subcollections matching date
          const cgSnap = await firestoreDb.collectionGroup('assessments').get();
          const subToDelete = [];
          cgSnap.forEach(d => {
            const data = d.data();
            const cDate = data.completedAt ? new Date(data.completedAt).toISOString().slice(0, 10) : "";
            const disp = String(data.completedAtDisplay || data.date || "");
            if (cDate === date || (data.completedAt && data.completedAt.startsWith(date)) || disp.includes(date)) {
              subToDelete.push(d);
            }
          });
          if (subToDelete.length) {
            const batch2 = firestoreDb.batch();
            subToDelete.forEach(d => batch2.delete(d.ref));
            await batch2.commit();
          }
        }
      } catch (fbErr) {
        console.error('Firebase bulk delete error:', fbErr.message);
      }
    }

    let local = getLocalAssessments();
    if (all === 'true') {
      local = [];
    } else if (date) {
      local = local.filter(a => {
        const cDate = a.completedAt ? new Date(a.completedAt).toISOString().slice(0, 10) : "";
        const disp = String(a.completedAtDisplay || a.date || "");
        return !(cDate === date || (a.completedAt && a.completedAt.startsWith(date)) || disp.includes(date));
      });
    }
    saveLocalAssessments(local);

    return res.json({
      success: true,
      message: all === 'true'
        ? 'All assessment records purged successfully from database.'
        : `All assessment records for date ${date} deleted successfully.`
    });
  } catch (error) {
    console.error('Error purging assessments:', error);
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

    if (firestoreDb) {
      try {
        // 1. Delete student profile documents and candidate subcollections
        for (const cand of candidateKeys) {
          await firestoreDb.collection('students').doc(cand).delete();
          const subSnap = await firestoreDb.collection('students').doc(cand).collection('assessments').get();
          if (!subSnap.empty) {
            const batch = firestoreDb.batch();
            subSnap.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
          }
        }

        // 2. Delete from global assessments collection matching any candidate keys
        for (const cand of candidateKeys) {
          const globalSnap = await firestoreDb.collection('assessments').where('username', '==', cand).get();
          if (!globalSnap.empty) {
            const batch2 = firestoreDb.batch();
            globalSnap.forEach(doc => batch2.delete(doc.ref));
            await batch2.commit();
          }

          const num = parseStudentNumericId(cand);
          if (typeof num === 'number') {
            const numSnap = await firestoreDb.collection('assessments').where('studentId', '==', num).get();
            if (!numSnap.empty) {
              const batch3 = firestoreDb.batch();
              numSnap.forEach(doc => batch3.delete(doc.ref));
              await batch3.commit();
            }
          }
        }

        console.log(`[Firebase Firestore] Deleted student account ${rawId} and all associated candidate records.`);
      } catch (fbErr) {
        console.error('Firebase delete student error:', fbErr.message);
      }
    }

    // Clean from local storage store as well
    const localStudents = getLocalStudents();
    for (const cand of candidateKeys) {
      delete localStudents[cand];
    }
    saveLocalStudents(localStudents);

    let localAssessments = getLocalAssessments();
    localAssessments = localAssessments.filter(a => {
      const aUser = String(a.username || '').toLowerCase();
      const aId = String(a.studentId || '').toLowerCase();
      return !candidateKeys.includes(aUser) && !candidateKeys.includes(aId);
    });
    saveLocalAssessments(localAssessments);

    return res.json({
      success: true,
      message: `Student account ${rawId} and all associated assessment records deleted successfully.`
    });
  } catch (error) {
    console.error('Error deleting student account:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================================================
// 6. CUSTOM ASSESSMENTS MANAGEMENT (EXCEL / CSV UPLOADED EXAMS)
// ==========================================================================

// 6.1 Get all Custom Assessments
app.get('/api/custom-assessments', async (req, res) => {
  try {
    let list = [];
    if (firestoreDb) {
      try {
        const snap = await firestoreDb.collection('custom_assessments').get();
        snap.forEach(doc => {
          list.push(Object.assign({ id: doc.id }, doc.data()));
        });
        list.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
        console.log(`[Firebase Firestore] Retrieved ${list.length} custom assessments`);
      } catch (fbErr) {
        console.warn('Firestore custom assessments query fallback:', fbErr.message);
        list = getLocalCustomAssessments();
      }
    } else {
      list = getLocalCustomAssessments();
    }

    return res.json({
      success: true,
      count: list.length,
      databaseMode,
      customAssessments: list
    });
  } catch (error) {
    console.error('Error fetching custom assessments:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// 6.2 Create / Publish new Custom Assessment
app.post('/api/custom-assessments', async (req, res) => {
  try {
    const payload = req.body;
    if (!payload || !payload.title || !Array.isArray(payload.questions) || !payload.questions.length) {
      return res.status(400).json({ success: false, error: 'Exam Title and at least one Question are required.' });
    }

    const examId = payload.id || 'CUST_EXAM_' + Date.now();
    const customExam = {
      id: examId,
      title: String(payload.title).trim(),
      topic: String(payload.topic || payload.title).trim(),
      description: String(payload.description || '').trim(),
      durationMinutes: Number(payload.durationMinutes || 20),
      totalQuestions: payload.questions.length,
      questions: payload.questions, // array of { question, options: [A, B, C, D], answer: "A", explanation: "" }
      codingPrograms: Array.isArray(payload.codingPrograms) ? payload.codingPrograms : [],
      status: payload.status || 'active',
      createdAt: payload.createdAt || new Date().toISOString(),
      createdAtDisplay: payload.createdAtDisplay || new Date().toLocaleString(),
      createdBy: payload.createdBy || 'Admin'
    };

    // Save to Firebase Firestore if connected
    if (firestoreDb) {
      try {
        await firestoreDb.collection('custom_assessments').doc(examId).set(customExam);
        console.log(`[Firebase Firestore] Custom assessment '${customExam.title}' saved with ID ${examId}`);
      } catch (fbErr) {
        console.error('Firestore save custom assessment error:', fbErr.message);
      }
    }

    // Save to Local Fallback Store
    const localExams = getLocalCustomAssessments();
    const existingIdx = localExams.findIndex(e => String(e.id) === String(examId));
    if (existingIdx >= 0) {
      localExams[existingIdx] = customExam;
    } else {
      localExams.unshift(customExam);
    }
    saveLocalCustomAssessments(localExams);

    return res.json({
      success: true,
      databaseMode,
      message: 'Custom assessment published successfully.',
      customAssessment: customExam
    });
  } catch (error) {
    console.error('Error creating custom assessment:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// 6.3 Delete Custom Assessment
app.delete('/api/custom-assessments/:id', async (req, res) => {
  try {
    const rawParam = decodeURIComponent(String(req.params.id || '').trim());
    if (!rawParam) {
      return res.status(400).json({ success: false, error: 'Custom assessment ID is required.' });
    }

    if (firestoreDb) {
      try {
        // 1. Direct doc deletion
        await firestoreDb.collection('custom_assessments').doc(rawParam).delete();

        // 2. Query and batch delete by ID or title match
        const snap = await firestoreDb.collection('custom_assessments').get();
        const batch = firestoreDb.batch();
        let matchCount = 0;
        snap.forEach(doc => {
          const d = doc.data() || {};
          if (doc.id === rawParam || String(d.id) === rawParam || String(d.title || '').trim().toLowerCase() === rawParam.toLowerCase()) {
            batch.delete(doc.ref);
            matchCount++;
          }
        });
        if (matchCount > 0) {
          await batch.commit();
        }
        console.log(`[Firebase Firestore] Deleted custom assessment matching '${rawParam}' (${matchCount} docs removed).`);
      } catch (fbErr) {
        console.error('Firestore delete custom assessment error:', fbErr.message);
      }
    }

    let localExams = getLocalCustomAssessments();
    localExams = localExams.filter(e => String(e.id) !== rawParam && String(e.title || '').trim().toLowerCase() !== rawParam.toLowerCase());
    saveLocalCustomAssessments(localExams);

    return res.json({
      success: true,
      message: `Custom assessment '${rawParam}' deleted successfully.`
    });
  } catch (error) {
    console.error('Error deleting custom assessment:', error);
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
