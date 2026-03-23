/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        "./app/**/*.{js,jsx}",
        "./components/**/*.{js,jsx}",
        "./src/**/*.{js,jsx}"
    ],
    theme: {
        extend: {
            colors: {
                sand: "#f5efe3",
                terracotta: "#b85d3a",
                forest: "#1f5b4b"
            }
        }
    },
    plugins: []
};
