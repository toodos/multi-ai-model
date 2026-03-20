require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json({ limit: "20mb" }));
app.use(express.static(path.join(__dirname, "public")));
app.use("/assets", express.static(path.join(__dirname, "assets")));

const GROQ_KEY = process.env.GROQ_KEY;
const GEMINI_KEY = process.env.GEMINI_KEY;
const OPENROUTER_KEY = process.env.OPENROUTER_KEY;
const POLLINATION_KEY = process.env.POLLINATION_KEY;
const PORT = process.env.PORT || 3000;

const GROQ_BASE = "https://api.groq.com/openai/v1";
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
const POLLINATION_BASE = process.env.POLLINATION_BASE || "https://api.pollination.ai";

// Validate API keys at startup
if (!GROQ_KEY) {
  console.error("❌ GROQ_KEY not set in .env file");
  process.exit(1);
}
if (!GEMINI_KEY) {
  console.warn("⚠️  GEMINI_KEY not set - Gemini models will be unavailable");
}
if (!OPENROUTER_KEY) {
  console.warn("⚠️  OPENROUTER_KEY not set - OpenRouter models will be unavailable");
}
if (!POLLINATION_KEY) {
  console.warn("⚠️  POLLINATION_KEY not set - Pollination models will be unavailable");
}

console.log("🔑 Groq key:", GROQ_KEY && GROQ_KEY !== "your_groq_key_here" ? GROQ_KEY.slice(0, 12) + "..." : "NOT SET");
console.log("🔑 Gemini key:", GEMINI_KEY && GEMINI_KEY !== "your_gemini_key_here" ? GEMINI_KEY.slice(0, 12) + "..." : "NOT SET");
console.log("🔑 OpenRouter key:", OPENROUTER_KEY && OPENROUTER_KEY !== "your_openrouter_key_here" ? OPENROUTER_KEY.slice(0, 12) + "..." : "NOT SET");

// Determine if model is Gemini or Groq
function isGeminiModel(model) {
  return model.includes("gemini");
}

const OPENROUTER_MODELS = [
  "qwen/qwen3-coder:free",
  "deepseek/deepseek-r1",
  "mistralai/mistral-small-3.1-24b-instruct:free",
  "stepfun/step-3.5-flash:free",
  "z-ai/glm-4.5-air:free",
  "meta-llama/llama-3.3-70b-instruct:free",
  "nvidia/nemotron-nano-12b-v2-vl:free"
];

function isOpenRouterModel(model) {
  return OPENROUTER_MODELS.includes(model);
}

const POLLINATION_MODELS = [
  'pollination/flux-schnell',
  'pollination/amazon-nova-micro',
  'pollination/perplexity-sonar',
  'pollination/deepseek-v3.2',
  'pollination/claude-haiku-4.5',
  'pollination/openai',
  'pollination/openai-fast',
  'pollination/openai-large',
  'pollination/qwen-coder',
  'pollination/mistral',
  'pollination/grok',
  'pollination/gemini',
  'pollination/gemini-fast',
  'pollination/nova',
  'pollination/nova-micro',
  'pollination/minimax',
  'pollination/kimi',
  'pollination/step-3.5-flash',
  'pollination/midijourney',
  'pollination/polly',
  'pollination/nomnom',
  'pollination/qwen-character'
];

// Explicit overrides mapping our internal pollination/... ids to Pollinations' model ids
const POLLINATION_ALIAS_OVERRIDES = {
  'flux-schnell': 'flux',
  'amazon-nova-micro': 'nova-fast',
  'perplexity-sonar': 'perplexity-fast',
  'deepseek-v3.2': 'deepseek',
  'claude-haiku-4.5': 'claude-fast',
  'openai': 'openai',
  'openai-fast': 'openai-fast',
  'openai-large': 'openai-large',
  'qwen-coder': 'qwen-coder',
  'mistral': 'mistral',
  'grok': 'grok',
  'gemini': 'gemini',
  'gemini-fast': 'gemini-fast',
  'nova': 'nova-fast',
  'nova-micro': 'nova-fast',
  'minimax': 'minimax',
  'kimi': 'kimi',
  'step-3.5-flash': 'step-3.5-flash',
  'midijourney': 'midijourney',
  'polly': 'polly',
  'nomnom': 'nomnom',
  'qwen-character': 'qwen-character'
};

