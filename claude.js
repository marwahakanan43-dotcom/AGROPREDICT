const https = require('https');

async function callClaude(messages, systemPrompt, maxTokens = 800) {
  const GROQ_API_KEY = process.env.GROQ_API_KEY || 'dummy-key';

  const body = JSON.stringify({
    model: 'llama-3.1-8b-instant',
    max_tokens: maxTokens,
    temperature: 0.7,
    messages: [
      { role: 'system', content: systemPrompt || '' },
      ...messages
    ],
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.groq.com',
      path: '/openai/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: 15000,
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) return reject(new Error(parsed.error.message));
          const text = parsed.choices?.[0]?.message?.content || '';
          resolve(text);
        } catch (e) { reject(e); }
      });
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('AI response timed out. Please try again.')); });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

const AGRO_SYSTEM = `You are AgroPredict, an expert agricultural AI assistant specializing in Haryana, India farming.
You provide practical, concise advice for Indian farmers about crop management, disease control, market prices, irrigation, fertilizers, and yield improvement.
Always be specific, practical, and use Indian context (₹ for currency, Indian crop varieties, local pests/diseases, Haryana-specific conditions).
Keep responses clear, actionable, and structured. You can respond in Hindi or English based on the user's question.`;

module.exports = { callClaude, AGRO_SYSTEM };