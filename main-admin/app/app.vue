<script setup lang="ts">
import { zh_cn } from '@nuxt/ui/locale'

useHead({ title: 'GenPlus · AI 工作台', htmlAttrs: { lang: 'zh-CN' } })
</script>

<template>
  <!-- locale 决定 Calendar / InputDate / InputTime 等组件的日期时间格式与内置文案 -->
  <UApp :locale="zh_cn" :toaster="{ position: 'top-right' }">
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
