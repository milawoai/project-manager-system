# Server 开发规范

## 接口规范（严格遵守）

### 只允许 GET 和 POST
禁止使用 `@Put()` `@Patch()` `@Delete()`。

### 每个功能一个独立接口，路径即动词
禁止同一路径靠 HTTP 方法区分行为，禁止路径参数（`:id`）。

**正确示例：**
```typescript
@Post('list')    // 获取列表
@Post('create')  // 创建
@Post('detail')  // 详情，body: { id }
@Post('update')  // 更新，body: { id, ...fields }
@Post('remove')  // 删除，body: { id }
```

**禁止示例：**
```typescript
@Get()           // ❌ 与 @Post() 同路径不同方法
@Get(':id')      // ❌ 路径参数
@Put(':id')      // ❌ 禁止 Put
@Delete(':id')   // ❌ 禁止 Delete
@Post(':id/projects')  // ❌ 嵌套路径参数
```

### id 放 Body，不放路径
```typescript
// ❌ 错误
@Get(':id') findOne(@Param('id') id: string) {}

// ✅ 正确
@Post('detail') findOne(@Body() dto: { id: string }) {}
```

### Controller 内路径唯一
同一 `@Controller` 下不允许出现重名路径。

## 项目结构
- NestJS + TypeORM + SQLite
- 入口：`src/main.ts`
- 实体：`src/entities/`
- 网关（WebSocket）：`src/gateways/`
