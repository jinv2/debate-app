const OpenAI = require('openai');

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
        neuData = JSON.parse(neu.replace(/\`\`\`json|\`\`\`/g, '').trim()); 
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
