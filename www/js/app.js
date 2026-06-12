// ─── NODAS APP CORE ─────────────────────────────────────────────────────────

const app = {
    notes: [],
    currentNoteId: null,
    isDarkMode: false,
    lang: 'en',
    audioEnabled: true,
    audioCtx: null,
    booted: false,
    searchQuery: '',
    searchActive: false,

    els: {},

    init() {
        this.cacheElements();
        this.loadSettings();
        this.loadData();
        this.applyLanguage();
        this.startBitAnimation();
        this.setupHardwareBackButton();
        this.setupTypingSound();
        this.setupSearch();

        history.replaceState({ view: 'list' }, '', '#list');

        const initAudio = () => {
            if(!this.audioCtx) this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            if(this.audioCtx.state === 'suspended') this.audioCtx.resume();
            document.removeEventListener('click', initAudio);
            document.removeEventListener('keydown', initAudio);
            document.removeEventListener('touchstart', initAudio);
        };
        document.addEventListener('click', initAudio);
        document.addEventListener('keydown', initAudio);
        document.addEventListener('touchstart', initAudio);

        this.runBootSequence();
    },

    cacheElements() {
        this.els = {
            screen: document.getElementById('screen-container'),
            bootScreen: document.getElementById('boot-screen'),
            bitAnim: document.getElementById('bit-anim'),
            modeInd: document.getElementById('mode-indicator'),
            views: document.querySelectorAll('.view'),
            notesContainer: document.getElementById('notes-container'),
            timelineContainer: document.getElementById('timeline-container'),
            searchPrompt: document.getElementById('search-prompt'),
            searchInput: document.getElementById('search-input'),
            searchHint: document.getElementById('search-hint'),
            searchClose: document.getElementById('search-close'),
            editTitle: document.getElementById('edit-title'),
            editLabels: document.getElementById('edit-labels'),
            editContent: document.getElementById('edit-content'),
            btnPin: document.getElementById('btn-pin'),
            sysMsgContainer: document.getElementById('sys-msg-container')
        };
    },

    formatTime(ms) {
        const d = new Date(ms);
        const pad = n => n.toString().padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    },

    runBootSequence() {
        const bootLines = [
            "NODAS KERNEL v4.0 PURE_LOGIC",
            "CPU: ARM v8",
            "Mounting /dev/localstorage... [OK]",
            "Initializing Audio Synth... [OK]",
            "Enabling Instant Redraw CRT... [OK]",
            "Loading System GUI..."
        ];

        let i = 0;
        const interval = setInterval(() => {
            if (i < bootLines.length) {
                const line = document.createElement('div');
                line.className = 'boot-line';
                line.innerText = bootLines[i];
                this.els.bootScreen.appendChild(line);
                this.playTone('type');
                i++;
            } else {
                clearInterval(interval);
                setTimeout(() => {
                    this.els.bootScreen.style.display = 'none';
                    this.booted = true;
                    this.playTone('success');
                    this.showView('list');
                }, 200);
            }
        }, 100);
    },

    playTone(type) {
        if (!this.audioEnabled || !this.audioCtx) return;
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.connect(gain);
        gain.connect(this.audioCtx.destination);
        const now = this.audioCtx.currentTime;

        if (type === 'click') {
            osc.type = 'square';
            osc.frequency.setValueAtTime(600, now);
            osc.frequency.exponentialRampToValueAtTime(50, now + 0.04);
            gain.gain.setValueAtTime(0.08, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
            osc.start(now); osc.stop(now + 0.04);
        } else if (type === 'type') {
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(200 + Math.random()*100, now);
            gain.gain.setValueAtTime(0.03, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
            osc.start(now); osc.stop(now + 0.03);
        } else if (type === 'success') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(500, now);
            osc.frequency.linearRampToValueAtTime(1200, now + 0.15);
            gain.gain.setValueAtTime(0.05, now);
            gain.gain.linearRampToValueAtTime(0, now + 0.15);
            osc.start(now); osc.stop(now + 0.15);
        } else if (type === 'error' || type === 'delete') {
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(150, now);
            osc.frequency.exponentialRampToValueAtTime(20, now + 0.2);
            gain.gain.setValueAtTime(0.15, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
            osc.start(now); osc.stop(now + 0.2);
        }
    },

    setupTypingSound() {
        const playType = () => this.playTone('type');
        this.els.searchInput.addEventListener('input', playType);
        this.els.editTitle.addEventListener('input', playType);
        this.els.editLabels.addEventListener('input', playType);
        this.els.editContent.addEventListener('input', playType);
    },

    // ─── SEARCH BAR: tap-to-activate ──────────────────────────────────────
    // The bar starts inert (input has pointer-events:none, shows a hint).
    // Tapping the bar activates it, focuses the input, and pushes a history
    // state so the hardware back button closes the search instead of
    // leaving the list view.
    setupSearch() {
        this.els.searchPrompt.addEventListener('click', (e) => {
            if (!this.searchActive) {
                this.activateSearch();
            }
        });

        this.els.searchClose.addEventListener('click', (e) => {
            e.stopPropagation();
            // Triggers popstate -> deactivateSearch via history handler
            if (window.location.hash === '#search') history.back();
            else this.deactivateSearch(true);
        });

        this.els.searchInput.addEventListener('input', (e) => {
            this.searchQuery = e.target.value.toLowerCase();
            this.renderNotes();
        });

        // Tapping outside the search bar while active collapses it again
        document.addEventListener('click', (e) => {
            if (!this.searchActive) return;
            if (this.els.searchPrompt.contains(e.target)) return;
            if (window.location.hash === '#search') history.back();
            else this.deactivateSearch();
        });
    },

    activateSearch() {
        this.playTone('click');
        this.searchActive = true;
        this.els.searchPrompt.classList.add('active');
        history.pushState({ view: 'list', search: true }, '', '#search');
        // Slight delay so the click that activated it doesn't immediately blur
        setTimeout(() => this.els.searchInput.focus(), 0);
    },

    deactivateSearch(clear = false) {
        this.searchActive = false;
        this.els.searchPrompt.classList.remove('active');
        this.els.searchInput.blur();
        if (clear) {
            this.searchQuery = '';
            this.els.searchInput.value = '';
            this.renderNotes();
        }
    },

    sysMsg(text) {
        const msg = document.createElement('div');
        msg.className = 'sys-msg';
        this.els.sysMsgContainer.prepend(msg);
        if (this.els.sysMsgContainer.children.length > 3) this.els.sysMsgContainer.lastChild.remove();

        let i = 0; msg.innerText = '';
        const typeInterval = setInterval(() => {
            if (i < text.length) { msg.innerText += text.charAt(i); i++; }
            else {
                clearInterval(typeInterval);
                setTimeout(() => { msg.style.opacity = '0'; setTimeout(() => msg.remove(), 200); }, 2000);
            }
        }, 15);
    },

    loadSettings() {
        this.setTheme(localStorage.getItem('nodas_theme') === 'dark');
        const savedLang = localStorage.getItem('nodas_lang');
        if (savedLang) this.lang = savedLang;
        const savedAudio = localStorage.getItem('nodas_audio');
        if (savedAudio !== null) this.audioEnabled = savedAudio === 'true';
    },

    loadData() {
        try {
            const data = localStorage.getItem('nodas_db');
            if (data) this.notes = JSON.parse(data);
        } catch (e) { this.notes = []; }
    },

    saveData() { localStorage.setItem('nodas_db', JSON.stringify(this.notes)); },

    t(key, params = {}) {
        let text = dict[this.lang][key] || key;
        for (let p in params) text = text.replace(`{${p}}`, params[p]);
        return text;
    },

    applyLanguage() {
        document.getElementById('btn-insert').innerText = this.t('btnInsert');
        document.getElementById('btn-timeline').innerText = this.t('btnTimeline');
        document.getElementById('btn-config').innerText = this.t('btnConfig');
        document.getElementById('lbl-filename').innerText = this.t('lblFilename');
        document.getElementById('lbl-labels').innerText = this.t('lblLabels');
        document.getElementById('btn-delete').innerText = this.t('btnDelete');
        document.getElementById('btn-save').innerText = this.t('btnSave');
        document.getElementById('btn-abort').innerText = this.t('btnAbort');
        document.getElementById('hd-display').innerText = this.t('hdDisplay');
        document.getElementById('desc-display').innerText = this.t('descDisplay');
        document.getElementById('hd-audio').innerText = this.t('hdAudio');
        document.getElementById('hd-data').innerText = this.t('hdData');
        document.getElementById('btn-export').innerText = this.t('btnExport');
        document.getElementById('btn-import').innerText = this.t('btnImport');
        document.getElementById('btn-return').innerText = this.t('btnReturn');
        if (this.els.searchHint) this.els.searchHint.innerText = this.t('searchHint');

        document.getElementById('btn-lang').innerText = `LANG: ${this.lang.toUpperCase()}`;
        document.getElementById('btn-audio').innerText = `AUDIO: ${this.audioEnabled ? 'ON' : 'OFF'}`;

        if (this.currentNoteId) {
            const note = this.notes.find(n => n.id === this.currentNoteId);
            this.els.btnPin.innerText = (note && note.pinned) ? this.t('btnUnpin') : this.t('btnPin');
        } else {
            this.els.btnPin.innerText = this.t('btnPin');
        }
        this.renderNotes(); // update total items text
    },

    toggleLanguage() {
        this.playTone('click');
        this.lang = this.lang === 'id' ? 'en' : 'id';
        localStorage.setItem('nodas_lang', this.lang);
        this.applyLanguage();
    },

    toggleAudio() {
        this.audioEnabled = !this.audioEnabled;
        localStorage.setItem('nodas_audio', this.audioEnabled);
        this.applyLanguage();
        this.playTone('click');
    },

    toggleTheme() {
        this.playTone('click');
        this.setTheme(!this.isDarkMode);
        this.screenRedraw(true);
    },

    setTheme(isDark) {
        this.isDarkMode = isDark;
        if (isDark) {
            document.body.classList.add('dark-mode');
            this.els.modeInd.innerText = '[DRK]';
            localStorage.setItem('nodas_theme', 'dark');
        } else {
            document.body.classList.remove('dark-mode');
            this.els.modeInd.innerText = '[LGT]';
            localStorage.setItem('nodas_theme', 'light');
        }
    },

    startBitAnimation() {
        setInterval(() => {
            let bits = '';
            for(let i=0; i<8; i++) bits += Math.random() > 0.5 ? '1' : '0';
            this.els.bitAnim.innerText = bits;
        }, 80);
    },

    screenRedraw(isHard = false) {
        const el = this.els.screen;
        const animClass = isHard ? 'glitch-hard' : 'redraw-anim';
        el.classList.remove(animClass);
        void el.offsetWidth;
        el.classList.add(animClass);
        setTimeout(() => el.classList.remove(animClass), isHard ? 200 : 100);
    },

    navigate(viewId) {
        this.playTone('click');
        history.pushState({ view: viewId }, '', `#${viewId}`);
        this.showView(viewId);
    },

    goBack() {
        this.playTone('click');
        window.history.back();
    },

    // ─── HARDWARE BACK BUTTON ROUTING ─────────────────────────────────────
    // Order of priority mirrors a typical mobile-app back stack:
    // 1. Search bar (if active) closes first.
    // 2. Otherwise fall back to whichever view the history state points to.
    setupHardwareBackButton() {
        window.addEventListener('popstate', (event) => {
            // If search bar is open and the new state isn't '#search', close it
            if (this.searchActive && (!event.state || !event.state.search)) {
                this.deactivateSearch(false);
                return;
            }
            if (event.state && event.state.view) this.showView(event.state.view);
            else if (this.booted) this.showView('list');
        });
    },

    showView(viewId) {
        if(!this.booted) return;

        // INSTANT REDRAW LOGIC
        this.els.views.forEach(v => v.classList.remove('active'));
        document.getElementById(`view-${viewId}`).classList.add('active');

        this.screenRedraw(); // Brief CRT flicker on switch

        if (viewId === 'list') {
            this.renderNotes();
            // Do NOT auto-focus search anymore — bar starts inert until tapped.
        } else if (viewId === 'timeline') {
            this.renderTimeline();
        } else if (viewId === 'editor') {
            this.els.editContent.focus();
        }
    },

    renderNotes() {
        this.els.notesContainer.innerHTML = '';

        let filteredNotes = this.notes;
        if (this.searchQuery) {
            filteredNotes = this.notes.filter(n =>
                (n.title && n.title.toLowerCase().includes(this.searchQuery)) ||
                (n.content && n.content.toLowerCase().includes(this.searchQuery)) ||
                n.labels.some(l => l.toLowerCase().includes(this.searchQuery))
            );
        }

        const sortedNotes = [...filteredNotes].sort((a, b) => {
            if (a.pinned !== b.pinned) return b.pinned - a.pinned;
            return b.updatedAt - a.updatedAt;
        });

        document.getElementById('txt-total-items').innerText = this.t('totalItems', {n: sortedNotes.length});

        if (sortedNotes.length === 0) {
            this.els.notesContainer.innerHTML = `<li style="padding:16px; color:var(--dim)">${this.t('dirEmpty')}</li>`;
            return;
        }

        sortedNotes.forEach(note => {
            const dateStr = this.formatTime(note.updatedAt);
            const labelsHtml = note.labels.length > 0 ? `[${note.labels.join('] [')}]` : '';
            const pinHtml = note.pinned ? `<span class="pin-badge">PIN</span>` : '';

            const li = document.createElement('li');
            li.className = 'note-item';
            li.onclick = () => this.openEditor(note.id);
            li.innerHTML = `
                <div class="note-meta">${pinHtml} ${dateStr}</div>
                <div class="note-title">${note.title || 'unnamed_file.txt'}</div>
                <div class="note-tags">${labelsHtml}</div>
            `;
            this.els.notesContainer.appendChild(li);
        });
    },

    renderTimeline() {
        this.els.timelineContainer.innerHTML = '';
        // Sort absolute chronological (newest first)
        const timelineNotes = [...this.notes].sort((a, b) => b.updatedAt - a.updatedAt);

        if (timelineNotes.length === 0) {
            this.els.timelineContainer.innerHTML = '<div>No logs found.</div>';
            return;
        }

        timelineNotes.forEach(note => {
            const time = this.formatTime(note.updatedAt);
            const labelStr = note.labels.length > 0 ? ` <span class="log-label">[${note.labels.join(',')}]</span>` : '';
            const pinStr = note.pinned ? ` <span style="color:var(--bg); background:var(--fg);">[PIN]</span>` : '';

            const div = document.createElement('div');
            div.className = 'log-entry';
            div.innerHTML = `
                <span class="log-time">[${time}]</span>${pinStr}${labelStr}
                SYS_WRITE: <span class="log-title" onclick="app.openEditor('${note.id}')">${note.title || 'unnamed'}</span>
            `;
            this.els.timelineContainer.appendChild(div);
        });
    },

    newNote() {
        this.currentNoteId = null;
        this.els.editTitle.value = '';
        this.els.editLabels.value = '';
        this.els.editContent.value = '';
        this.els.btnPin.innerText = this.t('btnPin');
        this.navigate('editor');
    },

    openEditor(id) {
        const note = this.notes.find(n => n.id === id);
        if (!note) return;
        this.currentNoteId = id;
        this.els.editTitle.value = note.title;
        this.els.editLabels.value = note.labels.join(', ');
        this.els.editContent.value = note.content;
        this.els.btnPin.innerText = note.pinned ? this.t('btnUnpin') : this.t('btnPin');
        this.navigate('editor');
    },

    saveNote() {
        const title = this.els.editTitle.value.trim();
        const content = this.els.editContent.value.trim();
        const labels = this.els.editLabels.value.trim() ? this.els.editLabels.value.trim().split(',').map(l => l.trim()).filter(l => l) : [];

        if (!title && !content) { this.goBack(); return; }

        const isPinned = this.els.btnPin.innerText === this.t('btnUnpin');

        if (this.currentNoteId) {
            const idx = this.notes.findIndex(n => n.id === this.currentNoteId);
            if (idx > -1) this.notes[idx] = { ...this.notes[idx], title, content, labels, pinned: isPinned, updatedAt: Date.now() };
        } else {
            this.notes.push({
                id: 'nodas_' + Date.now().toString(36),
                title, content, labels, pinned: isPinned,
                createdAt: Date.now(), updatedAt: Date.now()
            });
        }
        this.saveData();
        this.playTone('success');
        this.sysMsg(this.t('msgSave'));
        this.screenRedraw(true);
        setTimeout(() => this.goBack(), 100);
    },

    togglePin() {
        this.playTone('click');
        if (this.els.btnPin.innerText === this.t('btnUnpin')) {
            this.els.btnPin.innerText = this.t('btnPin');
            this.sysMsg(this.t('msgUnpin'));
        } else {
            this.els.btnPin.innerText = this.t('btnUnpin');
            this.sysMsg(this.t('msgPin'));
        }
        this.screenRedraw();
    },

    deleteCurrentNote() {
        if (!this.currentNoteId) { this.goBack(); return; }
        this.notes = this.notes.filter(n => n.id !== this.currentNoteId);
        this.saveData();
        this.playTone('delete');
        this.sysMsg(this.t('msgDelete'));
        this.screenRedraw(true);
        setTimeout(() => this.goBack(), 100);
    },

    exportData() {
        this.playTone('click');
        if (this.notes.length === 0) return;
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(this.notes));
        const a = document.createElement('a');
        a.setAttribute("href", dataStr);
        a.setAttribute("download", "nodas_sys_dump_" + Date.now() + ".json");
        document.body.appendChild(a); a.click(); a.remove();
        this.sysMsg("SYS: Memory dumped.");
    },

    importData(event) {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const imported = JSON.parse(e.target.result);
                if (Array.isArray(imported)) {
                    const existingIds = new Set(this.notes.map(n => n.id));
                    let added = 0;
                    imported.forEach(note => {
                        if(note.id && !existingIds.has(note.id)) { this.notes.push(note); added++; }
                    });
                    this.saveData();
                    this.playTone('success');
                    this.sysMsg(this.t('msgImportOk', {n: added}));
                    this.screenRedraw(true);
                } else throw new Error("Format error");
            } catch (err) {
                this.playTone('error');
                this.sysMsg("ERR: JSON integrity check failed.");
            }
            event.target.value = '';
        };
        reader.readAsText(file);
    }
};

