"use strict";
window.createQuizEngine = function (questions, supplements, roles) {
  const validAnswer = a => a === null || a === 'none' || a === 'unsure' || (Number.isInteger(a) && a >= 0 && a <= 4);
  const validArray = (a, n) => Array.isArray(a) && a.length === n && a.every(validAnswer);
  const ids = questions.map(q => q.id);
  const evidence = window.MATCH_EVIDENCE || {unknownDimensions: {}, closeGap: 3, maxMeanDistance: 20, balancedLow: 40, balancedHigh: 60};
  const required = Array.from({length: 6}, (_, d) => Math.ceil(questions.filter(q => q.dim === d).length * .6));
  function emptyState() {
    return {version: 3, questionIds: ids.slice(), answers: Array(questions.length).fill(null), index: 0, completed: false, migrated: false};
  }
  function calculate(answers) {
    return required.map((minimum, d) => {
      const values = questions.flatMap((q,i) => q.dim === d && typeof answers[i] === 'number' ? [q.reverse ? 4-answers[i] : answers[i]] : []);
      return {mainCount: values.length, count: values.length, required: minimum,
        value: values.length >= minimum ? values.reduce((a,b) => a+b,0)/values.length*25 : null};
    });
  }
  function rank(scores) {
    if (scores.some(s => s.value === null)) return [];
    return roles.map((r,i) => {
      const unknown = evidence.unknownDimensions[r.id] || [];
      const difference = r.v.map((v,d) => Math.abs(v-scores[d].value));
      return {r,i,distance:difference.reduce((a,b)=>a+b,0)/6,
        minDistance:difference.reduce((sum,v,d)=>sum+(unknown.includes(d)?0:v),0)/6,
        maxDistance:difference.reduce((sum,v,d)=>sum+(unknown.includes(d)?Math.max(scores[d].value,100-scores[d].value):v),0)/6,
        uncertainDimensions:unknown.slice()};
    })
      .sort((a,b) => a.distance-b.distance || a.i-b.i);
  }
  function assess(scores) {
    const ranked=rank(scores);
    if (!ranked.length) return {kind:'insufficient',primary:null,candidates:[],alternatives:[],note:'',ranked};
    const first=ranked[0];
    const competingMinimum=Math.min(...ranked.slice(1).map(x=>x.minDistance));
    const balanced=scores.every(s=>s.value>=evidence.balancedLow && s.value<=evidence.balancedHigh);
    const distant=first.distance>evidence.maxMeanDistance;
    const tied=ranked.length>1 && Math.abs(ranked[1].distance-first.distance)<1e-9;
    const uncertain=first.uncertainDimensions.length>0;
    const close=first.maxDistance+evidence.closeGap>=competingMinimum;
    // Select the closest editorial profile; uncertainty changes the explanation, not whether a result exists.
    const note=balanced?'这次回答的倾向较均衡，角色之间的区别较小。':distant?'这是现有角色中相对最接近的一位，整体相似程度仍有限。':tied?'另有同样接近的角色，可以展开一起看。':uncertain?'部分角色特征的依据有限，把它作为这次的首选参考。':close?'细微差别不必看得太重，结果供趣味参考。':'';
    const alternatives=ranked.slice(1).filter(x=>x.distance<=first.distance+evidence.closeGap).slice(0,2);
    return {kind:'match',primary:first,candidates:[first],alternatives,note,flags:{balanced,distant,tied,uncertain,close},ranked};
  }
  function restore(raw, legacy) {
    const s = emptyState();
    let source = raw, oldIds = null;
    if (source?.version === 3 && Array.isArray(source.questionIds) && new Set(source.questionIds).size === source.questionIds.length && validArray(source.answers, source.questionIds.length)) oldIds=source.questionIds;
    else if (source?.version === 2 && validArray(source.answers,60)) oldIds=window.QUESTION_BANK_IDS[2];
    else if (legacy?.version === 1 && validArray(legacy.answers,36)) {source=legacy;oldIds=window.QUESTION_BANK_IDS[1];}
    if (!oldIds) return s;
    const values=new Map(oldIds.map((id,i)=>[id,source.answers[i]]));
    s.answers=ids.map(id => values.has(id) ? values.get(id) : null);
    s.migrated=source.version!==3 || JSON.stringify(oldIds)!==JSON.stringify(ids);
    s.index=s.answers.findIndex(a=>a===null);
    if(s.index<0){s.index=questions.length-1;s.completed=true;}
    else if(!s.migrated && Number.isInteger(source.index)) s.index=Math.max(0,Math.min(questions.length-1,source.index));
    return s;
  }
  function record(s,answer) {
    if(answer===null || !validAnswer(answer)) throw new Error('无效的作答值');
    s.answers[s.index]=answer;s.completed=false;
  }
  function route(s) {
    const missing=s.answers.findIndex(a=>a===null);
    if(missing>=0){s.index=missing;s.completed=false;return 'quiz';}
    s.completed=true;return 'result';
  }
  function next(s) {if(s.index<questions.length-1){s.index++;return 'quiz';}return route(s);}
  function back(s) {s.completed=false;if(s.index>0){s.index--;return 'quiz';}return 'home';}
  return {emptyState,calculate,rank,assess,restore,record,route,next,back,required};
};