function isPollinationModel(model) {
  // Only treat as Pollination model if the API key is configured
  return POLLINATION_KEY && POLLINATION_MODELS.includes(model);
}

const GROQ_MODELS = [
  "llama-3.1-8b-instant",
  "qwen/qwen3-32b",
  "llama-3.3-70b-versatile",
  "llama-4-scout-17b-16e-instruct",
  "llama-4-maverick-17b-128e-instruct",
  "moonshotai/kimi-k2-instruct",
  "mistral-saba-24b",
  "gemma2-9b-it",
  "compound-beta",
  "compound-beta-mini"
];
const GEMINI_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite"
];
const TEXT_MODELS = [...GROQ_MODELS, ...GEMINI_MODELS, ...POLLINATION_MODELS];

// Analyze input to select best model
function selectModel(messages, system) {
  const allText = (system || "") + " " + messages.map(m => m.content || "").join(" ");
  const length = allText.length;
  const hasCode = /```|\bcode\b|function|class|import|const |let |var |coding|algorithm/i.test(allText);
  const hasVision = /image|photo|picture|visual|chart|diagram|screenshot|vision/i.test(allText);
  const hasCreative = /story|poem|creative|write|compose|imagine|describe/i.test(allText);
  const hasWeb = /news|today|current|latest|weather|search|what.*is|trending/i.test(allText);
  const hasTechnical = /debug|error|fix|issue|bug|solve|design|architecture|algorithm/i.test(allText);
  const isComplex = /step|explain|analyze|compare|system design|deep dive|multi.*step|reasoning/i.test(allText);
  const isSimple = !hasCode && !hasTechnical && length < 150;

  // Select appropriate Gemini model if available
  if (GEMINI_KEY) {
    if (isSimple) return "gemini-2.5-flash-lite";
    if (isComplex) return "gemini-2.5-flash";
    if (hasCode || hasTechnical) return "gemini-2.5-flash";
    return "gemini-2.5-flash";
  }

  // Select appropriate Groq model
  if (isSimple) return "llama-3.1-8b-instant";
  if (hasVision) return "llama-4-scout-17b-16e-instruct";
  if (hasCreative) return "llama-4-maverick-17b-128e-instruct";
  if (hasWeb) return "compound-beta";
  if (hasCode || hasTechnical) return "qwen/qwen3-32b";
  if (isComplex) return "llama-3.3-70b-versatile";
  return "qwen/qwen3-32b"; // Default
}

// Get fallback chain for model selection
function getModelFallbackChain(selectedModel) {
  if (isOpenRouterModel(selectedModel)) {
    return Array.from(new Set([
      selectedModel,
      ...OPENROUTER_MODELS.filter(model => model !== selectedModel),
      ...GROQ_MODELS
    ]));
  }

  if (isPollinationModel(selectedModel)) {
    return Array.from(new Set([
      selectedModel,
      ...POLLINATION_MODELS.filter(model => model !== selectedModel),
      ...GROQ_MODELS
    ]));
  }

  // Gemini fallback chain
  if (isGeminiModel(selectedModel)) {
    const geminiChain = {
      "gemini-2.5-flash": ["gemini-2.5-flash", "gemini-2.5-flash-lite"],
      "gemini-2.5-flash-lite": ["gemini-2.5-flash-lite", "gemini-2.5-flash"]
    };
    return geminiChain[selectedModel] || GEMINI_MODELS;
  }

  // Groq fallback chain
  const groqChain = {
    "llama-3.1-8b-instant": ["llama-3.1-8b-instant", "mistral-saba-24b", "qwen/qwen3-32b", "llama-3.3-70b-versatile"],
    "qwen/qwen3-32b": ["qwen/qwen3-32b", "llama-3.3-70b-versatile", "gemma2-9b-it", "llama-3.1-8b-instant"],
    "llama-3.3-70b-versatile": ["llama-3.3-70b-versatile", "qwen/qwen3-32b", "llama-4-maverick-17b-128e-instruct"],
    "llama-4-scout-17b-16e-instruct": ["llama-4-scout-17b-16e-instruct", "llama-3.3-70b-versatile", "llama-4-maverick-17b-128e-instruct"],
    "llama-4-maverick-17b-128e-instruct": ["llama-4-maverick-17b-128e-instruct", "llama-3.3-70b-versatile", "qwen/qwen3-32b"],
    "moonshotai/kimi-k2-instruct": ["moonshotai/kimi-k2-instruct", "qwen/qwen3-32b", "llama-3.3-70b-versatile"],
    "mistral-saba-24b": ["mistral-saba-24b", "qwen/qwen3-32b", "llama-3.1-8b-instant"],
    "gemma2-9b-it": ["gemma2-9b-it", "qwen/qwen3-32b", "llama-3.1-8b-instant"],
    "compound-beta": ["compound-beta", "compound-beta-mini", "qwen/qwen3-32b"],
    "compound-beta-mini": ["compound-beta-mini", "compound-beta", "qwen/qwen3-32b"]
  };
  return groqChain[selectedModel] || GROQ_MODELS;
}

// Call appropriate API based on model type
async function callChatAPI(model, body) {
  if (isGeminiModel(model)) {
    return callGeminiAPI(model, body);
  } else if (isOpenRouterModel(model)) {
    return callOpenRouterAPI(model, body);
  } else if (isPollinationModel(model)) {
    return callPollinationAPI(model, body);
  } else {
    return callGroqAPI(model, body);
  }
}

// Call Groq API
async function callGroqAPI(model, body) {
  // Groq supports system role, add it to messages array
  const messages = [];
  if (body.system) {
    messages.push({ role: "system", content: body.system });
  }
  messages.push(...body.messages);

  const requestBody = {
    model: body.model,
    messages: messages,
    temperature: body.temperature,
    max_tokens: body.max_tokens
  };

  // Enable reasoning for supported models
  if (model === 'qwen/qwen3-32b') {
    requestBody.reasoning_format = 'raw';
  }

  return await fetch(`${GROQ_BASE}/chat/completions`, {
    method: "POST",
    headers: { 
      "Content-Type": "application/json",
      "Authorization": `Bearer ${GROQ_KEY}`
    },
    body: JSON.stringify(requestBody)
  });
}

// Call OpenRouter API
async function callOpenRouterAPI(model, body) {
  const messages = [];
  if (body.system) {
    messages.push({ role: "system", content: body.system });
  }
  messages.push(...body.messages);

  const requestBody = {
    model: body.model,
    messages: messages,
    temperature: body.temperature,
    max_tokens: body.max_tokens
  };

  if (!OPENROUTER_KEY) {
    throw new Error("OPENROUTER_KEY is not configured");
  }

  return await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${OPENROUTER_KEY}`,
      "HTTP-Referer": `http://localhost:${PORT}`,
      "X-Title": "Oakawol AI"
    },
    body: JSON.stringify(requestBody)
  });
}

