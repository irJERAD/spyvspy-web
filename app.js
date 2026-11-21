/*
 * Spy vs Spy — The Corridor
 * Game engine ported faithfully from the authoritative design spec
 * ("Spy vs Spy - Play Designs.dc.html"). Rules, numbers, and resolution
 * order match the spec exactly; this file just swaps the DC component
 * runtime for plain DOM rendering.
 */

const N = 5;
const ROMAN = ["I", "II", "III", "IV", "V"];
const BLADE_ACC = [85, 55];
const PISTOL_ACC = [95, 88, 74, 58, 42];
const BLADE_DMG = 2;
const PISTOL_DMG = 5;
const MAX_ROUNDS = 20;
const TRAP_DMG = 3;

// Tunables (defaults from the spec's exposed balance props)
const CONFIG = {
  startingHealth: 10,
  pistolDelay: 1,
  pistolAmmo: 3,
  luckJitter: 8,
};

class Game {
  constructor(cfg) {
    this.cfg = cfg;
    this.state = this.fresh();
  }

  hpMax() { return this.cfg.startingHealth ?? 10; }
  delay() { return this.cfg.pistolDelay ?? 1; }
  jitter() { return this.cfg.luckJitter ?? 8; }
  ammoMax() { return this.cfg.pistolAmmo ?? 3; }

  fresh() {
    const hp = this.hpMax();
    return {
      round: 1,
      over: null,
      targeting: null,
      you: { room: 0, hp, hidden: false, exposed: 0, windup: null, ammo: this.ammoMax(), dealt: 0, trap: null },
      foe: { room: 4, hp, hidden: false, exposed: 0, windup: null, ammo: this.ammoMax(), dealt: 0, trap: null },
      seenFoe: 4,
      foeSeenYou: 0,
      foeWindupKnown: false,
      foeTrapSeen: null,
      log: [{ r: "—", t: "Two spies let themselves into the east wing. Five rooms. One of them leaves.", tone: "quiet" }],
    };
  }

  visible(s) { return !s.foe.hidden || s.foe.exposed > 0; }

  roll(base) {
    return Math.random() * 100 < base + (Math.random() * 2 - 1) * this.jitter();
  }

  shoot(att, def, target, kind, entries, who) {
    const dist = Math.abs(att.room - target);
    const table = kind === "blade" ? BLADE_ACC : PISTOL_ACC;
    const dmg = kind === "blade" ? BLADE_DMG : PISTOL_DMG;
    const name = kind === "blade" ? "blade" : "pistol";
    const mine = who === "you";
    const subj = mine ? "You" : "The house spy";
    // You only learn about his attacks you could plausibly perceive: a pistol is
    // heard anywhere, a blade only if it happens beside you.
    const heard = mine || kind === "pistol" || Math.abs(att.room - def.room) <= 1;
    const say = (t, tone) => { if (heard) entries.push({ t, tone }); };
    const ev = (fx) => { if (heard) this._ev.push({ fx, room: target }); };
    if (target !== def.room) {
      say(mine
        ? "Your " + name + " goes into room " + ROMAN[target] + ". Empty — he was not standing there when it landed."
        : "A shot goes into room " + ROMAN[target] + ". Not yours.", "quiet");
      ev(kind + "miss");
      if (kind === "blade") { att.hidden = false; att.exposed = Math.max(att.exposed, 1); }
      return;
    }
    if (dist >= table.length || !this.roll(table[dist])) {
      say(subj + "'s " + name + " misses by a hand's breadth in room " + ROMAN[target] + ".", "quiet");
      ev(kind + "miss");
      if (kind === "blade") { att.hidden = false; att.exposed = Math.max(att.exposed, 1); }
      return;
    }
    def.hp -= dmg;
    def.hidden = false;
    att.dealt = (att.dealt || 0) + dmg;
    entries.push({ t: subj + " " + (mine ? "land" : "lands") + " the " + name + " in room " + ROMAN[target] + " — " + dmg + " wounds.", tone: "hit" });
    this._ev.push({ fx: kind + "hit", room: target, onYou: !mine });
    if (kind === "blade") att.hidden = true;
  }

