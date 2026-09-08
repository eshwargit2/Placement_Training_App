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
    let studentData = null;
    let attempts = [];

    // 1. Fetch Student Profile from Firestore
    if (firestoreDb) {
      try {
        const docSnap = await firestoreDb.collection('students').doc(rawId).get();
        if (docSnap.exists) {
          studentData = docSnap.data();
        }

        // Fetch student's assessments from subcollection
        const subSnap = await firestoreDb.collection('students').doc(rawId)
          .collection('assessments').orderBy('completedAt', 'desc').get();
        subSnap.forEach(d => attempts.push(d.data()));

        // Also query global collection if subcollection was empty
        if (!attempts.length) {
          const globalSnap = await firestoreDb.collection('assessments')
            .where('username', '==', rawId).get();
          globalSnap.forEach(d => attempts.push(d.data()));
        }
      } catch (fbErr) {
        console.warn('Firestore dashboard query error:', fbErr.message);
      }
    }

    // 2. Fallback to Local Storage
    if (!studentData) {
      const localStudents = getLocalStudents();
      studentData = localStudents[rawId] || null;
    }

    if (!attempts.length) {
      const localAssessments = getLocalAssessments();
      attempts = localAssessments.filter(a =>
        String(a.studentId).toLowerCase() === rawId ||
        String(a.username).toLowerCase() === rawId
      );
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

// 6. Admin API - Delete an Assessment Record
app.delete('/api/admin/assessment/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { studentId } = req.query;

    if (firestoreDb) {
      try {
        const docRef = firestoreDb.collection('assessments').doc(id);
        const docSnap = await docRef.get();
        const sId = studentId || (docSnap.exists ? docSnap.data().studentId : null);

        await docRef.delete();

        if (sId) {
          try {
            await firestoreDb.collection('students').doc(sId).collection('assessments').doc(id).delete();
          } catch (errSub) { }
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

// 7. Admin API - Delete Student Account and all associated data from Firebase
app.delete('/api/admin/student/:studentId', async (req, res) => {
  try {
    const sId = String(req.params.studentId || '').trim().toLowerCase();
    if (!sId) {
      return res.status(400).json({ success: false, error: 'Student ID or username is required.' });
    }

    if (firestoreDb) {
      try {
        // 1. Delete student profile document from Firestore
        await firestoreDb.collection('students').doc(sId).delete();

        // 2. Delete all assessments in student's subcollection
        const subSnap = await firestoreDb.collection('students').doc(sId).collection('assessments').get();
        if (!subSnap.empty) {
          const batch = firestoreDb.batch();
          subSnap.forEach(doc => batch.delete(doc.ref));
          await batch.commit();
        }

        // 3. Delete from global assessments collection
        const globalSnap = await firestoreDb.collection('assessments').where('username', '==', sId).get();
        if (!globalSnap.empty) {
          const batch2 = firestoreDb.batch();
          globalSnap.forEach(doc => batch2.delete(doc.ref));
          await batch2.commit();
        }

        console.log(`[Firebase Firestore] Deleted student account ${sId} and associated records.`);
      } catch (fbErr) {
        console.error('Firebase delete student error:', fbErr.message);
      }
    }

    // Clean from local storage store as well
    const localStudents = getLocalStudents();
    delete localStudents[sId];
    saveLocalStudents(localStudents);

    let localAssessments = getLocalAssessments();
    localAssessments = localAssessments.filter(a =>
      String(a.studentId).toLowerCase() !== sId &&
      String(a.username).toLowerCase() !== sId
    );
    saveLocalAssessments(localAssessments);

    return res.json({
      success: true,
      message: `Student account ${sId} and all associated assessment records deleted successfully.`
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
