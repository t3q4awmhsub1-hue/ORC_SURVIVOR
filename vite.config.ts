import { defineConfig } from 'vite';

export default defineConfig({
  // GitHub Pages はリポジトリ名のサブパス配信になるため相対パスでビルドする
  base: './',
  build: {
    target: 'es2022',
  },
});