// Call Gemini API
async function callGeminiAPI(model, body) {
  // Gemini doesn't support system role, so prepend to first user message
  const messages = body.messages;
  let contents;
  
  if (body.system) {
    // Find first user message and prepend system prompt
    const firstUserIdx = messages.findIndex(m => m.role === "user");
    if (firstUserIdx !== -1) {
      const newMessages = [...messages];
      newMessages[firstUserIdx] = {
        ...newMessages[firstUserIdx],
        content: `${body.system}\n\n${newMessages[firstUserIdx].content}`
      };
      contents = newMessages.map(msg => ({
        role: msg.role === "user" ? "user" : "model",
        parts: [{ text: msg.content }]
      }));
    } else {
      // No user message, prepend system as user message
      contents = [
        { role: "user", parts: [{ text: body.system }] },
        ...messages.map(msg => ({
          role: msg.role === "user" ? "user" : "model",
          parts: [{ text: msg.content }]
        }))
      ];
    }
  } else {
    contents = messages.map(msg => ({
      role: msg.role === "user" ? "user" : "model",
      parts: [{ text: msg.content }]
    }));
  }

  const geminiBody = {
    contents: contents,
    generationConfig: {
      temperature: body.temperature,
      maxOutputTokens: body.max_tokens
    }
  };

  return await fetch(`${GEMINI_BASE}/${model}:generateContent?key=${GEMINI_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(geminiBody)
  });
}

// Transform Gemini response to OpenAI format
function transformGeminiResponse(geminiData) {
  // Handle empty or malformed response
  if (!geminiData.candidates || geminiData.candidates.length === 0) {
    return {
      choices: [{
        message: {
          role: "assistant",
          content: "No response generated"
        },
        finish_reason: "error"
      }],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
    };
  }

  const firstContent = geminiData.candidates[0]?.content?.parts?.[0]?.text || "";
  if (!firstContent) {
    return {
      choices: [{
        message: {
          role: "assistant",
          content: "Empty response from model"
        },
        finish_reason: "error"
      }],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
    };
  }

  return {
    choices: [{
      message: {
        role: "assistant",
        content: firstContent
      },
      finish_reason: geminiData.candidates[0]?.finishReason || "stop"
    }],
    usage: {
      prompt_tokens: geminiData.usageMetadata?.promptTokenCount || 0,
      completion_tokens: geminiData.usageMetadata?.candidatesTokenCount || 0,
      total_tokens: geminiData.usageMetadata?.totalTokenCount || 0
    }
  };
}

function extractOpenRouterThinking(message) {
  if (!message) {
    return "";
  }

  if (typeof message.reasoning === "string" && message.reasoning.trim()) {
    return message.reasoning.trim();
  }

  const reasoningDetails = message.reasoning_details;
  if (Array.isArray(reasoningDetails)) {
    const text = reasoningDetails
      .map(detail => detail?.text || detail?.reasoning || "")
      .filter(Boolean)
      .join("\n");
    if (text.trim()) {
      return text.trim();
    }
  }

  return "";
}

// Transform OpenRouter response to OpenAI format
function transformOpenRouterResponse(openRouterData) {
  const firstChoice = openRouterData?.choices?.[0];
  const message = firstChoice?.message || {};
  const reasoning = extractOpenRouterThinking(message);
  const content = typeof message.content === "string" ? message.content.trim() : "";

  if (!content && !reasoning) {
    return {
      choices: [{
        message: {
          role: "assistant",
          content: "Empty response from model"
        },
        finish_reason: firstChoice?.finish_reason || "error"
      }],
      usage: openRouterData?.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
    };
  }

  const combinedContent = reasoning
    ? content
      ? `<think>${reasoning}</think>\n\n${content}`
      : `<think>${reasoning}</think>`
    : content;

  return {
    ...openRouterData,
    choices: [{
      ...firstChoice,
      message: {
        ...message,
        role: "assistant",
        content: combinedContent
      }
    }]
  };
}

// Call Pollination API (OpenAI-compatible chat completions)
async function callPollinationAPI(model, body) {
  if (!POLLINATION_KEY) {
    throw new Error("POLLINATION_KEY is not configured");
  }

  // Lazy-load Pollinations model list (no auth required for model discovery)
  if (!global.POLL_MODEL_INDEX) {
    try {
      const metaUrl = `${POLLINATION_BASE.replace(/\/$/, '')}/v1/models`;
      console.log(`📡 Fetching Pollinations model list -> ${metaUrl}`);
      const r = await fetch(metaUrl);
      const json = await r.json();
      const index = {};
      if (Array.isArray(json.data)) {
        for (const m of json.data) {
          // primary id
          if (m.id) index[m.id] = { id: m.id, aliases: m.aliases || [] };
          // aliases
          if (Array.isArray(m.aliases)) {
            for (const a of m.aliases) index[a] = { id: m.id, aliases: m.aliases };
          }
        }
      } else if (Array.isArray(json)) {
        for (const m of json) {
          const id = m.name || m.id;
          if (!id) continue;
          index[id] = { id, aliases: m.aliases || [] };
          if (Array.isArray(m.aliases)) {
            for (const a of m.aliases) index[a] = { id, aliases: m.aliases };
          }
        }
      }
      global.POLL_MODEL_INDEX = index;
      try{ fs.appendFileSync('poll_response.log', `${new Date().toISOString()} POLL_MODELS_LOADED count=${Object.keys(index).length}\n`); }catch(e){}
    } catch (e) {
      console.warn('⚠️ Failed to fetch Pollinations model list:', e && e.message);
      global.POLL_MODEL_INDEX = {};
    }
  }

  // Resolve model alias: allow our internal names like 'pollination/amazon-nova-micro'
  let desired = body.model || model || '';
  // strip optional prefix
  if (desired.startsWith('pollination/')) desired = desired.replace(/^pollination\//, '');

  // Try explicit overrides first (map internal names to Pollinations ids)
  const shortDesired = desired.replace(/^pollination\//, '');
  let resolved = null;
  if (POLLINATION_ALIAS_OVERRIDES[shortDesired]) {
    resolved = POLLINATION_ALIAS_OVERRIDES[shortDesired];
  }

  // Try exact alias or id match
  const idx = global.POLL_MODEL_INDEX || {};
  if (!resolved && idx[desired]) resolved = desired; // alias maps to index entry (alias key)
  // if desired matches an index entry's id (value.id)
  if (!resolved) {
    for (const k of Object.keys(idx)) {
      if (idx[k].id === desired) { resolved = idx[k].id; break; }
    }
  }
  // fuzzy match: find alias containing token
  if (!resolved) {
    const token = desired.toLowerCase();
    for (const k of Object.keys(idx)) {
      if (k.toLowerCase().includes(token) || (idx[k].id && idx[k].id.toLowerCase().includes(token))) {
        resolved = idx[k].id; break;
      }
    }
  }
  // fallback to 'openai' if unresolved
  if (!resolved) resolved = desired; // let Pollinations return error if truly invalid

  const messages = [];
  if (body.system) messages.push({ role: "system", content: body.system });
  messages.push(...(body.messages || []));

  const requestBody = {
    model: resolved,
    messages: messages,
    temperature: body.temperature,
    max_tokens: body.max_tokens
  };

  const url = `${POLLINATION_BASE.replace(/\/$/, '')}/v1/chat/completions`;
  console.log(`📡 Pollination request -> ${url} (requested=${model} resolved=${resolved})`);

  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${POLLINATION_KEY}`
    },
    body: JSON.stringify(requestBody)
  });

  const text = await r.text();
  try{ fs.appendFileSync('poll_response.log', `${new Date().toISOString()} ENDPOINT=/v1/chat/completions REQUESTED=${model} RESOLVED=${resolved} STATUS=${r.status} BODY=${text}\n`); }catch(e){}

  return {
    ok: r.ok,
    status: r.status,
    json: async () => { try { return JSON.parse(text); } catch (e) { return { raw: text }; } },
    text: async () => text
  };
}

