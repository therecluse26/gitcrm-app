// Zod's fast path compiles validators with new Function, which the Content Security Policy blocks
// (no 'unsafe-eval', docs/07). Zod tests for eval once, on its first parse, and that test logs a
// policy violation. main.tsx imports this module first, so jitless is set before any parse.
import { z } from 'zod';

z.config({ jitless: true });
