const path = require('path');
const http = require('http');
const dotenv = require('dotenv');

dotenv.config({
  path: path.resolve(__dirname, '../.env'),
});

const baseUrl = String(process.env.BACKEND_BASE_URL || 'http://localhost:5000').trim().replace(/\/+$/, '');
const workerSecret = String(process.env.WORKER_SHARED_SECRET || '').trim();
const workerPortRaw = Number(String(process.env.WORKER_PORT || '4000').trim());
const intervalMsRaw = Number(String(process.env.SCHEDULER_INTERVAL_MS || '60000').trim());
const batchSizeRaw = Number(String(process.env.SCHEDULER_BATCH_SIZE || '10').trim());

const workerPort = Number.isInteger(workerPortRaw) ? workerPortRaw : 4000;
const intervalMs = Number.isFinite(intervalMsRaw) ? Math.max(5000, intervalMsRaw) : 60000;
const batchSize = Number.isInteger(batchSizeRaw) ? Math.max(1, Math.min(50, batchSizeRaw)) : 10;

if (!workerSecret) {
  throw new Error('Missing WORKER_SHARED_SECRET in scheduler-worker/.env');
}

const endpoint = `${baseUrl}/api/worker/scheduler/run?batch=${batchSize}`;
let isRunning = false;

const runOnce = async () => {
  if (isRunning) {
    console.log(`[worker] skipped run at ${new Date().toISOString()} because previous run is still in progress`);
    return;
  }

  isRunning = true;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'x-worker-secret': workerSecret,
      },
    });

    const responseBody = await response.text();

    if (!response.ok) {
      if (response.status === 401) {
        console.error('[worker] unauthorized: WORKER_SHARED_SECRET does not match backend');
      } else if (response.status === 503) {
        console.error('[worker] backend worker secret is not configured');
      }
      console.error(
        `[worker] run failed status=${response.status} body=${responseBody || '<empty>'}`
      );
      return;
    }

    try {
      const parsedBody = JSON.parse(responseBody);
      console.log(`\n[worker] --- Scheduler Run Completed at ${new Date().toISOString()} ---`);
      console.log(`[worker] Status: ${response.status} | Fetched: ${parsedBody.fetched} | Posted: ${parsedBody.posted} | Failed: ${parsedBody.failed}`);
      
      if (parsedBody.details && parsedBody.details.length > 0) {
        console.log(`[worker] Details:`);
        parsedBody.details.forEach(detail => {
          console.log(`  -> ID: ${detail.id} | Platform: ${detail.platform} | Status: ${detail.status}`);
          if (detail.status === 'failed') {
            console.log(`     Error: ${detail.error}`);
          } else {
            console.log(`     Result: ${JSON.stringify(detail.publishResult)}`);
          }
        });
      }
      console.log(`[worker] --------------------------------------------------------\n`);
    } catch (e) {
      console.log(`[worker] run success status=${response.status} body=${responseBody || '<empty>'}`);
    }
  } catch (error) {
    console.error(`[worker] request error: ${String(error.message || error)}`);
  } finally {
    isRunning = false;
  }
};

console.log(`[worker] scheduler worker started at ${new Date().toISOString()}`);
console.log(`[worker] endpoint=${endpoint}`);
console.log(`[worker] intervalMs=${intervalMs}`);
console.log(`[worker] port=${workerPort}`);

runOnce();
setInterval(runOnce, intervalMs);

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        status: 'ok',
        service: 'scheduler-worker',
        intervalMs,
        endpoint,
      })
    );
    return;
  }

  if (req.method === 'POST' && req.url === '/run-now') {
    await runOnce();
    res.writeHead(202, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ message: 'Run triggered' }));
    return;
  }

  res.writeHead(404, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ message: 'Not found' }));
});

server.listen(workerPort, () => {
  console.log(`[worker] http server listening on port ${workerPort}`);
});
