// 在 Deno 中使用 URL 导入模块
import express from 'https://esm.sh/express';
import request from 'https://esm.sh/request';
import axios from 'https://esm.sh/axios';
import qs from 'https://esm.sh/qs';



// 创建一个 Express 应用实例
const app = express();

// 解析请求体
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

const PORT = 9877;
app.get("/", (req, res) => {
    res.send("欢迎来到Node.js Express应用！");
});


function uuidv4() {
    // 生成16个随机字节（128位）
    const bytes = new Uint8Array(16);
    for (let i = 0; i < 16; i++) {
        bytes[i] = Math.floor(Math.random() * 256);
    }

    // 按照 UUID v4 标准格式设置特定位
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // 0100xxxx: version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // 10xxxxxx: variant

    // 转换成 8-4-4-4-12 的 hex 格式
    const hex = [...bytes].map(b => b.toString(16).padStart(2, '0'));

    return (
        hex.slice(0, 4).join('') + '-' +
        hex.slice(4, 6).join('') + '-' +
        hex.slice(6, 8).join('') + '-' +
        hex.slice(8, 10).join('') + '-' +
        hex.slice(10, 16).join('')
    );
}
async function fetchTokenDetails(authHeader) {
    const url = 'https://api.promptlayer.com/ws-token-request';
    const headers = { Authorization: "Bearer " + authHeader };

    const response = await axios.post(url, null, { headers });
    if (response.data.success) {
        const access_token = response.data.token_details.token;
        const clientId = response.data.token_details.clientId;
        return { access_token, clientId };
    } else {
        throw new Error('Failed to get token details');
    }
}

/**
 * 获取 workspace id
 */
async function fetchWorkspaceId(authHeader) {
    const url = 'https://api.promptlayer.com/workspaces';
    const headers = { Authorization: "Bearer " + authHeader };

    const response = await axios.get(url, { headers });
    if (response.data.success && response.data.workspaces.length > 0) {
        const workspaceId = response.data.workspaces[0].id;
        return { workspaceId };
    } else {
        throw new Error('Failed to get workspace id');
    }
}


function transformMessagesArray(messages) {
    if (!Array.isArray(messages)) {
        throw new Error("输入必须是一个数组");
    }

    return messages.map(msg => ({
        role: msg.role,
        content: [
            {
                type: "text",
                text: msg.content
            }
        ],
        tool_calls: [],
        template_format: "f-string"
    }));
}

async function login(username, password) {
    const url = 'https://api.promptlayer.com/login';
    const headers = { "user-agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36 Edg/136.0.0.0" };
    const data = {"email":username,"password":password}
    const response = await axios.post(url, data, { headers });
    if (response.data) {
        const access_token = response.data.access_token;
        return { access_token};
    } else {
        return -1
    }
}
// 刷新playseesion
async function pysession(authHeader, workspaceId, databody) {
    const url = 'https://api.promptlayer.com/api/dashboard/v2/workspaces/' + workspaceId + '/playground_sessions';
    const headers = { Authorization: "Bearer " + authHeader };
    let provider = "openai"
    let model = "gpt-4o"
    let parameters = {
        "temperature": 1,
        "seed": 0,
        "response_format": null,
        "top_p": 1,
        "frequency_penalty": 0,
        "presence_penalty": 0
    }
    if (databody.model.includes("claude") && (databody.model.includes("3.7") || databody.model.includes("3-7"))) {
        provider = "anthropic"
        model = "claude-3-7-sonnet-latest"
        parameters = {
            "max_tokens": 64000,
            "temperature": 1
        }
    }
    if (databody.model.includes("claude") && (databody.model.includes("3.5") || databody.model.includes("3-5"))) {
        provider = "anthropic"
        model = "claude-3-5-sonnet-latest"
        parameters = {
            "max_tokens": 256,
            "temperature": 1,
            "top_k": 0,
            "top_p": 0
        }
    }
    if (databody.model.includes("4.1")) {
        model = "gpt-4.1"
    }

    if (databody.model.includes("4.5") || databody.model.includes("4-5")) {
        model = "gpt-4.5-preview"
    }
    if (databody.model == "gpt-4o-search-preview") {
        model = "gpt-4o-search-preview"
        parameters = {
            "response_format": null,
            "web_search_options": {
                "search_context_size": "medium",
                "user_location": {
                    "approximate": {
                        "city": "New York",
                        "country": "US",
                        "region": "New York",
                        "timezone": "America/New_York"
                    },
                    "type": "approximate"
                }
            }
        }
    }
    let data = {
        "id": uuidv4(),
        "name": "Not implemented",
        "prompt_blueprint": {
            "inference_client_name": null,
            "metadata": {
                "model": {
                    "name": model,
                    "provider": provider,
                    "parameters": parameters
                }
            },
            "prompt_template": {
                "type": "chat",
                "messages": transformMessagesArray(databody.messages),
                "tools": null,
                "input_variables": [],
                "functions": []
            },
            "provider_base_url_name": null
        },
        "input_variables": []
    }
    const response = await axios.put(url, data, { headers});
    if (response.data.success) {
        return response.data.playground_session.id;
    } else {
        return -1
    }
}


