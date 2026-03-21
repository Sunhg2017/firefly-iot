# 设备模拟器 AppKey 物模型拉取使用说明

## 1. 适用角色

- 联调开发
- 测试人员
- 现场实施人员

## 2. 新建设备怎么填写

新建设备时，在“扩展配置”区补充以下内容：

- `OpenAPI 网关地址`
- `Access Key`
- `Secret Key`

默认网关地址为：

```text
http://localhost:8080
```

如果暂时不填写 Access Key / Secret Key，设备仍然可以连接和发送自定义 JSON，只是不能使用“物模型模拟”。

## 3. 老设备怎么补录

选中左侧已有设备后，在右侧控制区找到“物模型 OpenAPI”卡片，直接填写：

- OpenAPI 网关地址
- Access Key
- Secret Key

输入后会立即保存到当前设备配置。

## 4. 如何验证物模型拉取成功

1. 先确保设备已填写 `ProductKey`
2. 再补齐 OpenAPI 三项配置
3. 打开右侧 `数据上报`
4. 将数据源切到 `物模型模拟`
5. 查看是否出现属性、事件候选项

如果拉取成功，界面会显示已同步的属性数和事件数。

## 5. 常见问题

### 5.1 为什么提示缺少 OpenAPI 配置

因为物模型读取不再走旧接口，而是统一改成 AppKey 签名方式。缺少以下任一项都会被拦截：

- OpenAPI 网关地址
- Access Key
- Secret Key

### 5.2 为什么连接成功了还是没有物模型

设备接入成功和物模型读取已经是两条独立链路：

- 连接成功：说明设备鉴权与接入链路正常
- 物模型为空或失败：说明 OpenAPI 链路或 AppKey 授权还有问题

### 5.3 OpenAPI 网关地址该填什么

本地默认是：

```text
http://localhost:8080
```

不要填 connector 的 `9070` 地址。物模型模拟走的是网关 `/open/DEVICE/...` 路径。

### 5.4 导入导出会不会丢

不会。以下字段已经跟随设备配置一起导入、导出和克隆：

- `openApiBaseUrl`
- `openApiAccessKey`
- `openApiSecretKey`
