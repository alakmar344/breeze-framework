/**
 * Breeze Framework v1.1.0 — TypeScript Definitions
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
  computed<T>(fn: () => T): BreezeSignal<T>;
  computed<T>(key: string, deps: string[], fn: (...args: any[]) => T): BreezeAPI;
  effect(fn: () => void): () => void;
  batch<T>(fn: () => T): T;

  // Components & Lifecycle
  component(name: string, def: ComponentDefinition): BreezeAPI;
  onMount(fn: (root: Element) => void): BreezeAPI;
  onDestroy(fn: () => void): BreezeAPI;
  onUpdate(fn: (state: Record<string, any>) => void): BreezeAPI;

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

  // Plugins
  plugin(name: string, pluginObj: { install?: (api: BreezeAPI) => void; actions?: Record<string, Function> }): BreezeAPI;

  // DOM Helpers
  query<T extends Element = Element>(selector: string): T | null;
  queryAll<T extends Element = Element>(selector: string): NodeListOf<T>;

  // Event Bus
  on(event: string, handler: (data: any) => void): BreezeAPI;
  off(event: string, handler: (data: any) => void): BreezeAPI;
  emit(event: string, data?: any): BreezeAPI;

  // Utilities
  fetch(url: string, options?: RequestInit): Promise<any>;
  parse(source: string): AstNode[];
}

export const Breeze: BreezeAPI;
export default Breeze;
