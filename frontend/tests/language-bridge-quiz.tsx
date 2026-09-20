/**
 * language-bridge-quiz.tsx — آزمونِ باگِ «نتیجه‌ی کوییز نشان داده نمی‌شود»
 *
 * داستانِ باگ: در «پل زبان» بعد از پاسخِ آخرین سؤال، آمارِ بالای صفحه reload
 * می‌شد و چون والد در حالتِ loading کلِ درخت را با اسپینر عوض می‌کرد، تبِ
 * کوییز از نو mount می‌شد؛ در نتیجه صفحه‌ی نتیجه هرگز دیده نمی‌شد و کوییز
 * از اول شروع می‌شد.
 *
 * این تست همان مسیر را می‌رود و سه چیز را می‌سنجد:
 *   ۱) کوییز شروع می‌شود و سؤال‌ها یکی‌یکی می‌آیند
 *   ۲) بعد از پاسخِ آخرین سؤال، صفحه‌ی نتیجه (نمره + پیام بابا + مرورِ پاسخ‌ها)
 *      روی صفحه می‌ماند — حتی وقتی آمارِ بالای صفحه تازه می‌شود
 *   ۳) دکمه‌ی «دوباره» کوییز تازه می‌آورد
 */
import { JSDOM } from 'jsdom'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const publicDir = join(dirname(dirname(fileURLToPath(import.meta.url))), '..', 'public')

const dom = new JSDOM('<!doctype html><html lang="fa" dir="rtl"><body><div id="root"></div></body></html>', {
  pretendToBeVisual: true,
  url: 'http://localhost:5173/',
})
const w: any = dom.window
const g = globalThis as any
g.window = w
g.document = w.document
Object.defineProperty(g, 'navigator', { value: w.navigator, configurable: true })
for (const k of ['HTMLElement', 'Element', 'Node', 'Event', 'MouseEvent', 'KeyboardEvent', 'CustomEvent', 'SVGElement'])
  g[k] = w[k]
g.localStorage = w.localStorage
g.requestAnimationFrame = w.requestAnimationFrame.bind(w)
g.cancelAnimationFrame = w.cancelAnimationFrame.bind(w)
g.getComputedStyle = w.getComputedStyle.bind(w)
g.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })
w.matchMedia = g.matchMedia
g.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} }
g.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
g.IS_REACT_ACT_ENVIRONMENT = true
g.scrollTo = () => undefined
w.scrollTo = () => undefined
g.URL.createObjectURL = () => 'blob:fake'

let failCount = 0
const check = (label: string, cond: boolean, extra = '') => {
  console.log(`${cond ? '  ✅' : '  ❌'} ${label}${extra ? ' — ' + extra : ''}`)
  if (!cond) failCount += 1
}

const QUESTIONS = [
  { id: 1, question: 'کلمه‌ی «دل» به مازندرانی؟', options: ['قلب', 'دل', 'جان'], category: 'بدن', category_icon: '🫀', feedback: 'قشنگ بود' },
  { id: 2, question: '«چشم» به ترکی؟', options: ['گوز', 'ال', 'دل'], category: 'بدن', category_icon: '🫀', feedback: '' },
  { id: 3, question: '«خواب» به انگلیسی؟', options: ['sleep', 'run', 'eat'], category: 'روزمره', category_icon: '🌙', feedback: '' },
]

const overview = () => ({
  entries: [],
  categories: [],
  languages: [{ key: 'mazani', label: 'مازندرانی' }],
  stats: {
    words: 0,
    idioms: 0,
    with_audio: 0,
    quiz_count: QUESTIONS.length,
    progress: [
      { owner: 'daughter', owner_label: 'دخترم', learned_count: 2, streak: 1, best_streak: 3, total_entries: 10 },
    ],
    by_language: [],
  },
})

let overviewCalls = 0
let submitCalls = 0
let quizCalls = 0
let failSubmit = false

g.fetch = async (url: string, opts: any = {}) => {
  const raw = String(url)
  const path = raw.replace(/^https?:\/\/[^/]+/, '')
  const method = (opts.method || 'GET').toUpperCase()
  const json = (d: unknown, status = 200) => ({
    ok: status < 400,
    status,
    json: async () => d,
    text: async () => JSON.stringify(d),
    headers: { get: () => 'application/json' },
  })

  if (path.startsWith('/locales/')) {
    const lang = path.split('/')[2] === 'en' ? 'en' : 'fa'
    return json(JSON.parse(readFileSync(join(publicDir, 'locales', lang, 'translation.json'), 'utf8')))
  }
  if (path.startsWith('/api/language/overview')) {
    overviewCalls += 1
    return json(overview())
  }
  if (path.startsWith('/api/language/quiz/submit')) {
    submitCalls += 1
    if (failSubmit) return json({ message: 'دیتابیس در دسترس نیست' }, 503)
    const body = JSON.parse(opts.body || '{}')
    const details = (body.answers || []).map((row: any, i: number) => ({
      id: row.id,
      given: row.answer,
      answer: QUESTIONS[i]?.options[0] || '',
      correct: true,
      feedback: '',
      explanation: QUESTIONS[i]?.question || '',
    }))
    return json({ ok: true, correct: details.length, total: details.length, details, message: 'آفرین دخترم! 🌟' })
  }
  if (path.startsWith('/api/language/quiz')) {
    quizCalls += 1
    return json({ items: QUESTIONS, count: QUESTIONS.length })
  }
  if (method !== 'GET') return json({ ok: true })
  return json({ items: [] })
}