  aiChoose(s) {
    const f = s.foe, y = s.you;
    const knows = !y.hidden || y.exposed > 0;
    let guess = knows ? y.room : Math.max(0, Math.min(N - 1, s.foeSeenYou + (Math.random() < 0.5 ? 0 : Math.random() < 0.5 ? -1 : 1)));
    const d = Math.abs(f.room - guess);
    if (f.hp <= this.hpMax() * 0.35 && !f.hidden && f.exposed === 0 && Math.random() < 0.55) return { k: "hide" };
    if (d <= 1 && Math.random() < 0.72) return { k: "blade", target: guess };
    if (!f.windup && f.ammo > 0 && f.exposed === 0 && d <= 3 && d >= 1 && Math.random() < 0.34) return { k: "pistol", target: guess };
    if ((f.trap === null || f.trap !== f.room) && d >= 2 && f.exposed === 0 && Math.random() < 0.2) return { k: "trap" };
    if (!knows && Math.random() < 0.3) return { k: "listen" };
    if (d === 0 && !f.hidden && f.exposed === 0 && Math.random() < 0.5) return { k: "hide" };
    if (d > 1) return { k: "move", dir: guess > f.room ? 1 : -1 };
    return Math.random() < 0.5 && f.exposed === 0 ? { k: "hide" } : { k: "move", dir: f.room === 0 ? 1 : -1 };
  }

