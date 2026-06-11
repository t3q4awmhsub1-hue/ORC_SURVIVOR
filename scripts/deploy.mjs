/**
 * gh-pagesブランチへの手動デプロイ（GitHub Actionsが使えない環境のフォールバック）。
 * 使い方: npm run deploy
 */
import { execSync } from 'node:child_process';
import { rmSync, existsSync } from 'node:fs';

const REMOTE = 'https://github.com/t3q4awmhsub1-hue/ORC_SURVIVOR.git';
const run = (cmd, cwd) => execSync(cmd, { cwd, stdio: 'inherit' });

run('npm run build');
if (existsSync('dist/.git')) rmSync('dist/.git', { recursive: true, force: true });
run('git init -b gh-pages', 'dist');
run('git add -A', 'dist');
run('git commit -m "deploy"', 'dist');
run(`git push -f ${REMOTE} gh-pages`, 'dist');
rmSync('dist/.git', { recursive: true, force: true });
console.log('deployed: https://t3q4awmhsub1-hue.github.io/ORC_SURVIVOR/');
