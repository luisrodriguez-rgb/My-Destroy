import { cp, mkdir } from 'node:fs/promises';

// The recovered archive stays untouched; Vite serves a disposable copy.
await mkdir('public/reference', { recursive: true });
await cp('My-Destroy-recuperado', 'public/reference', { recursive: true });