function transformPollinationResponse(data) {
  if (data.choices) return data;
  const text = data.output_text || data.result || (typeof data === 'string' ? data : JSON.stringify(data));
  return {
    choices: [{
      message: { role: 'assistant', content: String(text) }
    }],
    usage: data.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
  };
}

// Sleep utility for rate-limit handling
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

app.post("/api/chat", async (req, res) => {
  const { messages, max_tokens, temperature, system, model } = req.body;

  console.log('🛰️ Incoming /api/chat model param:', model);
  try{
    fs.appendFileSync('poll_debug.log', `${new Date().toISOString()} INCOMING_MODEL=${model}\n`);
  }catch(e){}

  // Input validation
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "messages array is required and must not be empty" });
  }

  for (const msg of messages) {
    if (!msg.role || !msg.content || typeof msg.content !== "string") {
      return res.status(400).json({ error: "Each message must have role and content (string)" });
    }
  }

  // Validate token limits
  const finalMaxTokens = Math.min(max_tokens || 2048, 8192);
  const finalTemp = Math.max(0, Math.min(temperature ?? 0.7, 2));

  // Use user-selected model if provided, otherwise auto-select
  const selectedModel = model || selectModel(messages, system);
  console.log('🧭 Selected model after auto-select:', selectedModel);
  try{
    fs.appendFileSync('poll_debug.log', `${new Date().toISOString()} SELECTED_MODEL=${selectedModel}\n`);
  }catch(e){}
  const modelsToTry = getModelFallbackChain(selectedModel);

  for (const model of modelsToTry) {
    let retries = 0;
    while (retries < 2) {
      try {
        console.log(`📤 ${retries === 0 ? "Primary" : "Retry"} Trying: ${model}`);
        const body = {
          model: model,
          messages: messages,
          system: system,
          temperature: finalTemp,
          max_tokens: finalMaxTokens
        };

        const r = await callChatAPI(model, body);

        console.log(`📥 ${model} → status ${r.status}`);
        let data = await r.json();

        // Check for rate limiting first
        if (r.status === 429 || r.status === 503 || r.status === 502) {
          if (retries === 0) {
            console.log(`⚠️  ${model} rate limited, waiting 2s and retrying...`);
            await sleep(2000);
            retries++;
            continue;
          }
          console.log(`⚠️  ${model} still rate limited after retry, trying next model...`);
          break;
        }

        // Check for API errors
        if (data.error || data.code) {
          const errMsg = data?.error?.message || data?.error || data?.code || JSON.stringify(data);
          console.log(`❌ API error: ${errMsg}`);
          // Break to try next model
          break;
        }

        // Transform provider-specific responses to OpenAI format
        if (isGeminiModel(model) && data.candidates) {
          data = transformGeminiResponse(data);
        } else if (isOpenRouterModel(model) && data.choices) {
          data = transformOpenRouterResponse(data);
        } else if (isPollinationModel(model)) {
          data = transformPollinationResponse(data);
        }

        // Check for valid response
        if (r.status === 200 && data.choices && data.choices.length > 0) {
          console.log(`✅ Success with ${model}`);
          return res.json({ ...data, _model_used: model });
        }

        // Unhandled response format
        if (r.status >= 400) {
          console.log(`⚠️  ${model} returned status ${r.status}, trying next...`);
          break;
        }
      } catch (e) {
        console.error(`❌ ${model} threw:`, e.message);
        break;
      }
    }
  }
  res.status(503).json({ error: "All models unavailable. Please try again later." });
});

