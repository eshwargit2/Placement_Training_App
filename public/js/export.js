// ==========================================================================
// VMKVEC CSE Placement Training - Excel & PDF Export Engine
// ==========================================================================

function getAttemptDetails(a) {
  const qs = QUESTION_BANK[a.day] || [];
  const details = a.mcqDetails && a.mcqDetails.length ? a.mcqDetails : qs.map((q, i) => ({
    number: i + 1,
    question: q[0],
    options: q.slice(1, 5),
    answer: "Not recorded",
    correct: q[5],
    result: "Not recorded"
  }));
  return details;
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
  const st = state.students.find(x => x.id === a.studentId) || {};
  const details = getAttemptDetails(a);
  const rows = [];
  details.forEach(d => rows.push([
    st.id,
    a.username,
    st.name || a.studentName,
    st.department || "",
    st.year || "",
    st.rollNumber || "",
    "Day " + a.day,
    "MCQ " + d.number,
    d.question,
    d.options.map((o, i) => "ABCD"[i] + ". " + o).join(" | "),
    d.answer,
    d.correct,
    d.result,
    a.attemptNumber || 1,
    a.score + "/" + a.total,
    a.percentage + "%",
    a.completedAtDisplay || a.date || "",
    Math.ceil((a.completionSeconds || 0) / 60),
    (a.strongAreas || []).join("; "),
    (a.weakAreas || []).join("; "),
    "", "", ""
  ]));
  [1, 2, 3].forEach(n => {
    const sub = state.submissions.find(x => x.studentId === a.studentId && x.day === a.day && x.problem === n && (x.attemptNumber || 1) === (a.attemptNumber || 1));
    rows.push([
      st.id,
      a.username,
      st.name || a.studentName,
      st.department || "",
      st.year || "",
      st.rollNumber || "",
      "Day " + a.day,
      "Program " + n,
      a["program" + n + "Prompt"] || sub?.prompt || CODING_BANK[a.day]?.[n - 1] || "",
      "",
      a["program" + n] || sub?.code || "",
      "",
      sub?.status || "Submitted",
      a.attemptNumber || 1,
      a.score + "/" + a.total,
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
  state.attempts.forEach(a => rows.push(...flattenAttemptRows(a)));
  downloadExcel("all_student_complete_assessment_records.xls", EXPORT_HEADERS, rows);
}

function exportStudentRecords(id) {
  const st = state.students.find(x => x.id === id);
  if (!st) return;
  const rows = [];
  state.attempts.filter(a => a.studentId === id).forEach(a => rows.push(...flattenAttemptRows(a)));
  downloadExcel((st.rollNumber || st.username) + "_complete_assessment_records.xls", EXPORT_HEADERS, rows);
}

function exportAttemptExcel(id) {
  const a = state.attempts.find(x => String(x.id) === String(id));
  if (!a) return;
  downloadExcel(`${a.username}_day${a.day}_attempt${a.attemptNumber || 1}_complete_record.xls`, EXPORT_HEADERS, flattenAttemptRows(a));
}

function exportDepartmentRecords(dept) {
  const rows = [["Student ID", "Username", "Name", "Department", "Year", "Roll No", "Assessments Completed", "Average %", "Strong Areas", "Weak Areas", "Status"]];
  state.students.filter(s => !dept || s.department === dept).forEach(st => {
    const aa = state.attempts.filter(a => a.studentId === st.id);
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

function attemptPDFLines(a) {
  const st = state.students.find(x => x.id === a.studentId) || {};
  const lines = [
    "PLACEMENT ASSESSMENT COMPLETE RECORD",
    "Student ID: " + st.id + " | Login: " + a.username + " | Name: " + (st.name || a.studentName || "-"),
    "Department: " + (st.department || "-") + " | Year: " + (st.year || "-") + " | Roll No: " + (st.rollNumber || "-"),
    "Day " + a.day + " - " + curriculum[a.day - 1][0] + " | Attempt " + (a.attemptNumber || 1),
    "Score: " + a.score + "/" + a.total + " (" + a.percentage + "%) | Date/Time: " + (a.completedAtDisplay || a.date || ""),
    "Time Used: " + Math.ceil((a.completionSeconds || 0) / 60) + " min | Strong: " + ((a.strongAreas || []).join(", ") || "None") + " | Weak: " + ((a.weakAreas || []).join(", ") || "None"),
    "",
    "MCQ QUESTIONS / ANSWERS"
  ];
  getAttemptDetails(a).forEach(d => {
    lines.push("Q" + d.number + ": " + d.question);
    lines.push("Options: " + d.options.map((o, i) => "ABCD"[i] + ". " + o).join(" | "));
    lines.push("Student: " + d.answer + " | Correct: " + d.correct + " | " + d.result);
    lines.push("");
  });
  lines.push("CODING PROGRAMS");
  [1, 2, 3].forEach(n => {
    const sub = state.submissions.find(x => x.studentId === a.studentId && x.day === a.day && x.problem === n && (x.attemptNumber || 1) === (a.attemptNumber || 1));
    lines.push("Program " + n + ": " + (a["program" + n + "Prompt"] || sub?.prompt || CODING_BANK[a.day]?.[n - 1] || ""));
    lines.push("Status: " + (sub?.status || "Submitted"));
    (a["program" + n] || sub?.code || "No code saved").split(/\r?\n/).forEach(x => lines.push("Code: " + x));
    if (sub?.feedback) lines.push("Trainer Feedback: " + sub.feedback);
    lines.push("");
  });
  return lines;
}

function exportAttemptPDF(id) {
  const a = state.attempts.find(x => String(x.id) === String(id));
  if (!a) return;
  makePDF(`${a.username}_day${a.day}_attempt${a.attemptNumber || 1}_complete_record.pdf`, attemptPDFLines(a));
}

function exportStudentPDF(id) {
  const st = state.students.find(x => x.id === id);
  if (!st) return;
  const aa = state.attempts.filter(a => a.studentId === id);
  let lines = [
    "PLACEMENT ASSESSMENT STUDENT REPORT",
    "Student ID: " + st.id + " | Login: " + st.username + " | Name: " + (st.name || "-"),
    "Department: " + (st.department || "-") + " | Year: " + (st.year || "-") + " | Roll No: " + (st.rollNumber || "-"),
    "Total Attempts: " + aa.length,
    "",
    "COMPLETE ASSESSMENT RECORDS"
  ];
  aa.forEach(a => lines.push(...attemptPDFLines(a), "============================================================"));
  makePDF((st.rollNumber || st.username) + "_complete_assessment_report.pdf", lines);
}

function exportAllRecordsPDF() {
  let lines = [
    "PLACEMENT ASSESSMENT - ALL STUDENT COMPLETE RECORDS",
    "Generated: " + new Date().toLocaleString(),
    ""
  ];
  state.attempts.forEach(a => lines.push(...attemptPDFLines(a), "============================================================"));
  makePDF("all_student_complete_assessment_records.pdf", lines);
}