async function postmessage(authHeader, workspaceId, playground_sessions, databody) {
    const url = 'https://api.promptlayer.com/api/dashboard/v2/workspaces/' + workspaceId + '/run_groups';
    const headers = { Authorization: "Bearer " + authHeader };
    let provider = "openai"
    let model = "gpt-4o"
    let parameters = {
        "temperature": 1,
        "seed": 0,
        "response_format": null,
        "top_p": 1,
        "frequency_penalty": 0,
        "presence_penalty": 0
    }
    if (databody.model.includes("claude") && (databody.model.includes("3.7") || databody.model.includes("3-7"))) {
        provider = "anthropic"
        model = "claude-3-7-sonnet-latest"
        parameters = {
            "max_tokens": 64000,
            "temperature": 1
        }
    }
    if (databody.model.includes("claude") && (databody.model.includes("3.5") || databody.model.includes("3-5"))) {
        provider = "anthropic"
        model = "claude-3-5-sonnet-latest"
        parameters = {
            "max_tokens": 256,
            "temperature": 1,
            "top_k": 0,
            "top_p": 0
        }
    }
    if (databody.model.includes("4.1")) {
        model = "gpt-4.1"
    }

    if (databody.model.includes("4.5") || databody.model.includes("4-5")) {
        model = "gpt-4.5-preview"
    }
    if (databody.model == "gpt-4o-search-preview") {
        model = "gpt-4o-search-preview"
        parameters = {
            "response_format": null,
            "web_search_options": {
                "search_context_size": "medium",
                "user_location": {
                    "approximate": {
                        "city": "New York",
                        "country": "US",
                        "region": "New York",
                        "timezone": "America/New_York"
                    },
                    "type": "approximate"
                }
            }
        }
    }
    let data = {
        "id": uuidv4(),
        "playground_session_id": playground_sessions,
        "shared_prompt_blueprint": {
            "inference_client_name": null,
            "metadata": {
                "model": {
                    "name": model,
                    "provider": provider,
                    "parameters": parameters
                }
            },
            "prompt_template": {
                "type": "chat",
                "messages": transformMessagesArray(databody.messages),
                "tools": null,
                "input_variables": [],
                "functions": []
            },
            "provider_base_url_name": null
        },
        "individual_run_requests": [
            {
                "input_variables": {},
                "run_group_position": 1
            }
        ]
    }
    const response = await axios.post(url, data, { headers });
    if (response.data.success) {
        return 1
    } else {
        return -1
    }
}
function isJsonString(str) {
    try {
        const parsed = JSON.parse(str);
        return typeof parsed === 'object' && parsed !== null;
    } catch (e) {
        return false;
    }
}
// postmessage("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJmcmVzaCI6ZmFsc2UsImlhdCI6MTc0NzczOTk1MCwianRpIjoiMjc0YTlmNDUtYTRhZC00MDAxLWFkN2MtMzc5MmNkYTI2NDk4IiwidHlwZSI6ImFjY2VzcyIsInN1YiI6MjIyMzksIm5iZiI6MTc0NzczOTk1MCwiZXhwIjoxNzQ4MzQ0NzUwfQ.ZSqkwGlZIW8OmCo0JfHK4BUW2kdnIJ_p-CNJ9FN2pIQ",22553,"499e14da-4977-4d69-8b3e-566041c151e2" )
function findDifference(str1, str2) {
    // 检查第一个字符串是否是第二个字符串的一部分
    if (str2.startsWith(str1)) {
        // 如果是，返回第二个字符串的不同部分
        return str2.slice(str1.length);
    } else {
        // 如果不是，返回一个提示信息或者处理其他逻辑
        return "";
    }
}
function normalizeMessages(messages) {
    if (!Array.isArray(messages)) {
        return [{
            "role": "user",
            "content": "error"
        }]; // 或者根据你的需求返回其他内容
    }
    // 遍历每个 message 对象
    return messages.map((message) => {
        if (Array.isArray(message.content)) {
            // 如果 content 是数组，则提取 type="text" 的 text 内容
            const textContent = message.content
                .filter((item) => item.type === "text")
                .map((item) => item.text)
                .join(" ");

            // 将 message.content 替换为 textContent
            return {
                ...message,
                content: textContent
            };
        }
        // 如果 content 不是数组，直接返回 message 对象
        return message;
    });
}

