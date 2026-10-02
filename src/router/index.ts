import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      redirect: '/dashboard',
    },
    {
      path: '/dashboard',
      name: 'dashboard',
      component: () => import('@/pages/DashboardPage.vue'),
    },
    {
      path: '/calendar',
      name: 'calendar',
      component: () => import('@/pages/CalendarPage.vue'),
    },
    {
      path: '/queue',
      name: 'queue',
      component: () => import('@/pages/QueuePage.vue'),
    },
    {
      path: '/library',
      name: 'library',
      component: () => import('@/pages/LibraryPage.vue'),
    },
    {
      path: '/channels',
      name: 'channels',
      component: () => import('@/pages/ChannelsPage.vue'),
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('@/pages/SettingsPage.vue'),
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('@/pages/NotFoundPage.vue'),
    },
  ],
})

export default router