  commit(act) {
    if (this.state.over) return;
    const s = JSON.parse(JSON.stringify(this.state));
    const entries = [];
    this._ev = [];
    const foeAct = this.aiChoose(s);
    s.targeting = null;
    s.foeWindupKnown = false;

    if (act.k === "move") {
      s.you.room = Math.max(0, Math.min(N - 1, s.you.room + act.dir));
      this._ev.push({ fx: "step" });
      entries.push({ t: "You cross into room " + ROMAN[s.you.room] + ".", tone: "quiet" });
    }
    if (foeAct.k === "move") s.foe.room = Math.max(0, Math.min(N - 1, s.foe.room + foeAct.dir));

    if (act.k === "hide") {
      s.you.hidden = true;
      this._ev.push({ fx: "hide" });
      entries.push({ t: "You fold yourself behind the drapery in room " + ROMAN[s.you.room] + ".", tone: "quiet" });
      if (s.you.ammo < this.ammoMax()) { s.you.ammo += 1; entries.push({ t: "In the dark you press another round into the pistol — " + s.you.ammo + " in hand.", tone: "quiet" }); }
    }
    if (foeAct.k === "hide") { s.foe.hidden = true; s.foe.ammo = Math.min(this.ammoMax(), s.foe.ammo + 1); }

    for (const side of ["you", "foe"]) {
      const a = s[side], d = s[side === "you" ? "foe" : "you"];
      if (a.windup) {
        a.windup.fireIn -= 1;
        if (a.windup.fireIn <= 0) {
          const t = a.windup.target;
          a.windup = null;
          this.shoot(a, d, t, "pistol", entries, side);
        }
      }
    }

    if (act.k === "blade") this.shoot(s.you, s.foe, act.target, "blade", entries, "you");
    if (foeAct.k === "blade") this.shoot(s.foe, s.you, foeAct.target, "blade", entries, "foe");

    if (act.k === "pistol") {
      s.you.windup = { target: act.target, fireIn: this.delay() };
      s.you.hidden = false;
      s.you.ammo -= 1;
      s.you.exposed = this.delay() + 1;
      this._ev.push({ fx: "hammer" });
      entries.push({ t: "You step out and level the pistol at room " + ROMAN[act.target] + ". It fires next round.", tone: "loud" });
    }
    if (foeAct.k === "pistol") {
      s.foe.windup = { target: foeAct.target, fireIn: this.delay() };
      s.foe.hidden = false;
      s.foe.ammo -= 1;
      s.foe.exposed = this.delay() + 1;
      this._ev.push({ fx: "hammer" });
      entries.push({ t: "Somewhere in the house, a hammer draws back.", tone: "loud" });
    }

    if (act.k === "trap") {
      s.you.trap = s.you.room;
      this._ev.push({ fx: "trapset" });
      entries.push({ t: "You string a tripwire across room " + ROMAN[s.you.room] + " and step back from it.", tone: "quiet" });
    }
    if (foeAct.k === "trap") s.foe.trap = s.foe.room;

    if (act.k === "listen") {
      this._ev.push({ fx: "listen" });
      const d = Math.abs(s.you.room - s.foe.room);
      if (d <= 2) {
        s.seenFoe = s.foe.room;
        entries.push({ t: "You hold still. Floorboards, room " + ROMAN[s.foe.room] + ".", tone: "quiet" });
      } else {
        entries.push({ t: "You hold still. Nothing within earshot — he is at least three rooms off.", tone: "quiet" });
      }
      if (d <= 2 && s.foe.trap !== null) { s.foeTrapSeen = s.foe.trap; entries.push({ t: "A faint creak of wire in room " + ROMAN[s.foe.trap] + " — he has laid a trap there.", tone: "loud" }); }
      if (s.foe.windup) { s.foeWindupKnown = true; entries.push({ t: "And a hammer being drawn back, aimed at room " + ROMAN[s.foe.windup.target] + ".", tone: "loud" }); }
    }
    if (foeAct.k === "listen" && Math.abs(s.you.room - s.foe.room) <= 2) s.foeSeenYou = s.you.room;

    // Traps spring on whoever ends the round standing in the enemy's trapped room.
    if (s.foe.trap !== null && s.you.room === s.foe.trap) {
      s.you.hp -= TRAP_DMG; s.you.hidden = false; s.you.exposed = Math.max(s.you.exposed, 1);
      s.foe.dealt = (s.foe.dealt || 0) + TRAP_DMG;
      this._ev.push({ fx: "trapsnap", room: s.you.room, onYou: true });
      entries.push({ t: "A wire catches your ankle in room " + ROMAN[s.you.room] + " — " + TRAP_DMG + " wounds, and you are seen.", tone: "hit" });
      s.foe.trap = null;
    }
    if (s.you.trap !== null && s.foe.room === s.you.trap) {
      s.foe.hp -= TRAP_DMG; s.foe.hidden = false; s.foe.exposed = Math.max(s.foe.exposed, 1);
      s.you.dealt = (s.you.dealt || 0) + TRAP_DMG;
      this._ev.push({ fx: "trapsnap", room: s.you.trap });
      entries.push({ t: "Your tripwire in room " + ROMAN[s.you.trap] + " snaps — a cry, " + TRAP_DMG + " wounds, and he is in the open.", tone: "hit" });
      s.you.trap = null;
    }
    if (s.foeTrapSeen !== null && s.foe.trap !== s.foeTrapSeen) s.foeTrapSeen = null;

    if (this.visible(s)) s.seenFoe = s.foe.room;
    if (!s.you.hidden || s.you.exposed > 0) s.foeSeenYou = s.you.room;

    s.you.exposed = Math.max(0, s.you.exposed - 1);
    s.foe.exposed = Math.max(0, s.foe.exposed - 1);

    if (s.you.hp <= 0 && s.foe.hp <= 0) s.over = "Both spies down in the same breath. The wing is quiet.";
    else if (s.you.hp <= 0) s.over = "You are down. The house spy walks out.";
    else if (s.foe.hp <= 0) s.over = "The house spy is down. You take the file and the stairs.";
    else if (s.round >= MAX_ROUNDS) s.over = "Dawn. Both spies are recalled, alive and useless.";

    if (s.over) { entries.push({ t: s.over, tone: "hit" }); this._ev.push({ fx: s.foe.hp <= 0 && s.you.hp > 0 ? "win" : "lose" }); }
    s.events = this._ev;
    s.round = Math.min(MAX_ROUNDS, s.round + 1);
    s.log = entries.map(e => ({ ...e, r: this.state.round })).reverse().concat(s.log).slice(0, 24);
    this.state = s;
  }

  reset() { this.state = this.fresh(); }

  setTargeting(mode) {
    this.state = { ...this.state, targeting: this.state.targeting === mode ? null : mode };
  }
}


// ---------------------------------------------------------------------------
// Sound (synthesised with Web Audio — no asset files) and motion

