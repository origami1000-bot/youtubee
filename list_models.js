const dotenv = require('dotenv');
dotenv.config();
const API_KEY = process.env.GOOGLE_AI_STUDIO_API_KEY;

async function run() {
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  console.log(JSON.stringify(data.models.filter(m => m.name.includes("imagen") || m.name.includes("generate")), null, 2));
}
run();
