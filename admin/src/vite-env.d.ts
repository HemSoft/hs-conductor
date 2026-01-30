/// <reference types="vite/client" />

// Electron webview element types for JSX
declare namespace JSX {
  interface IntrinsicElements {
    webview: React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement> & {
        src?: string;
        preload?: string;
        allowpopups?: boolean;
        nodeintegration?: boolean;
        nodeintegrationinsubframes?: boolean;
        plugins?: boolean;
        disablewebsecurity?: boolean;
        partition?: string;
        webpreferences?: string;
        useragent?: string;
        httpreferrer?: string;
      },
      HTMLElement
    >;
  }
}

// Electron WebviewTag interface
declare namespace Electron {
  interface WebviewTag extends HTMLElement {
    src: string;
    insertCSS(css: string): Promise<string>;
    executeJavaScript(code: string): Promise<unknown>;
    addEventListener(event: 'dom-ready', listener: () => void): void;
    addEventListener(event: 'did-finish-load', listener: () => void): void;
    addEventListener(event: 'did-fail-load', listener: (event: Event) => void): void;
    removeEventListener(event: string, listener: (...args: unknown[]) => void): void;
  }
}