app.post("/api/image", async (req, res) => {
  res.status(501).json({ error: "Image generation not supported by apifreellm. Use text generation instead." });
});

app.post("/api/tts", async (req, res) => {
  const { text } = req.body;
  
  if (!text || typeof text !== "string" || text.trim().length === 0) {
    return res.status(400).json({ error: "text field is required" });
  }

  if (!GROQ_KEY) {
    return res.status(503).json({ error: "TTS service unavailable - GROQ_KEY not configured" });
  }

  try {
    const r = await fetch(`${GROQ_BASE}/chat/completions`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": `Bearer ${GROQ_KEY}`
      },
      body: JSON.stringify({ 
        model: "whisper-large-v3-turbo",
        messages: [{ role: "user", content: text }] 
      })
    });
    
    if (!r.ok) {
      const error = await r.json();
      return res.status(r.status).json({ error: error.error?.message || "TTS request failed" });
    }
    
    const buf = await r.arrayBuffer();
    res.set("Content-Type", "audio/mpeg");
    res.send(Buffer.from(buf));
  } catch (e) {
    res.status(500).json({ error: `TTS processing failed: ${e.message}` });
  }
});

app.listen(PORT, () => {
  console.log(`\n✅  Vibe Studio 2 → http://localhost:${PORT}`);
  console.log(`🤖 Groq: 10 models (8B/24B/32B/70B/Scout/Maverick/Kimi/Gemma/Compound)`);
  console.log(`🔷 Gemini: 5 models (3.1-lite/2.5-flash/2.5-pro/2.5-lite/3-preview)`);
  console.log(`🔍 Pollination: flux, nova, perplexity, deepseek, claude (via Pollination)`);
  console.log(`⚡ Smart routing: Vision → Scout | Creative → Maverick | Code → Qwen | Web → Compound\n`);
});