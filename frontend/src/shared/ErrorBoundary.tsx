/**
 * ErrorBoundary.tsx — نگهبان خطا برای اپ‌های LoveOS
 *
 * اگر یک اپ وسط کدش به خطا بخورد یا چانکش (که با lazy بارگذاری می‌شود) لود نشود،
 * به‌جای یک صفحه‌ی سفید/قفل‌شده پیام گرم بابا و دکمه‌ی «دوباره امتحان کن» نشان داده می‌شود.
 * این دقیقاً همان حالتی را پوشش می‌دهد که یک اپ باز می‌شود ولی محتوایش هیچ‌وقت نمی‌آید
 * (مثلاً نسخه‌ی قدیمی کش‌شده‌ی PWA که فایل جدیدش روی سرور نیست).
 */
import { Component, type ErrorInfo, type ReactNode } from 'react'

import { Icon } from './Icon'

interface Props {
  children: ReactNode
  title?: string
  /**
   * کلاسِ پوسته‌ی نگهبان. مهم: وقتی این نگهبان دورِ کلِ اپ گذاشته می‌شود
   * (main.tsx) باید `h-full w-full` بگیرد، وگرنه این `div` وسطِ زنجیره‌ی
   * ارتفاع می‌ایستد و پوسته‌ی سیستم (`h-full`) به‌جای تمام‌صفحه، به‌اندازه‌ی
   * محتوایش جمع می‌شود.
   */
  className?: string
}

interface State {
  error: Error | null
  tries: number
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, tries: 0 }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // فقط برای دیدن بابا در کنسول — هیچ‌وقت به کاربر نشان داده نمی‌شود
    console.error('[LoveOS] app crashed:', error, info.componentStack)
  }

  private retry = () => {
    this.setState((s) => ({ error: null, tries: s.tries + 1 }))
  }

  private hardReload = () => {
    // نسخه‌ی تازه‌ی اپ‌ها را از سرور می‌گیرد (برای چانک قدیمی کش‌شده)
    window.location.reload()
  }

  render() {
    if (!this.state.error) {
      return (
        <div key={this.state.tries} className={this.props.className}>
          {this.props.children}
        </div>
      )
    }
    const chunkError = /dynamically imported module|Loading chunk|MIME type|Importing a module script failed/i.test(
      this.state.error.message,
    )
    return (
      <div
        className={`${this.props.className ? `${this.props.className} ` : ''}flex flex-col items-center justify-center gap-3 py-12 text-center`}
      >
        <span className="text-3xl">🥺</span>
        <p className="os-title text-base">{this.props.title ? `«${this.props.title}» باز نشد` : 'این بخش باز نشد'}</p>
        <p className="max-w-xs text-xs leading-6 os-muted">
          {chunkError
            ? 'به‌نظر می‌رسد نسخه‌ی قدیمی اپ در حافظه‌ی مرورگر مانده. یک بار تازه‌سازی کن، درست می‌شود.'
            : 'یه مشکل کوچیک پیش اومد — دوباره امتحان کن؛ اگه باز نشد به بابا بگو.'}
        </p>
        <div className="flex gap-2">
          <button className="os-btn-primary" onClick={this.retry}>
            <span className="inline-flex items-center gap-1.5">
              <Icon name="retry" size={14} /> دوباره
            </span>
          </button>
          <button className="os-btn" onClick={this.hardReload}>
            تازه‌سازی
          </button>
        </div>
      </div>
    )
  }
}
