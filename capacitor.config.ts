import type { CapacitorConfig } from '@capacitor/cli'

// GridBrawl 네이티브 앱 래퍼(Capacitor). 웹 빌드(dist/)를 그대로 담아 배포한다.
// `npm run build && npx cap sync` 후 `npx cap open android` / `npx cap open ios`.
const config: CapacitorConfig = {
  appId: 'com.imjaehyeog.GridBrawl',
  appName: 'GridBrawl',
  webDir: 'dist',
}

export default config
