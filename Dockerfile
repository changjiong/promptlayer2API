# 使用官方的 Deno 镜像作为基础
# 你可以选择一个具体的版本，例如 denoland/deno:1.40.0，以确保环境一致性
FROM denoland/deno:latest

# 将工作目录设置为 /app
WORKDIR /app

# 将你的 server.js 文件复制到容器的 /app 目录下
COPY server.js .

# (可选，但推荐) 缓存依赖项
# 这会在构建镜像时下载并缓存 server.js 中通过 URL 导入的模块
# 如果你的模块 URL 不变，后续构建会更快
RUN deno cache server.js

# 暴露应用监听的端口
# 根据你的 server.js 中的 app.listen(PORT, ...) 或 app.listen(3000, ...)，确保端口一致
# 如果你使用了 PORT = 9877 并且 app.listen(PORT, ...)，则这里应该是 9877
EXPOSE 3000

# 容器启动时运行的命令
# --allow-net 是必须的，因为应用需要进行网络请求 (访问 PromptLayer, Ably)ss
# --allow-env 如果你的应用将来需要读取环境变量，可以加上 (当前代码主要从请求头获取凭证)
# 注意：确保 server.js 中的监听端口与 EXPOSE 指令以及 Dokploy 中的配置一致
CMD ["run", "--allow-net", "--allow-read=.", "--allow-env", "server.js"]