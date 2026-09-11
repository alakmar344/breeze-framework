#!/usr/bin/env node
/** v2 bench: form-validate — validateObject over 10k forms. */
'use strict';
const { performance } = require('perf_hooks');
const { Breeze } = require('../breeze.js');

function runFormValidate(iters = 5) {
  const forms = new Array(10000);
  for (let i = 0; i < 10000; i++) {
    forms[i] = { name: i % 3 ? `User ${i}` : '', email: i % 2 ? `u${i}@x.com` : 'bad' };
  }
  const schema = { name: [Breeze.forms.required], email: [Breeze.forms.required, Breeze.forms.email] };
  const t0 = performance.now();
  let errs = 0;
  for (let k = 0; k < iters; k++) {
    for (let i = 0; i < forms.length; i++) {
      const e = Breeze.forms.validateObject(forms[i], schema);
      if (e.name || e.email) errs++;
    }
  }
  const ms = performance.now() - t0;
  return { msTotal: +ms.toFixed(2), perFormUs: +((ms / (forms.length * iters)) * 1000).toFixed(2), errs };
}
if (require.main === module) {
  const r = runFormValidate(3);
  console.log(`form-validate: ${r.msTotal} ms total, ${r.perFormUs} us/form`);
}
module.exports = { runFormValidate };
