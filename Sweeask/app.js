/* ============================================================
   SWEEASK — app.js  v1.2.0
   Full task engine: storage, XP, recurrence, rendering,
   command palette, settings, templates, focus timer.
   Loaded by app.html. Requires Chart.js on the page.
   ============================================================ */

(function (global) {
  'use strict';

  /* ──────────────────────────────────────────
     CONSTANTS
  ────────────────────────────────────────── */
  var SK          = 'tpv3';
  var SK_C        = 'tpv3c';
  var SK_XP       = 'sweeask-xp';
  var SK_SETTINGS = 'sweeask-settings';
  var THEME_KEY   = 'sweeask-theme';

  var XP_POINTS = { Low: 10, Med: 20, High: 35, Crit: 50 };
  var XP_LEVELS  = [0, 100, 250, 500, 900, 1400, 2100, 3000, 4200, 5800, 8000];
  var LEVEL_NAMES = [
    'Beginner','Explorer','Achiever','Challenger','Focused',
    'Expert','Master','Elite','Legend','Champion','Grandmaster'
  ];
  var NAVS = [
    'today','all','recurring','week','month','calendar',
    'events','meetings','deadlines','habits',
    'high','medium','low',
    'analytics','heatmap','focus','skills'
  ];
  var NAV_TITLES = {
    today:'Today', all:'All Tasks', recurring:'Recurring Tasks',
    week:'This Week', month:'Monthly Grid', calendar:'Calendar',
    events:'Events', meetings:'Meetings', deadlines:'Deadlines', habits:'Habits',
    high:'High Priority', medium:'Medium Priority', low:'Low Priority',
    analytics:'Analytics', heatmap:'Heatmap', focus:'Focus Timer', skills:'Skills & XP'
  };

  /* ──────────────────────────────────────────
     STATE
  ────────────────────────────────────────── */
  var tasks       = [];
  var completions = {};
  var settings    = {
    sound: true, vol: 70, notif: false,
    peakStart: '09:00', peakEnd: '12:00',
    xp: true, lvlNotif: true
  };
  var xpData = { total: 0, level: 1, tasks: 0, skills: {} };

  var nav         = 'today';
  var fPrio       = 'Low';
  var fType       = 'Task';
  var fStat       = 'Todo';
  var fRecur      = 'none';
  var pendDel     = null;
  var charts      = {};
  var toastTimer  = null;
  var weekOffset  = 0;
  var calY, calM;

  // Timer
  var tSec = 1500, tOn = false, tIv = null;
  var pomos = 0, isBreak = false, fMode = 'work';
  var TMODES = { work: 1500, short: 300, long: 900 };

  // Audio
  var AudioCtx = global.AudioContext || global.webkitAudioContext;
  var audioCtx = null;

  // Command Palette
  var cpOpen = false, cpIdx = 0;
  var cpCmds = [], cpTaskMatches = [];

  // Notification permission
  var notifOK = false;

  /* ──────────────────────────────────────────
     STORAGE
  ────────────────────────────────────────── */
  function save()    { localStorage.setItem(SK, JSON.stringify(tasks)); }
  function saveC()   { localStorage.setItem(SK_C, JSON.stringify(completions)); }
  function saveXP()  { localStorage.setItem(SK_XP, JSON.stringify(xpData)); }
  function saveSett(){ localStorage.setItem(SK_SETTINGS, JSON.stringify(settings)); }

  function loadAll() {
    try { var r = localStorage.getItem(SK);          tasks       = r ? JSON.parse(r) : [];       } catch(e){ tasks = []; }
    try { var r = localStorage.getItem(SK_C);        completions = r ? JSON.parse(r) : {};       } catch(e){ completions = {}; }
    try { var r = localStorage.getItem(SK_XP);       if(r) xpData    = Object.assign(xpData, JSON.parse(r));    } catch(e){}
    try { var r = localStorage.getItem(SK_SETTINGS); if(r) settings  = Object.assign(settings, JSON.parse(r)); } catch(e){}
    notifOK = !!settings.notif;
  }

  /* ──────────────────────────────────────────
     THEME
  ────────────────────────────────────────── */
  function setTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    localStorage.setItem(THEME_KEY, t);
    document.querySelectorAll('[data-theme-btn]').forEach(function(b) {
      b.classList.toggle('active', b.getAttribute('data-theme-btn') === t);
    });
  }
  function initTheme() {
    setTheme(localStorage.getItem(THEME_KEY) || 'default');
    document.querySelectorAll('[data-theme-btn]').forEach(function(b) {
      b.addEventListener('click', function() { setTheme(this.getAttribute('data-theme-btn')); });
    });
  }

  /* ──────────────────────────────────────────
     UTILS
  ────────────────────────────────────────── */
  function todayStr(d) {
    if (!d) d = new Date();
    return d.toISOString().slice(0, 10);
  }
  function esc(s) {
    return String(s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function toast(msg, type) {
    if (!type) type = 'ok';
    var el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.className = type + ' on';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function() { el.className = ''; }, 3100);
  }

  /* ──────────────────────────────────────────
     AUDIO
  ────────────────────────────────────────── */
  function getAC() {
    if (!audioCtx && AudioCtx) {
      try { audioCtx = new AudioCtx(); } catch(e) {}
    }
    return audioCtx;
  }
  function snd(type) {
    if (!settings.sound) return;
    var a = getAC(); if (!a) return;
    var vol = (settings.vol || 70) / 100 * 0.28;
    try {
      if (type === 'done') {
        [523, 659, 784].forEach(function(f, i) {
          (function(f, d) {
            var o = a.createOscillator(), g = a.createGain();
            o.connect(g); g.connect(a.destination);
            o.type = 'sine'; o.frequency.value = f;
            g.gain.setValueAtTime(vol, a.currentTime + d);
            g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + d + 0.35);
            o.start(a.currentTime + d); o.stop(a.currentTime + d + 0.4);
          })(f, i * 0.1);
        });
      } else if (type === 'add') {
        var o = a.createOscillator(), g = a.createGain();
        o.connect(g); g.connect(a.destination);
        o.type = 'sine';
        o.frequency.setValueAtTime(440, a.currentTime);
        o.frequency.setValueAtTime(550, a.currentTime + 0.07);
        g.gain.setValueAtTime(vol * 0.7, a.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + 0.22);
        o.start(); o.stop(a.currentTime + 0.25);
      } else if (type === 'del') {
        var o = a.createOscillator(), g = a.createGain();
        o.connect(g); g.connect(a.destination);
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(220, a.currentTime);
        o.frequency.exponentialRampToValueAtTime(100, a.currentTime + 0.2);
        g.gain.setValueAtTime(vol * 0.5, a.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + 0.22);
        o.start(); o.stop(a.currentTime + 0.25);
      } else if (type === 'timer') {
        [440, 550, 660, 880].forEach(function(f, i) {
          (function(f, d) {
            var o = a.createOscillator(), g = a.createGain();
            o.connect(g); g.connect(a.destination);
            o.frequency.value = f;
            g.gain.setValueAtTime(vol, a.currentTime + d);
            g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + d + 0.3);
            o.start(a.currentTime + d); o.stop(a.currentTime + d + 0.35);
          })(f, i * 0.12);
        });
      }
    } catch(e) {}
  }

  /* ──────────────────────────────────────────
     NOTIFICATIONS
  ────────────────────────────────────────── */
  function reqNotif() {
    if (!('Notification' in global)) { toast('Not supported', 'warn'); return; }
    Notification.requestPermission().then(function(p) {
      notifOK = p === 'granted';
      settings.notif = notifOK;
      saveSett();
      var el = document.getElementById('st-notif');
      if (el) el.checked = notifOK;
      toast(notifOK ? '🔔 Notifications enabled!' : 'Blocked by browser', 'info');
    });
  }
  function sendNotif(title, body) {
    if (notifOK && document.hidden) {
      try { new Notification(title, { body: body }); } catch(e) {}
    }
  }

  /* ──────────────────────────────────────────
     XP SYSTEM
  ────────────────────────────────────────── */
  function getLevel(xp) {
    for (var i = XP_LEVELS.length - 1; i >= 0; i--) {
      if (xp >= XP_LEVELS[i]) return i + 1;
    }
    return 1;
  }
  function getLevelName(lvl) {
    return LEVEL_NAMES[Math.min(lvl - 1, LEVEL_NAMES.length - 1)];
  }
  function xpForNext(lvl) {
    return XP_LEVELS[Math.min(lvl, XP_LEVELS.length - 1)] || XP_LEVELS[XP_LEVELS.length - 1];
  }
  function xpProgress(xp) {
    var lvl  = getLevel(xp);
    var base = XP_LEVELS[Math.min(lvl - 1, XP_LEVELS.length - 1)];
    var next = xpForNext(lvl);
    if (next <= base) return 100;
    return Math.round((xp - base) / (next - base) * 100);
  }
  function awardXP(task) {
    if (!settings.xp) return;
    var pts = XP_POINTS[task.priority || 'Low'] || 10;
    if (task.recur && task.recur !== 'none') pts = Math.round(pts * 1.2);
    var oldLvl = getLevel(xpData.total);
    xpData.total += pts;
    xpData.tasks = (xpData.tasks || 0) + 1;
    if (task.skill) {
      var sk = task.skill.toLowerCase().trim();
      xpData.skills[sk] = (xpData.skills[sk] || 0) + pts;
    }
    saveXP();
    var newLvl = getLevel(xpData.total);
    if (newLvl > oldLvl && settings.lvlNotif) showLevelUp(newLvl);
    updateXPBar();
  }
  function updateXPBar() {
    var xp   = xpData.total;
    var lvl  = getLevel(xp);
    var pct  = xpProgress(xp);
    var elLvl  = document.getElementById('sb-level');
    var elPts  = document.getElementById('sb-xp-pts');
    var elFill = document.getElementById('sb-xp-fill');
    var elWrap = document.getElementById('xp-bar-wrap');
    if (elLvl)  elLvl.textContent  = 'Level ' + lvl + ' · ' + getLevelName(lvl);
    if (elPts)  elPts.textContent  = xp + ' XP';
    if (elFill) elFill.style.width = pct + '%';
    if (elWrap) elWrap.style.display = settings.xp ? 'block' : 'none';
  }
  function showLevelUp(lvl) {
    var el  = document.getElementById('xp-levelup');
    var txt = document.getElementById('xp-levelup-text');
    if (txt) txt.textContent = 'You reached Level ' + lvl + ' — ' + getLevelName(lvl) + '!';
    if (el) {
      el.classList.add('show');
      setTimeout(function() { el.classList.remove('show'); }, 3500);
    }
    snd('done');
  }

  /* ──────────────────────────────────────────
     SETTINGS
  ────────────────────────────────────────── */
  global.saveSetting = function(k, v) { settings[k] = v; saveSett(); };
  global.toggleNotif = function(val)  { if (val) reqNotif(); else { notifOK = false; settings.notif = false; saveSett(); } };

  global.openSettings = function() {
    document.getElementById('settings-overlay').classList.add('on');
    // Sync UI to state
    _setSetting('st-sound',      'checked',  settings.sound);
    _setSetting('st-vol',        'value',    settings.vol);
    _setSetting('st-notif',      'checked',  settings.notif);
    _setSetting('st-peak-start', 'value',    settings.peakStart || '09:00');
    _setSetting('st-peak-end',   'value',    settings.peakEnd   || '12:00');
    _setSetting('st-xp',         'checked',  settings.xp);
    _setSetting('st-lvlnotif',   'checked',  settings.lvlNotif);
    // Storage info
    try {
      var sz = JSON.stringify(tasks).length + JSON.stringify(completions).length;
      _textContent('sp-storage', (sz / 1024).toFixed(1) + ' KB');
      _textContent('sp-total', tasks.length + ' tasks');
    } catch(e) {}
    // theme buttons inside panel
    document.querySelectorAll('.sp-theme-btn').forEach(function(b) {
      b.classList.toggle('on', b.getAttribute('data-theme-btn') === (localStorage.getItem(THEME_KEY) || 'default'));
    });
  };
  global.closeSettings = function() { document.getElementById('settings-overlay').classList.remove('on'); };
  global.closeSettingsOnBg = function(e) { if (e.target === document.getElementById('settings-overlay')) global.closeSettings(); };

  function _setSetting(id, prop, val) { var el = document.getElementById(id); if (el) el[prop] = val; }
  function _textContent(id, val)      { var el = document.getElementById(id); if (el) el.textContent = val; }

  global.nukeAll = function() {
    if (!confirm('Delete ALL tasks and XP data? This cannot be undone.')) return;
    tasks = []; completions = {};
    xpData = { total: 0, level: 1, tasks: 0, skills: {} };
    save(); saveC(); saveXP(); render(); updateXPBar();
    global.closeSettings();
    toast('All data cleared', 'err');
  };

  /* ──────────────────────────────────────────
     RECURRENCE
  ────────────────────────────────────────── */
  function showsOnDate(task, ds) {
    if (!task.recur || task.recur === 'none') return task.date === ds;
    var start = task.startDate || task.date || '2020-01-01';
    if (ds < start) return false;
    var d = new Date(ds + 'T00:00:00'), dow = d.getDay();
    if (task.recur === 'daily')   return true;
    if (task.recur === 'weekday') return dow >= 1 && dow <= 5;
    if (task.recur === 'weekly')  { var sd = new Date(start + 'T00:00:00'); return d.getDay() === sd.getDay(); }
    if (task.recur === 'monthly') { var sd2 = new Date(start + 'T00:00:00'); return d.getDate() === sd2.getDate(); }
    return false;
  }
  function tasksOn(ds) { return tasks.filter(function(t) { return showsOnDate(t, ds); }); }

  /* ──────────────────────────────────────────
     COMPLETIONS
  ────────────────────────────────────────── */
  function cKey(id, ds) { return id + '_' + ds; }
  function isComp(task, ds) {
    if (!task.recur || task.recur === 'none') return !!task.completed;
    return !!completions[cKey(task.id, ds)];
  }
  function setComp(task, ds, val) {
    if (!task.recur || task.recur === 'none') {
      task.completed   = val;
      task.completedAt = val ? new Date().toISOString() : null;
      save();
    } else {
      var k = cKey(task.id, ds);
      if (val) completions[k] = true; else delete completions[k];
      saveC();
    }
  }

  /* ──────────────────────────────────────────
     PEAK HOURS
  ────────────────────────────────────────── */
  function isPeak(timeStr) {
    if (!timeStr || !settings.peakStart || !settings.peakEnd) return false;
    return timeStr >= settings.peakStart && timeStr <= settings.peakEnd;
  }

  /* ──────────────────────────────────────────
     PILL SELECTORS
  ────────────────────────────────────────── */
  global.sType  = function(t) { fType = t;  _pills('pt-', ['Task','Event','Meeting','Deadline','Habit'], t, 'on-type'); };
  global.sPrio  = function(p) { fPrio = p;  var m={Low:'on-low',Med:'on-med',High:'on-high',Crit:'on-crit'}; _pills2('pp-', ['Low','Med','High','Crit'], p, m); };
  global.sStat  = function(s) { fStat = s;  _pills('ps-', ['Todo','Progress','Done','Blocked'], s, 'on-stat'); };
  global.sRecur = function(r) { fRecur = r; _pills('pr-', ['none','daily','weekday','weekly','monthly'], r, 'on-stat'); };

  function _pills(prefix, list, active, cls) {
    list.forEach(function(x) {
      var el = document.getElementById(prefix + x);
      if (el) el.className = 'pill' + (x === active ? ' ' + cls : '');
    });
  }
  function _pills2(prefix, list, active, classMap) {
    list.forEach(function(x) {
      var el = document.getElementById(prefix + x);
      if (el) el.className = 'pill' + (x === active ? ' ' + classMap[x] : '');
    });
  }

  /* ──────────────────────────────────────────
     FORM
  ────────────────────────────────────────── */
  global.toggleForm = function() {
    var f = document.getElementById('af');
    if (!f) return;
    if (f.style.display === 'none') {
      f.style.display = 'block';
      setTimeout(function() {
        var t = document.getElementById('f-title');
        if (t) t.focus();
      }, 40);
    } else {
      f.style.display = 'none';
    }
  };

  global.addTask = function() {
    var titleEl = document.getElementById('f-title');
    var title   = titleEl ? titleEl.value.trim() : '';
    if (!title) { toast('Enter a task title', 'warn'); return; }

    var t = {
      id:          Date.now(),
      title:       title,
      note:        _val('f-note'),
      type:        fType,
      priority:    fPrio,
      status:      fStat,
      date:        _val('f-date'),
      startDate:   _val('f-date') || todayStr(),
      timeStart:   _val('f-tstart'),
      timeEnd:     _val('f-tend'),
      recur:       fRecur,
      tag:         _val('f-tag'),
      skill:       _val('f-skill'),
      est:         _val('f-est'),
      completed:   fStat === 'Done',
      completedAt: fStat === 'Done' ? new Date().toISOString() : null,
      createdAt:   new Date().toISOString()
    };
    tasks.unshift(t);
    ['f-title','f-note','f-tag','f-skill','f-est','f-tstart','f-tend'].forEach(function(id) {
      var el = document.getElementById(id); if (el) el.value = '';
    });
    document.getElementById('af').style.display = 'none';
    global.sType('Task'); global.sPrio('Low'); global.sStat('Todo'); global.sRecur('none');
    save(); render(); snd('add');
    toast(fRecur !== 'none' ? '🔁 Recurring task added!' : '✅ Task added!', 'ok');
    sendNotif('Task added', t.title);
  };

  function _val(id) { var el = document.getElementById(id); return el ? el.value : ''; }

  /* ──────────────────────────────────────────
     TASK ACTIONS
  ────────────────────────────────────────── */
  global.togTask = function(id, ds) {
    if (!ds) ds = todayStr();
    var t = tasks.find(function(x) { return x.id === id; });
    if (!t) return;
    var cur = isComp(t, ds);
    setComp(t, ds, !cur);
    if (!cur) { snd('done'); toast('🎉 Done!', 'ok'); sendNotif('Task done!', t.title); awardXP(t); }
    render();
  };

  global.askDel = function(id) {
    pendDel = id;
    document.getElementById('ov').classList.add('on');
    document.getElementById('cdel').onclick = function() {
      tasks = tasks.filter(function(t) { return t.id !== pendDel; });
      Object.keys(completions).forEach(function(k) {
        if (k.indexOf(pendDel + '_') === 0) delete completions[k];
      });
      save(); saveC(); render();
      global.closeMod(); snd('del'); toast('Deleted', 'err');
    };
  };

  global.closeMod = function() {
    document.getElementById('ov').classList.remove('on');
    pendDel = null;
  };

  global.handleCb  = function(el) { global.togTask(parseInt(el.getAttribute('data-id'), 10), el.getAttribute('data-ds')); };
  global.handleDel = function(el) { global.askDel(parseInt(el.getAttribute('data-id'), 10)); };

  /* ──────────────────────────────────────────
     NAVIGATION
  ────────────────────────────────────────── */
  global.go = function(n) {
    nav = n;
    NAVS.forEach(function(x) {
      var el = document.getElementById('ni-' + x); if (el) el.className = 'ni' + (x === n ? ' on' : '');
      var v  = document.getElementById('v-' + x);  if (v)  v.style.display = x === n ? 'block' : 'none';
    });
    _textContent('pg-t', NAV_TITLES[n] || n);
    var sb = document.getElementById('appSidebar'); if (sb) sb.classList.remove('sb-open');
    var ov = document.getElementById('sbOverlay');  if (ov) ov.classList.remove('on');
    render();
  };

  global.weekOffset = 0;
  global.calPrev = function() { calM--; if (calM < 0) { calM = 11; calY--; } render(); };
  global.calNext = function() { calM++; if (calM > 11) { calM = 0;  calY++; } render(); };
  global.toggleMobileSb = function() {
    var sb = document.getElementById('appSidebar'); if (sb) sb.classList.toggle('sb-open');
    var ov = document.getElementById('sbOverlay');  if (ov) ov.classList.toggle('on');
  };

  /* ──────────────────────────────────────────
     STATS & CARDS
  ────────────────────────────────────────── */
  function getStats() {
    var tk = todayStr(), tt = tasksOn(tk), td = 0;
    tt.forEach(function(t) { if (isComp(t, tk)) td++; });
    var done = 0, high = 0, over = 0, rec = 0;
    tasks.forEach(function(t) {
      if (t.completed) done++;
      if (t.priority === 'High' && !t.completed) high++;
      if ((!t.recur || t.recur === 'none') && t.date && t.date < tk && !t.completed) over++;
      if (t.recur && t.recur !== 'none') rec++;
    });
    return {
      total: tasks.length, done: done,
      rate: tasks.length ? Math.round(done / tasks.length * 100) : 0,
      todayT: tt.length, todayD: td,
      todayRate: tt.length ? Math.round(td / tt.length * 100) : 0,
      high: high, over: over, recCount: rec
    };
  }

  function getStreak() {
    var c = 0;
    for (var i = 0; i < 365; i++) {
      var d = new Date(); d.setDate(d.getDate() - i);
      var k = todayStr(d), dt = tasksOn(k);
      if (!dt.length) break;
      if (dt.every(function(t) { return isComp(t, k); })) c++; else break;
    }
    return c;
  }

  function getWeek7() {
    var out = [];
    for (var i = 6; i >= 0; i--) {
      var d = new Date(); d.setDate(d.getDate() - i);
      var k = todayStr(d), dt = tasksOn(k), dc = 0;
      dt.forEach(function(t) { if (isComp(t, k)) dc++; });
      out.push({ date: k.slice(5), done: dc, total: dt.length, full: dc === dt.length && dt.length > 0 });
    }
    return out;
  }

  function statCards() {
    var s = getStats(), streak = getStreak();
    _textContent('sk-n',  streak);
    _textContent('nb-t',  Math.max(0, s.todayT - s.todayD));
    _textContent('nb-h',  s.high);
    _textContent('nb-d',  s.over);
    _textContent('nb-r',  s.recCount);
    function sc(lbl, val, color, bar, bc) {
      var h = '<div class="scard" style="--acc:' + color + '"><div class="sc-l">' + lbl + '</div>';
      h += '<div class="sc-v" style="color:' + color + '">' + val + '</div>';
      if (bar != null) h += '<div class="mbar"><div class="mfill" style="width:' + bar + '%;background:' + bc + '"></div></div>';
      return h + '</div>';
    }
    var lvl = getLevel(xpData.total);
    return '<div class="sc5">' +
      sc('Today',      s.todayD + '/' + s.todayT, 'var(--pri3)', s.todayRate, 'var(--pri)') +
      sc('All Done',   s.done   + '/' + s.total,  'var(--acc)',  s.rate,      'var(--acc)') +
      sc('🔁 Recurring', s.recCount + '',          '#22D3EE',    null,        null) +
      sc('🔴 High',    s.high + '',                '#F87171',    null,        null) +
      sc(settings.xp ? '⚡ Lv.' + lvl : '⚠️ Overdue',
         settings.xp ? getLevelName(lvl) : s.over + '',
         '#A855F7', settings.xp ? xpProgress(xpData.total) : null, '#A855F7') +
      '</div>';
  }

  /* ──────────────────────────────────────────
     HTML HELPERS
  ────────────────────────────────────────── */
  function chip(cls, label) { return '<span class="chip ' + cls + '">' + label + '</span>'; }
  function pChip(p) {
    var m = { Low:'cg', Med:'cy', High:'cr', Crit:'cpk' };
    var e = { Low:'🟢', Med:'🟡', High:'🔴', Crit:'🔥' };
    return chip(m[p] || 'cg2', (e[p] || '') + ' ' + esc(p));
  }
  function tChip(t) {
    var m = { Task:'cg2', Event:'cb2', Meeting:'cp', Deadline:'cr', Habit:'ct' };
    var e = { Task:'📋', Event:'📅', Meeting:'👥', Deadline:'🚨', Habit:'🌿' };
    return chip(m[t] || 'cg2', (e[t] || '') + ' ' + esc(t));
  }
  function sChip(s) {
    var m = { Todo:'cg2', Progress:'cb2', Done:'cg', Blocked:'cr' };
    var e = { Todo:'📋', Progress:'⚡', Done:'✅', Blocked:'🚫' };
    return chip(m[s] || 'cg2', (e[s] || '') + ' ' + esc(s));
  }
  function trBadge(ts, te) {
    if (!ts && !te) return '';
    var t = ts || ''; if (ts && te) t += ' – '; if (te) t += te;
    return '<span class="trange' + (isPeak(ts) ? ' peak-task' : '') + '">' + (isPeak(ts) ? '⚡ ' : '') + esc(t) + '</span>';
  }
  function recurBadge(r) {
    if (!r || r === 'none') return '';
    var m = { daily:'🔁 Daily', weekday:'💼 Weekdays', weekly:'📅 Weekly', monthly:'🗓️ Monthly' };
    return '<span class="rbadge">' + (m[r] || r) + '</span>';
  }
  function empty() {
    return '<div class="empty"><div class="empty-ic">📭</div><h3>Nothing here yet</h3><p>Add a task to get started</p></div>';
  }

  /* ──────────────────────────────────────────
     TASK TABLE
  ────────────────────────────────────────── */
  function taskTable(list, ds, title) {
    if (!ds) ds = todayStr();
    if (!list.length) return empty();
    var h = '<div class="tw">';
    if (title) h += '<div class="tw-head"><span class="tw-ht">' + esc(title) + '</span></div>';
    h += '<table><thead><tr>';
    h += '<th style="width:36px"></th><th>Task</th><th>Type</th><th>Priority</th>';
    h += '<th>Status</th><th>Time</th><th>Date</th><th>Recur</th><th>Tag</th><th>Skill</th><th></th>';
    h += '</tr></thead><tbody>';
    for (var i = 0; i < list.length; i++) {
      var t = list[i], done = isComp(t, ds);
      h += '<tr class="' + (done ? 'cmp' : '') + '">';
      h += '<td><div class="cb' + (done ? ' ck' : '') + '" data-id="' + t.id + '" data-ds="' + esc(ds) + '" onclick="handleCb(this)">';
      h += '<svg width="10" height="10" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg></div></td>';
      h += '<td><div class="ttc"><div class="tt">' + esc(t.title);
      if (settings.xp && (t.priority === 'High' || t.priority === 'Crit')) {
        h += '  <span style="font-size:10px;color:#A855F7">+' + XP_POINTS[t.priority] + 'xp</span>';
      }
      h += '</div>';
      if (t.note) h += '<div class="tn">' + esc(t.note.slice(0, 55)) + (t.note.length > 55 ? '…' : '') + '</div>';
      h += '</div></td>';
      h += '<td>' + tChip(t.type || 'Task') + '</td>';
      h += '<td>' + pChip(t.priority || 'Low') + '</td>';
      h += '<td>' + sChip(done ? 'Done' : (t.status || 'Todo')) + '</td>';
      h += '<td>' + trBadge(t.timeStart, t.timeEnd) + '</td>';
      h += '<td style="font-size:12px;color:var(--t3)">' + (t.date || '—') + '</td>';
      h += '<td>' + recurBadge(t.recur) + '</td>';
      h += '<td>' + (t.tag   ? chip('cp', esc(t.tag))   : '') + '</td>';
      h += '<td>' + (t.skill ? chip('ct', esc(t.skill)) : '') + '</td>';
      h += '<td><div class="ra-wrap"><button class="ra del" data-id="' + t.id + '" onclick="handleDel(this)" title="Delete">🗑</button></div></td>';
      h += '</tr>';
    }
    return h + '</tbody></table></div>';
  }

  /* ──────────────────────────────────────────
     VIEWS
  ────────────────────────────────────────── */
  function renderToday(el) {
    var tk = todayStr(), list = tasksOn(tk);
    var q = (document.getElementById('srch') || {}).value || '';
    q = q.toLowerCase();
    if (q) list = list.filter(function(t) { return t.title.toLowerCase().indexOf(q) >= 0 || (t.note || '').toLowerCase().indexOf(q) >= 0; });
    var h = statCards();
    // Peak banner
    if (settings.peakStart && settings.peakEnd) {
      var now = new Date();
      var nowStr = String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');
      if (nowStr >= settings.peakStart && nowStr <= settings.peakEnd) {
        h += '<div class="peak-banner">⚡ You are in your <strong>Peak Focus Hours</strong> (' + settings.peakStart + ' – ' + settings.peakEnd + '). Tackle your hardest tasks now.</div>';
      }
    }
    var morning = [], afternoon = [], evening = [], night = [], other = [];
    list.forEach(function(t) {
      var ts = t.timeStart || ''; if (!ts) { other.push(t); return; }
      var hr = parseInt(ts.split(':')[0], 10);
      if (hr >= 5  && hr < 12) morning.push(t);
      else if (hr >= 12 && hr < 17) afternoon.push(t);
      else if (hr >= 17 && hr < 21) evening.push(t);
      else night.push(t);
    });
    function grp(label, arr) {
      if (!arr.length) return '';
      var done = 0; arr.forEach(function(t) { if (isComp(t, tk)) done++; });
      var allD = done === arr.length;
      var bgsty = allD ? 'background:var(--acc-gl);color:var(--acc)' : 'background:var(--surface2);color:var(--t3)';
      return '<div style="margin-bottom:14px">' +
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:7px">' +
        '<span style="font-size:13px;font-weight:800;color:var(--t2)">' + label + '</span>' +
        '<span style="font-size:10px;font-weight:800;padding:2px 9px;border-radius:99px;' + bgsty + '">' + (allD ? '✓ ' : '') + done + '/' + arr.length + '</span>' +
        '</div>' + taskTable(arr, tk, '') + '</div>';
    }
    h += '<div style="margin-bottom:10px;font-size:12px;color:var(--t3)">' + tk + ' — ' + list.length + ' tasks today</div>';
    if (!list.length) { h += empty(); }
    else {
      if (morning.length)   h += grp('🌅 Morning (5am–12pm)',  morning);
      if (afternoon.length) h += grp('☀️ Afternoon (12–5pm)', afternoon);
      if (evening.length)   h += grp('🌆 Evening (5–9pm)',    evening);
      if (night.length)     h += grp('🌙 Night',              night);
      if (other.length)     h += grp('📋 All Day / No Time',  other);
    }
    el.innerHTML = h;
  }

  function renderAll(el) {
    var q = ((document.getElementById('srch') || {}).value || '').toLowerCase();
    var list = tasks.filter(function(t) { return !q || t.title.toLowerCase().indexOf(q) >= 0 || (t.note || '').toLowerCase().indexOf(q) >= 0; });
    var h = statCards();
    if (!list.length) { el.innerHTML = h + empty(); return; }
    var groups = {}, order = [];
    list.forEach(function(t) { var d = t.date || 'No Date'; if (!groups[d]) { groups[d] = []; order.push(d); } groups[d].push(t); });
    order.sort(function(a, b) { if (a === 'No Date') return 1; if (b === 'No Date') return -1; return b > a ? 1 : -1; });
    var tk = todayStr();
    order.forEach(function(date) {
      var dt = groups[date], dc = 0;
      dt.forEach(function(t) { if (isComp(t, date)) dc++; });
      var isT = date === tk, pct = dt.length ? Math.round(dc / dt.length * 100) : 0, allD = dc === dt.length && dt.length > 0;
      h += '<div class="grp"><div class="gh"><span class="gd' + (isT ? ' tod' : '') + '">📅 ' + (isT ? 'TODAY — ' : '') + date + '</span>';
      h += '<span class="gpg' + (allD ? ' done' : '') + '">' + dc + '/' + dt.length + '</span></div>';
      h += '<div class="gbar"><div class="gbar-f" style="width:' + pct + '%"></div></div>';
      h += taskTable(dt, date, '') + '</div>';
    });
    el.innerHTML = h;
  }

  function renderRecurring(el) {
    var rec = tasks.filter(function(t) { return t.recur && t.recur !== 'none'; }), tk = todayStr();
    var h = statCards();
    if (!rec.length) { h += '<div class="empty"><div class="empty-ic">🔁</div><h3>No recurring tasks yet</h3><p>Add a task and choose Daily, Weekdays, Weekly, or Monthly.</p></div>'; el.innerHTML = h; return; }
    var grps = { daily:[], weekday:[], weekly:[], monthly:[] };
    rec.forEach(function(t) { if (grps[t.recur]) grps[t.recur].push(t); });
    var labels = { daily:'🔁 Every Day', weekday:'💼 Weekdays Only', weekly:'📅 Every Week', monthly:'🗓️ Monthly' };
    ['daily','weekday','weekly','monthly'].forEach(function(r) {
      if (!grps[r].length) return;
      h += '<div style="margin-bottom:6px;font-size:13px;font-weight:800;color:#22D3EE">' + labels[r] + ' (' + grps[r].length + ')</div>';
      h += taskTable(grps[r], tk, '') + '<div style="margin-bottom:16px"></div>';
    });
    el.innerHTML = h;
  }

  function renderWeek(el) {
    var now = new Date(), dow = now.getDay();
    var monday = new Date(now); monday.setDate(now.getDate() - dow + 1 + (dow === 0 ? -6 : 0) + global.weekOffset * 7);
    var sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
    var fmt = function(d) { return d.toLocaleDateString('en-US', { month:'short', day:'numeric' }); };
    var tk = todayStr();
    var h = '<div class="week-nav"><div><div class="week-nav-title">' + fmt(monday) + ' – ' + fmt(sunday) + '</div>';
    h += '<div style="font-size:11px;color:var(--t3);margin-top:2px">Click tasks to mark done · ⚡ = peak hours</div></div>';
    h += '<div style="display:flex;gap:6px"><button class="btn btn-g" style="padding:6px 12px;font-size:12px" onclick="weekOffset--;render()">← Prev</button>';
    h += '<button class="btn btn-g" style="padding:6px 12px;font-size:12px" onclick="weekOffset=0;render()">Today</button>';
    h += '<button class="btn btn-g" style="padding:6px 12px;font-size:12px" onclick="weekOffset++;render()">Next →</button></div></div>';
    h += statCards();
    var DN = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    h += '<div class="wgrid">';
    for (var d = 0; d < 7; d++) {
      var day = new Date(monday); day.setDate(day.getDate() + d);
      var dk = todayStr(day), isT = dk === tk, dt = tasksOn(dk), dc = 0;
      dt.forEach(function(t) { if (isComp(t, dk)) dc++; });
      var pct = dt.length ? Math.round(dc / dt.length * 100) : 0;
      h += '<div class="wday' + (isT ? ' tod' : '') + '">';
      h += '<div class="wday-head"><div class="wday-name">' + DN[d] + '</div><div class="wday-num">' + day.getDate() + '</div></div>';
      h += '<div class="wday-body">';
      dt.slice(0, 5).forEach(function(t) {
        var done = isComp(t, dk), tc = (t.type || 'Task').toLowerCase(), peak = isPeak(t.timeStart);
        h += '<div class="wtask wt-' + tc + (done ? ' wdone' : '') + '" data-id="' + t.id + '" data-ds="' + dk + '" onclick="handleCb(this)">';
        h += (peak ? '⚡ ' : '') + (t.timeStart ? '<span style="font-size:9px;opacity:0.7">' + t.timeStart + ' </span>' : '');
        h += esc(t.title.slice(0, 16)) + (t.title.length > 16 ? '…' : '') + (t.recur && t.recur !== 'none' ? ' 🔁' : '') + '</div>';
      });
      h += '</div>';
      if (dt.length > 5) h += '<div style="font-size:10px;color:var(--t3);padding:0 5px 4px">+' + (dt.length - 5) + ' more</div>';
      h += '<div class="wday-prog"><div class="wday-prog-f" style="width:' + pct + '%"></div></div></div>';
    }
    h += '</div>';
    var seen = {}, all = [];
    for (var d2 = 0; d2 < 7; d2++) { var day2 = new Date(monday); day2.setDate(day2.getDate() + d2); tasksOn(todayStr(day2)).forEach(function(t) { if (!seen[t.id]) { seen[t.id] = true; all.push(t); } }); }
    if (all.length) h += '<div style="font-size:13px;font-weight:800;color:var(--t2);margin-bottom:8px">Detailed List</div>' + taskTable(all, tk, '');
    el.innerHTML = h;
  }

  function renderMonth(el) {
    var now = new Date(); if (calY === undefined) { calY = now.getFullYear(); calM = now.getMonth(); }
    var MN = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    var last = new Date(calY, calM + 1, 0), tk = todayStr();
    var h = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px"><span style="font-size:18px;font-weight:900;color:var(--t1)">' + MN[calM] + ' ' + calY + '</span>';
    h += '<div style="display:flex;gap:6px"><button class="btn btn-g" style="padding:6px 12px;font-size:12px" onclick="calPrev()">← Prev</button><button class="btn btn-g" style="padding:6px 12px;font-size:12px" onclick="calNext()">Next →</button></div></div>';
    h += statCards();
    h += '<div class="tw"><div class="tw-head"><span class="tw-ht">' + MN[calM] + ' ' + calY + ' — Daily breakdown</span></div>';
    h += '<table><thead><tr><th>Date</th><th>Day</th><th>Tasks</th><th>Done</th><th>Progress</th><th>Top Task</th></tr></thead><tbody>';
    var DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    for (var d = 1; d <= last.getDate(); d++) {
      var dd = new Date(calY, calM, d), dk = todayStr(dd), isT = dk === tk;
      var dt = tasksOn(dk), dc = 0; dt.forEach(function(t) { if (isComp(t, dk)) dc++; });
      var pct = dt.length ? Math.round(dc / dt.length * 100) : 0;
      h += '<tr style="' + (isT ? 'background:var(--pri-gl);' : '') + '">';
      h += '<td style="font-size:12px;font-weight:' + (isT ? 800 : 500) + ';color:' + (isT ? 'var(--pri3)' : 'var(--t2)') + '">' + dk + (isT ? ' ✦' : '') + '</td>';
      h += '<td style="font-size:12px;color:var(--t3)">' + DAYS[dd.getDay()] + '</td>';
      h += '<td style="font-size:13px;font-weight:700;color:var(--t1)">' + dt.length + '</td>';
      h += '<td style="font-size:13px;font-weight:700;color:var(--acc)">' + dc + '</td>';
      h += '<td style="min-width:110px">';
      if (dt.length) { h += '<div style="height:5px;background:var(--surface2);border-radius:99px;overflow:hidden;width:90px;display:inline-block;vertical-align:middle"><div style="height:100%;width:' + pct + '%;background:' + (pct >= 100 ? 'var(--acc)' : 'var(--pri)') + ';border-radius:99px"></div></div><span style="font-size:10px;color:var(--t3);margin-left:4px">' + pct + '%</span>'; }
      else h += '<span style="font-size:11px;color:var(--t4)">No tasks</span>';
      h += '</td><td style="font-size:12px;color:var(--t2)">';
      if (dt[0]) h += esc(dt[0].title.slice(0, 26)) + (dt[0].title.length > 26 ? '…' : '') + ' ' + tChip(dt[0].type || 'Task');
      h += '</td></tr>';
    }
    h += '</tbody></table></div>'; el.innerHTML = h;
  }

  function renderCalendar(el) {
    if (calY === undefined) { var n = new Date(); calY = n.getFullYear(); calM = n.getMonth(); }
    var MN = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    var first = new Date(calY, calM, 1), last2 = new Date(calY, calM + 1, 0), sd = first.getDay(), tk = todayStr();
    var h = '<div class="cal"><div class="cal-head"><div class="cal-title">' + MN[calM] + ' ' + calY + '</div>';
    h += '<div style="display:flex;gap:6px"><button class="btn btn-g" style="padding:6px 12px;font-size:12px" onclick="calPrev()">← Prev</button><button class="btn btn-g" style="padding:6px 12px;font-size:12px" onclick="calNext()">Next →</button></div></div>';
    h += '<div class="cal-wk"><span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span></div><div class="cal-body">';
    for (var i = 0; i < sd; i++) h += '<div class="cday om"></div>';
    for (var d = 1; d <= last2.getDate(); d++) {
      var dd = new Date(calY, calM, d), dk = todayStr(dd), dt = tasksOn(dk);
      h += '<div class="cday' + (dk === tk ? ' tod' : '') + '"><div class="cdn">' + d + '</div>';
      dt.slice(0, 3).forEach(function(t) {
        var done = isComp(t, dk);
        h += '<div class="cdot ' + (t.type || 'task').toLowerCase() + (done ? ' done-d' : '') + '">';
        if (t.timeStart) h += '<span style="font-size:9px">' + t.timeStart + ' </span>';
        h += esc(t.title.slice(0, 10)) + (t.title.length > 10 ? '…' : '') + '</div>';
      });
      if (dt.length > 3) h += '<div style="font-size:9px;color:var(--t3)">+' + (dt.length - 3) + ' more</div>';
      h += '</div>';
    }
    var rem = (7 - ((sd + last2.getDate()) % 7)) % 7;
    for (var i = 0; i < rem; i++) h += '<div class="cday om"></div>';
    h += '</div></div>'; el.innerHTML = h;
  }

  function renderHeatmap(el) {
    var h = '<div class="hm"><div style="font-size:15px;font-weight:800;color:var(--t1);margin-bottom:3px">Activity Heatmap</div>';
    h += '<div style="font-size:12px;color:var(--t3);margin-bottom:14px">Last 112 days — darker = more completed</div><div class="hm-grid">';
    for (var i = 111; i >= 0; i--) {
      var d = new Date(); d.setDate(d.getDate() - i);
      var k = todayStr(d), dt = tasksOn(k), dc = 0;
      dt.forEach(function(t) { if (isComp(t, k)) dc++; });
      var cls = 'hd';
      if (dt.length > 0) { var r = dc / dt.length; if (r > 0 && r <= 0.25) cls = 'hd l1'; else if (r > 0.25 && r <= 0.5) cls = 'hd l2'; else if (r > 0.5 && r < 1) cls = 'hd l3'; else if (r >= 1) cls = 'hd l4'; }
      h += '<div class="' + cls + '" title="' + k + ': ' + dc + '/' + dt.length + '"></div>';
    }
    h += '</div><div style="display:flex;align-items:center;gap:5px;font-size:11px;color:var(--t3)">Less ';
    ['var(--surface2)','#3D1E6D','#6D28D9','#A855F7','#D946EF'].forEach(function(c) { h += '<span style="background:' + c + ';width:10px;height:10px;border-radius:2px;display:inline-block"></span>'; });
    h += ' More</div></div>'; el.innerHTML = h;
  }

  function dchart(id) { if (charts[id]) { charts[id].destroy(); delete charts[id]; } }

  function renderAnalytics(el) {
    var s = getStats(), wd = getWeek7(), tk = todayStr();
    var recT = tasksOn(tk).filter(function(t) { return t.recur && t.recur !== 'none'; }), recD = 0;
    recT.forEach(function(t) { if (isComp(t, tk)) recD++; });
    var recRate = recT.length ? Math.round(recD / recT.length * 100) : 0;
    var tD={}, pD={}, sD={}, rD={};
    tasks.forEach(function(t) {
      tD[t.type||'Task']       = (tD[t.type||'Task']       || 0) + 1;
      pD[t.priority||'Low']    = (pD[t.priority||'Low']    || 0) + 1;
      sD[t.status||'Todo']     = (sD[t.status||'Todo']     || 0) + 1;
      rD[t.recur||'none']      = (rD[t.recur||'none']      || 0) + 1;
    });
    var lL = [], lD2 = [];
    for (var i = 29; i >= 0; i--) { var d = new Date(); d.setDate(d.getDate() - i); var k = todayStr(d), cnt = 0, dtt = tasksOn(k); dtt.forEach(function(t) { if (isComp(t, k)) cnt++; }); lL.push(k.slice(5)); lD2.push(cnt); }
    var lvl = getLevel(xpData.total);
    var h = '<div style="display:flex;flex-direction:column;gap:14px">';
    h += '<div class="cr3"><div class="ccard" style="text-align:center"><div class="cc-t">Overall</div><div class="cc-s">All tasks</div><div class="ring-outer"><canvas id="r1" width="110" height="110"></canvas><div class="ring-inner"><div class="ring-pct">' + s.rate + '%</div><div class="ring-txt">Done</div></div></div></div>';
    h += '<div class="ccard" style="text-align:center"><div class="cc-t">Today</div><div class="cc-s">Today\'s progress</div><div class="ring-outer"><canvas id="r2" width="110" height="110"></canvas><div class="ring-inner"><div class="ring-pct">' + s.todayRate + '%</div><div class="ring-txt">Today</div></div></div></div>';
    h += '<div class="ccard" style="text-align:center"><div class="cc-t">XP Level</div><div class="cc-s">Gamification progress</div><div class="ring-outer"><canvas id="r3" width="110" height="110"></canvas><div class="ring-inner"><div class="ring-pct">' + lvl + '</div><div class="ring-txt">Level</div></div></div></div></div>';
    h += '<div class="cr2"><div class="ccard"><div class="cc-t">7-Day Progress</div><div class="cc-s">Done vs total each day</div><canvas id="c-bar" height="200"></canvas></div>';
    h += '<div class="ccard"><div class="cc-t">By Type</div><div class="cc-s">Task type breakdown</div><canvas id="c-type" height="200"></canvas></div></div>';
    h += '<div class="cr3"><div class="ccard"><div class="cc-t">By Priority</div><div class="cc-s">Priority breakdown</div><canvas id="c-prio" height="180"></canvas></div>';
    h += '<div class="ccard"><div class="cc-t">By Status</div><div class="cc-s">Workflow status</div><canvas id="c-stat" height="180"></canvas></div>';
    h += '<div class="ccard"><div class="cc-t">By Recurrence</div><div class="cc-s">How tasks repeat</div><canvas id="c-recur" height="180"></canvas></div></div>';
    h += '<div class="ccard"><div class="cc-t">30-Day Trend</div><div class="cc-s">Daily completed tasks</div><canvas id="c-line" height="140"></canvas></div></div>';
    el.innerHTML = h;
    setTimeout(function() {
      var cf = { family:'Inter', size:11 };
      function mkR(id, pct, color) { dchart(id); var c = document.getElementById(id); if (!c) return; charts[id] = new Chart(c, { type:'doughnut', data:{ datasets:[{ data:[pct,100-pct], backgroundColor:[color,'rgba(255,255,255,0.06)'], borderWidth:0, cutout:'78%' }] }, options:{ plugins:{ legend:{display:false}, tooltip:{enabled:false} }, animation:{duration:700} } }); }
      mkR('r1', s.rate, '#A855F7'); mkR('r2', s.todayRate, '#22C55E'); mkR('r3', xpProgress(xpData.total), '#22D3EE');
      function mkPie(id, labels, data, colors) { dchart(id); var c = document.getElementById(id); if (!c) return; charts[id] = new Chart(c, { type:'doughnut', data:{ labels:labels, datasets:[{ data:data, backgroundColor:colors, borderWidth:2, borderColor:'rgba(0,0,0,0.3)' }] }, options:{ plugins:{ legend:{ position:'bottom', labels:{ font:cf, padding:7, color:'#94A3B8' } } }, animation:{duration:600} } }); }
      dchart('c-bar'); var bc = document.getElementById('c-bar');
      if (bc) { charts['c-bar'] = new Chart(bc, { type:'bar', data:{ labels:wd.map(function(x){return x.date;}), datasets:[{ data:wd.map(function(x){return x.total;}), backgroundColor:'rgba(255,255,255,0.07)', borderRadius:5, borderSkipped:false },{ data:wd.map(function(x){return x.done;}), backgroundColor:wd.map(function(x){return x.full?'#A855F7':'#6D28D9';}), borderRadius:5, borderSkipped:false }] }, options:{ plugins:{legend:{display:false}}, scales:{ x:{grid:{display:false},border:{display:false},ticks:{font:cf,color:'#94A3B8'}}, y:{grid:{color:'rgba(255,255,255,0.05)'},border:{display:false},ticks:{font:cf,color:'#94A3B8'}} } } }); }
      mkPie('c-type',  Object.keys(tD),  Object.values(tD),  ['#64748B','#60A5FA','#A78BFA','#F87171','#2DD4BF']);
      mkPie('c-prio',  ['Low','Med','High','Crit'], [pD.Low||0,pD.Med||0,pD.High||0,pD.Crit||0], ['#4ADE80','#FACC15','#F87171','#F472B6']);
      mkPie('c-stat',  Object.keys(sD),  Object.values(sD),  ['#64748B','#60A5FA','#4ADE80','#F87171']);
      mkPie('c-recur', Object.keys(rD),  Object.values(rD),  ['#334155','#4ADE80','#60A5FA','#A78BFA','#FB923C']);
      dchart('c-line'); var lc = document.getElementById('c-line');
      if (lc) { charts['c-line'] = new Chart(lc, { type:'line', data:{ labels:lL, datasets:[{ data:lD2, borderColor:'#A855F7', backgroundColor:'rgba(168,85,247,0.08)', borderWidth:2.5, pointRadius:3, pointBackgroundColor:'#A855F7', tension:0.35, fill:true }] }, options:{ plugins:{legend:{display:false}}, scales:{ x:{grid:{display:false},border:{display:false},ticks:{font:cf,color:'#94A3B8',maxTicksLimit:10}}, y:{grid:{color:'rgba(255,255,255,0.05)'},border:{display:false},ticks:{font:cf,color:'#94A3B8'}} } } }); }
    }, 60);
  }

  /* ── FOCUS TIMER ── */
  function fmtT(s) { var m = Math.floor(s / 60), ss = s % 60; return (m < 10 ? '0' : '') + m + ':' + (ss < 10 ? '0' : '') + ss; }

  function renderFocus(el) {
    var total = TMODES[fMode], R = 75, circ = 2 * Math.PI * R, offset = circ * (1 - tSec / total);
    var h = '<div class="foc-wrap"><div class="foc-card"><div style="font-size:16px;font-weight:900;color:var(--t1);margin-bottom:4px">⏱️ Focus Timer</div>';
    h += '<div style="font-size:12px;color:var(--t2);margin-bottom:16px">Pomodoro — work deep, rest smart</div>';
    h += '<div class="foc-tabs">';
    h += '<button class="ft' + (fMode === 'work'  ? ' on' : '') + '" onclick="setFM(\'work\')">🍅 Work 25m</button>';
    h += '<button class="ft' + (fMode === 'short' ? ' on' : '') + '" onclick="setFM(\'short\')">☕ Break 5m</button>';
    h += '<button class="ft' + (fMode === 'long'  ? ' on' : '') + '" onclick="setFM(\'long\')">🌿 Long 15m</button></div>';
    h += '<div class="ring-timer"><svg viewBox="0 0 170 170" width="170" height="170"><circle class="rtr" cx="85" cy="85" r="' + R + '"/><circle class="rtf" cx="85" cy="85" r="' + R + '" stroke-dasharray="' + circ.toFixed(1) + '" stroke-dashoffset="' + offset.toFixed(1) + '" id="rtf"/></svg>';
    h += '<div class="rt-center"><div class="rt-time" id="tdisp">' + fmtT(tSec) + '</div><div class="rt-lbl">' + (isBreak ? 'Break' : 'Focus') + '</div></div></div>';
    h += '<div class="foc-btns"><button class="fb fb-s" id="tbtn" onclick="togTimer()">' + (tOn ? '⏸ Pause' : '▶ Start') + '</button>';
    h += '<button class="fb fb-r" onclick="rstTimer()">↺ Reset</button></div>';
    h += '<div class="foc-stats"><div class="fs-i"><div class="fs-v">' + pomos + '</div><div class="fs-l">🍅 Pomodoros</div></div>';
    h += '<div class="fs-i"><div class="fs-v">' + Math.round(pomos * 25) + 'm</div><div class="fs-l">Focus Time</div></div>';
    h += '<div class="fs-i"><div class="fs-v">' + xpData.total + '</div><div class="fs-l">⚡ XP Total</div></div></div></div></div>';
    el.innerHTML = h;
  }
  global.setFM = function(m) { fMode = m; if (!tOn) { tSec = TMODES[m]; isBreak = (m !== 'work'); } render(); };
  global.togTimer = function() {
    if (tOn) { clearInterval(tIv); tOn = false; updT(); return; }
    tOn = true;
    tIv = setInterval(function() {
      tSec--; updT();
      if (tSec <= 0) {
        clearInterval(tIv); tOn = false; snd('timer');
        if (!isBreak) { pomos++; isBreak = true; fMode = (pomos % 4 === 0) ? 'long' : 'short'; tSec = TMODES[fMode]; toast('🎉 Pomodoro #' + pomos + ' done!', 'info'); sendNotif('Done!', 'Pomodoro #' + pomos); }
        else { isBreak = false; fMode = 'work'; tSec = TMODES.work; toast('⚡ Break over — focus!', 'ok'); sendNotif('Break over', 'Back to work'); }
        if (nav === 'focus') render();
      }
    }, 1000);
    updT();
  };
  global.rstTimer = function() { clearInterval(tIv); tOn = false; isBreak = false; tSec = TMODES[fMode]; updT(); if (nav === 'focus') render(); };
  function updT() {
    var d = document.getElementById('tdisp'); if (d) d.textContent = fmtT(tSec);
    var b = document.getElementById('tbtn');  if (b) b.textContent = tOn ? '⏸ Pause' : '▶ Start';
    var rf = document.getElementById('rtf');
    if (rf) { var R = 75, circ = 2 * Math.PI * R; rf.setAttribute('stroke-dasharray', circ.toFixed(1)); rf.setAttribute('stroke-dashoffset', (circ * (1 - tSec / TMODES[fMode])).toFixed(1)); }
  }

  /* ── SKILLS VIEW ── */
  function renderSkills(el) {
    var xp = xpData.total, lvl = getLevel(xp), pct = xpProgress(xp), next = xpForNext(lvl);
    var h = '<div style="display:flex;flex-direction:column;gap:16px">';
    h += '<div class="ccard" style="background:linear-gradient(135deg,rgba(124,58,237,0.15),rgba(168,85,247,0.08));border-color:var(--pri)">';
    h += '<div style="display:flex;align-items:center;gap:20px;flex-wrap:wrap">';
    h += '<div style="text-align:center;min-width:90px"><div style="font-size:52px;font-weight:900;color:var(--pri3);line-height:1;font-family:Outfit,sans-serif">' + lvl + '</div><div style="font-size:12px;font-weight:700;color:var(--pri3);margin-top:2px">LEVEL</div></div>';
    h += '<div style="flex:1;min-width:200px"><div style="font-size:1.3rem;font-weight:800;color:var(--t1);margin-bottom:4px">' + getLevelName(lvl) + '</div>';
    h += '<div style="font-size:13px;color:var(--t2);margin-bottom:10px">' + xp + ' XP · ' + (xpData.tasks || 0) + ' tasks done</div>';
    h += '<div style="height:8px;background:var(--surface2);border-radius:99px;overflow:hidden"><div style="height:100%;width:' + pct + '%;background:linear-gradient(90deg,var(--pri),var(--pri3));border-radius:99px;transition:width 0.8s ease"></div></div>';
    h += '<div style="font-size:11px;color:var(--t3);margin-top:4px">' + (next - xp) + ' XP to Level ' + (lvl + 1) + '</div></div></div></div>';
    var skKeys = Object.keys(xpData.skills);
    if (skKeys.length) {
      h += '<div class="ccard"><div class="cc-t">🎯 Skill XP</div><div class="cc-s">XP earned per skill tag</div><div style="display:flex;flex-direction:column;gap:8px;margin-top:8px">';
      var maxV = Math.max.apply(null, skKeys.map(function(k) { return xpData.skills[k]; }));
      skKeys.sort(function(a, b) { return xpData.skills[b] - xpData.skills[a]; }).forEach(function(sk) {
        var v = xpData.skills[sk], p2 = Math.round(v / maxV * 100);
        h += '<div style="display:flex;align-items:center;gap:10px">';
        h += '<div style="font-size:12px;font-weight:700;color:var(--t2);width:100px;flex-shrink:0;text-transform:capitalize">' + esc(sk) + '</div>';
        h += '<div style="flex:1;height:8px;background:var(--surface2);border-radius:99px;overflow:hidden"><div style="height:100%;width:' + p2 + '%;background:linear-gradient(90deg,var(--pri),var(--pri3));border-radius:99px"></div></div>';
        h += '<div style="font-size:11px;color:var(--pri3);font-weight:700;width:50px;text-align:right">' + v + ' XP</div></div>';
      });
      h += '</div></div>';
    }
    h += '<div class="ccard"><div class="cc-t">🏆 Level Ladder</div><div class="cc-s">Your progression path</div>';
    h += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:8px;margin-top:12px">';
    for (var li = 1; li <= 11; li++) {
      var isCur = li === lvl, isPast = li < lvl;
      var bg = isCur ? 'background:var(--pri-gl);border-color:var(--pri)' : isPast ? 'background:var(--acc-gl);border-color:var(--acc)' : 'background:var(--surface2)';
      var col = isCur ? 'var(--pri3)' : isPast ? 'var(--acc)' : 'var(--t4)';
      h += '<div style="' + bg + ';border:1px solid var(--border2);border-radius:9px;padding:10px;text-align:center">';
      h += '<div style="font-size:18px;font-weight:900;color:' + col + '">' + li + '</div>';
      h += '<div style="font-size:10px;color:' + col + ';font-weight:700;margin-top:2px">' + getLevelName(li) + '</div>';
      h += '<div style="font-size:9px;color:var(--t4);margin-top:1px">' + (XP_LEVELS[li - 1] || 0) + ' XP</div></div>';
    }
    h += '</div></div></div>'; el.innerHTML = h;
  }

  /* ── FILTER HELPERS ── */
  function filtByType(type) { var q = ((document.getElementById('srch')||{}).value||'').toLowerCase(); return tasks.filter(function(t){return t.type===type&&(!q||t.title.toLowerCase().indexOf(q)>=0);}); }
  function filtByPrio(p)    { var q = ((document.getElementById('srch')||{}).value||'').toLowerCase(); return tasks.filter(function(t){return t.priority===p&&(!q||t.title.toLowerCase().indexOf(q)>=0);}); }

  /* ── EXPORTS ── */
  global.expCSV = function() {
    if (!tasks.length) { toast('No tasks', 'info'); return; }
    var lines = ['id,title,type,priority,status,date,timeStart,timeEnd,recur,tag,skill,est,completed'];
    tasks.forEach(function(t) { lines.push([t.id,'"'+(t.title||'').replace(/"/g,'""')+'"',t.type||'Task',t.priority||'Low',t.status||'Todo',t.date||'',t.timeStart||'',t.timeEnd||'',t.recur||'none',t.tag||'',t.skill||'',t.est||'',t.completed].join(',')); });
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([lines.join('\n')],{type:'text/csv'})); a.download = 'sweeask-' + todayStr() + '.csv'; a.click(); toast('📥 CSV exported!','info');
  };
  global.expJSON = function() {
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify({tasks:tasks,xp:xpData,settings:settings},null,2)],{type:'application/json'})); a.download = 'sweeask-' + todayStr() + '.json'; a.click(); toast('📋 JSON exported!','info');
  };

  /* ──────────────────────────────────────────
     COMMAND PALETTE
  ────────────────────────────────────────── */
  var CP_COMMANDS = [
    {icon:'📅',label:'Today',          tag:'view',   action:function(){global.go('today');}},
    {icon:'📋',label:'All Tasks',      tag:'view',   action:function(){global.go('all');}},
    {icon:'🔁',label:'Recurring Tasks',tag:'view',   action:function(){global.go('recurring');}},
    {icon:'📆',label:'This Week',       tag:'view',   action:function(){global.go('week');}},
    {icon:'🗓️',label:'Monthly Grid',   tag:'view',   action:function(){global.go('month');}},
    {icon:'📊',label:'Analytics',       tag:'view',   action:function(){global.go('analytics');}},
    {icon:'🟩',label:'Heatmap',         tag:'view',   action:function(){global.go('heatmap');}},
    {icon:'⏱️',label:'Focus Timer',    tag:'view',   action:function(){global.go('focus');}},
    {icon:'🎯',label:'Skills & XP',     tag:'view',   action:function(){global.go('skills');}},
    {icon:'📅',label:'Calendar',        tag:'view',   action:function(){global.go('calendar');}},
    {icon:'🌿',label:'Habits',          tag:'type',   action:function(){global.go('habits');}},
    {icon:'🚨',label:'Deadlines',       tag:'type',   action:function(){global.go('deadlines');}},
    {icon:'👥',label:'Meetings',        tag:'type',   action:function(){global.go('meetings');}},
    {icon:'✏️',label:'Add New Task',    tag:'action', action:function(){closePalette();global.toggleForm();}},
    {icon:'📋',label:'Open Templates',  tag:'action', action:function(){closePalette();global.openTemplates();}},
    {icon:'⚙️',label:'Open Settings',  tag:'action', action:function(){closePalette();global.openSettings();}},
    {icon:'🌌',label:'Theme: Default',  tag:'theme',  action:function(){setTheme('default');}},
    {icon:'🌑',label:'Theme: Dark',     tag:'theme',  action:function(){setTheme('dark');}},
    {icon:'☀️',label:'Theme: Light',   tag:'theme',  action:function(){setTheme('light');}},
    {icon:'📥',label:'Export CSV',      tag:'action', action:function(){global.expCSV();}},
    {icon:'🔥',label:'High Priority',   tag:'filter', action:function(){global.go('high');}},
    {icon:'🏠',label:'Go to Home',      tag:'nav',    action:function(){location.href='index.html';}},
    {icon:'🆕',label:'See Changelog',   tag:'nav',    action:function(){location.href='updates.html';}},
  ];

  global.openPalette = function() {
    cpOpen = true; cpIdx = 0;
    document.getElementById('cp-overlay').classList.add('on');
    var inp = document.getElementById('cp-input'); if (inp) { inp.value = ''; inp.focus(); }
    cpRender(CP_COMMANDS, []);
  };
  function closePalette() { cpOpen = false; document.getElementById('cp-overlay').classList.remove('on'); }
  global.closePalette = closePalette;
  global.closeCPOnBg  = function(e) { if (e.target === document.getElementById('cp-overlay')) closePalette(); };

  global.cpFilter = function() {
    var q = (document.getElementById('cp-input').value || '').toLowerCase().trim();
    if (!q) { cpRender(CP_COMMANDS, []); return; }
    var cmds = CP_COMMANDS.filter(function(c) { return c.label.toLowerCase().indexOf(q) >= 0 || c.tag.indexOf(q) >= 0; });
    var tRes = tasks.filter(function(t) { return t.title.toLowerCase().indexOf(q) >= 0; }).slice(0, 5);
    cpRender(cmds, tRes);
  };

  function cpRender(cmds, tRes) {
    cpIdx = 0; cpCmds = cmds; cpTaskMatches = tRes;
    var h = '';
    if (cmds.length) {
      h += '<div class="cp-group-label">Commands</div>';
      cmds.forEach(function(c, i) {
        h += '<div class="cp-item' + (i === 0 ? ' selected' : '') + '" data-cp-i="' + i + '" onclick="cpExec(' + i + ')" onmouseover="cpHover(' + i + ')">';
        h += '<span class="cp-item-icon">' + c.icon + '</span><span class="cp-item-label">' + esc(c.label) + '</span>';
        h += '<span class="cp-item-tag">' + c.tag + '</span></div>';
      });
    }
    if (tRes.length) {
      h += '<div class="cp-group-label">Tasks</div>';
      var off = cmds.length;
      tRes.forEach(function(t, i) {
        var idx = off + i;
        h += '<div class="cp-item" data-cp-i="' + idx + '" onclick="cpExecTask(' + t.id + ')" onmouseover="cpHover(' + idx + ')">';
        h += '<span class="cp-item-icon">' + (t.completed ? '✅' : '📋') + '</span>';
        h += '<span class="cp-item-label">' + esc(t.title) + '</span>';
        h += '<span class="cp-item-right">' + (t.date || '') + '</span></div>';
      });
    }
    if (!h) h = '<div style="padding:20px;text-align:center;font-size:13px;color:var(--t3)">No results</div>';
    document.getElementById('cp-results').innerHTML = h;
  }

  global.cpHover = function(i) {
    cpIdx = i;
    document.querySelectorAll('.cp-item').forEach(function(el) { el.classList.toggle('selected', parseInt(el.getAttribute('data-cp-i'), 10) === i); });
  };
  global.cpExec = function(i) { var c = cpCmds[i]; if (c) { closePalette(); c.action(); } };
  global.cpExecTask = function(id) { closePalette(); var t = tasks.find(function(x){return x.id===id;}); if(t) global.go(['Event','Meeting','Deadline','Habit'].indexOf(t.type)>=0 ? t.type.toLowerCase()+'s' : 'all'); };
  global.cpKey = function(e) {
    var items = document.querySelectorAll('.cp-item'); if (!items.length) return;
    if      (e.key === 'ArrowDown') { e.preventDefault(); cpIdx = Math.min(cpIdx+1, items.length-1); global.cpHover(cpIdx); items[cpIdx].scrollIntoView({block:'nearest'}); }
    else if (e.key === 'ArrowUp')   { e.preventDefault(); cpIdx = Math.max(cpIdx-1, 0);              global.cpHover(cpIdx); items[cpIdx].scrollIntoView({block:'nearest'}); }
    else if (e.key === 'Enter')     { e.preventDefault(); var s = document.querySelector('.cp-item.selected'); if (s) s.click(); }
    else if (e.key === 'Escape')    { closePalette(); }
  };

  /* ──────────────────────────────────────────
     TEMPLATES
  ────────────────────────────────────────── */
  var TEMPLATES = [
    {emoji:'💪',name:'Morning Workout',  desc:'Daily exercise habit',         title:'Morning workout',        type:'Habit',    priority:'Med',  recur:'daily',   timeStart:'07:00',timeEnd:'08:00',tag:'Health',  skill:'Fitness'},
    {emoji:'📖',name:'Study Session',    desc:'2-hour deep study block',       title:'Study session',          type:'Task',     priority:'High', recur:'daily',   timeStart:'09:00',timeEnd:'11:00',tag:'Study',   skill:'Learning'},
    {emoji:'💻',name:'Code Review',      desc:'Review pull requests',          title:'Review pull requests',   type:'Task',     priority:'High', recur:'weekday', timeStart:'10:00',timeEnd:'11:00',tag:'Work',    skill:'Coding'},
    {emoji:'📝',name:'Daily Standup',    desc:'Team meeting',                  title:'Daily standup',          type:'Meeting',  priority:'Med',  recur:'weekday', timeStart:'10:00',timeEnd:'10:30',tag:'Work'},
    {emoji:'🎯',name:'Weekly Review',    desc:'Review goals and tasks',        title:'Weekly review & planning',type:'Task',    priority:'High', recur:'weekly',  timeStart:'18:00',timeEnd:'19:00',tag:'Planning'},
    {emoji:'📺',name:'YouTube Upload',   desc:'Content upload deadline',       title:'Upload YouTube video',   type:'Deadline', priority:'High', recur:'weekly',  tag:'Content', skill:'Creating'},
    {emoji:'🧘',name:'Meditation',       desc:'Mindfulness practice',          title:'Meditation',             type:'Habit',    priority:'Low',  recur:'daily',   timeStart:'08:00',timeEnd:'08:20',tag:'Health',  skill:'Mindfulness'},
    {emoji:'📚',name:'Book Reading',     desc:'30 min reading daily',          title:'Read for 30 minutes',    type:'Habit',    priority:'Low',  recur:'daily',   timeStart:'22:00',timeEnd:'22:30',tag:'Growth'},
    {emoji:'🏃',name:'Evening Run',      desc:'Daily cardio',                  title:'Evening run',            type:'Habit',    priority:'Med',  recur:'daily',   timeStart:'18:30',timeEnd:'19:15',tag:'Health',  skill:'Fitness'},
    {emoji:'📊',name:'Monthly Report',   desc:'Monthly progress report',       title:'Write monthly report',   type:'Task',     priority:'High', recur:'monthly', tag:'Work',    skill:'Writing'},
    {emoji:'💡',name:'Idea Log',         desc:'Write down new ideas',          title:'Log new ideas & insights',type:'Task',    priority:'Low',  recur:'daily',   timeStart:'21:00',timeEnd:'21:15',tag:'Creativity'},
    {emoji:'🔔',name:'Pay Bills',        desc:'Monthly bill check',            title:'Check and pay bills',    type:'Task',     priority:'Med',  recur:'monthly', tag:'Finance'},
  ];

  global.openTemplates = function() {
    var h = '';
    TEMPLATES.forEach(function(tpl, i) {
      h += '<div class="tpl-card" onclick="handleTpl(' + i + ')">';
      h += '<span class="tpl-emoji">' + tpl.emoji + '</span>';
      h += '<div class="tpl-name">' + esc(tpl.name) + '</div>';
      h += '<div class="tpl-desc">' + esc(tpl.desc) + '</div>';
      h += '<div class="tpl-tags">';
      if (tpl.type)  h += '<span class="tpl-tag">' + tpl.type + '</span>';
      if (tpl.recur && tpl.recur !== 'none') h += '<span class="tpl-tag">🔁 ' + tpl.recur + '</span>';
      if (tpl.tag)   h += '<span class="tpl-tag">' + tpl.tag + '</span>';
      h += '</div></div>';
    });
    document.getElementById('tpl-grid').innerHTML = h;
    document.getElementById('tpl-overlay').classList.add('on');
  };
  global.handleTpl = function(i) {
    var tpl = TEMPLATES[i];
    var t = { id:Date.now(), title:tpl.title, note:tpl.note||'', type:tpl.type||'Task', priority:tpl.priority||'Low', status:'Todo', date:todayStr(), startDate:todayStr(), timeStart:tpl.timeStart||'', timeEnd:tpl.timeEnd||'', recur:tpl.recur||'none', tag:tpl.tag||'', skill:tpl.skill||'', est:tpl.est||'', completed:false, completedAt:null, createdAt:new Date().toISOString() };
    tasks.unshift(t); save(); render();
    global.closeTemplates(); snd('add'); toast('📋 Task added from template!', 'ok');
  };
  global.closeTemplates    = function() { document.getElementById('tpl-overlay').classList.remove('on'); };
  global.closeTplOnBg      = function(e) { if (e.target === document.getElementById('tpl-overlay')) global.closeTemplates(); };

  /* ──────────────────────────────────────────
     MASTER RENDER
  ────────────────────────────────────────── */
  function render() {
    var tk = todayStr(), el;
    var views = { today:renderToday, all:renderAll, recurring:renderRecurring, week:renderWeek, month:renderMonth, calendar:renderCalendar, analytics:renderAnalytics, heatmap:renderHeatmap, focus:renderFocus, skills:renderSkills };
    if (views[nav]) { views[nav](document.getElementById('v-' + nav)); }
    else {
      el = document.getElementById('v-' + nav);
      if (!el) return;
      if (nav==='events')    el.innerHTML = statCards() + taskTable(filtByType('Event'),   tk, 'Events');
      if (nav==='meetings')  el.innerHTML = statCards() + taskTable(filtByType('Meeting'), tk, 'Meetings');
      if (nav==='deadlines') el.innerHTML = statCards() + taskTable(filtByType('Deadline'),tk, 'Deadlines');
      if (nav==='habits')    el.innerHTML = statCards() + taskTable(filtByType('Habit'),   tk, 'Habits');
      if (nav==='high')      el.innerHTML = statCards() + taskTable(filtByPrio('High'),    tk, 'High Priority');
      if (nav==='medium')    el.innerHTML = statCards() + taskTable(filtByPrio('Med'),     tk, 'Medium Priority');
      if (nav==='low')       el.innerHTML = statCards() + taskTable(filtByPrio('Low'),     tk, 'Low Priority');
    }
    updateXPBar();
  }
  global.render = render;

  /* ──────────────────────────────────────────
     KEYBOARD SHORTCUTS
  ────────────────────────────────────────── */
  document.addEventListener('keydown', function(e) {
    if (cpOpen) { global.cpKey(e); return; }
    if (e.key === 'Escape') {
      global.closeMod(); global.closeSettings(); global.closeTemplates();
      var af = document.getElementById('af'); if (af) af.style.display = 'none';
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); global.openPalette(); }
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') { e.preventDefault(); global.toggleForm(); }
  });

  var ovEl = document.getElementById('ov');
  if (ovEl) ovEl.addEventListener('click', function(e) { if (e.target === this) global.closeMod(); });

  /* ──────────────────────────────────────────
     INIT
  ────────────────────────────────────────── */
  function init() {
    loadAll();
    initTheme();

    // Mobile nav hamburger
    var hbg = document.getElementById('hamburger');
    var mnv = document.getElementById('mobileNav');
    if (hbg && mnv) hbg.addEventListener('click', function() { mnv.classList.toggle('open'); });

    // Offline detection
    window.addEventListener('online',  function() { var el=document.getElementById('off');if(el)el.classList.remove('on'); });
    window.addEventListener('offline', function() { var el=document.getElementById('off');if(el)el.classList.add('on'); });
    if (!navigator.onLine) { var el=document.getElementById('off');if(el)el.classList.add('on'); }

    // PWA install
    var dPrompt = null;
    var ib = document.getElementById('installBtn');
    window.addEventListener('beforeinstallprompt', function(e) { e.preventDefault(); dPrompt=e; if(ib)ib.style.display='inline-flex'; });
    if (ib) { ib.addEventListener('click', async function() { if(!dPrompt)return; dPrompt.prompt(); await dPrompt.userChoice; dPrompt=null; ib.style.display='none'; }); }
    window.addEventListener('appinstalled', function() { if(ib)ib.style.display='none'; });

    // Service worker
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function(){});

    // Init date + subtitle
    var fd = document.getElementById('f-date'); if (fd) fd.value = todayStr();
    var ps = document.getElementById('pg-s');
    if (ps) ps.textContent = new Date().toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric', year:'numeric' });

    if (calY === undefined) { var n = new Date(); calY = n.getFullYear(); calM = n.getMonth(); }

    render();
    updateXPBar();

    // Overdue warning
    setTimeout(function() {
      var over = tasks.filter(function(t) { return (!t.recur||t.recur==='none') && t.date && t.date < todayStr() && !t.completed; });
      if (over.length) toast('⚠️ ' + over.length + ' overdue task' + (over.length > 1 ? 's' : ''), 'warn');
    }, 1500);

    console.log('[Sweeask] app.js v1.2.0 initialized — ' + tasks.length + ' tasks loaded');
  }

  // Expose weekOffset as global (referenced by inline onclick in week view)
  Object.defineProperty(global, 'weekOffset', {
    get: function() { return weekOffset; },
    set: function(v) { weekOffset = v; }
  });

  // Run on DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})(window);
