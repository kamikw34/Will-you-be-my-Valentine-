(() => {
    'use strict';

    // ---------- Настройки ----------
    const NAME = 'Юлечка';
    const FROM = 'Щелкун';
    const TO = 'Березне';
    const DIST_KM = 2312;

    const OBSTACLES = 30;
    const SPACING = 235;
    const START_X = 460;
    const OBS_W = 62;
    const GROUND_H = 46;
    const GRAVITY = 1150;
    const FLAP = -360;
    const MAX_FALL = 520;
    const PLAYER_X = 92;
    const PLAYER_R = 17;
    const HIT_R = 12;
    const CEILING = 88; // ниже панели с маршрутом
    const END_X = START_X + (OBSTACLES - 1) * SPACING + 300;
    const HOME_X = END_X + 220;

    const MILESTONES = [
        [0.0, 'Лети ко мне, милая'],
        [0.06, 'Пока-пока, Урал'],
        [0.15, 'Давай-давай, ухылянтик, ты сбежишь'],
        [0.33, 'Треть пути! Помнишь Молдову? 11–15 сентября'],
        [0.5, 'Я тебя жду, моя принцесса'],
        [0.68, 'Переводим часы на пару часов назад'],
        [0.84, 'Рыбонька, давай'],
        [0.95, `${TO} на горизонте!`],
    ];
    const OOPS = [
        'Ну ёмаё, давай ещё',
        'АААААА',
        'Милая, постарайся ещё цють-цють',
        'Пупупу',
    ];

    // ---------- Холст ----------
    const cv = document.getElementById('game');
    const ctx = cv.getContext('2d');
    let W = 360, H = 640, scale = 1;

    function resize() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const cw = window.innerWidth, ch = window.innerHeight;
        H = Math.max(560, Math.min(820, W * ch / cw));
        scale = Math.min(cw / W, ch / H);
        cv.style.width = W * scale + 'px';
        cv.style.height = H * scale + 'px';
        cv.width = Math.round(W * scale * dpr);
        cv.height = Math.round(H * scale * dpr);
        ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
    }
    window.addEventListener('resize', resize);
    resize();

    const groundY = () => H - GROUND_H;

    // ---------- Утилиты ----------
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const lerp = (a, b, t) => a + (b - a) * t;
    const rand = (a, b) => a + Math.random() * (b - a);
    const smooth = (a, b, x) => {
        const t = clamp((x - a) / (b - a), 0, 1);
        return t * t * (3 - 2 * t);
    };

    function mixColor(c1, c2, t) {
        const p = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
        const a = p(c1), b = p(c2);
        return `rgb(${a.map((v, i) => Math.round(lerp(v, b[i], t))).join(',')})`;
    }

    function keyframes(list, x) {
        for (let i = 0; i < list.length - 1; i++) {
            const [x0, c0] = list[i], [x1, c1] = list[i + 1];
            if (x <= x1) return mixColor(c0, c1, clamp((x - x0) / (x1 - x0), 0, 1));
        }
        return list[list.length - 1][1];
    }

    // ---------- Звук ----------
    let audio = null;
    function initAudio() {
        if (audio) return;
        try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { audio = null; }
    }
    function beep(freq, dur = 0.08, type = 'sine', vol = 0.05, slide = 1) {
        if (!audio || muted) return;
        const now = audio.currentTime;
        const o = audio.createOscillator(), g = audio.createGain();
        o.type = type;
        o.frequency.setValueAtTime(freq, now);
        if (slide !== 1) o.frequency.exponentialRampToValueAtTime(freq * slide, now + dur);
        g.gain.setValueAtTime(vol, now);
        g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
        o.connect(g).connect(audio.destination);
        o.start(now);
        o.stop(now + dur);
    }
    const sfx = {
        flap: () => beep(520, 0.07, 'triangle', 0.04, 1.4),
        heart: () => { beep(880, 0.1, 'sine', 0.05); setTimeout(() => beep(1320, 0.14, 'sine', 0.05), 70); },
        win: () => [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => beep(f, 0.22, 'sine', 0.06), i * 140)),
    };
    // ---------- Музыка ----------
    const music = new Audio('music.mp3');
    music.loop = true;
    music.volume = 0.45;
    let muted = false;
    try { muted = localStorage.getItem('sekretik-muted') === '1'; } catch (e) { /* по умолчанию со звуком */ }
    let musicStarted = false;

    function playMusic() {
        musicStarted = true;
        if (!muted && !document.hidden) music.play().catch(() => {});
    }

    const muteBtn = document.getElementById('muteBtn');
    function updateMuteBtn() {
        muteBtn.textContent = muted ? '🔇' : '🎵';
        muteBtn.setAttribute('aria-label', muted ? 'Включить звук' : 'Выключить звук');
    }
    muteBtn.addEventListener('click', () => {
        muted = !muted;
        try { localStorage.setItem('sekretik-muted', muted ? '1' : '0'); } catch (e) { /* не запомним */ }
        if (muted) { music.pause(); stopFail(); }
        else playMusic();
        updateMuteBtn();
    });
    updateMuteBtn();

    // ---------- Звуки проигрыша (случайный при каждом падении) ----------
    const FAIL_SOUNDS = ['otryzhka', 'armatura', 'buzzer', 'imbo', 'goida', 'lobotomy', 'net-idi-na', 'gudok']
        .map((name) => {
            const a = new Audio(`sfx/${name}.mp3`);
            a.preload = 'auto';
            a.addEventListener('ended', () => { music.volume = 0.45; });
            return a;
        });
    let failSound = null, lastFail = -1;

    function playFail() {
        if (muted) return;
        let i = Math.floor(Math.random() * FAIL_SOUNDS.length);
        if (i === lastFail) i = (i + 1) % FAIL_SOUNDS.length;
        lastFail = i;
        failSound = FAIL_SOUNDS[i];
        failSound.currentTime = 0;
        music.volume = 0.12; // приглушаем песню, чтобы звук было слышно
        failSound.play().catch(() => { music.volume = 0.45; });
    }

    function stopFail() {
        if (failSound) failSound.pause();
        failSound = null;
        music.volume = 0.45;
    }

    // приложение свернули или открыли снова (на Android приходят app-pause / app-resume)
    const pauseMusic = () => { music.pause(); stopFail(); };
    const resumeMusic = () => { if (musicStarted) playMusic(); };
    document.addEventListener('app-pause', pauseMusic);
    document.addEventListener('app-resume', resumeMusic);

    const vibrate = (ms) => { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) { /* нет вибро */ } };

    // ---------- Рисование ----------
    function heartPath(x, y, s) {
        ctx.beginPath();
        ctx.moveTo(x, y + s * 0.35);
        ctx.bezierCurveTo(x, y, x - s * 0.5, y - s * 0.1, x - s * 0.5, y + s * 0.3);
        ctx.bezierCurveTo(x - s * 0.5, y + s * 0.6, x - s * 0.1, y + s * 0.75, x, y + s);
        ctx.bezierCurveTo(x + s * 0.1, y + s * 0.75, x + s * 0.5, y + s * 0.6, x + s * 0.5, y + s * 0.3);
        ctx.bezierCurveTo(x + s * 0.5, y - s * 0.1, x, y, x, y + s * 0.35);
        ctx.closePath();
    }

    function drawHeart(x, y, s, color, outline) {
        heartPath(x, y - s / 2, s);
        ctx.fillStyle = color;
        ctx.fill();
        if (outline) {
            ctx.lineWidth = 2;
            ctx.strokeStyle = outline;
            ctx.stroke();
        }
    }

    const WHITE_BEAR = { fur: '#ffffff', inner: '#ffc2d4', line: '#6b4a4a' };
    const BROWN_BEAR = { fur: '#c98f5f', inner: '#f2c9a5', line: '#5a3826' };

    function drawBear(x, y, r, pal, opt = {}) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(opt.rot || 0);
        const lw = Math.max(1, r * 0.13);
        ctx.lineWidth = lw;
        ctx.strokeStyle = pal.line;

        // крылышки-сердечки
        if (opt.wings !== undefined) {
            const a = Math.sin(opt.wings) * 0.6;
            ctx.save();
            ctx.translate(-r * 0.55, r * 0.25);
            ctx.rotate(-1.9 + a);
            drawHeart(0, -r * 0.55, r * 1.05, '#ff8fb4', '#d94f82');
            ctx.restore();
        }

        // тело
        ctx.beginPath();
        ctx.ellipse(0, r * 1.0, r * 0.78, r * 0.72, 0, 0, Math.PI * 2);
        ctx.fillStyle = pal.fur;
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(0, r * 1.1, r * 0.45, r * 0.42, 0, 0, Math.PI * 2);
        ctx.fillStyle = pal.inner;
        ctx.globalAlpha = 0.6;
        ctx.fill();
        ctx.globalAlpha = 1;

        // ушки
        for (const sx of [-1, 1]) {
            ctx.beginPath();
            ctx.arc(sx * r * 0.62, -r * 0.72, r * 0.32, 0, Math.PI * 2);
            ctx.fillStyle = pal.fur;
            ctx.fill();
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(sx * r * 0.62, -r * 0.72, r * 0.16, 0, Math.PI * 2);
            ctx.fillStyle = pal.inner;
            ctx.fill();
        }

        // голова
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fillStyle = pal.fur;
        ctx.fill();
        ctx.stroke();

        // щёчки
        ctx.fillStyle = 'rgba(255,120,160,0.55)';
        for (const sx of [-1, 1]) {
            ctx.beginPath();
            ctx.ellipse(sx * r * 0.56, r * 0.25, r * 0.17, r * 0.11, 0, 0, Math.PI * 2);
            ctx.fill();
        }

        // глазки
        ctx.fillStyle = '#2b1b1b';
        for (const sx of [-1, 1]) {
            if (opt.happy) {
                ctx.beginPath();
                ctx.arc(sx * r * 0.33, 0, r * 0.12, Math.PI * 1.1, Math.PI * 1.9);
                ctx.stroke();
            } else {
                ctx.beginPath();
                ctx.ellipse(sx * r * 0.33, -r * 0.02, r * 0.09, r * 0.12, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#fff';
                ctx.beginPath();
                ctx.arc(sx * r * 0.33 + r * 0.03, -r * 0.07, r * 0.035, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#2b1b1b';
            }
        }

        // носик и ротик
        ctx.beginPath();
        ctx.ellipse(0, r * 0.18, r * 0.08, r * 0.055, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = lw * 0.75;
        ctx.beginPath();
        ctx.arc(-r * 0.08, r * 0.25, r * 0.08, 0.1, Math.PI - 0.1);
        ctx.arc(r * 0.08, r * 0.25, r * 0.08, 0.1, Math.PI - 0.1);
        ctx.stroke();

        // лапки
        ctx.lineWidth = lw;
        const arm = opt.hug ? 1 : 0;
        for (const sx of [-1, 1]) {
            ctx.beginPath();
            ctx.ellipse(sx * r * (0.72 - arm * 0.1), r * (0.95 - arm * 0.25), r * 0.22, r * 0.3, sx * (0.5 + arm), 0, Math.PI * 2);
            ctx.fillStyle = pal.fur;
            ctx.fill();
            ctx.stroke();
        }
        ctx.restore();
    }

    // mood: -1 — злая тучка в начале пути, 1 — счастливая у финиша
    function drawCloudColumn(sx, y0, y1, capAtBottom, night, mood) {
        const happy = smooth(0.2, 1, mood);
        const fill = mixColor(night > 0.5 ? '#d9cff0' : '#f6f1ff', '#ffe3ef', happy);
        const line = mixColor('#a995d6', '#e895b8', happy);
        if (y1 - y0 < 4) return;
        ctx.save();
        ctx.fillStyle = fill;
        ctx.strokeStyle = line;
        ctx.lineWidth = 2.5;

        // пушистые края
        ctx.beginPath();
        for (let y = y0; y < y1; y += 20) {
            ctx.moveTo(sx + 9, y);
            ctx.arc(sx, y, 9, 0, Math.PI * 2);
            ctx.moveTo(sx + OBS_W + 9, y + 10);
            ctx.arc(sx + OBS_W, y + 10, 9, 0, Math.PI * 2);
        }
        ctx.stroke();
        ctx.fill();
        ctx.fillRect(sx, y0, OBS_W, y1 - y0);

        // шапка-тучка с мордочкой
        const cy = capAtBottom ? y1 - 6 : y0 + 6;
        const cx = sx + OBS_W / 2;
        ctx.beginPath();
        ctx.arc(cx - 22, cy, 18, 0, Math.PI * 2);
        ctx.moveTo(cx + 40, cy);
        ctx.arc(cx + 22, cy, 18, 0, Math.PI * 2);
        ctx.moveTo(cx + 24, cy + (capAtBottom ? 6 : -6));
        ctx.arc(cx, cy + (capAtBottom ? 6 : -6), 24, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fill();

        const fy = cy + (capAtBottom ? 6 : -6);
        const ink = '#5b4a7a';
        ctx.fillStyle = ink;
        ctx.strokeStyle = ink;
        ctx.lineWidth = 2;

        // щёчки у радостных
        if (mood > 0.3) {
            ctx.fillStyle = `rgba(255,120,160,${0.6 * smooth(0.3, 0.8, mood)})`;
            ctx.beginPath();
            ctx.ellipse(cx - 15, fy + 5, 4.5, 2.8, 0, 0, Math.PI * 2);
            ctx.ellipse(cx + 15, fy + 5, 4.5, 2.8, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = ink;
        }

        // глазки: у самых счастливых — дужки ^ ^
        ctx.beginPath();
        if (mood > 0.75) {
            ctx.arc(cx - 8, fy, 3.2, Math.PI * 1.15, Math.PI * 1.85);
            ctx.moveTo(cx + 8 + 3.2 * Math.cos(Math.PI * 1.15), fy + 3.2 * Math.sin(Math.PI * 1.15));
            ctx.arc(cx + 8, fy, 3.2, Math.PI * 1.15, Math.PI * 1.85);
            ctx.stroke();
        } else {
            ctx.arc(cx - 8, fy - 2, 2.6, 0, Math.PI * 2);
            ctx.arc(cx + 8, fy - 2, 2.6, 0, Math.PI * 2);
            ctx.fill();
        }

        // сердитые бровки в начале пути
        if (mood < -0.4) {
            ctx.beginPath();
            ctx.moveTo(cx - 12, fy - 9);
            ctx.lineTo(cx - 4, fy - 6);
            ctx.moveTo(cx + 12, fy - 9);
            ctx.lineTo(cx + 4, fy - 6);
            ctx.stroke();
        }

        // ротик: от грустной дуги к улыбке
        ctx.beginPath();
        ctx.moveTo(cx - 6, fy + 6);
        ctx.quadraticCurveTo(cx, fy + 6 + 8 * mood, cx + 6, fy + 6);
        ctx.stroke();
        ctx.restore();
    }

    function drawHouse(x) {
        const gy = groundY();
        ctx.save();
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = '#5a3826';
        // стены
        ctx.fillStyle = '#ffe2b8';
        ctx.fillRect(x, gy - 78, 92, 78);
        ctx.strokeRect(x, gy - 78, 92, 78);
        // крыша
        ctx.beginPath();
        ctx.moveTo(x - 12, gy - 76);
        ctx.lineTo(x + 46, gy - 124);
        ctx.lineTo(x + 104, gy - 76);
        ctx.closePath();
        ctx.fillStyle = '#e8577e';
        ctx.fill();
        ctx.stroke();
        // окошко
        ctx.fillStyle = '#ffd35c';
        ctx.fillRect(x + 12, gy - 60, 24, 22);
        ctx.strokeRect(x + 12, gy - 60, 24, 22);
        // дверь с сердечком
        ctx.fillStyle = '#b5754a';
        ctx.fillRect(x + 54, gy - 50, 26, 50);
        ctx.strokeRect(x + 54, gy - 50, 26, 50);
        drawHeart(x + 67, gy - 38, 11, '#ff4f8b');
        // табличка
        ctx.fillStyle = '#fff5fa';
        ctx.fillRect(x + 14, gy - 112, 64, 18);
        ctx.strokeRect(x + 14, gy - 112, 64, 18);
        ctx.fillStyle = '#5a3826';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(TO, x + 46, gy - 99);
        ctx.restore();
    }

    // ---------- Фон ----------
    const SKY_TOP = [[0, '#8ec9ff'], [0.45, '#ff9fc0'], [0.75, '#4a2f7d'], [1, '#1d1645']];
    const SKY_BOT = [[0, '#ffe3f0'], [0.45, '#ffd59e'], [0.75, '#d07aa0'], [1, '#6b3f7a']];
    const HILL_FAR = [[0, '#b6e0c8'], [0.5, '#d8a3b8'], [1, '#3a2d5c']];
    const HILL_NEAR = [[0, '#8fd19e'], [0.5, '#b88aa8'], [1, '#2b2248']];
    const stars = Array.from({ length: 60 }, () => ({ x: Math.random(), y: Math.random() * 0.6, s: rand(0.6, 1.8), p: rand(0, 6) }));
    const bgClouds = Array.from({ length: 6 }, (_, i) => ({ x: i * 90 + rand(0, 40), y: rand(70, 260), s: rand(0.6, 1.2) }));

    function drawBackground(p, camX, time) {
        const gy = groundY();
        const g = ctx.createLinearGradient(0, 0, 0, gy);
        g.addColorStop(0, keyframes(SKY_TOP, p));
        g.addColorStop(1, keyframes(SKY_BOT, p));
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);

        // звёзды
        const night = smooth(0.55, 0.85, p);
        if (night > 0) {
            for (const s of stars) {
                ctx.globalAlpha = night * (0.6 + 0.4 * Math.sin(time * 2 + s.p));
                ctx.fillStyle = '#fff';
                ctx.fillRect(s.x * W, s.y * gy, s.s, s.s);
            }
            ctx.globalAlpha = 1;
        }

        // солнце садится, луна встаёт
        const sunY = lerp(120, gy + 40, smooth(0.1, 0.7, p));
        ctx.fillStyle = 'rgba(255, 236, 160, 0.95)';
        ctx.beginPath();
        ctx.arc(W - 80, sunY, 28, 0, Math.PI * 2);
        ctx.fill();
        if (night > 0) {
            const moonY = lerp(gy, 130, night);
            ctx.fillStyle = '#fff6d8';
            ctx.beginPath();
            ctx.arc(70, moonY, 22, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = keyframes(SKY_TOP, p);
            ctx.beginPath();
            ctx.arc(80, moonY - 6, 20, 0, Math.PI * 2);
            ctx.fill();
        }

        // облачка вдали
        ctx.fillStyle = `rgba(255,255,255,${0.55 - night * 0.35})`;
        for (const c of bgClouds) {
            const x = ((c.x - camX * 0.15) % 540 + 540) % 540 - 90;
            ctx.beginPath();
            ctx.arc(x, c.y, 16 * c.s, 0, Math.PI * 2);
            ctx.arc(x + 18 * c.s, c.y - 8 * c.s, 20 * c.s, 0, Math.PI * 2);
            ctx.arc(x + 40 * c.s, c.y, 15 * c.s, 0, Math.PI * 2);
            ctx.fill();
        }

        // холмы, в начале пути — Уральские горы
        const mountains = 1 - smooth(0.04, 0.2, p);
        ctx.fillStyle = keyframes(HILL_FAR, p);
        ctx.beginPath();
        ctx.moveTo(0, gy);
        for (let x = 0; x <= W; x += 6) {
            const wx = x + camX * 0.25;
            const hill = 40 + 18 * Math.sin(wx * 0.012) + 10 * Math.sin(wx * 0.031);
            const peak = mountains * (70 + 50 * Math.abs(Math.sin(wx * 0.009)) - 30 * Math.abs(Math.sin(wx * 0.023)));
            ctx.lineTo(x, gy - hill - peak);
        }
        ctx.lineTo(W, gy);
        ctx.fill();

        ctx.fillStyle = keyframes(HILL_NEAR, p);
        ctx.beginPath();
        ctx.moveTo(0, gy);
        for (let x = 0; x <= W; x += 6) {
            const wx = x + camX * 0.5;
            ctx.lineTo(x, gy - 22 - 12 * Math.sin(wx * 0.02) - 6 * Math.sin(wx * 0.05));
        }
        ctx.lineTo(W, gy);
        ctx.fill();
        return night;
    }

    function drawGround(camX, p) {
        const gy = groundY();
        ctx.fillStyle = keyframes([[0, '#7cc88a'], [0.6, '#8a9a6a'], [1, '#3b4a3a']], p);
        ctx.fillRect(0, gy, W, GROUND_H);
        ctx.fillStyle = keyframes([[0, '#5aa86a'], [1, '#2a3a2c']], p);
        ctx.fillRect(0, gy, W, 6);
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        for (let i = -1; i < W / 30 + 1; i++) {
            const x = i * 30 - (camX % 30);
            ctx.fillRect(x, gy + 14 + (i % 2) * 10, 10, 3);
        }
    }

    // ---------- Игра ----------
    let state = 'menu';
    let time = 0;
    let camX = 0;
    let player, obstacles, hearts, particles, floaters;
    let msg = null, msgIdx = 0;
    let collected = 0;
    let attempts = 0, fallT = 0;
    let arrive = null;

    function reset() {
        camX = 0;
        player = { x: PLAYER_X, y: H * 0.42, vy: 0, wing: 0 };
        obstacles = [];
        hearts = [];
        particles = [];
        floaters = [];
        msg = null;
        msgIdx = 0;
        collected = 0;
        fallT = 0;
        arrive = null;

        const gy = groundY();
        let prev = gy * 0.45;
        for (let i = 0; i < OBSTACLES; i++) {
            const k = i / (OBSTACLES - 1);
            const gap = lerp(205, 168, k);
            const lo = CEILING + 20 + gap / 2, hi = gy - 50 - gap / 2;
            const center = clamp(prev + rand(-140, 140), lo, hi);
            prev = center;
            obstacles.push({ x: START_X + i * SPACING, top: center - gap / 2, bottom: center + gap / 2, passed: false });
        }
        for (let i = 0; i < OBSTACLES; i++) {
            if (Math.random() < 0.65) {
                const a = obstacles[i], b = obstacles[i + 1] || a;
                const y = ((a.top + a.bottom) / 2 + (b.top + b.bottom) / 2) / 2 + rand(-20, 20);
                hearts.push({ x: a.x + OBS_W / 2 + SPACING / 2, y, got: false });
            }
        }
    }

    const progress = () => {
        if (state === 'menu') return 0;
        if (state === 'play' || state === 'crashed' || state === 'gameover') return clamp(camX / END_X, 0, 1);
        return 1;
    };

    function flap() {
        if (state !== 'play') return;
        player.vy = FLAP;
        sfx.flap();
        for (let i = 0; i < 3; i++) {
            particles.push({ x: player.x - 14, y: player.y + 10, vx: rand(-60, -20), vy: rand(20, 60), life: 0.5, max: 0.5, kind: 'puff', s: rand(3, 6) });
        }
    }

    function showMsg(text, dur = 2.6) {
        msg = { text, t: dur, max: dur };
    }

    function burstHearts(x, y, n, spread = 140) {
        for (let i = 0; i < n; i++) {
            particles.push({
                x, y,
                vx: rand(-spread, spread), vy: rand(-spread * 1.4, -spread * 0.2),
                life: rand(0.9, 1.6), max: 1.6, kind: 'heart', s: rand(8, 15),
                c: ['#ff4f8b', '#ff8fb4', '#ffb3c9', '#e8577e'][i % 4],
            });
        }
    }

    function circleRect(cx, cy, r, rx, ry, rw, rh) {
        const nx = clamp(cx, rx, rx + rw), ny = clamp(cy, ry, ry + rh);
        return (cx - nx) ** 2 + (cy - ny) ** 2 < r * r;
    }

    function crash() {
        state = 'crashed';
        fallT = 0;
        playFail();
        vibrate(150);
        player.vy = -200;
        msg = null;
        for (let i = 0; i < 10; i++) {
            particles.push({ x: player.x, y: player.y, vx: rand(-120, 120), vy: rand(-120, 120), life: 0.6, max: 0.6, kind: 'puff', s: rand(4, 9) });
        }
    }

    // мишка падает на землю, потом экран «заново»
    function updateCrashed(dt) {
        fallT += dt;
        const floor = groundY() - PLAYER_R * 1.6;
        player.vy = Math.min(player.vy + GRAVITY * dt, MAX_FALL);
        player.y = Math.min(floor, player.y + player.vy * dt);
        if (fallT > 1.0 && state === 'crashed') {
            state = 'gameover';
            showGameOver();
        }
    }

    function showGameOver() {
        const flown = Math.round(DIST_KM * clamp(camX / END_X, 0, 1));
        let best = flown;
        try {
            best = Math.max(flown, Number(localStorage.getItem('sekretik-best')) || 0);
            localStorage.setItem('sekretik-best', String(best));
        } catch (e) { /* без рекорда */ }
        document.getElementById('overTitle').textContent = OOPS[attempts % OOPS.length];
        document.getElementById('overText').textContent =
            `Пролетела ${flown} км из ${DIST_KM}. До меня осталось ${DIST_KM - flown} км.`;
        document.getElementById('overBest').textContent = `Рекорд: ${best} км`;
        attempts++;
        show('gameover');
    }

    function updatePlay(dt) {
        const p = progress();
        while (msgIdx < MILESTONES.length && p >= MILESTONES[msgIdx][0]) {
            showMsg(MILESTONES[msgIdx][1]);
            msgIdx++;
        }

        camX += (150 + 35 * p) * dt;

        player.vy = Math.min(player.vy + GRAVITY * dt, MAX_FALL);
        player.y += player.vy * dt;
        if (player.y < CEILING) { player.y = CEILING; player.vy = 0; }

        const gy = groundY();
        if (player.y > gy - PLAYER_R * 1.6) {
            crash();
            return;
        }

        for (const o of obstacles) {
            const sx = o.x - camX;
            if (sx > W || sx + OBS_W < -20) continue;
            if ((
                circleRect(player.x, player.y, HIT_R, sx - 4, -50, OBS_W + 8, o.top + 50) ||
                circleRect(player.x, player.y, HIT_R, sx - 4, o.bottom, OBS_W + 8, gy - o.bottom)
            )) {
                crash();
                return;
            }
            if (!o.passed && sx + OBS_W < player.x) o.passed = true;
        }

        for (const h of hearts) {
            if (h.got) continue;
            const sx = h.x - camX;
            if (Math.hypot(sx - player.x, h.y - player.y) < 26) {
                h.got = true;
                collected++;
                sfx.heart();
                burstHearts(sx, h.y, 6, 80);
                floaters.push({ x: sx, y: h.y - 20, text: '+1', t: 0.9, c: '#ff4f8b' });
            }
        }

        if (camX >= END_X) startArrive();
    }

    function startArrive() {
        state = 'arrive';
        arrive = { phase: 0, t: 0 };
        msg = null;
    }

    function herScreenX() {
        return HOME_X - camX - 30;
    }

    function updateArrive(dt) {
        const gy = groundY();
        const herY = gy - 46;
        arrive.t += dt;
        if (arrive.phase === 0) {
            // долетаем до домика
            const target = HOME_X - 30 - W * 0.7;
            camX = Math.min(target, camX + 160 * dt);
            player.y = lerp(player.y, herY - 30, 1 - Math.pow(0.1, dt));
            if (camX >= target) { arrive.phase = 1; arrive.t = 0; }
        } else if (arrive.phase === 1) {
            // подлетаем к ней
            const tx = herScreenX() - 36;
            player.x = lerp(player.x, tx, 1 - Math.pow(0.02, dt));
            player.y = lerp(player.y, herY, 1 - Math.pow(0.02, dt));
            if (Math.abs(player.x - tx) < 2) {
                arrive.phase = 2;
                arrive.t = 0;
                sfx.win();
                vibrate([60, 60, 60]);
            }
        } else {
            // обнимашки
            if (Math.random() < dt * 14) burstHearts(herScreenX() - 18, herY - 30, 2, 90);
            if (arrive.t > 2.6 && state === 'arrive') {
                state = 'question';
                show('question');
            }
        }
    }

    function updateParticles(dt) {
        for (const q of particles) {
            q.life -= dt;
            q.x += q.vx * dt;
            q.y += q.vy * dt;
            if (q.kind === 'heart') q.vy += 160 * dt;
            else { q.vx *= 0.94; q.vy *= 0.94; }
        }
        particles = particles.filter((q) => q.life > 0);
        for (const f of floaters) { f.t -= dt; f.y -= 30 * dt; }
        floaters = floaters.filter((f) => f.t > 0);
        if (msg) { msg.t -= dt; if (msg.t <= 0) msg = null; }
    }

    // ---------- Отрисовка кадра ----------
    function drawHUD(p) {
        // полоска маршрута
        const x0 = 76, x1 = W - 76, y = 34;
        ctx.save();
        ctx.fillStyle = 'rgba(255,255,255,0.82)';
        roundRect(10, 12, W - 20, 50, 18);
        ctx.fill();

        ctx.font = 'bold 11px sans-serif';
        ctx.fillStyle = '#7a4a66';
        ctx.textAlign = 'left';
        ctx.fillText(FROM, 18, y + 4);
        ctx.textAlign = 'right';
        ctx.fillText(TO, W - 18, y + 4);

        ctx.strokeStyle = '#f3c2d6';
        ctx.lineWidth = 6;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x0, y);
        ctx.lineTo(x1, y);
        ctx.stroke();
        ctx.strokeStyle = '#ff4f8b';
        ctx.beginPath();
        ctx.moveTo(x0, y);
        ctx.lineTo(lerp(x0, x1, p) + 0.01, y);
        ctx.stroke();
        drawHeart(x1, y, 12, '#ff4f8b');
        drawBear(lerp(x0, x1, p), y - 2, 7, WHITE_BEAR);

        ctx.font = '11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#7a4a66';
        const left = Math.round(DIST_KM * (1 - p));
        ctx.fillText(left > 0 ? `осталось ${left} км` : 'долетели!', W / 2, y + 22);
        ctx.textAlign = 'right';
        ctx.fillText(String(collected), W - 18, y + 22);
        drawHeart(W - 28 - ctx.measureText(String(collected)).width, y + 18, 10, '#ff4f8b');
        ctx.restore();
    }

    function roundRect(x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    }

    function drawMessage() {
        if (!msg) return;
        const a = Math.min(1, msg.t / 0.4, (msg.max - msg.t) / 0.3 + 0.01);
        ctx.save();
        ctx.globalAlpha = clamp(a, 0, 1);
        ctx.font = 'bold 15px sans-serif';
        const w = Math.min(W - 30, ctx.measureText(msg.text).width + 32);
        ctx.fillStyle = 'rgba(255, 79, 139, 0.92)';
        roundRect((W - w) / 2, 76, w, 34, 17);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.fillText(msg.text, W / 2, 98, W - 50);
        ctx.restore();
    }

    function render() {
        const p = state === 'menu' ? 0 : progress();
        const night = drawBackground(p, camX, time);

        // тучки
        for (const o of obstacles) {
            const sx = o.x - camX;
            if (sx > W + 40 || sx + OBS_W < -40) continue;
            const mood = lerp(-1, 1, o.x / END_X);
            drawCloudColumn(sx, -20, o.top, true, night, mood);
            drawCloudColumn(sx, o.bottom, groundY(), false, night, mood);
        }

        // домик в Березне и мишка, который ждёт
        const hx = HOME_X - camX;
        if (hx < W + 140) {
            drawHouse(hx + 10);
            const gy = groundY();
            const hug = state !== 'play' && arrive && arrive.phase === 2;
            drawBear(herScreenX(), gy - 46 + (hug ? 0 : Math.sin(time * 3) * 2), 19, BROWN_BEAR, { hug, happy: hug });
        }

        drawGround(camX, p);

        // сердечки
        for (const h of hearts) {
            if (h.got) continue;
            const sx = h.x - camX;
            if (sx < -20 || sx > W + 20) continue;
            const s = 18 + Math.sin(time * 5 + h.x) * 2;
            ctx.save();
            ctx.shadowColor = 'rgba(255,79,139,0.6)';
            ctx.shadowBlur = 10;
            drawHeart(sx, h.y, s, '#ff4f8b', '#fff');
            ctx.restore();
        }

        // мишка
        if (player) {
            {
                const hug = arrive && arrive.phase === 2;
                const rot = state === 'play' ? clamp(player.vy / 700, -0.45, 0.7) : state === 'crashed' || state === 'gameover' ? 2.6 : 0;
                drawBear(player.x, player.y, PLAYER_R, WHITE_BEAR, { wings: hug ? undefined : player.wing, rot, hug, happy: hug });
            }
        }

        // частицы
        for (const q of particles) {
            ctx.globalAlpha = clamp(q.life / q.max, 0, 1);
            if (q.kind === 'heart') drawHeart(q.x, q.y, q.s, q.c);
            else {
                ctx.fillStyle = '#fff';
                ctx.beginPath();
                ctx.arc(q.x, q.y, q.s, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        ctx.globalAlpha = 1;

        for (const f of floaters) {
            ctx.save();
            ctx.globalAlpha = clamp(f.t, 0, 1);
            ctx.font = 'bold 14px sans-serif';
            ctx.textAlign = 'center';
            ctx.lineWidth = 3;
            ctx.strokeStyle = 'rgba(80,30,60,0.6)';
            ctx.strokeText(f.text, f.x, f.y);
            ctx.fillStyle = f.c;
            ctx.fillText(f.text, f.x, f.y);
            ctx.restore();
        }

        if (state !== 'menu') drawHUD(p);
        if (state === 'play') drawMessage();

        if (state === 'play' && camX < 120) {
            ctx.save();
            ctx.globalAlpha = 0.6 + 0.4 * Math.sin(time * 6);
            ctx.font = 'bold 16px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillStyle = '#fff';
            ctx.strokeStyle = 'rgba(80,30,60,0.5)';
            ctx.lineWidth = 3;
            ctx.strokeText('Тапай по экрану!', W / 2, H * 0.62);
            ctx.fillText('Тапай по экрану!', W / 2, H * 0.62);
            ctx.restore();
        }
    }

    // ---------- Цикл ----------
    let last = performance.now();
    function frame(now) {
        const dt = Math.min(0.033, (now - last) / 1000);
        last = now;
        time += dt;

        if (player) {
            const flapping = state === 'play' ? (player.vy < 0 ? 22 : 10) : 9;
            player.wing += dt * flapping;
        }
        if (state === 'menu' || state === 'final') {
            camX += 40 * dt;
            if (player) player.y = H * 0.42 + Math.sin(time * 2.2) * 10;
            if (state === 'final' && Math.random() < dt * 6) burstHearts(rand(30, W - 30), H + 10, 3, 120);
        } else if (state === 'play') {
            updatePlay(dt);
        } else if (state === 'crashed' || state === 'gameover') {
            updateCrashed(dt);
        } else if (state === 'arrive' || state === 'question') {
            if (arrive) updateArrive(dt);
        }
        updateParticles(dt);
        render();
        requestAnimationFrame(frame);
    }

    // ---------- Экраны ----------
    const screens = ['menu', 'question', 'final', 'gameover'];
    function show(id) {
        for (const s of screens) document.getElementById(s).classList.toggle('show', s === id);
    }

    function startGame() {
        initAudio();
        if (audio && audio.state === 'suspended') audio.resume();
        stopFail();
        // каждая новая попытка — песня с начала
        music.currentTime = 0;
        playMusic();
        reset();
        setQuestion(0);
        state = 'play';
        show(null);
    }

    // ---------- Вопросы ----------
    const QUESTIONS = [
        { text: 'Милая моя, ты будешь со мной в перемоге и зрадости?', no: 'Нет' },
        { text: 'Пошли в бравл старс?', no: 'Не, не хочу щас' },
    ];
    const qText = document.getElementById('qText');
    const noBtn = document.getElementById('noBtn');
    const yesBtn = document.getElementById('yesBtn');
    const noBoom = new Audio('sfx/net-idi-na.mp3');
    let qStep = 0;

    function setQuestion(i) {
        qStep = i;
        qText.textContent = QUESTIONS[i].text;
        noBtn.textContent = QUESTIONS[i].no;
        noBtn.hidden = false;
        yesBtn.classList.remove('big');
    }

    // кнопка «Нет» разлетается на кусочки
    function explode(btn) {
        const r = btn.getBoundingClientRect();
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        const colors = ['#ff4f8b', '#ffb3c9', '#e9dde6', '#7a5a6e', '#ffd35c'];
        for (let i = 0; i < 40; i++) {
            const bit = document.createElement('div');
            bit.className = 'shard';
            const size = rand(9, 20);
            bit.style.cssText = `left:${cx}px;top:${cy}px;width:${size}px;height:${size}px;background:${colors[i % colors.length]}`;
            document.body.appendChild(bit);
            const a = rand(0, Math.PI * 2), d = rand(90, 240);
            bit.animate([
                { transform: 'translate(-50%,-50%) scale(1)', opacity: 1 },
                { transform: `translate(calc(-50% + ${Math.cos(a) * d}px), calc(-50% + ${Math.sin(a) * d}px)) scale(0.3) rotate(${rand(-360, 360)}deg)`, opacity: 0 },
            ], { duration: rand(700, 1100), easing: 'cubic-bezier(.2,.8,.3,1)' }).onfinish = () => bit.remove();
        }
        const card = btn.closest('.card');
        card.animate([
            { transform: 'translateX(0)' }, { transform: 'translateX(-8px)' }, { transform: 'translateX(8px)' },
            { transform: 'translateX(-5px)' }, { transform: 'translateX(0)' },
        ], { duration: 300 });
        btn.hidden = true;
    }

    noBtn.addEventListener('click', () => {
        explode(noBtn);
        vibrate([40, 30, 120]);
        if (!muted) {
            noBoom.currentTime = 0;
            noBoom.play().catch(() => {});
        }
        yesBtn.classList.add('big');
    });

    yesBtn.addEventListener('click', () => {
        if (qStep < QUESTIONS.length - 1) {
            sfx.heart();
            setQuestion(qStep + 1);
            return;
        }
        state = 'final';
        arrive = null;
        player.x = PLAYER_X;
        sfx.win();
        vibrate([80, 50, 80, 50, 160]);
        burstHearts(W / 2, H * 0.6, 40, 220);
        show('final');
    });

    document.getElementById('startBtn').addEventListener('click', startGame);
    document.getElementById('againBtn').addEventListener('click', () => { attempts = 0; startGame(); });
    document.getElementById('retryBtn').addEventListener('click', startGame);

    cv.addEventListener('pointerdown', (e) => { e.preventDefault(); flap(); });
    window.addEventListener('keydown', (e) => {
        if (e.code === 'Space' || e.code === 'ArrowUp') { e.preventDefault(); flap(); }
    });
    document.addEventListener('visibilitychange', () => {
        last = performance.now();
        if (document.hidden) pauseMusic();
        else resumeMusic();
    });

    reset();
    requestAnimationFrame(frame);

    // для проверки в браузере: window.__secret.skip() — перелететь почти в конец
    window.__secret = { skip: () => { camX = END_X - 300; obstacles = obstacles.filter((o) => o.x > camX + W); } };
})();
