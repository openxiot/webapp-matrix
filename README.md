# webapp-wematrix

Openxiot 物联网设备管理与监控平台的 Web 版（微矩阵），使用 Angular + ng-zorro-antd 实现，为 [android-wematrix](https://github.com/openxiot/android-wematrix) 的 Web 重新实现。

针对更大的 Web 屏幕做了布局调整：使用**侧边栏导航 + 顶部栏**替代 Android 的底部 Tab 栏。

## 功能

- 🔐 **登录**：GitHub OAuth 登录 / 测试账号登录
- 🏢 **组织管理**：创建/重命名/删除组织、选择当前组织、成员管理（添加/移除/改角色）
- 🏗️ **项目管理**：创建/重命名/删除项目、选择当前项目、空间树管理（楼栋/楼层/房间/区域）
- 📱 **设备管理**：设备列表、设备详情、设备远程操作
- 📦 **产品浏览**：产品列表（生命周期标签）、产品详情（京东/淘宝购买入口）
- 👤 **个人中心**：账号详情、退出登录、关于页面
- 🌗 **浅色/深色主题**：通过顶部开关切换，支持持久化

## 技术栈

- Angular 22（Standalone Components + Signals + Lazy Loading）
- ng-zorro-antd 22（Ant Design Angular 组件库）
- 使用 `provideNzIcons` 按需注册图标，减小打包体积

## 开发

```bash
npm install
ng serve
```

打开 http://localhost:4200/

## 构建

```bash
ng build
```

产物输出到 `dist/webapp-wematrix/`。

## 项目结构

```
src/app/
├── models/            # 数据模型（与 Android 的 ApiModels 对应）
│   └── api.models.ts
├── services/          # 服务层
│   ├── api.service.ts     # HTTP API 封装（account/site/product 三组接口）
│   ├── token.service.ts   # Token/用户/组织/项目状态（localStorage 持久化）
│   └── theme.service.ts   # 浅色/深色主题管理
├── interceptors/      # HTTP 拦截器
│   └── auth.interceptor.ts  # 自动附加 Authorization / X-Org-Id 请求头
├── guards/            # 路由守卫
│   └── auth.guard.ts       # 未登录重定向到 /login
├── layout/            # 主布局（侧边栏 + 顶栏）
├── pages/             # 页面组件（全部懒加载）
│   ├── login/             # 登录页
│   ├── organizations/     # 组织选择 + 组织详情（成员管理）
│   ├── projects/          # 项目概览 + 项目列表 + 空间树
│   ├── devices/           # 设备列表 + 设备详情 + 设备操作
│   ├── products/          # 产品列表 + 产品详情
│   └── profile/           # 个人中心 + 账号详情 + 关于
└── icons.provider.ts   # ng-zorro 图标注册
```

## API 说明

与 Android 版一致，使用三组后端服务：

| 服务 | Base URL | 用途 |
|------|----------|------|
| Account | `https://account.openxiot.cn` | 登录、组织、成员 |
| Site | `https://site.openxiot.cn` | 空间、设备 |
| Product | `https://product.openxiot.cn` | 产品 |

所有请求（除 product 外）自动附加 `Authorization: Bearer <token>` 和 `X-Org-Id: <orgId>` 请求头。
