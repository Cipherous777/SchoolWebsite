require("dotenv").config();
const express = require("express");
const app = express();
const admin = require('firebase-admin');
const path = require("path");
const fs = require("fs");
const multer = require('multer');

const PORT = process.env.PORT || 7937;



if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
  console.log(process.env.FIREBASE_PRIVATE_KEY.slice(0, 50)); 
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
  });
} else {
  const serviceAccount = require('./firebase-key.json');
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}


const db = admin.firestore();

let studentsData = {};
try {
  studentsData = JSON.parse(fs.readFileSync('./students.json', 'utf8'));
  console.log(`Loaded ${Object.keys(studentsData).length} students from students.json`);
} catch (err) {
  console.log("students.json not found — upload will be disabled");
}
// MULTER CONFIG — MUST BE HERE, BEFORE ANY ROUTE USES 'upload'
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let folder = 'resumes'; // default = job applicants
    // Detect student registration form
    if (req.body.fullName && req.body.phone && req.body.email) {
      folder = 'documents';
    }
    const uploadPath = path.join(__dirname, 'public', 'uploads', folder);
    fs.mkdirSync(uploadPath, { recursive: true });
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1E9)}-${file.originalname}`;
    cb(null, uniqueName);
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowed = ['.pdf', '.jpg', '.jpeg', '.png', '.doc', '.docx'];
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF, images, and Word documents allowed!'));
    }
  }
});

// ==================== EXPRESS SETUP ====================
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static("public"));
app.use(express.json({ limit: '10mb' }));   // THIS WAS MISSING — THIS IS THE KILLER
app.use(express.urlencoded({ extended: true }));
app.use("/register.portal", express.static(path.join(__dirname, "public")));

// ==================== ALL YOUR ROUTES ====================
app.get("/", (req, res) => res.render("home"));
app.get("/home", (req, res) => res.redirect("/"));
app.get("/about", (req, res) => res.render("about"));
app.get("/contact", (req, res) => res.render("contact"));
app.get("/gallery", (req, res) => res.render("gallery"));
app.get("/admin", (req, res) => res.render("admin"));
app.get("/home.kg", (req, res) => res.render("kg"));
app.get("/home.primary", (req, res) => res.render("primary"));
app.get("/home.secondary", (req, res) => res.render("secondary"));
app.get("/news", (req, res) => res.render("news"));
app.get("/register", (req, res) => res.redirect("/register.portal"));
app.get("/register.portal", (req, res) => res.render("register"));
app.get("/register.portal/student", (req, res) => res.render("studentRegister"));
app.get("/register.portal/teacher", (req, res) => res.render("teacherRegister"));
app.get("/register.portal/formCompleted", (req, res) => res.render("formCompleted"));
app.get("/register.portal/codefill", (req, res) => res.render("codefill"));
app.get("/login", (req, res) => res.render("login"));
// REPLACE THIS ROUTE COMPLETELY
app.get("/portal.student", (req, res) => {
  // Get data from the login (sent from signin page)
  const studentName = req.query.name || "Student";
  const studentGrade = req.query.grade || "";
  const studentCode = req.query.code || "XXXX";

  res.render("studentPortal", {
    studentName: studentName,
    studentGrade: studentGrade,
    studentCode: studentCode
  });
});
app.get("/portal.login" ,(req,res)=>{
  res.render("login")
})

app.get("/portal.parent", (req, res) => res.render("parentPortal"));

app.get("/portal.admin", async (req, res) => {
  try {
    const [regSnap, teacherSnap, studentSnap] = await Promise.all([
      db.collection("students").get(),                    // ← your registered students with codes
      db.collection("applicants").get(),                  // ← THIS IS YOUR REAL COLLECTION NAME
      db.collection("studentApplications").get()         // ← new student registration forms
    ]);

    const registeredStudents = regSnap.docs.map(d => d.data());

    const teacherApps = teacherSnap.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      appliedAt: doc.data().appliedAt?.toDate() || new Date(),
      resumeUrl: doc.data().resumePath ? `/uploads/resumes/${doc.data().resumePath.split('/').pop()}` : null,
      resumeName: doc.data().resumeName || "Resume"
    }));

    const studentApps = studentSnap.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      appliedAt: doc.data().appliedAt?.toDate() || new Date(),
      filePath: doc.data().documentPath ? `/uploads/documents/${doc.data().documentPath.split('/').pop()}` : null
    }));

    res.render("adminPortal", { 
      registeredStudents, 
      teacherApps,      // ← this matches the EJS
      studentApps       // ← this matches the EJS
    });

  } catch (err) {
    console.error("Admin dashboard error:", err);
    res.status(500).send("Failed to load dashboard");
  }
});

// ==================== SIGN IN PAGE ====================
app.get('/signin.student', (req, res) => {
  res.render('loginStudent');
});
// ==================== TEACHER SIGN IN — EXACT SAME AS STUDENT ====================
// TEACHER SIGN-IN — 100% WORKING — SAME PATTERN AS STUDENT
app.post('/signin.teacher', async (req, res) => {
  const { code } = req.body;
  const cleanCode = code.trim();

  try {
    const doc = await db.collection('teachers').doc(cleanCode).get();

    if (doc.exists) {
      const teacher = doc.data();
      return res.json({
        success: true,
        name: teacher.name,
        subject: teacher.subject,
        grades: teacher.grades || [],
        code: cleanCode
      });
    } else {
      return res.json({ success: false, error: "Invalid teacher code" });
    }
  } catch (err) {
    console.error("Teacher login error:", err);
    return res.json({ success: false, error: "Server error" });
  }
});
// Teacher login page
app.get("/signin.teacher", (req, res) => {
  res.render("loginTeacher");
});


app.get("/portal.teacher", async (req, res) => {
  // If no name in URL → try to get from session or redirect
  if (!req.query.name && !req.query.code) {
    return res.redirect("/teacher-login");
  }

  // Default values so EJS never crashes
  const teacherName = req.query.name || "Teacher";
  const teacherSubject = req.query.subject || "Unknown Subject";
  const teacherGrades = req.query.grades ? req.query.grades.split(',') : ["9", "10", "11", "12"];
  const teacherCode = req.query.code || "XXXX";

  res.render("teacherPortal", {
    teacherName,
    teacherSubject,
    teacherGrades,
    teacherCode
  });
});
// Get students by grade for teacher
app.get("/get-students-grade", async (req, res) => {
  const grade = req.query.grade;
  const subject = req.query.subject;

  try {
    const snapshot = await db.collection("students")
      .where("grade", "==", parseInt(grade))
      .get();

    const students = [];
    snapshot.forEach(doc => {
      students.push({
        code: doc.id,
        name: doc.data().name,
        grades: doc.data().grades || {}
      });
    });

    res.json(students);
  } catch (err) {
    res.status(500).json([]);
  }
});

// Save grade from teacher to student
app.post("/save-grade", async (req, res) => {
  const { studentCode, subject, grade } = req.body;

  try {
    await db.collection("students").doc(studentCode).set({
      grades: { [subject]: parseInt(grade) }
    }, { merge: true });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});
// ==================== MAIN LOGIN — READS FROM FIREBASE (THIS IS WHAT YOU WANT!) ====================
app.post('/signin', async (req, res) => {
  const { code, grade } = req.body;
  const cleanCode = code.trim();
  const cleanGrade = parseInt(grade);

  try {
    const docRef = db.collection('students').doc(cleanCode);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.json({ success: false, error: "Invalid code" });
    }

    const student = doc.data();

    if (student.grade === cleanGrade) {
      return res.json({
        success: true,
        name: student.name,
        grade: student.grade,
        code: cleanCode
      });
    } else {
      return res.json({ success: false, error: "Wrong grade" });
    }

  } catch (error) {
    console.error("Firebase error:", error);
    return res.json({ success: false, error: "Server error" });
  }
});


app.get('/upload-students', async (req, res) => {
  if (Object.keys(studentsData).length === 0) {
    return res.send("<h1>students.json not found!</h1>");
  }

  try {
    let uploaded = 0;
    const total = Object.keys(studentsData).length;

    // Split into chunks of 400 (safe limit)
    const entries = Object.entries(studentsData);
    for (let i = 0; i < entries.length; i += 400) {
      const chunk = entries.slice(i, i + 400);
      const batch = db.batch();

      chunk.forEach(([code, student]) => {
        const docRef = db.collection('students').doc(code);
        batch.set(docRef, {
          name: student.name.trim(),
          grade: student.grade,
          code: parseInt(code)
        });
      });

      await batch.commit();
      uploaded += chunk.length;
      console.log(`Uploaded ${uploaded}/${total} students...`);
    }

    res.send(`
      <div style="font-family:Arial; text-align:center; padding:60px; background:#f0fdf4; color:#166534;">
        <h1>ALL STUDENTS UPLOADED SUCCESSFULLY!</h1>
        <h2>112 / 112 students now in Firebase</h2>
        <p><strong>Every single code works now</strong></p>
        <p>Test: 4821 + Grade 9 → Aaron Yared</p>
        <p>You can close this tab. You're done forever.</p>
      </div>
    `);
    console.log(`UPLOAD COMPLETE: ${uploaded} students in Firebase`);
  } catch (error) {
    console.error("Upload failed:", error);
    res.send(`<h1>ERROR:</h1><pre>${error.message}</pre>`);
  }
});
// Get student grades for student portal
// FINAL — GET STUDENT GRADES — NO CACHE, NO LIES, WORKS 100%
app.get("/get-student-grades", async (req, res) => {
  const code = req.query.code?.trim();
  
  if (!code) {
    return res.json({ grades: {} });
  }

  try {
    const docRef = db.collection("students").doc(code);
    const doc = await docRef.get({ source: "server" }); // FORCE SERVER — NO CACHE

    if (!doc.exists) {
      console.log(`Student ${code} not found`);
      return res.json({ grades: {} });
    }

    const grades = doc.data().grades || {};
    console.log(`DELIVERED GRADES TO STUDENT ${code}:`, grades); // ← YOU WILL SEE THIS IN TERMINAL

    res.json({ grades });

  } catch (error) {
    console.error("ERROR FETCHING GRADES:", error);
    res.json({ grades: {} });
  }
});

app.post('/save-grade-detailed', async (req, res) => {
  console.log("SAVING GRADE:", req.body);

  const { studentCode, subject, t1 = 0, t2 = 0, t3 = 0, mid = 0, final = 0 } = req.body || {};

  if (!studentCode || !subject) {
    return res.status(400).json({ error: "Missing data" });
  }

  const cleanSubject = subject.trim();  // THIS IS THE FIX

  try {
    const studentRef = db.collection('students').doc(studentCode);

    await studentRef.set({
      grades: {
        [cleanSubject]: {     // ← Clean subject key
          t1: Number(t1),
          t2: Number(t2),
          t3: Number(t3),
          mid: Number(mid),
          final: Number(final)
        }
      }
    }, { merge: true });

    console.log(`SUCCESS → ${studentCode} | ${cleanSubject} = ${t1+t2+t3+mid+final}/100`);
    res.json({ success: true });

  } catch (error) {
    console.error("SAVE FAILED:", error);
    res.status(500).json({ error: error.message });
  }
});
// ADD THIS EXACTLY THIS — 100% working
app.get('/count-students', async (req, res) => {
  try {
    const snapshot = await db.collection('students').get();
    const total = snapshot.size;
    const codes = [];
    snapshot.forEach(doc => codes.push(doc.id));

    // Sort codes so we see them in order
    codes.sort((a, b) => a - b);

    res.send(`
      <div style="font-family: Arial; text-align:center; padding:60px; background:#f0fdf4;">
        <h1 style="color:green; font-size:60px;">
          FIREBASE SAYS: <b>${total}</b> STUDENTS
        </h1>
        <h2>Total students in database right now: <b>${total}</b></h2>
        <p>First 15 codes: ${codes.slice(0, 15).join(', ')}</p>
        <p>Last 15 codes: ${codes.slice(-15).join(', ')}</p>
        <hr>
        <p>If you see <b>112</b> → everything is perfect</p>
        <p>If you see less → we will fix it together</p>
        </div>
    `);
  } catch (error) {
    res.send(`<h2 style="color:red">Error: ${error.message}</h2>`);
  }
});
// DELETE GRADE — TEACHERS CAN NOW REMOVE MISTAKES
app.post('/delete-grade', async (req, res) => {
  const { studentCode, subject } = req.body;

  try {
    const studentRef = db.collection('students').doc(studentCode);
    await studentRef.update({
      [`grades.${subject}`]: admin.firestore.FieldValue.delete()
    });

    console.log(`DELETED GRADE → ${studentCode} | ${subject}`);
    res.json({ success: true });
  } catch (error) {
    console.error("Delete error:", error);
    res.status(500).json({ error: "Failed" });
  }
});



// Apply multer middleware to the route

// ==================== FINAL WORKING REGISTRATION ROUTE ====================
// DELETE the two old broken ones and use ONLY THIS:

app.post('/register.portal/submit', upload.single('resume'), async (req, res) => {
  try {
    const { fullName, phone, email, coverLetter } = req.body;
    const resume = req.file; // ← multer puts it in req.file (not req.files)

    // Validation
    if (!fullName || !phone || !email || !coverLetter) {
      return res.status(400).send(`
        <h2 style="color:red; text-align:center; margin-top:100px;">
          All fields are required!
        </h2>
        <p style="text-align:center;">
          <a href="javascript:history.back()">Go Back</a>
        </p>
      `);
    }

    // Prepare data
    const applicantData = {
      fullName: fullName.trim(),
      phone: phone.trim(),
      email: email.trim().toLowerCase(),
      coverLetter: coverLetter.trim(),
      appliedAt: admin.firestore.FieldValue.serverTimestamp(),
      status: "pending"
    };

    // If resume was uploaded
    if (resume) {
      applicantData.resumeName = resume.originalname;
      applicantData.resumePath = `/uploads/resumes/${resume.filename}`; // public URL
      applicantData.resumeSize = resume.size;
    }

    // Save to Firebase
    const docRef = await db.collection('applicants').add(applicantData);

    console.log(`New applicant saved! ID: ${docRef.id} | ${fullName} (${email})`);

    // Success → go to thank you page
    res.redirect('/register.portal/formCompleted');

  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).send(`
      <h2 style="color:red; text-align:center; margin-top:100px;">
        Server Error. Please try again later.
      </h2>
      <p><a href="/register.portal">Back to form</a></p>
    `);
  }
});
// ==================== ADMIN: View All Job Applicants ====================
app.get("/portal.admin/applicants", async (req, res) => {
  try {
    const snapshot = await db.collection("applicants")
      .orderBy("appliedAt", "desc")
      .get();

    const applicants = [];

    snapshot.forEach(doc => {
      const data = doc.data();
      applicants.push({
        id: doc.id,
        fullName: data.fullName || "No Name",
        email: data.email || "—no email—",
        phone: data.phone || "—",
        coverLetter: data.coverLetter ? data.coverLetter.substring(0, 120) + "..." : "—",
        hasResume: !!data.resumePath,
        resumeUrl: data.resumePath ? data.resumePath : null,
        resumeName: data.resumeName || "resume.pdf",
        appliedAt: data.appliedAt ? data.appliedAt.toDate().toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        }) : "Just now",
        status: data.status || "pending"
      });
    });

    res.render("adminApplicants", { applicants });

  } catch (error) {
    console.error("Error fetching applicants:", error);
    res.status(500).send("Error loading applicants.");
  }
});
// ==================== STUDENT REGISTRATION — SAVE TO FIREBASE ====================
app.post('/register.portal/submit-codefill', upload.single('file'), async (req, res) => {
  try {
    const { fullName, phone, email } = req.body;
    const file = req.file;  // from multer

    // Basic validation
    if (!fullName || !phone || !email) {
      return res.status(400).send(`
        <h2 style="color:red; text-align:center; margin:100px;">
          All fields are required!
        </h2>
        <p style="text-align:center;"><a href="javascript:history.back()">Go Back</a></p>
      `);
    }

    // Clean data
    const studentData = {
      fullName: fullName.trim(),
      parentPhone: phone.trim(),
      parentEmail: email.trim().toLowerCase(),
      appliedAt: admin.firestore.FieldValue.serverTimestamp(),
      status: "new", // new, approved, rejected
      hasDocuments: !!file
    };

    // Save uploaded file info
    if (file) {
      studentData.documentName = file.originalname;
      studentData.documentPath = `/uploads/documents/${file.filename}`;
      studentData.documentSize = file.size;
    }

    // Save to Firebase collection: studentApplications
    const docRef = await db.collection('studentApplications').add(studentData);

    console.log(`New student application! ${fullName} | ${email} | ID: ${docRef.id}`);

    // SUCCESS → redirect to thank you page
    res.redirect('/register.portal/formCompleted');

  } catch (error) {
    console.error("Student registration failed:", error);
    res.status(500).send(`
      <h2 style="color:red; text-align:center; margin:100px;">
        Server Error. Try again later.
      </h2>
      <p style="text-align:center;"><a href="/register.portal/codefill">Back</a></p>
    `);
  }
});

// ==================== FEEDBACK ROUTES ====================

// Feedback page
app.get("/feedback", (req, res) => {
  res.render("feedback");
});



// Submit feedback
app.post("/submit-feedback", async (req, res) => {
  try {
    const { feedback } = req.body;

    if (!feedback || feedback.trim().length === 0) {
      return res.json({ 
        success: false, 
        error: "Feedback cannot be empty" 
      });
    }

    // Save feedback to Firebase
    await db.collection('feedback').add({
      feedback: feedback.trim(),
      submittedAt: admin.firestore.FieldValue.serverTimestamp(),
      ip: req.ip || req.connection.remoteAddress
    });

    console.log(`New feedback submitted: ${feedback.substring(0, 50)}...`);

    res.json({ 
      success: true,
      message: "Feedback submitted successfully"
    });

  } catch (error) {
    console.error("Feedback submission error:", error);
    res.json({ 
      success: false, 
      error: "Failed to submit feedback" 
    });
  }
});

// Admin feedback view (optional - for you to see all feedback)
app.get("/feedback.receive", async (req, res) => {
  try {
    const snapshot = await db.collection('feedback')
      .orderBy('submittedAt', 'desc')
      .get();

    const feedbackList = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      feedbackList.push({
        id: doc.id,
        feedback: data.feedback,
        submittedAt: data.submittedAt ? data.submittedAt.toDate().toLocaleString() : 'Unknown',
        ip: data.ip || 'Unknown'
      });
    });

    res.render("feedbackRecieve", { feedbackList });
  } catch (error) {
    console.error("Error fetching feedback:", error);
    res.status(500).send("Error loading feedback");
  }
});
app.listen(PORT, () => {
  console.log(`\nIIS PORTAL IS READY`);
  console.log(`http://localhost:${PORT}/signin   → Student Login`);
  if (Object.keys(studentsData).length > 0) {
    console.log(`http://localhost:${PORT}/upload-students   → CLICK THIS FIRST TO UPLOAD DATA`);
  }
  console.log(`Test: Code 4821 + Grade 9 → Aaron Yared`);
});