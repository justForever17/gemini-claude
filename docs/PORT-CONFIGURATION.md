# 端口配置说明

## 🌐 使用的协议

**端口**: 9000  
**协议**: TCP  
**服务**: HTTP/HTTPS (如果配置了反向代理)

## 🔓 防火墙配置

### Linux (iptables)

```bash
# 开放 TCP 9000 端口
sudo iptables -A INPUT -p tcp --dport 9000 -j ACCEPT

# 保存规则
sudo iptables-save > /etc/iptables/rules.v4
```

### Linux (firewalld - CentOS/RHEL/Fedora)

```bash
# 开放 TCP 9000 端口
sudo firewall-cmd --permanent --add-port=9000/tcp

# 重载防火墙
sudo firewall-cmd --reload

# 验证
sudo firewall-cmd --list-ports
```

### Linux (ufw - Ubuntu/Debian)

```bash
# 开放 TCP 9000 端口
sudo ufw allow 9000/tcp

# 查看状态
sudo ufw status
```

### 云服务器安全组

#### 阿里云

1. 登录阿里云控制台
2. 进入 ECS 实例
3. 点击"安全组配置"
4. 添加入方向规则：
   - 协议类型: TCP
   - 端口范围: 9000/9000
   - 授权对象: 0.0.0.0/0 (所有 IP) 或指定 IP

#### 腾讯云

1. 登录腾讯云控制台
2. 进入云服务器
3. 点击"安全组"
4. 添加入站规则：
   - 类型: 自定义
   - 协议: TCP
   - 端口: 9000
   - 来源: 0.0.0.0/0 或指定 IP

#### AWS

1. 登录 AWS 控制台
2. 进入 EC2 实例
3. 点击"安全组"
4. 添加入站规则：
   - 类型: Custom TCP
   - 协议: TCP
   - 端口范围: 9000
   - 源: 0.0.0.0/0 或指定 IP

#### Google Cloud

```bash
# 使用 gcloud 命令
gcloud compute firewall-rules create allow-gemini-claude \
  --allow tcp:9000 \
  --source-ranges 0.0.0.0/0 \
  --description "Allow Gemini-Claude proxy"
```

## 🔒 安全建议

### 1. 限制访问 IP（推荐）

不要对所有 IP 开放，只允许特定 IP 访问：

```bash
# 只允许特定 IP
sudo ufw allow from 192.168.1.100 to any port 9000 proto tcp

# 允许 IP 段
sudo ufw allow from 192.168.1.0/24 to any port 9000 proto tcp
```

### 2. 使用反向代理 + HTTPS

推荐使用 Nginx 或 Caddy 作为反向代理：

#### Nginx 配置

```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    # 重定向到 HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;
    
    # SSL 证书
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    # 反向代理到 9000 端口
    location / {
        proxy_pass http://localhost:9000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

这样只需要开放 80 和 443 端口：

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw deny 9000/tcp  # 关闭 9000，只允许本地访问
```

#### Caddy 配置（自动 HTTPS）

```caddy
your-domain.com {
    reverse_proxy localhost:9000
}
```

### 3. 使用 VPN

如果只是个人使用，可以通过 VPN 访问，不对公网开放：

```bash
# 只允许 VPN 网段访问
sudo ufw allow from 10.8.0.0/24 to any port 9000 proto tcp
```

## 🧪 测试端口

### 从服务器本地测试

```bash
# 测试端口是否监听
netstat -tlnp | grep 9000

# 或使用 ss
ss -tlnp | grep 9000

# 测试 HTTP 访问
curl http://localhost:9000
```

### 从外部测试

```bash
# 测试端口是否开放
telnet your-server-ip 9000

# 或使用 nc
nc -zv your-server-ip 9000

# 测试 HTTP 访问
curl http://your-server-ip:9000
```

### 在线端口检测

- https://www.yougetsignal.com/tools/open-ports/
- https://www.portchecktool.com/

## 📋 完整部署检查清单

```bash
# 1. 检查服务是否运行
docker ps | grep gemini-claude-proxy

# 2. 检查端口监听
netstat -tlnp | grep 9000

# 3. 测试本地访问
curl http://localhost:9000

# 4. 开放防火墙端口
sudo ufw allow 9000/tcp

# 5. 测试外部访问
curl http://your-server-ip:9000

# 6. 如果使用云服务器，配置安全组
# （在云服务商控制台操作）
```

## 🔧 常见问题

### Q: 端口已开放但无法访问？

A: 检查以下几点：

1. **Docker 容器是否运行**
   ```bash
   docker ps | grep gemini-claude-proxy
   ```

2. **端口是否正确映射**
   ```bash
   docker port gemini-claude-proxy
   ```

3. **防火墙是否真的开放**
   ```bash
   sudo ufw status
   sudo iptables -L -n | grep 9000
   ```

4. **云服务器安全组是否配置**
   - 检查云服务商控制台

5. **SELinux 是否阻止**（CentOS/RHEL）
   ```bash
   sudo setenforce 0  # 临时禁用测试
   ```

### Q: 如何修改端口？

A: 修改 `docker-compose.yml`：

```yaml
services:
  gemini-claude-proxy:
    ports:
      - "8080:9000"  # 改为 8080 端口
```

然后重启：
```bash
docker compose down
docker compose up -d
```

### Q: 如何只允许本地访问？

A: 修改 `docker-compose.yml`：

```yaml
services:
  gemini-claude-proxy:
    ports:
      - "127.0.0.1:9000:9000"  # 只绑定本地
```

## 📞 需要帮助？

如果端口配置有问题，提供以下信息：

```bash
# 1. 系统信息
uname -a

# 2. 防火墙状态
sudo ufw status
sudo iptables -L -n

# 3. 端口监听
netstat -tlnp | grep 9000

# 4. Docker 状态
docker ps
docker port gemini-claude-proxy

# 5. 容器日志
docker logs gemini-claude-proxy --tail 50
```
