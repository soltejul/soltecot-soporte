import type { Config } from "tailwindcss";

const config: Config = {
    content: [
        "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/src/app/**/*.{js,ts,jsx,tsx,mdx}", // Por si acaso
        "./src/app/**/*.{js,ts,jsx,tsx,mdx}",     // Esta es la ruta clave ahora
    ],
    theme: {
        extend: {
            colors: {
                soltecot: {
                    cyan: "#5cddcf",     // Tu color Pantone® 3533 C
                    dark: "#1A1A1A",     // Tu 85% de negro
                    darker: "#0D0D0D",   // Para contrastes más profundos
                },
            },
            fontFamily: {
                poppins: ["var(--font-poppins)", "sans-serif"],
                montserrat: ["var(--font-montserrat)", "sans-serif"],
            },
        },
    },
    plugins: [],
};
export default config;