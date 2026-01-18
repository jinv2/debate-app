const fs = require('fs');
const path = require('path');

// 1. 定义文件内容
const packageJson = {
  "name": "debate-smelter",
  "version": "1.0.0",
  "dependencies": { "openai": "^4.0.0" }
};

const netlifyToml = `[build]
  functions = "functions"
  publish = "public"
[dev]
  framework = "#static"
`;

const backendCode = `const OpenAI = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function callAgent(role, prompt, topic) {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{ role: "system", content: role }, { role: "user", content: "议题：" + topic }],
      temperature: 0.7,
    });
    return response.choices[0].message.content;
  } catch (error) { return "智能体离线或Key错误"; }
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };
  const { topic } = JSON.parse(event.body);
  if (!topic) return { statusCode: 400, body: "请输入议题" };

  const proTask = callAgent("激进的正方辩手，给3个强力论据，含小标题。", topic);
  const conTask = callAgent("批判的反方辩手，给3个反对论据，含小标题。", topic);
  const neuTask = callAgent('资深社会学家，严格JSON格式输出：{ "conflict_core": "", "questions": [], "controversy_score": 0 }', topic);

  try {
    const [pro, con, neu] = await Promise.all([proTask, conTask, neuTask]);
    let neuData = {};
    try { neuData = JSON.parse(neu.replace(/\\\`\\\`\\\`json|\\\`\\\`\\\`/g, '').trim()); } catch (e) { neuData = { conflict_core: "解析失败", controversy_score: 5 }; }
    return { statusCode: 200, body: JSON.stringify({ handbook: { pro, con }, report: neuData }) };
  } catch (e) { return { statusCode: 500, body: JSON.stringify({ error: "API Error" }) }; }
};
`;

const frontendCode = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>观点冶炼炉</title>
<style>
body{background:#0f172a;color:#e2e8f0;font-family:sans-serif;max-width:800px;margin:2rem auto;padding:1rem;}
.input-group{display:flex;gap:1rem;margin-bottom:2rem;}
input{flex:1;padding:1rem;background:#1e293b;border:1px solid #334155;color:white;}
button{padding:1rem 2rem;background:#3b82f6;color:white;border:none;cursor:pointer;}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-top:2rem;display:none;}
.card{background:#1e293b;padding:1rem;border-top:4px solid #3b82f6;}
.pro{border-color:#ef4444} .con{border-color:#3b82f6} .neu{grid-column:1/-1;border-color:#10b981}
pre{white-space:pre-wrap;}
</style>
</head>
<body>
<h1>观点冶炼炉</h1>
<div class="input-group"><input id="t" placeholder="输入议题..."><button id="btn" onclick="run()">冶炼</button></div>
<div id="loading" style="display:none;text-align:center">🔥 正在调度智能体...</div>
<div id="grid" class="grid">
 <div class="card pro"><h3>🔴 正方</h3><pre id="pro"></pre></div>
 <div class="card con"><h3>🔵 反方</h3><pre id="con"></pre></div>
 <div class="card neu"><h3>🟢 中立分析</h3><div id="neu"></div></div>
</div>
<script>
async function run(){
 const t=document.getElementById('t').value; if(!t)return;
 document.getElementById('btn').disabled=true;
 document.getElementById('loading').style.display='block';
 document.getElementById('grid').style.display='none';
 try{
  const res=await fetch('/.netlify/functions/smelter',{method:'POST',body:JSON.stringify({topic:t})});
  const d=await res.json();
  document.getElementById('pro').textContent=d.handbook.pro;
  document.getElementById('con').textContent=d.handbook.con;
  document.getElementById('neu').innerHTML='<strong>争议指数:</strong> '+d.report.controversy_score+'/10<br><strong>核心:</strong> '+d.report.conflict_core;
  document.getElementById('grid').style.display='grid';
 }catch(e){alert('错误')}
 finally{document.getElementById('btn').disabled=false;document.getElementById('loading').style.display='none';}
}
</script></body></html>
`;

// 2. 执行写入
['functions', 'public'].forEach(d => { if(!fs.existsSync(d)) fs.mkdirSync(d); });
fs.writeFileSync('package.json', JSON.stringify(packageJson, null, 2));
fs.writeFileSync('netlify.toml', netlifyToml);
fs.writeFileSync(path.join('functions', 'smelter.js'), backendCode);
fs.writeFileSync(path.join('public', 'index.html'), frontendCode);
console.log("✅ 文件生成成功！");
