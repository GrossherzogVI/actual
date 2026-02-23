import type { Config } from 'tailwindcss'

const config: Config = {
    content: [
        './index.html',
        './src/**/*.{js,ts,jsx,tsx}',
        '../../packages/design-system/src/**/*.{js,ts,jsx,tsx}'
    ],
    theme: {
        extend: {},
    },
    plugins: [],
}

export default config
