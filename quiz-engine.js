'use strict';
// 这是按角色差异选择补充维度的产品规则，不是经过校准的自适应心理测量模型。
window.createQuizEngine = function (questions, supplements, roles) {
  const validAnswer = a => a === null || a === 'none' || a === 'unsure' || (Number.isInteger(a) && a >= 0 && a <= 4);
  const validArray = (a, n) => Array.isArray(a) && a.length === n && a.every(validAnswer);
  const signature = a => JSON.stringify(a);
  const required = Array.from({length: 6}, (_, d) => Math.ceil(questions.filter(q => q.dim === d).length * .6));
  function emptyState() {
    return {version: 2, answers: Array(questions.length).fill(null), index: 0, stage: 'main',
      supplementAnswers: Array(supplements.length).fill(null), supplementOrder: [], supplementIndex: 0,
      supplementKey: '', completed: false, migrated: false, returnToSupplement: false};
  }
  function clearSupplement(s) {
    s.supplementAnswers = Array(supplements.length).fill(null);
    s.supplementOrder = []; s.supplementIndex = 0; s.supplementKey = '';
    s.completed = false; s.returnToSupplement = false;
  }
  function calculate(answers, extra = []) {
    return required.map((minimum, d) => {
      const values = questions.flatMap((q, i) => q.dim === d && typeof answers[i] === 'number' ? [q.reverse ? 4 - answers[i] : answers[i]] : []);
      const more = supplements.flatMap((q, i) => q.dim === d && typeof extra[i] === 'number' ? [q.reverse ? 4 - extra[i] : extra[i]] : []);
      const all = values.concat(more);
      return {mainCount: values.length, supplementCount: more.length, count: all.length, required: minimum,
        value: values.length >= minimum ? all.reduce((a, b) => a + b, 0) / all.length * 25 : null};
    });
  }
  function rank(scores) {
    if (scores.some(s => s.value === null)) return [];
    return roles.map((r, i) => ({r, i, distance: r.v.reduce((sum, v, d) => sum + Math.abs(v - scores[d].value), 0) / 6}))
      .sort((a, b) => a.distance - b.distance || a.i - b.i);
  }
  function needsSupplement(scores) {
    const order = rank(scores);
    return order.length > 1 && order[1].distance - order[0].distance < 3;
  }
  function supplementOrder(scores) {
    const top = rank(scores).slice(0, 3);
    if (top.length < 2) return [];
    // 前几位在哪些维度上差异较大，就先补这些维度；每个维度一正一反两题。
    const dims = required.map((_, d) => ({d, spread: Math.max(...top.map(x => x.r.v[d])) - Math.min(...top.map(x => x.r.v[d]))}))
      .sort((a, b) => b.spread - a.spread || a.d - b.d);
    return dims.flatMap(({d}) => supplements.flatMap((q, i) => q.dim === d ? [i] : []));
  }
  function validOrder(order) {
    if (!Array.isArray(order) || ![0, 6, 12].includes(order.length) || new Set(order).size !== order.length) return false;
    if (!order.every(i => Number.isInteger(i) && i >= 0 && i < supplements.length)) return false;
    return required.every((_, d) => {
      const selected = order.filter(i => supplements[i].dim === d);
      return selected.length === 0 || (selected.length === 2 && supplements[selected[0]].reverse !== supplements[selected[1]].reverse);
    });
  }
  function restore(raw, legacy) {
    const s = emptyState();
    if (raw?.version === 2 && validArray(raw.answers, questions.length)) {
      s.answers = raw.answers.slice();
      s.index = Number.isInteger(raw.index) ? Math.max(0, Math.min(questions.length - 1, raw.index)) : 0;
      if (validArray(raw.supplementAnswers, supplements.length) && validOrder(raw.supplementOrder) && raw.supplementKey === signature(s.answers)) {
        s.supplementOrder = raw.supplementOrder.slice();
        // 只有当前路由里出现过的题能进入计分，丢弃其他键上的伪造或过期答案。
        s.supplementAnswers = raw.supplementAnswers.map((a, i) => s.supplementOrder.includes(i) ? a : null);
        s.supplementKey = raw.supplementKey;
        s.supplementIndex = Number.isInteger(raw.supplementIndex) ? Math.max(0, Math.min(s.supplementOrder.length - 1, raw.supplementIndex)) : 0;
        s.stage = raw.stage === 'supplement' && s.supplementOrder.length ? 'supplement' : 'main';
      }
      s.completed = Boolean(raw.completed) && s.answers.every(a => a !== null) && s.supplementOrder.every(i => s.supplementAnswers[i] !== null);
      return s;
    }
    if (legacy?.version === 1 && validArray(legacy.answers, 36)) {
      s.answers.splice(0, 36, ...legacy.answers);
      s.index = Math.max(0, s.answers.findIndex(a => a === null));
      s.migrated = true;
    }
    return s;
  }
  function record(s, answer) {
    if (answer === null || !validAnswer(answer)) throw new Error('无效的作答值');
    if (s.stage === 'main') {
      if (s.answers[s.index] !== answer) clearSupplement(s);
      s.answers[s.index] = answer;
    } else {
      const item = s.supplementOrder[s.supplementIndex];
      if (!Number.isInteger(item)) throw new Error('无效的补充题路由');
      s.supplementAnswers[item] = answer;
    }
    s.completed = false;
  }
  function route(s) {
    const missing = s.answers.findIndex(a => a === null);
    if (missing >= 0) { s.stage = 'main'; s.index = missing; s.completed = false; return 'quiz'; }
    const core = calculate(s.answers);
    if (!s.supplementOrder.length) {
      if (!needsSupplement(core)) { s.completed = true; return 'result'; }
      s.supplementOrder = supplementOrder(core).slice(0, 6);
      s.supplementKey = signature(s.answers);
    }
    let unanswered = s.supplementOrder.findIndex(i => s.supplementAnswers[i] === null);
    if (unanswered < 0 && s.supplementOrder.length === 6 && needsSupplement(calculate(s.answers, s.supplementAnswers))) {
      const rest = supplementOrder(core).filter(i => !s.supplementOrder.includes(i));
      s.supplementOrder.push(...rest);
      unanswered = 6;
    }
    if (unanswered < 0) { s.completed = true; return 'result'; }
    s.stage = 'supplement'; s.supplementIndex = unanswered; s.completed = false; return 'quiz';
  }
  function next(s) {
    if (s.stage === 'main' && s.index < questions.length - 1) { s.index++; return 'quiz'; }
    if (s.stage === 'main' && s.returnToSupplement && s.supplementOrder.length) {
      s.returnToSupplement = false; s.stage = 'supplement'; s.supplementIndex = 0; return 'quiz';
    }
    if (s.stage === 'supplement' && s.supplementIndex < s.supplementOrder.length - 1) { s.supplementIndex++; return 'quiz'; }
    return route(s);
  }
  function back(s) {
    s.completed = false;
    if (s.stage === 'supplement') {
      if (s.supplementIndex > 0) s.supplementIndex--;
      else { s.stage = 'main'; s.index = questions.length - 1; s.returnToSupplement = true; }
      return 'quiz';
    }
    if (s.index > 0) { s.index--; return 'quiz'; }
    return 'home';
  }
  return {emptyState, calculate, rank, needsSupplement, supplementOrder, restore, record, route, next, back, required, validOrder};
};
