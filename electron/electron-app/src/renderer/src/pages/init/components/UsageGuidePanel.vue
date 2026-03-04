<script setup lang="ts">
// Usage Guide Panel - 待实现
</script>

<template>
  <div class="usage-guide-panel">
    <div class="panel-header">
      <h2>使用指南</h2>
      <p class="text-muted">了解如何使用这个应用程序</p>
    </div>
    <div class="placeholder-content">
      <i class="pi pi-book" style="font-size: 48px; color: var(--text-color-secondary)"></i>
      <p>使用指南功能待完善...</p>
    </div>
  </div>
</template>

<style scoped lang="less">
.usage-guide-panel {
  padding: 16px;

  .panel-header {
    margin-bottom: 24px;

    h2 {
      margin: 0 0 8px 0;
      font-size: 24px;
      font-weight: 600;
      color: var(--text-color);
    }

    .text-muted {
      margin: 0;
      color: var(--text-color-secondary);
      font-size: 14px;
    }
  }

  .placeholder-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 48px;
    background: var(--surface-card);
    border-radius: 8px;

    p {
      margin-top: 16px;
      color: var(--text-color-secondary);
    }
  }
}
</style>
