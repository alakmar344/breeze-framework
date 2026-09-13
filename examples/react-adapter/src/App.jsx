import { useEffect, useRef, useState } from 'react';
import { registerBreezeCounter } from './breeze-counter.js';

// Registering a custom element is idempotent and side-effect-only; doing it
// once at module scope (before React ever renders) is the normal pattern —
// same as you'd do with any other Web Component library in a React app.
registerBreezeCounter();

export default function App() {
  // Props flowing IN to the Breeze element: a real React state value passed
  // down as a plain DOM attribute on the custom element.
  const [initialCount] = useState(5);

  // Events flowing OUT of the Breeze element: mirrored into real React state
  // via a `ref` + native `addEventListener('bz-change', ...)`. This is
  // necessary — and the whole point of this example — because React's JSX
  // event props (`onClick`, `onChange`, ...) only understand React's own
  // synthetic event names for known DOM events. A custom event dispatched by
  // a Web Component (like `bz-change`) is NOT one of those, so a JSX prop
  // like `onBzChange={...}` would silently do nothing. `ref` + `addEventListener`
  // is the documented, correct way to listen to custom-element events in React.
  const [lastReportedCount, setLastReportedCount] = useState(initialCount);
  const [changeLog, setChangeLog] = useState([]);
  const counterRef = useRef(null);

  useEffect(() => {
    const el = counterRef.current;
    if (!el) return undefined;

    const handleBzChange = (event) => {
      setLastReportedCount(event.detail.count);
      setChangeLog((log) => [...log.slice(-4), `bz-change -> count = ${event.detail.count}`]);
    };

    el.addEventListener('bz-change', handleBzChange);
    return () => el.removeEventListener('bz-change', handleBzChange);
  }, []);

  return (
    <main className="app">
      <h1>React ⇄ Breeze: a real Custom Element, both directions</h1>
      <p className="lede">
        <code>&lt;breeze-counter&gt;</code> below is a native{' '}
        <a href="https://developer.mozilla.org/en-US/docs/Web/API/Web_components">
          Web Component
        </a>{' '}
        registered via <code>Breeze.defineElement()</code>. Its markup, state, and click
        handling are 100% Breeze's own <code>.breeze</code> compiler and DOM renderer — React
        never touches its internals. React only sees a DOM element.
      </p>

      <section className="panel">
        <h2>1. Props in — React → Breeze</h2>
        <p>
          React passes <code>count={'{'}initialCount{'}'}</code> down as a plain attribute.
          Breeze's <code>observedAttributes</code> hook reads it once on connect and seeds its
          own internal <code>@state count</code>.
        </p>
        <breeze-counter ref={counterRef} count={initialCount}></breeze-counter>
      </section>

      <section className="panel">
        <h2>2. Events out — Breeze → React</h2>
        <p>
          Every click inside the Breeze component (−1 / Reset / +1) runs entirely inside
          Breeze's own action system. Breeze then dispatches a real, bubbling{' '}
          <code>CustomEvent('bz-change')</code> on the host element, which React observes via{' '}
          <code>ref.current.addEventListener(...)</code> and mirrors into genuine React state
          below — no polling, no prop drilling into Breeze internals.
        </p>
        <p>
          Last count reported by Breeze: <strong>{lastReportedCount}</strong>
        </p>
        <ul className="log">
          {changeLog.length === 0 && <li className="log-empty">(click a button above)</li>}
          {changeLog.map((entry, i) => (
            <li key={i}>{entry}</li>
          ))}
        </ul>
      </section>
    </main>
  );
}
