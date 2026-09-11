/**
 * Breeze Framework v2.2.0 — TypeScript Definitions
 * Ultra-lightweight declarative frontend framework
 */

export interface BreezeSignal<T> {
  value: T;
  peek(): T;
  subscribe(fn: (value: T) => void): () => void;
}

export interface BreezeStateController<T> {
  get(): T;
  set(value: T): void;
  watch(callback: (next: T, prev: T) => void): void;
  signal: BreezeSignal<T>;
}

export interface BreezeStore<T> {
  get(): T;
  set(value: T): void;
  watch(callback: (next: T, prev: T) => void): void;
  update(fn: (prev: T) => T): void;
  reset(): void;
}

export interface SuspenseHandle<T> {
  state: BreezeSignal<'pending' | 'ready' | 'error'>;
  data: BreezeSignal<T | null>;
  error: BreezeSignal<any>;
  fallback: unknown;
}

export interface AstNode {
  type: string;
  tag?: string;
  id?: string | null;
  text?: string | null;
  args?: string[];
  modifiers?: string[];
  children?: AstNode[];
  indent?: number;
  key?: string;
  value?: any;
  props?: Record<string, any>;
  target?: string | null;
  name?: string;
  params?: string[];
  itemVar?: string;
  listKey?: string;
  keyProp?: string;
  conditionKey?: string;
  negate?: boolean;
}

export interface ProfilerReport {
  renders: number;
  renderTimeMs: number;
  domOps: {
    create: number;
    remove: number;
    move: number;
    text: number;
    attr: number;
  };
  signalUpdates: number;
  keyedDiffs: number;
  heapUsed: string;
}

export interface Profiler {
  recordRender(ms: number): void;
  recordDomOp(type: 'create' | 'remove' | 'move' | 'text' | 'attr'): void;
  recordSignalUpdate(): void;
  recordKeyedDiff(): void;
  getReport(): ProfilerReport;
  reset(): void;
}

export interface Router {
  params: Record<string, string>;
  query: Record<string, string>;
  setMode(mode: 'hash' | 'history'): Router;
  setOutlet(selector: string | null): Router;
  reset(): Router;
  beforeEach(guardFn: (to: string, from: string | null, next: (allow?: boolean | Promise<boolean>) => void) => void | boolean | Promise<boolean>): Router;
  init(): void;
  route(pattern: string, handler: (path: string, params: Record<string, string>, query?: Record<string, string>) => void | string | AstNode[] | Promise<any>): Router;
  navigate(path: string): void;
}

export interface SeoConfig {
  title?: string;
  description?: string;
  keywords?: string;
  author?: string;
  robots?: string;
  canonical?: string;
  image?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  ogUrl?: string;
  type?: string;
  twitterCard?: string;
  twitterTitle?: string;
  twitterDescription?: string;
  twitterImage?: string;
}

export interface AeoConfig {
  summary?: string;
  topics?: string;
  keyPoints?: string;
  speakable?: string | string[];
}

export interface GeoConfig {
  entities?: string;
  facts?: string;
}

export interface ComponentDefinition {
  props?: string[];
  setup?: (context: { props: Record<string, any> }) => Record<string, any>;
  render?: (context: { props: Record<string, any>; children?: AstNode[] }) => HTMLElement | null;
  template?: string;
}

export interface BreezeAPI {
  version: string;
  methods: Record<string, (...args: any[]) => any>;

  // Methods
  method(name: string, fn: (...args: any[]) => any): BreezeAPI;

  // Reactivity & Signals
  signal<T>(initialValue: T): BreezeSignal<T>;
  ref<T>(initialValue: T): BreezeSignal<T>;
  memo<T>(fn: () => T): BreezeSignal<T>;
  computed<T>(fn: () => T): BreezeSignal<T>;
  computed<T>(key: string, deps: string[], fn: (...args: any[]) => T): BreezeAPI;
  effect(fn: () => void): () => void;
  batch<T>(fn: () => T): T;
  schedule(fn: () => void): BreezeAPI;
  tick(): Promise<void>;
  nextTick(fn?: () => void): Promise<void>;

  // Components, Directives & Lifecycle
  component(name: string, def: ComponentDefinition): BreezeAPI;
  directive(name: string, def: { mount(el: Element, value: string): void }): BreezeAPI;
  onMount(fn: (root: Element) => void): BreezeAPI;
  onDestroy(fn: () => void): BreezeAPI;
  onUpdate(fn: (state: Record<string, any>) => void): BreezeAPI;
  onError(fn: (data: any) => void): BreezeAPI;

  // Profiler & Debugger
  profiler: Profiler;
  debug(enable?: boolean): BreezeAPI;

  // SSR & Hydration
  renderToString(sourceOrAst: string | AstNode[], state?: Record<string, any>): string;
  hydrate(sourceOrAst: string | AstNode[], rootSelector?: string | Element): BreezeAPI;

  // App Mount & Boot
  init(sourceUrl: string, rootSelector?: string): Promise<BreezeAPI>;
  mount(source: string, rootSelector?: string | Element): BreezeAPI;

  // Reactive State Store
  state<T = any>(key: string, initialValue?: T): BreezeStateController<T>;
  watch<T = any>(key: string, callback: (next: T, prev: T) => void): BreezeAPI;
  getState<T = any>(key: string): T;
  setState<T = any>(key: string, value: T): BreezeAPI;
  push<T = any>(key: string, item: T): BreezeAPI;
  remove(key: string, index: number): BreezeAPI;

  // SEO, Schema, AEO, GEO
  seo(config: SeoConfig): BreezeAPI;
  schema(data: Record<string, any>): BreezeAPI;
  aeo(config: AeoConfig): BreezeAPI;
  geo(config: GeoConfig): BreezeAPI;

