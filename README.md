# Placement Training & Assessment Portal

A modern web application built for **VMKVEC (Vinayaka Mission's Kirupananda Variyar Engineering College) - Department of Computer Science & Engineering** to streamline placement preparation, assessments, and coding evaluation.

---

## 🎯 Purpose of the App

- **Daily Curriculum & Assessments**: Structured 33-day placement training curriculum covering core CS fundamentals, aptitude, and problem solving.
- **Candidate Assessment System**: Timed multiple-choice questions (MCQs) and interactive coding challenges with live code submission.
- **Instant Feedback & Analytics**: Real-time evaluation, score tracking, answer verification, and student progress dashboards.
- **Admin & Evaluation Panel**: Central repository for trainers and administrators to inspect candidate submissions, review MCQ accuracy, assess code solutions, and export evaluation data.
- **Export Reports**: Generate styled, color-coded **PDF Evaluation Reports** (organized by unique student roll number, department, and score metrics) and **CSV datasets**.

---

## 🛠️ Technologies Used

### Frontend
- **HTML5 & Vanilla JavaScript (ES6+)**: Core structure, state management, and client logic.
- **Vanilla CSS3**: Custom design system with glassmorphism, responsive layouts, and micro-animations.
- **Icons**: SVG Vector Icons (Feather / Lucide icon sets).
- **Typography**: Google Fonts (*Plus Jakarta Sans*, *Outfit*, *Inter*, *Fira Code*).
- **Export Engine**: Custom in-browser PDF report engine with print styling and CSV data serialization.

### Backend & Cloud
- **Node.js & Express.js**: REST API endpoints for assessments, student management, and administrative actions.
- **Firebase Firestore / Firebase Admin SDK**: Cloud database for central assessment and student records.
- **Vercel**: Serverless cloud API deployment.

---

## 🚀 Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Run Local Backend Server
```bash
node Backend/server.js
```

### 3. Open Web App
Open `public/index.html` or `public/login.html` in your browser or run with a local static server.
