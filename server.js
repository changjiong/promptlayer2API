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
        return response.data.run_group.individual_run_requests[0].id
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
    let databody = req.body
    databody.messages = normalizeMessages(databody.messages)
    let access = ""
    let authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith("Bearer")) {
        access = authHeader.split("Bearer ")[1];
    }
    if(access == "") {
        return
    }
    access = (await login(access.split("-")[0], access.split("-")[1])).access_token
    const [tokenResult, workspaceResult] = await Promise.all([
        fetchTokenDetails(access),
        fetchWorkspaceId(access)
    ]);

    const { access_token, clientId } = tokenResult;
    const { workspaceId } = workspaceResult;

    //刷新sessionid
    let playground_sessions = await pysession(access, workspaceId, databody)

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
    let requestId = ""
    ws.onopen = async () => {
        ws.send(sendAction);
       requestId = await postmessage(access, workspaceId, playground_sessions, databody)
    //    console.log("individual_run_request_id:" + requestId)
    };

    ws.onmessage = async (event) => {
        try {
            const data = event.data;
            // console.log(data)
            linshi = ""
            send = ""
            const msg = JSON.parse(data);
            let firstMsg = msg?.messages?.[0];
            if (
                    firstMsg?.name === "UPDATE_LAST_MESSAGE" &&
                    typeof firstMsg.data === "string" &&
                    isJsonString(firstMsg.data)
                ) {
                if(JSON.parse(msg.messages[0].data).individual_run_request_id == requestId)  {
                linshi = JSON.parse(msg.messages[0].data).payload.message.content[0].text
                send = findDifference(last, linshi)
                last = linshi
                nonstr += send
                if (databody.stream == true) {
                    res.write(`data: {"id":"chatcmpl-9709rQdvMSIASrvcWGVsJMQouP2UV","object":"chat.completion.chunk","created":${Math.floor(Date.now() / 1000)},"model":"${databody.model}","system_fingerprint":"fp_3bc1b5746c","choices":[{"index":0,"delta":{"content":${JSON.stringify(send)}},"logprobs":null,"finish_reason":null}]} \n\n`)
                }
                }
                
            }
             
        if (
            firstMsg?.name === "INDIVIDUAL_RUN_COMPLETE" &&
            typeof firstMsg.data === "string" &&
            isJsonString(firstMsg.data)
            ){
                if(JSON.parse(msg.messages[0].data).individual_run_request_id == requestId)  {
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
            }
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
        return
    }

    ws.onerror = (err) => {
        res.status(500).json({ code: 2, msg: 'Socket error', error: err.message });
    }

    // 防止请求卡死，设置超时，例如 30 秒
    setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.close();
            res.json({ code: 3, msg: 'Socket timeout' });
        }
    }, 240000);
});

app.listen(3000, () => {
    console.log('Server running at http://localhost:3000');
});