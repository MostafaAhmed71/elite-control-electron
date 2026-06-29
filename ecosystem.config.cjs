const path = require('path');

const rootDir = __dirname;
const omrDir = path.join(rootDir, 'omr_engine');
const wppDir = path.join(rootDir, 'wppconnect-master');

module.exports = {
  apps: [
    {
      name: 'elite-omr-engine',
      script: process.env.OMR_PYTHON || 'python',
      args: '-m uvicorn main:app --host 0.0.0.0 --port 8000',
      cwd: omrDir,
      interpreter: 'none', // السماح لمسار البايثون المباشر بالعمل
      autorestart: true,
      watch: false
    },
    {
      name: 'elite-whatsapp',
      script: 'whatsapp-server.js',
      cwd: wppDir,
      autorestart: true,
      watch: false
    },
    {
      name: 'elite-frontend',
      script: 'pm2-vite-server.js',
      cwd: rootDir,
      autorestart: true,
      watch: false
    },
    {
      name: 'elite-bridge',
      script: 'node',
      args: 'elite_bridge.js',
      cwd: rootDir,
      autorestart: true,
      watch: false
    },
    {
      name: 'elite-ngrok',
      script: 'node',
      args: 'start-ngrok.js',
      cwd: rootDir,
      autorestart: true,
      watch: false
    }
  ]
};