const React = await import('react')
const { act } = React as any
const { createRoot } = await import('react-dom/client')
const { createElement: h } = React as any

const i18nModule = await import('../src/shared/i18n')
await i18nModule.i18nReady
await i18nModule.default.changeLanguage('fa')

const LanguageBridge = (await import('../src/apps/LanguageBridge')).default

async function mount(element: any) {
  const host = w.document.createElement('div')
  w.document.body.appendChild(host)
  const root = createRoot(host)
  await act(async () => {
    root.render(element)
  })
  await act(async () => {
    await new Promise((r) => setTimeout(r, 280))
  })
  return { host, root }
}

const byText = (host: HTMLElement, text: string, tag = 'button') =>
  Array.from(host.querySelectorAll(tag)).find((b) => (b.textContent || '').includes(text))

async function click(el: Element | undefined | null, wait = 460) {
  if (!el) return false
  await act(async () => {
    el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }))
  })
  await act(async () => {
    await new Promise((r) => setTimeout(r, wait))
  })
  return true
}

console.log('🧪 آزمونِ کوییزِ پل زبان (نتیجه باید بماند)')
const { host } = await mount(h(LanguageBridge))

check('پل زبان بالا آمد', (host.textContent || '').includes('پل زبان') || (host.textContent || '').includes('دخترم'))

const { default: i18n } = i18nModule
await click(byText(host, i18n.t('language.tab.quiz')))
await click(byText(host, i18n.t('language.quizStart')))
check('کوییز شروع شد و اولین سؤال آمد', (host.textContent || '').includes('کلمه‌ی «دل»'), (host.textContent || '').slice(0, 60))
check('فقط یک‌بار سؤال گرفته شد', quizCalls === 1, String(quizCalls))

// سه پاسخ (آخرین پاسخ، کوییز را تمام می‌کند)
await click(byText(host, 'قلب'))
check('سؤال دوم آمد', (host.textContent || '').includes('«چشم» به ترکی'), (host.textContent || '').slice(0, 60))
await click(byText(host, 'گوز'))
check('سؤال سوم آمد', (host.textContent || '').includes('«خواب» به انگلیسی'), (host.textContent || '').slice(0, 60))
await click(byText(host, 'sleep'), 700)

const afterSubmit = host.textContent || ''
check('پاسخ‌ها یک‌بار ثبت شدند', submitCalls === 1, String(submitCalls))
check('آمارِ بالای صفحه تازه شد (onChanged کار کرد)', overviewCalls > 1, String(overviewCalls))
check('🎯 صفحه‌ی نتیجه بعد از پایان دیده می‌شود', afterSubmit.includes('آفرین دخترم'), afterSubmit.slice(0, 80))
check('نمره روی صفحه‌ی نتیجه است', /۳\s*\/\s*۳/.test(afterSubmit))
check('مرورِ پاسخ‌ها هم هست', afterSubmit.includes('جواب تو') || afterSubmit.includes('جواب درست'))
check('کوییز از اول شروع نشده', !afterSubmit.includes(i18n.t('language.quizStart')))

// «دوباره» → کوییز تازه (برگشت از صفحه‌ی نتیجه به سؤال اول)
await click(byText(host, i18n.t('language.again')), 700)
check('دکمه‌ی «دوباره» کوییز تازه می‌آورد', quizCalls === 2, String(quizCalls))
check('صفحه‌ی نتیجه بسته شد', !(host.textContent || '').includes('آفرین دخترم'))
check(
  'سؤال اول با گزینه‌هایش دوباره آمد',
  Boolean(byText(host, 'قلب')) && Boolean(byText(host, 'جان')),
  (host.querySelector('main')?.textContent || host.textContent || '').slice(-80),
)

// خطای شبکه در ثبت نتیجه نباید صفحه را بی‌واکنش بگذارد
failSubmit = true
await click(byText(host, 'قلب'))
await click(byText(host, 'گوز'))
await click(byText(host, 'sleep'), 700)
check('خطای ثبت، پیامِ روشن می‌دهد (نه سکوت)', (host.textContent || '').includes('دیتابیس در دسترس نیست'))

console.log(failCount === 0 ? '\n🎉 آزمونِ کوییز پاس شد' : `\n❌ ${failCount} بررسی ناموفق`)
process.exit(failCount === 0 ? 0 : 1)
