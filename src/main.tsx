import { createRoot } from 'react-dom/client'
import App from './App'
import { installAudioUnlock } from './ui/sfx'
import './index.css'

// 자동재생 정책 — 첫 클릭/키 입력에서 오디오를 깨운다(그전 효과음은 무시됨).
installAudioUnlock()

createRoot(document.getElementById('root')!).render(<App />)
