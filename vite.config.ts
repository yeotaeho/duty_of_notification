import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 정적 SPA. 서버 없음. 의료 데이터는 브라우저 밖으로 나가지 않는다.
export default defineConfig({
  plugins: [react()],
  // pdfjs-dist는 큰 청크라 경고 한도를 올려둔다.
  build: { chunkSizeWarningLimit: 1500 },
});
