import { DIALOGUE, CREW } from '../../data/story.js';
import { esc } from './common.js';

// Talking to the crew: the camera settles on their face and the conversation
// runs along the bottom of the screen like subtitles, with numbered replies.
// Replies are big targets on purpose; in VR they become buttons at hand height.

const CPS = 58; // characters per second while a line types out

export class DialoguePanel {
  constructor(hub, st) {
    this.hub = hub;
    this.id = st.id;
    this.who = CREW[st.id];
    this.tree = DIALOGUE[st.id];
    this.c = hub.storyCtx((note) => this._note(note));
    this.notes = [];
    this.sel = 0;
    const el = document.createElement('div');
    el.className = 'talk';
    el.dataset.noframe = '1';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', `Talking to ${this.who.name}`);
    el.innerHTML = `
      <div class="talk-name"><b>${esc(this.who.name)}</b><span>${esc(this.who.role)}</span></div>
      <p class="talk-say" aria-live="polite"></p>
      <div class="talk-notes"></div>
      <ol class="talk-replies"></ol>
      <div class="talk-keys"><span class="key">1</span>–<span class="key">4</span> reply · <span class="key">Space</span> skip · <span class="key">Esc</span> leave</div>`;
    hub.app.uiRoot.appendChild(el);
    this.el = el;
    this.sayEl = el.querySelector('.talk-say');
    this.notesEl = el.querySelector('.talk-notes');
    this.repliesEl = el.querySelector('.talk-replies');
    el.addEventListener('click', (e) => this._click(e));
    hub.boat.crew.startTalk(this.id);
    const first = this.tree.start(this.c);
    hub.p.story.met[this.id] = true;
    this.go(first);
  }

  go(nodeId) {
    const node = this.tree.nodes[nodeId];
    if (!node) { this.hub.closeStation(); return; }
    this.node = node;
    node.act?.(this.c);
    this.text = typeof node.say === 'function' ? node.say(this.c) : node.say;
    this.shown = 0;
    this.typing = true;
    this.replies = (node.replies || []).filter((r) => !r.if || r.if(this.c));
    this.sel = 0;
    this.sayEl.textContent = '';
    this.repliesEl.innerHTML = '';
    this.repliesEl.classList.remove('show');
    this.hub.boat.crew.setSpeaking(this.id, true);
    this.hub.audio.speak(this.text, this.who.voice, this.hub.p.settings.voices !== false);
    this._renderNotes();
  }

  _finishTyping() {
    this.typing = false;
    this.shown = this.text.length;
    this.sayEl.textContent = this.text;
    this.hub.boat.crew.setSpeaking(this.id, false);
    this._renderReplies();
  }

  _renderReplies() {
    const seen = this.hub.p.story.seen;
    this.repliesEl.innerHTML = this.replies.map((r, i) => {
      const text = typeof r.text === 'function' ? r.text(this.c) : r.text;
      const cls = [r.topic && seen[r.topic] ? 'seen' : '', i === this.sel ? 'sel' : '', r.end || !r.to ? 'bye' : ''].filter(Boolean).join(' ');
      return `<li><button class="${cls}" data-r="${i}"><span class="key">${i + 1}</span><span>${esc(text)}</span></button></li>`;
    }).join('');
    this.repliesEl.classList.add('show');
  }

  _note(n) {
    this.notes.push(n);
    this._renderNotes();
  }

  _renderNotes() {
    this.notesEl.innerHTML = this.notes.map((n) => `<p class="talk-note ${n.kind || ''}">${n.html}</p>`).join('');
  }

  pick(i) {
    const r = this.replies[i];
    if (!r || this.typing) return;
    this.hub.audio.ui();
    if (r.topic) this.hub.p.story.seen[r.topic] = true;
    r.act?.(this.c);
    this.hub.save();
    if (r.end || !r.to) { this.hub.closeStation(); return; }
    this.go(r.to);
  }

  update(dt) {
    if (!this.typing) return;
    this.shown += dt * CPS;
    if (this.shown >= this.text.length) { this._finishTyping(); return; }
    this.sayEl.textContent = this.text.slice(0, Math.floor(this.shown));
  }

  onKey(e) {
    const n = /^Digit([1-9])$/.exec(e.code) || /^Numpad([1-9])$/.exec(e.code);
    if (n) { e.preventDefault(); if (this.typing) this._finishTyping(); else this.pick(+n[1] - 1); return; }
    if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyE') {
      e.preventDefault();
      if (this.typing) this._finishTyping();
      else if (e.code !== 'KeyE') this.pick(this.sel);
      return;
    }
    if (!this.typing && (e.code === 'KeyW' || e.code === 'ArrowUp' || e.code === 'KeyS' || e.code === 'ArrowDown')) {
      e.preventDefault();
      const d = e.code === 'KeyW' || e.code === 'ArrowUp' ? -1 : 1;
      this.sel = (this.sel + d + this.replies.length) % this.replies.length;
      this._renderReplies();
    }
  }

  onCanvasClick() {
    if (this.typing) this._finishTyping();
  }

  _click(e) {
    const b = e.target.closest('[data-r]');
    if (b) { this.pick(+b.dataset.r); return; }
    if (this.typing) this._finishTyping();
  }

  dispose() {
    this.hub.audio.hush();
    this.hub.boat.crew.endTalk();
    this.el.remove();
  }
}