const Sound = (() => {
  let ctx = null;
  let muted = false;
  try { muted = localStorage.getItem("svs-muted") === "1"; } catch (e) {}

  function ac() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }
  function tone(freq, dur, { type = "sine", gain = 0.15, at = 0, slideTo = null } = {}) {
    const c = ac(); if (!c) return;
    const t = c.currentTime + at;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(c.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, { gain = 0.2, at = 0, freq = 1200, q = 0.8, type = "bandpass" } = {}) {
    const c = ac(); if (!c) return;
    const t = c.currentTime + at;
    const buf = c.createBuffer(1, Math.max(1, Math.floor(c.sampleRate * dur)), c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(c.destination);
    src.start(t);
  }
  const fx = {
    step()       { noise(0.07, { gain: 0.18, freq: 300, type: "lowpass" }); noise(0.07, { gain: 0.14, at: 0.16, freq: 260, type: "lowpass" }); },
    hide()       { noise(0.35, { gain: 0.12, freq: 700, q: 0.4 }); },
    listen()     { tone(660, 0.25, { gain: 0.05 }); tone(660, 0.25, { gain: 0.04, at: 0.3 }); },
    hammer()     { tone(1800, 0.03, { type: "square", gain: 0.1 }); tone(1100, 0.05, { type: "square", gain: 0.1, at: 0.1 }); },
    trapset()    { tone(900, 0.04, { type: "triangle", gain: 0.12 }); tone(1300, 0.05, { type: "triangle", gain: 0.1, at: 0.07 }); },
    trapsnap()   { noise(0.12, { gain: 0.3, freq: 3500, q: 1.2, type: "highpass" }); tone(180, 0.3, { type: "sawtooth", gain: 0.16, slideTo: 60 }); },
    bladehit()   { noise(0.15, { gain: 0.25, freq: 4000, type: "highpass" }); tone(140, 0.18, { type: "triangle", gain: 0.18, slideTo: 70 }); },
    blademiss()  { noise(0.18, { gain: 0.14, freq: 2500, q: 0.5, type: "highpass" }); },
    pistolhit()  { noise(0.2, { gain: 0.35, freq: 900, q: 0.5 }); tone(120, 0.35, { type: "sawtooth", gain: 0.25, slideTo: 40 }); },
    pistolmiss() { noise(0.2, { gain: 0.28, freq: 1200, q: 0.5 }); tone(90, 0.2, { type: "sawtooth", gain: 0.12, slideTo: 50 }); },
    win()        { [523, 659, 784].forEach((f, i) => tone(f, 0.5, { gain: 0.1, at: i * 0.14 })); },
    lose()       { [392, 330, 262].forEach((f, i) => tone(f, 0.6, { type: "triangle", gain: 0.12, at: i * 0.2 })); },
  };
  return {
    play(name) { if (!muted && fx[name]) { try { fx[name](); } catch (e) {} } },
    isMuted() { return muted; },
    toggle() { muted = !muted; try { localStorage.setItem("svs-muted", muted ? "1" : "0"); } catch (e) {} if (!muted) ac(); return muted; },
  };
})();

const reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
let prevRooms = null;   // { you, foe } from the last render, for token slides

function playEvents(events, roomEls) {
  (events || []).forEach((e, i) => {
    setTimeout(() => {
      Sound.play(e.fx);
      if (reducedMotion || e.room === undefined || !roomEls[e.room]) return;
      const cls = e.fx.startsWith("trap") ? "fx-trap" : e.fx.endsWith("hit") ? "fx-hit" : e.fx.endsWith("miss") ? "fx-miss" : null;
      if (!cls) return;
      const el = roomEls[e.room];
      el.classList.remove("fx-trap", "fx-hit", "fx-miss");
      void el.offsetWidth;
      el.classList.add(cls);
      if (e.onYou) document.querySelector(".status-cell").classList.add("fx-shake");
      setTimeout(() => { el.classList.remove(cls); document.querySelector(".status-cell").classList.remove("fx-shake"); }, 900);
    }, i * 220);
  });
}

// ---------------------------------------------------------------------------
// Rendering

const game = new Game(CONFIG);

const els = {
  youHp: document.getElementById("youHp"),
  youBar: document.getElementById("youBar"),
  youStatus: document.getElementById("youStatus"),
  youAmmo: document.getElementById("youAmmo"),
  round: document.getElementById("round"),
  dealt: document.getElementById("dealt"),
  foeStatus: document.getElementById("foeStatus"),
  rooms: document.getElementById("rooms"),
  prompt: document.getElementById("prompt"),
  actions: document.getElementById("actions"),
  log: document.getElementById("log"),
};

function render() {
  const s = game.state;
  const hpMax = game.hpMax();
  const foeVisible = game.visible(s);
  const tgt = s.targeting;

  els.youHp.textContent = Math.max(0, s.you.hp);
  els.youBar.style.width = Math.max(0, (s.you.hp / hpMax) * 100) + "%";
  els.youStatus.textContent = s.you.windup
    ? "Pistol levelled at room " + ROMAN[s.you.windup.target]
    : s.you.hidden
    ? "Hidden in room " + ROMAN[s.you.room]
    : "In the open, room " + ROMAN[s.you.room] + (s.you.exposed > 0 ? " — cannot hide yet" : "");
  els.youAmmo.textContent = "Pistol rounds in hand: " + s.you.ammo;
  els.round.textContent = s.round;
  els.dealt.textContent = s.you.dealt || 0;
  els.foeStatus.textContent = foeVisible
    ? "In the open, room " + ROMAN[s.foe.room] + (s.foe.windup ? " — pistol levelled" : "")
    : "Somewhere out of sight";

  // rooms
  els.rooms.innerHTML = "";
  const roomEls = [];
  const slides = [];
  for (let i = 0; i < N; i++) {
    const inRange = tgt === "blade" ? Math.abs(i - s.you.room) <= 1 : tgt === "pistol" ? true : false;
    const active = !!tgt && inRange && !s.over;
    const marks = [];
    if (s.you.windup && s.you.windup.target === i) marks.push("your pistol");
    if (s.foeWindupKnown && s.foe.windup && s.foe.windup.target === i) marks.push("aimed at");
    if (s.you.trap === i) marks.push("your trap");
    if (s.foeTrapSeen === i) marks.push("his trap");

    const cell = document.createElement("div");
    cell.className = "room-cell" + (active ? " active" : "");

    const label = document.createElement("div");
    label.className = "room-label tnum";
    label.textContent = ROMAN[i];
    cell.appendChild(label);
    roomEls.push(cell);

    const tokens = document.createElement("div");
    tokens.className = "room-tokens";
    if (s.you.room === i) {
      const t = document.createElement("div");
      t.className = "token token-you";
      if (prevRooms && prevRooms.you !== i) slides.push([t, prevRooms.you, i]);
      t.textContent = "W";
      tokens.appendChild(t);
    }
    if (foeVisible && s.foe.room === i) {
      const t = document.createElement("div");
      t.className = "token token-foe";
      if (prevRooms && prevRooms.foe !== i && prevRooms.foeVisible) slides.push([t, prevRooms.foe, i]);
      t.textContent = "B";
      tokens.appendChild(t);
    }
    if (!foeVisible && s.seenFoe === i) {
      const t = document.createElement("div");
      t.className = "token token-ghost";
      t.textContent = "?";
      tokens.appendChild(t);
    }
    cell.appendChild(tokens);

    const mark = document.createElement("div");
    mark.className = "room-mark";
    mark.textContent = marks.join(" · ");
    cell.appendChild(mark);

    if (active) {
      cell.addEventListener("click", () => {
        game.commit({ k: tgt, target: i });
        render();
      });
    }
    els.rooms.appendChild(cell);
  }

  // token slides + sound/animation for this turn's events
  if (!reducedMotion) {
    for (const [tok, from, to] of slides) {
      const dx = roomEls[from].offsetLeft - roomEls[to].offsetLeft;
      tok.animate([{ transform: "translateX(" + dx + "px)" }, { transform: "translateX(0)" }], { duration: 320, easing: "ease-out" });
    }
  }
  prevRooms = { you: s.you.room, foe: s.foe.room, foeVisible };
  if (s.events && s.events.length) { playEvents(s.events, roomEls); s.events = []; }

  // prompt
  const d = Math.abs(s.you.room - s.foe.room);
  let prompt;
  if (s.over) prompt = s.over;
  else if (tgt === "blade") prompt = "Name the room you cut into — adjacent rooms only.";
  else if (tgt === "pistol") prompt = "Name the room you will fire into. The shot lands at the end of next round.";
  else if (foeVisible) prompt = "He is in the open, " + (d === 0 ? "in your room" : d + (d === 1 ? " room" : " rooms") + " off") + ".";
  else prompt = "He is hidden. Last seen in room " + ROMAN[s.seenFoe] + ".";
  els.prompt.textContent = prompt;

  // actions
  els.actions.innerHTML = "";
  const actionDefs = [
    { key: "move-w", label: "Move west", note: "one room", disabled: !!s.over || s.you.room === 0, onClick: () => game.commit({ k: "move", dir: -1 }) },
    { key: "move-e", label: "Move east", note: "one room", disabled: !!s.over || s.you.room === N - 1, onClick: () => game.commit({ k: "move", dir: 1 }) },
    { key: "hide", label: "Hide", note: s.you.exposed > 0 ? "too exposed" : "vanish", disabled: !!s.over || s.you.exposed > 0 || s.you.hidden, onClick: () => game.commit({ k: "hide" }) },
    { key: "blade", label: "Blade", note: "2 wounds · 1 room", disabled: !!s.over, selected: tgt === "blade", onClick: () => game.setTargeting("blade") },
    { key: "pistol", label: "Pistol", note: s.you.windup ? "already levelled" : s.you.ammo > 0 ? "5 wounds · delayed" : "empty — hide to reload", disabled: !!s.over || !!s.you.windup || s.you.ammo <= 0, selected: tgt === "pistol", onClick: () => game.setTargeting("pistol") },
    { key: "trap", label: "Trap", note: s.you.trap === s.you.room ? "already set here" : "3 wounds · unseen", disabled: !!s.over || s.you.trap === s.you.room, onClick: () => game.commit({ k: "trap" }) },
    { key: "listen", label: "Listen", note: "spend the round", disabled: !!s.over, onClick: () => game.commit({ k: "listen" }) },
  ];
  for (const a of actionDefs) {
    const btn = document.createElement("button");
    btn.className = "btn" + (a.selected ? " selected" : "");
    btn.disabled = a.disabled;
    const label = document.createElement("span");
    label.textContent = a.label;
    const note = document.createElement("span");
    note.className = "btn-note tnum";
    note.textContent = a.note;
    btn.appendChild(label);
    btn.appendChild(note);
    btn.addEventListener("click", () => { a.onClick(); render(); });
    els.actions.appendChild(btn);
  }
  const spacer = document.createElement("div");
  spacer.style.flex = "1";
  els.actions.appendChild(spacer);
  const resetBtn = document.createElement("button");
  resetBtn.className = "btn btn-secondary";
  resetBtn.textContent = "New match";
  resetBtn.addEventListener("click", () => { game.reset(); prevRooms = null; render(); });
  els.actions.appendChild(resetBtn);
  const soundBtn = document.createElement("button");
  soundBtn.className = "btn btn-secondary btn-sound";
  soundBtn.style.marginLeft = "0";
  soundBtn.setAttribute("aria-pressed", String(!Sound.isMuted()));
  soundBtn.textContent = Sound.isMuted() ? "Sound off" : "Sound on";
  soundBtn.addEventListener("click", () => { Sound.toggle(); render(); });
  els.actions.appendChild(soundBtn);

  // log
  const tone = { hit: "tone-hit", loud: "tone-loud", quiet: "tone-quiet" };
  els.log.innerHTML = "";
  for (const e of s.log) {
    const row = document.createElement("div");
    row.className = "log-entry";
    const r = document.createElement("div");
    r.className = "log-round tnum";
    r.textContent = e.r;
    const t = document.createElement("div");
    t.className = "log-text " + (tone[e.tone || "quiet"]);
    t.textContent = e.t;
    row.appendChild(r);
    row.appendChild(t);
    els.log.appendChild(row);
  }
}

render();
