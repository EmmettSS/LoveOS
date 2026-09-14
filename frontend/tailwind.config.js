/** @type {import('tailwindcss').Config} */
// پالت LoveOS: صورتی پاستلی، بنفش ملایم، کرم، طلایی نرم / شب: سرمه‌ای و بنفش تیره
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        rose: {
          50: '#fff5f9', 100: '#ffe6f1', 200: '#ffd0e5', 300: '#ffb3d5',
          400: '#ff8cc0', 500: '#f767a8', 600: '#e0478d', 700: '#b8326f',
        },
        lilac: {
          100: '#f3ecff', 200: '#e6dbff', 300: '#d4c2ff', 400: '#bba0fb', 500: '#9f7aea',
        },
        cream: { 100: '#fffaf3', 200: '#fdf3e5', 300: '#f8e7d0' },
        gold: { 300: '#f7dba7', 400: '#efc478', 500: '#d9a441' },
        night: {
          900: '#0b1026', 800: '#141a3a', 700: '#1e2450', 600: '#2b2f6b', 500: '#3d3f8c',
        },
      },
      fontFamily: {
        sans: ['Vazirmatn', 'system-ui', 'sans-serif'],
        cute: ['Lalezar', 'Baloo Bhaijaan 2', 'Vazirmatn', 'cursive'],
        hand: ['Noto Nastaliq Urdu', 'Vazirmatn', 'serif'],
        mono: ['ui-monospace', 'Menlo', 'monospace'],
      },
      borderRadius: { xl2: '1.6rem', blob: '42% 58% 55% 45% / 48% 42% 58% 52%' },
      boxShadow: {
        soft: '0 18px 45px -20px rgba(216,112,170,0.45)',
        glow: '0 0 34px rgba(255,140,192,0.55)',
        night: '0 18px 45px -20px rgba(10,14,45,0.9)',
      },
      keyframes: {
        float: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-8px)' } },
        beat: { '0%,100%': { transform: 'scale(1)' }, '15%': { transform: 'scale(1.16)' }, '30%': { transform: 'scale(1)' }, '45%': { transform: 'scale(1.1)' } },
        twinkle: { '0%,100%': { opacity: '0.25' }, '50%': { opacity: '1' } },
        shake: { '0%,100%': { transform: 'translateX(0)' }, '20%': { transform: 'translateX(-9px)' }, '40%': { transform: 'translateX(9px)' }, '60%': { transform: 'translateX(-6px)' }, '80%': { transform: 'translateX(6px)' } },
        rise: { from: { transform: 'translateY(16px)', opacity: '0' }, to: { transform: 'translateY(0)', opacity: '1' } },
      },
      animation: {
        float: 'float 4s ease-in-out infinite',
        beat: 'beat 1.6s ease-in-out infinite',
        twinkle: 'twinkle 3s ease-in-out infinite',
        shake: 'shake 0.5s ease-in-out',
        rise: 'rise 0.45s ease-out both',
      },
    },
  },
  plugins: [],
}
