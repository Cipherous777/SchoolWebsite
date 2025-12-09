// upload-teachers.js - RUN THIS ONCE ONLY

const admin = require('firebase-admin');
const serviceAccount = require('./firebase-key.json'); // same key you use in index.js

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// YOUR REAL TEACHERS LIST — 100% CORRECT
const teachers = {
  "1001": { name: "Mr. Gashaw", subject: "Mathematics", grades: ["9", "10", "11", "12"] },
  "1002": { name: "Ms. Stancy", subject: "English", grades: ["9", "10", "11", "12"] },
  "1003": { name: "Mr. Desalegn", subject: "Physics", grades: ["11", "12", "9", "10"] },
  "1004": { name: "Ms. Elias", subject: "Chemistry", grades: ["11", "12", "9", "10"] },
  "1005": { name: "Mr. Sisay", subject: "Biology", grades: ["11", "12", "9", "10"] },
  "1006": { name: "Mr. Gebeyaw", subject: "History, Citizenship", grades: ["9", "10", "11"] },
  "1007": { name: "Mr. Bereket", subject: "Economics, Agriculture", grades: ["9", "10", "11", "12"] },
  "1008": { name: "Mr. Nahom", subject: "ICT", grades: ["9", "10", "11", "12"] },
  "1009": { name: "Ms. Yeshwareg", subject: "Amharic", grades: ["9", "10"] },
  "1010": { name: "Mr. Solomon", subject: "Geography", grades: ["9", "10", "11"] }
};

async function uploadTeachers() {
  console.log("Starting teacher upload...\n");

  let uploaded = 0;
  const total = Object.keys(teachers).length;

  for (const [code, data] of Object.entries(teachers)) {
    try {
      await db.collection('teachers').doc(code).set({
        name: data.name.trim(),
        subject: data.subject.trim(),
        grades: data.grades.map(g => g.trim()).filter(g => g !== "") // clean empty strings
      });
      console.log(`Uploaded: ${data.name} → Code ${code}`);
      uploaded++;
    } catch (err) {
      console.error(`Failed ${code}:`, err.message);
    }
  }

  console.log("\nTEACHERS UPLOAD COMPLETE!");
  console.log(`Successfully uploaded: ${uploaded}/${total} teachers`);
  console.log("\nNow go to: http://localhost:7937/teacher-login");
  console.log("Test with code: 1002 → Ms. Stancy");
  process.exit();
}

uploadTeachers();