window.app = app;
document.addEventListener('DOMContentLoaded', () => app.init());

// ─── CAPACITOR NATIVE SETUP ─────────────────────────────────────────────────
// Hides the Android status bar (paired with FLAG_LAYOUT_NO_LIMITS from
// MainActivity.java for true edge-to-edge fullscreen) and wires the hardware
// back button to the same history-based navigation used by app.goBack().
document.addEventListener("DOMContentLoaded", () => {
    setTimeout(() => {
        if (window.Capacitor && window.Capacitor.Plugins) {
            const capApp = window.Capacitor.Plugins.App;
            const capStatusBar = window.Capacitor.Plugins.StatusBar;

            if (capApp) {
                capApp.addListener('backButton', () => {
                    if (window.history.length > 1) {
                        window.history.back();
                    } else {
                        capApp.exitApp();
                    }
                });
            }
            if (capStatusBar) capStatusBar.hide().catch(() => {});
        }
    }, 300);
});

// ─── OFFLINE SERVICE WORKER ─────────────────────────────────────────────────
// Caches all app shell assets so Nodas runs 100% offline after first load.
if ('serviceWorker' in navigator) {
    const swCode = `
    const CACHE_NAME = 'nodas-pwa-v1';
    self.addEventListener('install', (e) => {
        self.skipWaiting();
        e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll([
            './', './index.html', './css/style.css', './js/config.js', './js/app.js'
        ])));
    });
    self.addEventListener('activate', (e) => {
        e.waitUntil(
            caches.keys().then(keys => Promise.all(
                keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
            ))
        );
    });
    self.addEventListener('fetch', (e) => {
        e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
    });
    `;
    const blob = new Blob([swCode], { type: 'application/javascript' });
    navigator.serviceWorker.register(URL.createObjectURL(blob)).catch(err => console.log("SW Error:", err));
}
