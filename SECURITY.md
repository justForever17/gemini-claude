# 安全说明

## 🔒 敏感信息保护

本项目已配置 `.gitignore` 来保护你的敏感信息，以下文件和目录**不会**被上传到 Git 仓库：

### 受保护的文件

- ✅ `data/` - 整个数据目录（包含所有配置）
- ✅ `data/config.json` - 配置文件（包含 API Key、密码等）
- ✅ `.env` - 环境变量文件
- ✅ `.env.local` - 本地环境变量

### 配置文件内容

`data/config.json` 包含以下敏感信息：
- Gemini API URL
- Gemini API Key
- 本地 API Key
- 管理员密码（加密后）

**这些信息都不会被上传到 GitHub！**

## 🛡️ 安全建议

### 1. 定期更换密钥

建议定期更换以下密钥：
- 管理员密码
- 本地 API Key
- Gemini API Key（如果泄露）

### 2. 备份配置

虽然配置不会上传到 Git，但建议定期备份：

```bash
# 备份配置
cp data/config.json data/config.backup.json

# 或导出到安全位置
cp data/config.json ~/secure-backup/gemini-claude-config.json
```

### 3. 使用强密码

- 首次登录后立即修改默认密码 `admin123`
- 使用包含大小写字母、数字和特殊字符的强密码
- 密码长度建议至少 12 位

### 4. 限制访问

如果部署在公网：
- 使用防火墙限制访问 IP
- 配置反向代理（如 Nginx）
- 启用 HTTPS
- 考虑使用 VPN

### 5. API Key 安全

- 不要在公开场合分享 API Key
- 不要将 API Key 硬编码在代码中
- 定期检查 API Key 使用情况
- 如果怀疑泄露，立即重新生成

## 🔍 检查配置是否安全

运行以下命令检查敏感文件是否被 Git 跟踪：

```bash
# 检查 data 目录
git status --ignored | grep data

# 应该显示：
# !!      data/

# 检查是否有未忽略的配置文件
git ls-files | grep -E "(config\.json|\.env)"

# 应该没有输出
```

## 🚨 如果不小心上传了敏感信息

如果你不小心将配置文件上传到了 GitHub：

### 1. 立即更换所有密钥

```bash
# 1. 更换 Gemini API Key（在 Google Cloud Console）
# 2. 在 Web 界面更换管理员密码
# 3. 在 Web 界面重新生成本地 API Key
```

### 2. 从 Git 历史中删除

```bash
# 从 Git 历史中完全删除文件
git filter-branch --force --index-filter \
  "git rm --cached --ignore-unmatch data/config.json" \
  --prune-empty --tag-name-filter cat -- --all

# 强制推送
git push origin --force --all
```

### 3. 通知相关方

如果是团队项目，通知所有成员更换密钥。

## 📋 安全检查清单

部署前检查：

- [ ] `.gitignore` 包含 `data/` 目录
- [ ] 已修改默认管理员密码
- [ ] Gemini API Key 已正确配置
- [ ] 本地 API Key 已生成
- [ ] 测试连接成功

部署后检查：

- [ ] 配置文件未被 Git 跟踪
- [ ] Web 界面只能从受信任的网络访问
- [ ] 所有密码都是强密码
- [ ] 已备份配置文件

## 🔗 相关资源

- [Git 安全最佳实践](https://docs.github.com/en/code-security)
- [API Key 安全指南](https://cloud.google.com/docs/authentication/api-keys)
- [密码安全建议](https://www.nist.gov/password-guidelines)

## 📞 报告安全问题

如果发现安全漏洞，请通过以下方式报告：

- GitHub Issues（非敏感问题）
- 私密联系项目维护者（敏感问题）

**请不要在公开场合讨论安全漏洞细节。**
