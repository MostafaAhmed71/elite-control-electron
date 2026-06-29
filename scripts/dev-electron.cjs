delete process.env.ELECTRON_RUN_AS_NODE;
const { spawn } = require('child_process');

const child = spawn('npx', ['electron-vite', 'dev'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env }
});
