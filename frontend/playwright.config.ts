import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir:'./tests', timeout:60000, workers:1,
  use:{ baseURL:'http://127.0.0.1:5273', channel:'msedge', viewport:{width:1440,height:1050}, screenshot:'only-on-failure' },
  webServer:[
    { command:'dotnet run --project ../backend --no-launch-profile --urls http://127.0.0.1:5272', url:'http://127.0.0.1:5272/health', reuseExistingServer:false, timeout:60000 },
    { command:'npm run dev -- --port 5273', url:'http://127.0.0.1:5273', env:{POND_BACKEND_URL:'http://127.0.0.1:5272'}, reuseExistingServer:false, timeout:60000 }
  ]
});
