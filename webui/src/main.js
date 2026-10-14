import { createApp } from 'vue'
import './style.css'
import './assets/themes.css'
import './assets/glass-frame-dark.css'
import './assets/polish.css'
import './assets/semantic-card.css'
import './assets/card-typography.css'
import './assets/control-sidebar.css'
import './assets/icon-system.css'
import './assets/status-hero-cosmic.css'
import './assets/soft-label-card.css'
import './assets/sidebar-dark.css'
import './assets/onewifi-lab.css'
import './assets/onewifi-lab-light.css'
import './assets/onewifi-chip.css'
import './assets/overview-panels.css'
import './assets/form-select.css'
import './assets/mobile.css'
import './assets/liquid-glass.css'
import './assets/onewifi-pages.css'
// OneWIFI 主题：必须最后引入，靠 cascade 顺序覆盖上游同权重规则（含 !important 之外的声明）
import './assets/onewifi-theme.css'
import App from './App.vue'
import router from './router'
import { initTheme } from './stores/theme'
import { resetLoading } from './stores/globalLoading'
import { migrateLegacyStorage } from './utils/storageMigration'

migrateLegacyStorage()
initTheme()
resetLoading()

createApp(App).use(router).mount('#app')
