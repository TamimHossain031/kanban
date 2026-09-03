// Ambient declarations for non-code side-effect imports so TypeScript can
// resolve `import '@/styles/globals.css'` (and similar) without errors.
declare module '*.css';
declare module '*.scss';
