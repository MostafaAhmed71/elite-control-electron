import { createServer } from 'vite';

async function startServer() {
  const server = await createServer({
    // Vite will automatically load vite.config.js
    server: {
      port: 5173,
      host: '0.0.0.0',
    },
  });
  await server.listen();
  server.printUrls();
  console.log('Elite Frontend Server is running on port 5173');
}

startServer().catch((err) => {
  console.error('Error starting Vite server:', err);
  process.exit(1);
});
