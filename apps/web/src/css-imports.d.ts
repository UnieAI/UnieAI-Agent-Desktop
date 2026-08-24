/**
 * Side-effect stylesheet imports this shell performs.
 *
 * The shell is where third-party GLOBAL CSS belongs: vite builds it, so a
 * stylesheet can be named by package specifier, and the sheet keeps its own
 * class names instead of being renamed by CSS modules.
 */
declare module '*.css'
