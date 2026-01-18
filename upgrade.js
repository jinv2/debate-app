const fs = require('fs');
const path = require('path');

console.log("🛠️  正在升级为【客户自带 Key 模式】...");

// --- 新的后端代码 (不再依赖本地环境变量) ---
const newBackendCode = `const OpenAI = require('openai');

exports.handler = async (event) => {
  // 1. 跨域处理 (允许任何网站调用)
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: "Method Not Allowed" };
  }

  try {
    const { topic, clientKey } = JSON.parse(event.body);

    // 2. 检查客户是否填了 Key
    if (!clientKey || !clientKey.startsWith('sk-')) {
      return { 
        statusCode: 400, 
        headers,
        body: JSON.stringify({ error: "请提供有效的 OpenAI API Key (以 sk- 开头)" }) 
      };
    }

    if (!topic) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "请输入议题" }) };
    }

    // 3. 使用客户提供的 Key 初始化
    const openai = new OpenAI({ apiKey: clientKey });

    // 定义通用调用函数
    const callAgent = async (role, prompt) => {
      try {
        const response = await openai.chat.completions.create({
          model: "gpt-3.5-turbo",
          messages: [
            { role: "system", content: role },
            { role: "user", content: "议题：" + topic }
          ],
          temperature: 0.7,
        });
        return response.choices[0].message.content;
      } catch (error) {
        console.error("Agent Error:", error);
        throw error; // 抛出错误以便主流程捕获
      }
    };

    // 4. 并行触发智能体
    const [pro, con, neu] = await Promise.all([
      callAgent("激进的正方辩手，给3个强力论据，含小标题，不要开场白。", topic),
      callAgent("批判的反方辩手，给3个反对论据，含小标题，不要开场白。", topic),
      callAgent('资深社会学家，严格JSON格式输出：{ "conflict_core": "", "questions": [], "controversy_score": 0 }', topic)
    ]);

    // 5. 解析数据
    let neuData = {};
    try { 
        neuData = JSON.parse(neu.replace(/\\\`\\\`\\\`json|\\\`\\\`\\\`/g, '').trim()); 
    } catch (e) { 
        neuData = { conflict_core: "解析失败", controversy_score: 5 }; 
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ handbook: { pro, con }, report: neuData }),
    };

  } catch (error) {
    let msg = "智能体服务出错";
    if (error.status === 401) msg = "您的 API Key 无效或已过期";
    if (error.status === 429) msg = "您的 API Key 余额不足";
    return { statusCode: 500, headers, body: JSON.stringify({ error: msg }) };
  }
};
`;

// --- 新的前端代码 (增加 Key 输入框) ---
const newFrontendCode = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>观点冶炼炉 (Client Mode)</title>
<style>
body{background:#0f172a;color:#e2e8f0;font-family:sans-serif;max-width:800px;margin:2rem auto;padding:1rem;}
input, button { padding: 1rem; border-radius: 8px; border: 1px solid #334155; font-size: 1rem; }
input { background:#1e293b; color:white; width: 100%; box-sizing: border-box; margin-bottom: 1rem; }
.key-input { border-color: #f59e0b; }
button { background:#3b82f6; color:white; border:none; cursor:pointer; width: 100%; font-weight: bold; }
button:disabled { background: #475569; }
.grid{display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-top:2rem;display:none;}
.card{background:#1e293b;padding:1rem;border-top:4px solid #3b82f6;}
.pro{border-color:#ef4444} .con{border-color:#3b82f6} .neu{grid-column:1/-1;border-color:#10b981}
pre{white-space:pre-wrap;}
.error { color: #ef4444; text-align: center; margin-top: 1rem; display: none; background: rgba(239,68,68,0.1); padding: 0.5rem; }
</style>
</head>
<body>
<h1>🧠 深度辩论观点冶炼炉</h1>
<p style="color:#94a3b8; text-align:center">请输入您的 OpenAI Key 以开始使用</p>

<!-- 1. 新增 Key 输入框 -->
<input type="password" id="apiKey" class="key-input" placeholder="🔑 请在此粘贴您的 API Key (sk-...)" />

<!-- 议题输入 -->
<input type="text" id="topic" placeholder="💬 请输入争议议题，例如：AI 是否应该取代人类司机？" />

<button id="btn" onclick="run()">🚀 开始冶炼</button>

<div id="errorMsg" class="error"></div>
<div id="loading" style="display:none;text-align:center;margin-top:2rem">🔥 智能体正在激烈辩论中...</div>

<div id="grid" class="grid">
 <div class="card pro"><h3>🔴 正方论据</h3><pre id="pro"></pre></div>
 <div class="card con"><h3>🔵 反方论据</h3><pre id="con"></pre></div>
 <div class="card neu"><h3>🟢 中立分析</h3><div id="neu"></div></div>
</div>

<script>
async function run(){
 const k = document.getElementById('apiKey').value.trim();
 const t = document.getElementById('topic').value.trim();
 const errEl = document.getElementById('errorMsg');
 
 errEl.style.display = 'none';

 if(!k.startsWith('sk-')) {
    errEl.textContent = "❌ 请先输入有效的 OpenAI API Key (以 sk- 开头)";
    errEl.style.display = 'block';
    return;
 }
 if(!t) {
    errEl.textContent = "❌ 请输入议题";
    errEl.style.display = 'block';
    return;
 }

 document.getElementById('btn').disabled=true;
 document.getElementById('btn').innerText="冶炼中...";
 document.getElementById('loading').style.display='block';
 document.getElementById('grid').style.display='none';

 try{
  // 2. 将 Key 和 议题 一起发送给后端
  const res = await fetch('/.netlify/functions/smelter', {
      method: 'POST', 
      body: JSON.stringify({ topic: t, clientKey: k })
  });
  const d = await res.json();
  
  if(d.error) throw new Error(d.error);

  document.getElementById('pro').textContent=d.handbook.pro;
  document.getElementById('con').textContent=d.handbook.con;
  document.getElementById('neu').innerHTML='<strong>⚖️ 争议指数:</strong> '+d.report.controversy_score+'/10<br><strong>🔑 核心冲突:</strong> '+d.report.conflict_core;
  document.getElementById('grid').style.display='grid';
 } catch(e) {
  errEl.textContent = "⚠️ 错误: " + e.message;
  errEl.style.display = 'block';
 } finally {
  document.getElementById('btn').disabled=false;
  document.getElementById('btn').innerText="🚀 开始冶炼";
  document.getElementById('loading').style.display='none';
 }
}
</script></body></html>
`;

// 执行覆盖
fs.writeFileSync(path.join('functions', 'smelter.js'), newBackendCode);
fs.writeFileSync(path.join('public', 'index.html'), newFrontendCode);

console.log("✅ 升级完成！已切换为 BYOK (自带Key) 模式。");
