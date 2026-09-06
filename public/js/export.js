// ==========================================================================
// VMKVEC CSE Placement Training - Excel & PDF Export Engine
// ==========================================================================

function getAttemptDetails(a) {
  const qs = (typeof QUESTION_BANK !== 'undefined' && QUESTION_BANK[a.day]) ? QUESTION_BANK[a.day] : [];
  if (a.mcqDetails && Array.isArray(a.mcqDetails) && a.mcqDetails.length) {
    return a.mcqDetails.map((d, i) => ({
      number: d.number || (i + 1),
      question: d.question || (qs[i] ? qs[i][0] : `Question ${i + 1}`),
      options: Array.isArray(d.options) ? d.options : (qs[i] ? qs[i].slice(1, 5) : []),
      answer: d.answer || "Not recorded",
      correct: d.correct || (qs[i] ? qs[i][5] : "-"),
      result: d.result || "Not recorded"
    }));
  }
  return qs.map((q, i) => ({
    number: i + 1,
    question: q[0],
    options: q.slice(1, 5),
    answer: "Not recorded",
    correct: q[5],
    result: "Not recorded"
  }));
}

function xlsCell(v) {
  return `<Cell><Data ss:Type="String">${esc(String(v ?? ""))}</Data></Cell>`;
}

function downloadExcel(filename, headers, rows) {
  const body = rows.map(r => `<Row>${r.map(xlsCell).join("")}</Row>`).join("");
  const xml = `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Records"><Table><Row>${headers.map(xlsCell).join("")}</Row>${body}</Table></Worksheet></Workbook>`;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([xml], { type: "application/vnd.ms-excel" }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function flattenAttemptRows(a) {
  const st = (typeof state !== 'undefined' && state.students ? state.students.find(x => x.id === a.studentId) : null) || {};
  const details = getAttemptDetails(a);
  const rows = [];
  details.forEach(d => rows.push([
    st.id || a.studentId || "",
    a.username || a.studentName || "",
    st.name || a.studentName || "",
    st.department || a.department || "",
    st.year || a.year || "",
    st.rollNumber || a.rollNumber || "",
    "Day " + a.day,
    "MCQ " + d.number,
    d.question,
    (d.options || []).map((o, i) => "ABCD"[i] + ". " + o).join(" | "),
    d.answer,
    d.correct,
    d.result,
    a.attemptNumber || 1,
    a.score + "/" + (a.total || 5),
    a.percentage + "%",
    a.completedAtDisplay || a.date || "",
    Math.ceil((a.completionSeconds || 0) / 60),
    (a.strongAreas || []).join("; "),
    (a.weakAreas || []).join("; "),
    "", "", ""
  ]));
  [1, 2, 3].forEach(n => {
    const sub = (typeof state !== 'undefined' && state.submissions ? state.submissions.find(x => x.studentId === a.studentId && x.day === a.day && x.problem === n && (x.attemptNumber || 1) === (a.attemptNumber || 1)) : null);
    rows.push([
      st.id || a.studentId || "",
      a.username || a.studentName || "",
      st.name || a.studentName || "",
      st.department || a.department || "",
      st.year || a.year || "",
      st.rollNumber || a.rollNumber || "",
      "Day " + a.day,
      "Program " + n,
      a["program" + n + "Prompt"] || sub?.prompt || (typeof CODING_BANK !== 'undefined' && CODING_BANK[a.day]?.[n - 1]) || "",
      "",
      a["program" + n] || sub?.code || "",
      "",
      sub?.status || (a["program" + n] ? "Submitted" : "Not Provided"),
      a.attemptNumber || 1,
      a.score + "/" + (a.total || 5),
      a.percentage + "%",
      a.completedAtDisplay || a.date || "",
      Math.ceil((a.completionSeconds || 0) / 60),
      (a.strongAreas || []).join("; "),
      (a.weakAreas || []).join("; "),
      sub?.score ?? "",
      sub?.feedback || "",
      sub?.submittedAt || ""
    ]);
  });
  return rows;
}

const EXPORT_HEADERS = [
  "Student ID", "Username", "Name", "Department", "Year", "Roll No",
  "Assessment", "Item", "Question / Program", "Options", "Student Answer / Code",
  "Correct Answer", "Result / Status", "Attempt", "Score", "Percentage",
  "Completed At", "Time Used (min)", "Strong Areas", "Weak Areas",
  "Program Score", "Trainer Feedback", "Submitted At"
];

function exportAllAssessmentRecords() {
  const rows = [];
  const attempts = (typeof state !== 'undefined' && state.attempts) ? state.attempts : [];
  attempts.forEach(a => rows.push(...flattenAttemptRows(a)));
  downloadExcel("all_student_complete_assessment_records.xls", EXPORT_HEADERS, rows);
}

function exportStudentRecords(id) {
  const st = (typeof state !== 'undefined' && state.students) ? state.students.find(x => x.id === id) : null;
  if (!st) return;
  const rows = [];
  const attempts = (typeof state !== 'undefined' && state.attempts) ? state.attempts.filter(a => a.studentId === id) : [];
  attempts.forEach(a => rows.push(...flattenAttemptRows(a)));
  downloadExcel((st.rollNumber || st.username) + "_complete_assessment_records.xls", EXPORT_HEADERS, rows);
}

function exportAttemptExcel(id) {
  const a = (typeof state !== 'undefined' && state.attempts) ? state.attempts.find(x => String(x.id) === String(id)) : null;
  if (!a) return;
  downloadExcel(`${a.username}_day${a.day}_attempt${a.attemptNumber || 1}_complete_record.xls`, EXPORT_HEADERS, flattenAttemptRows(a));
}

function exportDepartmentRecords(dept) {
  const rows = [["Student ID", "Username", "Name", "Department", "Year", "Roll No", "Assessments Completed", "Average %", "Strong Areas", "Weak Areas", "Status"]];
  const students = (typeof state !== 'undefined' && state.students) ? state.students.filter(s => !dept || s.department === dept) : [];
  students.forEach(st => {
    const aa = (typeof state !== 'undefined' && state.attempts) ? state.attempts.filter(a => a.studentId === st.id) : [];
    const avg = aa.length ? Math.round(aa.reduce((n, a) => n + a.percentage, 0) / aa.length) : 0;
    rows.push([
      st.id,
      st.username,
      st.name,
      st.department,
      st.year,
      st.rollNumber,
      aa.length,
      avg + "%",
      [...new Set(aa.flatMap(a => a.strongAreas || []))].join("; "),
      [...new Set(aa.flatMap(a => a.weakAreas || []))].join("; "),
      aa.length ? "Completed" : "Open"
    ]);
  });
  downloadExcel((dept || "all_departments") + "_student_summary.xls", rows.shift(), rows);
}

function pdfEscape(v) {
  return String(v ?? "").replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)").replace(/\r?\n/g, " ");
}

function makePDF(title, lines) {
  const perPage = 48, pages = [];
  for (let i = 0; i < lines.length; i += perPage) pages.push(lines.slice(i, i + perPage));
  if (!pages.length) pages.push([""]);
  let objs = [];
  const pageIds = [], contentIds = [];
  let objNo = 3;
  pages.forEach(() => { pageIds.push(objNo++); contentIds.push(objNo++); });
  const fontId = objNo++;
  let pdf = `%PDF-1.4\n`;
  const offsets = [0];

  function add(id, body) {
    offsets[id] = pdf.length;
    pdf += id + ` 0 obj\n` + body + `\nendobj\n`;
  }

  add(1, `<< /Type /Catalog /Pages 2 0 R >>`);
  add(2, `<< /Type /Pages /Kids [${pageIds.map(x => x + " 0 R").join(" ")}] /Count ${pages.length} >>`);

  pages.forEach((pg, i) => {
    add(pageIds[i], `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentIds[i]} 0 R >>`);
    let stream = "BT\n/F1 9 Tf\n40 760 Td\n";
    pg.forEach((line, j) => {
      if (j === 0) stream += `/F1 12 Tf (${pdfEscape(line)}) Tj\n/F1 9 Tf 0 -20 Td\n`;
      else stream += `(${pdfEscape(line)}) Tj\n0 -14 Td\n`;
    });
    stream += "ET";
    add(contentIds[i], `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  });

  add(fontId, `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`);
  const xref = pdf.length;
  pdf += `xref\n0 ${objNo}\n0000000000 65535 f \n`;
  for (let i = 1; i < objNo; i++) pdf += String(offsets[i]).padStart(10, "0") + " 00000 n \n";
  pdf += `trailer\n<< /Size ${objNo} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;

  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([pdf], { type: "application/pdf" }));
  a.download = title;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function getScorePillHtml(percentage) {
  const pct = Number(percentage || 0);
  if (pct >= 75) return `<span class="score-pill-high">${pct}%</span>`;
  if (pct >= 50) return `<span class="score-pill-mid">${pct}%</span>`;
  return `<span class="score-pill-low">${pct}%</span>`;
}

function openColoredPDFReport(title, subtitle, metaHtml, contentHtml) {
  const reportDoc = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${esc(title)}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Fira+Code:wght@400;500&display=swap');
    
    * { box-sizing: border-box; }
    body {
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      margin: 0;
      padding: 16px 20px;
      background: #f1f5f9;
      color: #0f172a;
      line-height: 1.4;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    
    @page {
      size: A4 portrait;
      margin: 8mm 10mm;
    }
    
    @media print {
      body {
        padding: 0;
        background: #fff;
      }
      .no-print {
        display: none !important;
      }
      .page-break {
        page-break-before: always;
        break-before: page;
      }
      .card-avoid-break {
        page-break-inside: avoid;
        break-inside: avoid;
      }
    }
    
    .top-action-bar {
      position: sticky;
      top: 0;
      z-index: 1000;
      background: rgba(15, 23, 42, 0.96);
      backdrop-filter: blur(10px);
      color: #fff;
      padding: 10px 20px;
      border-radius: 10px;
      margin-bottom: 14px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      box-shadow: 0 8px 20px -4px rgba(0, 0, 0, 0.2);
    }
    .print-btn {
      background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
      color: #fff;
      border: 1px solid rgba(255,255,255,0.2);
      padding: 8px 16px;
      border-radius: 8px;
      font-weight: 700;
      font-size: 13px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: all 0.2s;
    }
    .print-btn:hover { background: #1d4ed8; transform: translateY(-1px); }
    
    /* Header Report Banner */
    .report-header {
      background: linear-gradient(135deg, #1e3a8a 0%, #1e40af 40%, #3b82f6 100%);
      color: #ffffff;
      padding: 16px 20px;
      border-radius: 12px;
      margin-bottom: 14px;
      box-shadow: 0 6px 18px -4px rgba(37,99,235,0.2);
    }
    .college-name {
      font-size: 16px;
      font-weight: 800;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      margin: 0 0 4px 0;
      color: #ffffff;
    }
    .dept-subtitle {
      font-size: 12.5px;
      color: #dbeafe;
      margin: 0 0 10px 0;
      font-weight: 600;
    }
    .report-meta-grid {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      background: rgba(255,255,255,0.15);
      padding: 8px 14px;
      border-radius: 8px;
      font-size: 12px;
      border: 1px solid rgba(255,255,255,0.2);
    }
    
    /* Summary Table */
    .summary-table-wrap {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      overflow: hidden;
      margin-bottom: 16px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.03);
    }
    .table-title {
      font-size: 14px;
      font-weight: 800;
      color: #0f172a;
      padding: 10px 16px;
      border-bottom: 1px solid #e2e8f0;
      background: #f8fafc;
      margin: 0;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12.5px;
    }
    th {
      background: #0f172a;
      color: #f8fafc;
      text-align: left;
      padding: 8px 12px;
      font-weight: 700;
      text-transform: uppercase;
      font-size: 11px;
      letter-spacing: 0.5px;
    }
    td {
      padding: 8px 12px;
      border-bottom: 1px solid #edf2f7;
      color: #334155;
    }
    tr:nth-child(even) td { background: #f8fafc; }
    
    /* Candidate Card */
    .student-card {
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 10px;
      margin-bottom: 14px;
      overflow: hidden;
      box-shadow: 0 2px 8px rgba(0,0,0,0.03);
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .student-card-header {
      background: linear-gradient(90deg, #0f172a 0%, #1e293b 100%);
      color: #fff;
      padding: 9px 14px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 6px;
    }
    .student-name-title {
      font-size: 14.5px;
      font-weight: 800;
      margin: 0;
      color: #fff;
      letter-spacing: 0.3px;
    }
    .student-badge-roll {
      background: #38bdf8;
      color: #0f172a;
      font-weight: 800;
      padding: 3px 10px;
      border-radius: 14px;
      font-size: 11.5px;
    }
    .student-meta-strip {
      background: #f8fafc;
      padding: 6px 14px;
      font-size: 12px;
      color: #475569;
      border-bottom: 1px solid #e2e8f0;
      display: flex;
      gap: 14px;
      flex-wrap: wrap;
    }
    
    /* Assessment Block */
    .assessment-item {
      padding: 10px 14px;
      border-bottom: 1px dashed #cbd5e1;
    }
    .assessment-item:last-child { border-bottom: none; }
    
    .assessment-header-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 6px;
      margin-bottom: 8px;
      padding-bottom: 6px;
      border-bottom: 1px solid #e2e8f0;
    }
    .assessment-title-text {
      font-size: 13.5px;
      font-weight: 800;
      color: #1e3a8a;
      margin: 0;
    }
    
    /* Score Pills */
    .score-pill-high {
      background: #dcfce7;
      color: #15803d;
      border: 1px solid #86efac;
      padding: 2px 8px;
      border-radius: 12px;
      font-weight: 800;
      font-size: 11.5px;
      display: inline-block;
    }
    .score-pill-mid {
      background: #eff6ff;
      color: #1d4ed8;
      border: 1px solid #bfdbfe;
      padding: 2px 8px;
      border-radius: 12px;
      font-weight: 800;
      font-size: 11.5px;
      display: inline-block;
    }
    .score-pill-low {
      background: #fee2e2;
      color: #b91c1c;
      border: 1px solid #fca5a5;
      padding: 2px 8px;
      border-radius: 12px;
      font-weight: 800;
      font-size: 11.5px;
      display: inline-block;
    }
    
    /* MCQ Item */
    .mcq-box {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 6px 10px;
      margin-bottom: 6px;
    }
    .mcq-q-title {
      font-weight: 700;
      color: #0f172a;
      font-size: 12.5px;
      margin-bottom: 4px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 6px;
    }
    .badge-correct {
      background: #dcfce7;
      color: #166534;
      font-weight: 700;
      font-size: 10.5px;
      padding: 1px 6px;
      border-radius: 4px;
      border: 1px solid #bbf7d0;
    }
    .badge-incorrect {
      background: #fee2e2;
      color: #991b1b;
      font-weight: 700;
      font-size: 10.5px;
      padding: 1px 6px;
      border-radius: 4px;
      border: 1px solid #fecaca;
    }
    .mcq-subtext {
      font-size: 11.5px;
      color: #475569;
      margin-bottom: 2px;
    }
    
    /* Code Box */
    .code-wrapper {
      background: #0f172a;
      border-radius: 6px;
      padding: 8px 12px;
      color: #f8fafc;
      font-family: 'Fira Code', Consolas, Monaco, monospace;
      font-size: 11px;
      line-height: 1.45;
      white-space: pre-wrap;
      word-break: break-word;
      border-left: 3px solid #38bdf8;
      margin-top: 4px;
      margin-bottom: 8px;
    }
    .prog-title {
      font-size: 12.5px;
      font-weight: 700;
      color: #1e293b;
      margin-top: 6px;
      margin-bottom: 2px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
  </style>
</head>
<body>
  <div class="top-action-bar no-print">
    <div>
      <span style="font-weight:800; font-size:14.5px; color:#38bdf8;">VMKVEC Placement Training Report</span>
      <span style="color:#cbd5e1; font-size:12.5px; margin-left:10px;">Formatted for Clean A4 PDF Export</span>
    </div>
    <div style="display:flex; gap:8px;">
      <button class="print-btn" onclick="window.print()">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
        Save as PDF / Print
      </button>
      <button class="print-btn" style="background:#334155;" onclick="window.close()">Close</button>
    </div>
  </div>

  <div class="report-header">
    <div class="college-name">Vinayaka Mission's Kirupananda Variyar Engineering College</div>
    <div class="dept-subtitle">Department of Computer Science &amp; Engineering &nbsp;·&nbsp; Placement Assessment System</div>
    <h1 style="margin:0 0 8px; font-size:18px; font-weight:800; color:#fff;">${esc(title)}</h1>
    <p style="margin:0 0 10px; font-size:12.5px; color:#e0e7ff;">${esc(subtitle)}</p>
    <div class="report-meta-grid">
      ${metaHtml}
    </div>
  </div>

  ${contentHtml}
</body>
</html>`;

  const win = window.open("", "_blank");
  if (!win) {
    alert("Please enable popups in your browser to download or view the PDF report.");
    return;
  }
  win.document.open();
  win.document.write(reportDoc);
  win.document.close();

  // Auto trigger print preview
  win.onload = function() {
    setTimeout(() => {
      try {
        win.focus();
        win.print();
      } catch (e) {
        console.warn("Print preview triggered:", e);
      }
    }, 400);
  };
}

function exportAttemptPDF(id) {
  const a = (typeof state !== 'undefined' && state.attempts) ? state.attempts.find(x => String(x.id) === String(id)) : null;
  if (!a) return;
  const st = (typeof state !== 'undefined' && state.students ? state.students.find(x => x.id === a.studentId) : null) || {};
  const rollNo = String(a.rollNumber ?? st.rollNumber ?? "-").trim();
  const studentName = String(a.studentName ?? st.name ?? a.username ?? "Student").trim();
  const dept = String(a.department ?? st.department ?? "CSE").trim();
  const yr = String(a.year ?? st.year ?? "4th Year").trim();
  const sid = String(a.studentId ?? st.id ?? "-").trim();
  const topicName = a.topic || (typeof curriculum !== 'undefined' && curriculum[a.day - 1] ? curriculum[a.day - 1][0] : `Day ${a.day} Assessment`);

  const metaHtml = `
    <div><b>Student:</b> ${esc(studentName)}</div>
    <div><b>Roll No:</b> ${esc(rollNo)}</div>
    <div><b>Dept:</b> ${esc(dept)} (${esc(yr)})</div>
    <div><b>Assessment:</b> Day ${a.day} — ${esc(topicName)}</div>
    <div><b>Score:</b> ${a.score}/${a.total || 5} (${a.percentage}%)</div>
    <div><b>Date:</b> ${esc(a.completedAtDisplay || a.date || "-")}</div>
  `;

  let contentHtml = `
    <div class="student-card">
      <div class="student-card-header">
        <h2 class="student-name-title">${esc(studentName.toUpperCase())}</h2>
        <span class="student-badge-roll">Roll No: ${esc(rollNo)}</span>
      </div>
      <div class="student-meta-strip">
        <span><b>Department:</b> ${esc(dept)}</span>
        <span><b>Year:</b> ${esc(yr)}</span>
        <span><b>Student ID:</b> ${esc(sid)}</span>
        <span><b>Attempt:</b> #${a.attemptNumber || 1}</span>
      </div>
      <div class="assessment-item">
        <div class="assessment-header-bar">
          <h3 class="assessment-title-text">Day ${a.day}: ${esc(topicName)}</h3>
          <div>${getScorePillHtml(a.percentage)}</div>
        </div>
        <h4 style="margin:12px 0 8px; font-size:13.5px; color:#1e3a8a;">1. MCQ Conceptual Evaluation</h4>
        ${getAttemptDetails(a).map(d => `
          <div class="mcq-box">
            <div class="mcq-q-title">
              <span>Q${d.number}: ${esc(d.question)}</span>
              <span class="${d.result === 'Correct' ? 'badge-correct' : 'badge-incorrect'}">${d.result === 'Correct' ? '✓ Correct' : '✗ Incorrect'}</span>
            </div>
            ${d.options && d.options.length ? `<div class="mcq-subtext"><b>Options:</b> ${esc(d.options.map((o, i) => "ABCD"[i] + ". " + o).join(" | "))}</div>` : ''}
            <div class="mcq-subtext"><b>Selected Answer:</b> <span style="color:${d.result === 'Correct' ? '#15803d' : '#b91c1c'}; font-weight:700;">${esc(d.answer)}</span></div>
            <div class="mcq-subtext"><b>Correct Answer:</b> <span style="color:#15803d; font-weight:700;">${esc(d.correct)}</span></div>
          </div>
        `).join("")}

        <h4 style="margin:20px 0 8px; font-size:13.5px; color:#1e3a8a;">2. Candidate Coding Submissions</h4>
        ${[1, 2, 3].map(n => {
          const sub = (typeof state !== 'undefined' && state.submissions ? state.submissions.find(x => x.studentId === a.studentId && x.day === a.day && x.problem === n && (x.attemptNumber || 1) === (a.attemptNumber || 1)) : null);
          const pPrompt = a["program" + n + "Prompt"] || sub?.prompt || (typeof CODING_BANK !== 'undefined' && CODING_BANK[a.day]?.[n - 1]) || `Program ${n}`;
          const pCode = a["program" + n] || sub?.code || "// No code saved";
          const pStatus = sub?.status || (a["program" + n] ? "Submitted" : "Not Provided");
          return `
            <div class="prog-title">
              <span><b>Challenge ${n}:</b> ${esc(pPrompt)}</span>
              <span class="badge-correct" style="background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe;">${esc(pStatus)}</span>
            </div>
            <div class="code-wrapper">${esc(pCode)}</div>
            ${sub?.feedback ? `<div class="mcq-subtext" style="color:#1e3a8a; margin-bottom:12px;"><b>Trainer Feedback:</b> ${esc(sub.feedback)}</div>` : ''}
          `;
        }).join("")}
      </div>
    </div>
  `;

  openColoredPDFReport(
    `${studentName} — Day ${a.day} Assessment Report`,
    `Individual Candidate Complete Assessment & Code Evaluation`,
    metaHtml,
    contentHtml
  );
}

function exportStudentPDF(id) {
  const currentId = id || (typeof state !== 'undefined' && state.user ? state.user.id : null);
  const st = (typeof state !== 'undefined' && state.students) ? (state.students.find(x => x.id === currentId) || state.user || {}) : (state.user || {});
  const rawAttempts = (typeof state !== 'undefined' && state.attempts) ? state.attempts : [];
  const aa = rawAttempts.filter(a => String(a.studentId) === String(currentId) || String(a.username) === String(st.username));
  if (!aa.length) {
    alert("No assessment records found to export for this student.");
    return;
  }
  const roll = st.rollNumber || st.username || currentId || 'student';
  exportAllRecordsPDF(aa, `${roll}_assessment_report.pdf`);
}

function exportAllRecordsPDF(customList, filename) {
  const rawList = customList || ((typeof state !== 'undefined' && state.attempts) ? state.attempts : []);
  if (!rawList || !rawList.length) {
    alert("No assessment records to export.");
    return;
  }

  // Group assessments uniquely per student by Roll Number, Name, Department
  const groupedStudents = new Map();

  rawList.forEach(a => {
    const st = (typeof state !== 'undefined' && state.students ? state.students.find(x => x.id === a.studentId) : null) || {};
    const rollNo = String(a.rollNumber ?? st.rollNumber ?? "").trim();
    const studentName = String(a.studentName ?? st.name ?? a.username ?? "Student").trim();
    const dept = String(a.department ?? st.department ?? "CSE").trim();
    const yr = String(a.year ?? st.year ?? "4th Year").trim();
    const sid = String(a.studentId ?? st.id ?? (rollNo || studentName)).trim();

    // Unique key: prioritize Roll Number, fallback to Name + Dept
    const key = rollNo ? `${rollNo.toUpperCase()}__${dept.toUpperCase()}` : `${studentName.toUpperCase()}__${dept.toUpperCase()}`;

    if (!groupedStudents.has(key)) {
      groupedStudents.set(key, {
        studentId: sid,
        studentName: studentName,
        rollNumber: rollNo || "-",
        department: dept,
        year: yr,
        assessments: []
      });
    }

    const studentGroup = groupedStudents.get(key);
    // Deduplicate duplicate assessment submissions for this student
    const isDup = studentGroup.assessments.some(existing => 
      String(existing.day) === String(a.day) && 
      String(existing.attemptNumber || 1) === String(a.attemptNumber || 1) &&
      (a.id && existing.id ? String(existing.id) === String(a.id) : true)
    );
    if (!isDup) {
      studentGroup.assessments.push(a);
    }
  });

  const metaHtml = `
    <div><b>Generated:</b> ${new Date().toLocaleDateString('en-GB')} ${new Date().toLocaleTimeString()}</div>
    <div><b>Total Unique Candidates:</b> ${groupedStudents.size}</div>
    <div><b>Total Assessments Stored:</b> ${rawList.length}</div>
    <div><b>Status:</b> Database Verified</div>
  `;

  // 1. Roster summary table
  let rosterRows = "";
  let counter = 1;
  groupedStudents.forEach(st => {
    const totalTests = st.assessments.length;
    const avgScore = totalTests ? Math.round(st.assessments.reduce((sum, x) => sum + Number(x.percentage || 0), 0) / totalTests) : 0;
    rosterRows += `
      <tr>
        <td style="font-weight:700;">${counter++}</td>
        <td><span class="student-badge-roll">${esc(st.rollNumber)}</span></td>
        <td style="font-weight:700; color:#0f172a;">${esc(st.studentName)}</td>
        <td>${esc(st.department)} · ${esc(st.year)}</td>
        <td><b>${totalTests}</b> Test${totalTests > 1 ? 's' : ''}</td>
        <td>${getScorePillHtml(avgScore)}</td>
      </tr>
    `;
  });

  const rosterTableHtml = `
    <div class="summary-table-wrap">
      <div class="table-title">
        <span>📋 Unique Candidates Assessment</span>
        <span style="font-size:12px; font-weight:600; color:#64748b;">${groupedStudents.size} Registered Candidates</span>
      </div>
      <table>
        <thead>
          <tr>
            <th style="width:40px;">#</th>
            <th>Roll Number</th>
            <th>Student Name</th>
            <th>Department &amp; Year</th>
            <th>Assessments</th>
            <th>Average Score</th>
          </tr>
        </thead>
        <tbody>
          ${rosterRows}
        </tbody>
      </table>
    </div>
  `;

  // 2. Candidate detailed sections
  let candidateCardsHtml = "";
  groupedStudents.forEach(st => {
    let assessmentsHtml = "";
    st.assessments.forEach((a, aIdx) => {
      const topicName = a.topic || (typeof curriculum !== 'undefined' && curriculum[a.day - 1] ? curriculum[a.day - 1][0] : `Assessment Day ${a.day}`);
      const mcqDetails = getAttemptDetails(a);

      assessmentsHtml += `
        <div class="assessment-item">
          <div class="assessment-header-bar">
            <div>
              <span class="assessment-title-text">[Test #${aIdx + 1}] Day ${a.day}: ${esc(topicName)}</span>
              <span style="color:#64748b; font-size:12px; margin-left:8px;">(Attempt #${a.attemptNumber || 1})</span>
            </div>
            <div style="display:flex; align-items:center; gap:10px;">
              <span style="font-size:12.5px; color:#475569;">⏱️ ${Math.ceil((a.completionSeconds || 0) / 60)} min &nbsp;|&nbsp; 📅 ${esc(a.completedAtDisplay || a.date || "-")}</span>
              ${getScorePillHtml(a.percentage)}
            </div>
          </div>

          <!-- MCQs -->
          <h4 style="margin:10px 0 6px; font-size:13px; color:#1e3a8a;">1. MCQ Responses &amp; Verification</h4>
          ${mcqDetails.map(d => `
            <div class="mcq-box">
              <div class="mcq-q-title">
                <span><b>Q${d.number}:</b> ${esc(d.question)}</span>
                <span class="${d.result === 'Correct' ? 'badge-correct' : 'badge-incorrect'}">${d.result === 'Correct' ? '✓ Correct' : '✗ Incorrect'}</span>
              </div>
              ${d.options && d.options.length ? `<div class="mcq-subtext"><b>Options:</b> ${esc(d.options.map((o, i) => "ABCD"[i] + ". " + o).join(" | "))}</div>` : ''}
              <div class="mcq-subtext"><b>Selected Answer:</b> <span style="color:${d.result === 'Correct' ? '#15803d' : '#b91c1c'}; font-weight:700;">${esc(d.answer)}</span> &nbsp;|&nbsp; <b>Correct:</b> <span style="color:#15803d; font-weight:700;">${esc(d.correct)}</span></div>
            </div>
          `).join("")}

          <!-- Coding Challenges -->
          <h4 style="margin:16px 0 6px; font-size:13px; color:#1e3a8a;">2. Candidate Coding Submissions (3 Programs)</h4>
          ${[1, 2, 3].map(n => {
            const sub = (typeof state !== 'undefined' && state.submissions ? state.submissions.find(x => x.studentId === a.studentId && x.day === a.day && x.problem === n && (x.attemptNumber || 1) === (a.attemptNumber || 1)) : null);
            const pPrompt = a["program" + n + "Prompt"] || sub?.prompt || (typeof CODING_BANK !== 'undefined' && CODING_BANK[a.day]?.[n - 1]) || `Program ${n}`;
            const pCode = a["program" + n] || sub?.code || "// No code saved";
            const pStatus = sub?.status || (a["program" + n] ? "Submitted" : "Not Provided");
            return `
              <div class="prog-title">
                <span><b>Challenge ${n}:</b> ${esc(pPrompt)}</span>
                <span class="badge-correct" style="background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe;">${esc(pStatus)}</span>
              </div>
              <div class="code-wrapper">${esc(pCode)}</div>
              ${sub?.feedback ? `<div class="mcq-subtext" style="color:#1e3a8a; margin-bottom:12px;"><b>Trainer Feedback:</b> ${esc(sub.feedback)}</div>` : ''}
            `;
          }).join("")}
        </div>
      `;
    });

    candidateCardsHtml += `
      <div class="student-card">
        <div class="student-card-header">
          <h3 class="student-name-title">${esc(st.studentName.toUpperCase())}</h3>
          <span class="student-badge-roll">Roll No: ${esc(st.rollNumber)}</span>
        </div>
        <div class="student-meta-strip">
          <span><b>Department:</b> ${esc(st.department)}</span>
          <span><b>Year:</b> ${esc(st.year)}</span>
          <span><b>Student ID:</b> ${esc(st.studentId)}</span>
          <span><b>Assessments Recorded:</b> ${st.assessments.length}</span>
        </div>
        ${assessmentsHtml}
      </div>
    `;
  });

  const fullContentHtml = `
    ${rosterTableHtml}
    <h2 style="font-size:15px; font-weight:800; color:#0f172a; margin:16px 0 10px;">Detailed Candidate Assessments &amp; Coding Logs</h2>
    ${candidateCardsHtml}
  `;

  openColoredPDFReport(
    "Central Assessment & Evaluation Records Report",
    "Complete placement assessment logs, conceptual MCQ review, and coding solutions.",
    metaHtml,
    fullContentHtml
  );
}