app.get('/v1/models', async (req, res) => {
  const models = [
    "claude-3-5-sonnet-20240620",
    "claude-3-7-sonnet-20250219",
    "claude-3-5-sonnet-20241022",
    "gpt-4o",
    "gpt-4.1",
    "gpt-4.1-2025-04-14",
    "gpt-4.5-preview-2025-02-27",
    "gpt-4o-search-preview"
  ];

  const result = models.map((id) => {
    return {
      id,
      object: "model",
      created: 1626777600,
      owned_by: "custom",
      root: id.startsWith("claude") ? "anthropic" : "openai"
    };
  });

  res.json({
    data: result,
    success: true
  });
});


app.post('/v1/chat/completions', async (req, res) => {
    let databody = req.body;
    databody.messages = normalizeMessages(databody.messages);

    // 从环境变量中获取 PromptLayer 凭证
    const promptlayerEmail = Deno.env.get("PROMPTLAYER_EMAIL");
    const promptlayerPassword = Deno.env.get("PROMPTLAYER_PASSWORD");

    if (!promptlayerEmail || !promptlayerPassword) {
        console.error("错误：PROMPTLAYER_EMAIL 或 PROMPTLAYER_PASSWORD 环境变量未设置。");
        return res.status(500).json({
            success: false,
            message: "服务器配置错误：PromptLayer 凭证未设置。"
        });
    }

    let access_token_from_login;
    try {
        const loginResult = await login(promptlayerEmail, promptlayerPassword);
        if (loginResult === -1 || !loginResult.access_token) {
            console.error("PromptLayer 登录失败。");
            return res.status(401).json({
                success: false,
                message: "PromptLayer 认证失败，请检查服务器配置的凭证。"
            });
        }
        access_token_from_login = loginResult.access_token;
    } catch (error) {
        console.error("PromptLayer 登录时发生错误:", error);
        return res.status(500).json({
            success: false,
            message: "PromptLayer 登录时发生内部错误。"
        });
    }
    const [tokenResult, workspaceResult] = await Promise.all([
        fetchTokenDetails(access_token_from_login),
        fetchWorkspaceId(access_token_from_login)
    ]).catch(error => {
        console.error("获取 PromptLayer token 或 workspace ID 时出错:", error);
        res.status(500).json({ success: false, message: "获取 PromptLayer 详细信息失败。" });
        return [null, null]; // 返回 null 以便后续检查可以中止
    });

    if (!tokenResult || !workspaceResult) return; // 如果出错则中止

    const { access_token, clientId } = tokenResult;
    const { workspaceId } = workspaceResult;

    //刷新sessionid
    let playground_sessions = await pysession(access_token_from_login, workspaceId, databody); // 使用登录获取的 token


    // 发送的数据
    const sendAction = `{"action":10,"channel":"user:${clientId}","params":{"agent":"react-hooks/2.0.2"}}`
    // 构建 wss url
    const wsUrl = `wss://realtime.ably.io/?access_token=${encodeURIComponent(access_token)}&clientId=${clientId}&format=json&heartbeats=true&v=3&agent=ably-js%2F2.0.2%20browser`;
    // 创建 WebSocket 连接
    const ws = new WebSocket(wsUrl);

    let closedByServer = false;
    let last = ""
    let linshi = ""
    let send = ""
    let nonstr = ""
    postmessage(access, workspaceId, playground_sessions, databody)
    ws.onopen = () => {
        ws.send(sendAction);
    };

    ws.onmessage = async (event) => {
        try {
            const data = event.data;
            linshi = ""
            send = ""
            const msg = JSON.parse(data);
            let firstMsg = msg?.messages?.[0];
            if (
                    firstMsg?.name === "UPDATE_LAST_MESSAGE" &&
                    typeof firstMsg.data === "string" &&
                    isJsonString(firstMsg.data)
                ) {
                linshi = JSON.parse(msg.messages[0].data).payload.message.content[0].text
                send = findDifference(last, linshi)
                last = linshi
                nonstr += send
                if (databody.stream == true) {
                    res.write(`data: {"id":"chatcmpl-9709rQdvMSIASrvcWGVsJMQouP2UV","object":"chat.completion.chunk","created":${Math.floor(Date.now() / 1000)},"model":"${databody.model}","system_fingerprint":"fp_3bc1b5746c","choices":[{"index":0,"delta":{"content":${JSON.stringify(send)}},"logprobs":null,"finish_reason":null}]} \n\n`)
                }
            }
             
        if (
            firstMsg?.name === "INDIVIDUAL_RUN_COMPLETE" &&
            typeof firstMsg.data === "string" &&
            isJsonString(firstMsg.data)
            ){
                if (!databody.stream || databody.stream != true) {
                    res.json({
                        id: "chatcmpl-8Tos2WZQfPdBaccpgMkasGxtQfJtq",
                        object: "chat.completion",
                        created: Math.floor(Date.now() / 1000),
                        model: databody.model,
                        choices: [
                            {
                                index: 0,
                                message: {
                                    role: "assistant",
                                    content: nonstr,
                                },
                                finish_reason: "stop",
                            },
                        ],
                        usage: {
                            prompt_tokens: 0,
                            completion_tokens: 0,
                            total_tokens: 0,
                        },
                        system_fingerprint: null,
                    });
                    return;
                }
                res.write(
                    `data: {"id":"chatcmpl-89CvUKf0C36wUexKrTrmhf5tTEnEw","object":"chat.completion.chunk","model":"${databody.model}","created":${Math.floor(
                        Date.now() / 1000,
                    )},"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n`,
                );
                res.write(`data: [DONE]\n`);
                res.end(); 
                ws.close();
            }
            // 收到 {"action":0} 时断开
            if (msg.action === 0) {
                closedByServer = true;
                ws.close();
            }
            // 你可以在这里做一些转发或处理，也可以直接返回到前端
        } catch (err) {
            // 不是 JSON，直接忽略
        }
    }

    ws.onclose = () => {
        // 如果不是由服务器主动关闭 (例如 INDIVIDUAL_RUN_COMPLETE 或 action:0)，
        // 并且响应还没有结束，则可能需要确保客户端不会挂起。
        if (!res.writableEnded) {
            console.log("WebSocket closed unexpectedly.");
            // 可以选择发送一个错误或简单结束响应
            // res.status(500).json({ code: 4, msg: 'Socket closed unexpectedly' });
            res.end(); // 确保响应结束
        }
        return;
    };

    ws.onerror = (err) => {
        res.status(500).json({ code: 2, msg: 'Socket error', error: err.message });
    }

    // 防止请求卡死，设置超时，例如 30 秒
    setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.close();
        }
        if (!res.writableEnded) {
            // 确保在超时时，如果响应头已发送（例如流式传输），则正确结束流
            if (databody.stream && res.headersSent) {
                 res.write(`data: {"error": "timeout"}\n\n`); // 可以发送一个错误事件
                 res.write(`data: [DONE]\n`);
            } else if (!res.headersSent) {
                res.status(503).json({ code: 3, msg: 'Socket timeout' });
            }
            res.end();
        }
    }, 30000); // 30秒超时
});

app.listen(3000, () => {
    console.log('Server running at http://localhost:3000');
});
