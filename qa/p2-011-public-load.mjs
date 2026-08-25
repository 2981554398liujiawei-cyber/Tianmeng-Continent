// TM-P2-011 public first-load probe: five fresh contexts, random load-only
// credentials. No save/force_save is issued and the credential is never logged.
import puppeteer from 'puppeteer-core'
import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'

const target = (process.env.PUBLIC_GAME_URL || '').trim()
if (!target) { console.error('PUBLIC_LOAD_PROBE_BLOCKED: PUBLIC_GAME_URL is missing'); process.exit(1) }
const chrome = process.env.CHROME_PATH || (['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'].find((p) => existsSync(p)) ?? '')
if (!chrome) { console.error('PUBLIC_LOAD_PROBE_BLOCKED: Chrome is missing'); process.exit(1) }
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const results = []
const protocolResults = []
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${detail ? ` | ${detail}` : ''}`) }
let browser
try {
  browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] })
  for (let i = 0; i < 5; i += 1) {
    const passphrase = `P2-011-${randomBytes(18).toString('base64url')}`
    const context = await browser.createBrowserContext(); const page = await context.newPage(); const requests = []; const responses = []
    page.on('request', (request) => { if (request.method() === 'POST') { try { const body = JSON.parse(request.postData() || '{}'); if (typeof body.action === 'string') requests.push(body) } catch {} } })
    page.on('response', async (response) => {
      const request = response.request()
      if (request.method() !== 'POST') return
      try {
        const requestBody = JSON.parse(request.postData() || '{}')
        if (requestBody.action !== 'load') return
        responses.push({ status: response.status(), body: await response.json() })
      } catch { responses.push({ status: response.status(), body: null }) }
    })
    await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 30000 }); await sleep(600)
    const input = await page.$('#cloud-passphrase')
    if (!input) throw new Error('cloud passphrase input missing')
    await input.type(passphrase); const startedAt = Date.now(); const clicked = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => (x.textContent || '').includes('进入天梦大陆')); if (!b || b.disabled) return false; b.click(); return true })
    check(`fresh load ${i + 1} submitted`, clicked)
    await sleep(4000)
    const evidence = await page.evaluate(() => ({ local: Object.keys(localStorage).join('|'), value: document.querySelector('#cloud-passphrase')?.value ?? '' }))
    const loadOnly = requests.length > 0 && requests.every((request) => request.action === 'load')
    check(`fresh load ${i + 1} is load-only`, loadOnly, `requests=${requests.length}`)
    const latest = responses.at(-1)
    const protocolOk = latest?.status === 200 && latest?.body?.ok === true && latest?.body?.exists === false
    protocolResults.push(protocolOk)
    check(`fresh load ${i + 1} protocol result`, protocolOk, `status=${latest?.status ?? 'none'} elapsed_ms=${Date.now() - startedAt}`)
    check(`fresh load ${i + 1} credential not persisted`, !evidence.local.includes(passphrase) && evidence.value === '', 'credential redacted')
    await context.close()
  }
} catch (error) { check('public load probe execution', false, error?.stack || String(error)) } finally { await browser?.close() }
const failed = results.filter((ok) => !ok).length
console.log(`PUBLIC_LOAD_SUCCESS_RATE=${protocolResults.filter(Boolean).length}/${protocolResults.length}`)
console.log(`===== P2-011 public LOAD probe: ${results.length - failed}/${results.length} =====`)
process.exit(failed ? 1 : 0)
