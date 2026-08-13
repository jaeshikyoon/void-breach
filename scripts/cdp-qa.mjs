import fs from 'node:fs/promises';

const endpoint = process.env.CDP_ENDPOINT ?? 'http://127.0.0.1:9223';
const targetUrl = process.env.QA_URL ?? 'http://127.0.0.1:5173/';
const screenshotPath = process.env.QA_SCREENSHOT ?? 'C:/Users/HOME/AppData/Local/Temp/void-breach-cdp.png';
const viewportWidth = Number(process.env.QA_WIDTH ?? 1672);
const viewportHeight = Number(process.env.QA_HEIGHT ?? 937);
const mobile = process.env.QA_MOBILE === '1';
const clickStart = process.env.QA_CLICK_START !== '0';

async function createPage() {
  const response = await fetch(`${endpoint}/json/new?${encodeURIComponent(targetUrl)}`, { method: 'PUT' });
  if (!response.ok) throw new Error(`CDP target creation failed: ${response.status}`);
  return response.json();
}

function connect(url) {
  const socket = new WebSocket(url);
  let id = 0;
  const pending = new Map();
  const events = [];
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const handler = pending.get(message.id);
      if (!handler) return;
      pending.delete(message.id);
      if (message.error) handler.reject(new Error(message.error.message));
      else handler.resolve(message.result);
    } else {
      events.push(message);
    }
  };
  const ready = new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = reject;
  });
  const send = async (method, params = {}) => {
    await ready;
    const current = ++id;
    socket.send(JSON.stringify({ id: current, method, params }));
    return new Promise((resolve, reject) => pending.set(current, { resolve, reject }));
  };
  return { socket, send, events };
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const page = await createPage();
const cdp = connect(page.webSocketDebuggerUrl);
await cdp.send('Page.enable');
await cdp.send('Runtime.enable');
await cdp.send('Console.enable');
await cdp.send('Emulation.setDeviceMetricsOverride', {
  width: viewportWidth,
  height: viewportHeight,
  deviceScaleFactor: 1,
  mobile,
});
if (mobile) {
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
}
await delay(12_000);

async function evaluate(expression) {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}

const initial = await evaluate(`({
  title: document.title,
  text: document.body.innerText.slice(0, 2000),
  buttons: [...document.querySelectorAll('button')].map((button) => button.innerText),
  canvases: document.querySelectorAll('canvas').length,
  loading: Boolean(document.querySelector('.game-loading')),
  error: document.querySelector('.game-error')?.innerText ?? null
})`);

if (clickStart && !initial.loading && initial.buttons.length) {
  await evaluate(`document.querySelector('.ui-start-primary, button')?.click()`);
  await delay(5_000);
}

const finalState = await evaluate(`({
  text: document.body.innerText.slice(0, 2500),
  buttons: [...document.querySelectorAll('button')].map((button) => button.innerText),
  canvases: document.querySelectorAll('canvas').length,
  loading: Boolean(document.querySelector('.game-loading')),
  error: document.querySelector('.game-error')?.innerText ?? null,
  canvasSize: (() => { const canvas = document.querySelector('canvas'); return canvas ? [canvas.width, canvas.height] : null; })()
})`);

const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
await fs.writeFile(screenshotPath, Buffer.from(screenshot.data, 'base64'));

const consoleEvents = cdp.events
  .filter((event) => event.method === 'Runtime.consoleAPICalled' || event.method === 'Runtime.exceptionThrown')
  .map((event) => ({ method: event.method, params: event.params }));
console.log(JSON.stringify({ initial, finalState, consoleEvents, screenshotPath }, null, 2));
cdp.socket.close();