  // Routing
  router: Router;
  route(pattern: string, handler: (path: string, params: Record<string, string>, query?: Record<string, string>) => void | string | AstNode[] | Promise<any>): BreezeAPI;
  navigate(path: string): BreezeAPI;
  outlet(selector: string | null): BreezeAPI;

  // v2 DX: store, context, suspense, portal, forms, i18n, a11y
  store<T = any>(name: string, initial?: T): BreezeStore<T>;
  provide(key: string, value: any): BreezeAPI;
  inject<T = any>(key: string, fallback?: T): T;
  refs: { set(name: string, el: Element | null): void; get(name: string): Element | null; clear(): void };
  refOf(name: string): Element | null;
  suspense<T = any>(promise: Promise<T>, opts?: { fallback?: unknown; onError?: (e: any) => void }): SuspenseHandle<T>;
  portal(children: AstNode[], target: string | Element): { type: 'portal'; children: AstNode[]; target: string | Element };
  errorBoundary<T>(fn: () => T | Promise<T>, fallback: T | ((e: any) => T)): T | Promise<T>;
  transition(el: string | Element, anim: string): BreezeAPI;
  forms: {
    required(v: any): string | null;
    email(v: any): string | null;
    min(len: number): (v: any) => string | null;
    validate(value: any, rules: Array<(v: any) => string | null>): string[];
    validateObject(obj: any, schema: Record<string, Array<(v: any) => string | null>>): Record<string, string[]>;
  };
  i18n: {
    locale(l?: string): string;
    add(locale: string, dict: Record<string, string>): void;
    t(key: string, vars?: Record<string, any>): string;
  };
  t(key: string, vars?: Record<string, any>): string;
  a11y: {
    announce(msg: string): void;
    focus(selOrEl: string | Element): void;
    trapFocus(container: Element): () => void;
  };
  announce(msg: string): BreezeAPI;
  codeframe(source: string, line: number): string;
  diagnostics(): Array<{ message: string; line: number | null }>;
  clearCache(): BreezeAPI;
  selectRow(container: string | Element, key: string | number, activeClass?: string): boolean;

  // Plugins
  plugin(name: string, pluginObj: { install?: (api: BreezeAPI) => void; actions?: Record<string, Function> }): BreezeAPI;

  // DOM Helpers
  query<T extends Element = Element>(selector: string): T | null;
  queryAll<T extends Element = Element>(selector: string): NodeListOf<T>;

  // Event Bus
  on(event: string, handler: (data: any) => void): BreezeAPI;
  off(event: string, handler: (data: any) => void): BreezeAPI;
  emit(event: string, data?: any): BreezeAPI;

  // Web Component & Configuration
  defineElement(tagName: string, template: string | AstNode[], options?: { observedAttributes?: string[]; shadow?: boolean; initialState?: Record<string, any>; connected?: () => void; disconnected?: () => void }): any;
  config: { warn: boolean; security: { sanitizeUrls: boolean } };
  sanitizeUrl(url: string): string;
  reportError(err: Error | unknown, context?: string): void;

  diagnostics: {
    graph(): {
      nodes: Array<{ id: string; type: 'signal' | 'computed' | 'effect'; value: any; label: string }>;
      edges: Array<{ from: string; to: string }>;
      hasCycle: boolean;
      cycles: string[][];
    };
    table(): any[];
    detectCycles(): { hasCycle: boolean; cycles: string[][] };
    reset(): void;
  };

  // Utilities
  fetch(url: string, options?: RequestInit): Promise<any>;
  parse(source: string, opts?: { noCache?: boolean }): AstNode[];
  render(sourceOrAst: string | AstNode | AstNode[], root?: any): any;
  calculateVirtualWindow(opts?: { scrollTop?: number; viewportHeight?: number; totalCount?: number; itemHeight?: number; overscan?: number }): { startIndex: number; endIndex: number; visibleCount: number; totalHeight: number; offsetY: number };
  testing: {
    calculateVirtualWindow(opts?: { scrollTop?: number; viewportHeight?: number; totalCount?: number; itemHeight?: number; overscan?: number }): { startIndex: number; endIndex: number; visibleCount: number; totalHeight: number; offsetY: number };
    renderToString(source: string | AstNode[], state?: Record<string, any>): string;
    parse(source: string, opts?: { noCache?: boolean }): AstNode[];
    splitArgs(inner: string): string[];
    fireAction(action: string, event?: any, el?: any): void;
    isStaticRowTemplate(children: AstNode[], itemVar: string): boolean;
    itemNodeToHtml(node: AstNode, itemVar: string, item: any, index: number, key?: string | number | null): string;
    renderRowsHtml(children: AstNode[], itemVar: string, items: any[], startIdx: number, keyProp: string): { html: string; keys: Array<string | number>; rootTag: string };
    compileRowSerializer(children: AstNode[], itemVar: string, keyProp: string, options?: { withKeys?: boolean }): { rootTag: string; render(items: any[], startIdx?: number): { html: string; keys: Array<string | number>; rootTag: string } };
  };
}

export const Breeze: BreezeAPI;
export default Breeze;

declare global {
  interface Window {
    __BREEZE_DEVTOOLS__?: {
      version: string;
      getGraph(): { nodes: Array<{ id: string; type: string; value: any; label: string }>; edges: Array<{ from: string; to: string }>; hasCycle: boolean; cycles: string[][] };
      getTable(): any[];
      getReport(): any;
      detectCycles(): { hasCycle: boolean; cycles: string[][] };
      onUpdate(fn: (data: any) => void): () => void;
    };
  }
}
