<template>
  <el-container style="height: 100vh">
    <el-aside width="220px" style="border-right: 1px solid #e5e7eb">
      <div style="padding: 16px; font-weight: 700">Project Manager</div>
      <el-menu router default-active="/machines">
        <el-menu-item index="/machines">工作机器</el-menu-item>
        <el-menu-item index="/projects">工程</el-menu-item>
        <el-menu-item index="/tasks">任务</el-menu-item>
      </el-menu>
    </el-aside>
    <el-container>
      <el-header style="border-bottom: 1px solid #e5e7eb; display: flex; align-items: center; font-weight: 600">
        远程任务分发管理台
      </el-header>
      <el-main style="background: #f5f7fa">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>
