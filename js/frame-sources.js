/* ============================================================
   Fontes de frames para a cena de transformação.

   Contrato (o que a cena espera de qualquer fonte):
     frameCount        -> número de "frames" da sequência
     load(onFrameReady)-> prepara assets; chama onFrameReady() quando
                          novos frames ficam disponíveis (para redesenhar)
     draw(ctx, index, viewport) -> desenha o frame `index`;
                          viewport = { w, h, portrait }
     ready(index)      -> o frame já pode ser desenhado?

   Para trocar o placeholder pela sequência real, basta trocar a
   fonte registrada em js/main.js por um ImageSequenceSource.
   ============================================================ */

/* ---------- helpers ---------- */

const clamp01 = (v) => Math.min(1, Math.max(0, v));

/** Interpolação suave entre a e b conforme t. */
function smoothstep(a, b, t) {
  const x = clamp01((t - a) / (b - a));
  return x * x * (3 - 2 * x);
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function lerpColor(hexA, hexB, t) {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

/** Pseudo-aleatório determinístico por índice (mesmo valor em todo frame). */
function seeded(i, salt = 1) {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

const fract = (v) => v - Math.floor(v);

/**
 * Carrega uma imagem via onload. (Não usar img.decode(): em aba de
 * fundo o Chrome adia a decodificação e a promise pode nunca resolver.)
 */
function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

/**
 * Bounding box dos pixels visíveis de um PNG recortado (alpha > ~10%).
 * Calculada uma vez no load — permite compor a figura pelo que ela
 * ocupa de fato, ignorando as margens transparentes do arquivo.
 */
function alphaBbox(img) {
  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const cctx = c.getContext("2d", { willReadFrequently: true });
  cctx.drawImage(img, 0, 0);
  const { data } = cctx.getImageData(0, 0, c.width, c.height);
  let minX = c.width, minY = c.height, maxX = 0, maxY = 0;
  const step = 2; // varre 1 a cada 2 pixels: precisão de sobra, 4x mais rápido
  for (let y = 0; y < c.height; y += step) {
    for (let x = 0; x < c.width; x += step) {
      if (data[(y * c.width + x) * 4 + 3] > 25) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX <= minX) return { x: 0, y: 0, w: c.width, h: c.height };
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/**
 * Desenha um recorte (PNG com alpha) ancorado no chão do palco,
 * subindo do proscênio JÁ OPACO (fade só no comecinho — se ficasse
 * translúcido, as letras de trás vazariam pelo corpo).
 * `reveal` 0→1 controla a entrada; `bb` é o alphaBbox da imagem.
 */
function drawGroundedCutout(ctx, img, bb, vp, reveal, heightFactor = {}) {
  const { w, h, portrait } = vp;
  const factor = portrait
    ? (heightFactor.portrait ?? 0.6)
    : (heightFactor.landscape ?? 0.74);
  // trava de largura: poses de braços abertos não estouram a tela
  // (1.15 = corte leve nas pontas em troca de mais presença)
  const scale = Math.min((h * factor) / bb.h, (w * 1.15) / bb.w);
  const appear = smoothstep(0, 0.3, reveal);
  const rise = (1 - reveal) * h * 0.22;
  const dx = w / 2 - (bb.x + bb.w / 2) * scale;
  const dy = h - (bb.y + bb.h) * scale + rise;
  ctx.save();
  ctx.globalAlpha = appear;
  ctx.drawImage(img, dx, dy, img.naturalWidth * scale, img.naturalHeight * scale);
  ctx.restore();
}

/**
 * Pré-compõe uma foto em cover-fit com máscara radial (vinheta) num buffer:
 * opaca no centro (figura), transparente nas bordas — assim o nome gigante
 * continua visível atrás da personagem. Um drawImage por frame depois disso.
 */
function maskedCoverBuffer(img, vp, focus = { x: 0.5, y: 0.32 }, vignette = {}) {
  const { rIn: rInF = 0.3, rOut: rOutF = 0.62 } = vignette;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const buf = document.createElement("canvas");
  buf.width = Math.round(vp.w * dpr);
  buf.height = Math.round(vp.h * dpr);
  const bctx = buf.getContext("2d");
  bctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const scale = Math.max(vp.w / img.naturalWidth, vp.h / img.naturalHeight);
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  bctx.drawImage(img, (vp.w - dw) * focus.x, (vp.h - dh) * focus.y, dw, dh);

  const cx = vp.w / 2;
  const cy = vp.h * 0.48;
  const rIn = Math.min(vp.w, vp.h) * rInF;
  const rOut = Math.max(vp.w, vp.h) * rOutF;
  const mask = bctx.createRadialGradient(cx, cy, rIn, cx, cy, rOut);
  mask.addColorStop(0, "rgba(0,0,0,1)");
  mask.addColorStop(1, "rgba(0,0,0,0)");
  bctx.globalCompositeOperation = "destination-in";
  bctx.fillStyle = mask;
  bctx.fillRect(0, 0, vp.w, vp.h);
  return buf;
}

/* ============================================================
   PLACEHOLDER — silhueta procedural
   Desenho vetorial barato (nenhuma imagem, nenhum blur), que
   simula a sequência: Myra → chapéu, pele verde, levitação.
   ============================================================ */
export class PlaceholderTransformationSource {
  /**
   * @param {Object} [opts]
   * @param {number} [opts.frameCount]
   * @param {Object} [opts.startImage] foto real do estado inicial (antes da
   *   transformação), full-bleed: { url, focus: {x,y} } — dissolve na
   *   silhueta assim que o scroll começa
   * @param {Object} [opts.finalCutout] recorte PNG com alpha que entra no
   *   fim do scroll (preferido): { url, revealFrom, heightFactor, mode }
   * @param {Object} [opts.finalImage] fallback com foto de fundo + vinheta:
   *   { url, focus: {x,y}, revealFrom }
   */
  constructor({ frameCount = 120, startImage = null, finalCutout = null, finalImage = null } = {}) {
    this.frameCount = frameCount;
    this.startImage = startImage;
    this.finalCutout = finalCutout;
    this.finalImage = finalImage;
    this._img = null;
    this._startImg = null;
    this._bbox = null;
    this._buffer = null;
    this._bufferKey = "";
  }

  load(onFrameReady) {
    const src = this.finalCutout ?? this.finalImage;
    if (src) {
      loadImage(src.url).then((img) => {
        this._img = img;
        if (this.finalCutout) this._bbox = alphaBbox(img);
        onFrameReady?.();
      }).catch(() => { /* sem a foto, a silhueta segue sozinha */ });
    }
    if (this.startImage) {
      loadImage(this.startImage.url).then((img) => {
        this._startImg = img;
        onFrameReady?.();
      }).catch(() => { /* sem a foto, a cena abre na silhueta */ });
    }
  }

  ready() { return true; }

  /**
   * Pré-compõe a foto final com máscara radial (vinheta) num buffer,
   * para o crossfade por frame custar um único drawImage. A vinheta
   * deixa as bordas transparentes — o nome gigante continua visível
   * atrás da personagem.
   */
  _finalBuffer(vp) {
    const key = `${vp.w}x${vp.h}`;
    if (this._bufferKey !== key) {
      this._buffer = maskedCoverBuffer(this._img, vp, this.finalImage.focus);
      this._bufferKey = key;
    }
    return this._buffer;
  }

  draw(ctx, index, vp) {
    const t = index / (this.frameCount - 1);
    const { w, h, portrait } = vp;

    ctx.clearRect(0, 0, w, h);

    // ---- composição: retrato usa figura maior e mais alta na tela
    const FH = portrait ? h * 0.62 : h * 0.72; // altura da figura
    const cx = w / 2;
    const floorY = portrait ? h * 0.9 : h * 0.94;

    // levitação no fim (defying gravity)
    const lift = smoothstep(0.72, 1, t) * FH * 0.07;
    const y0 = floorY - lift;

    // ---- luz de palco no chão (dourada, morre conforme t; verde nasce)
    const spotAlpha = 0.28 * (1 - smoothstep(0.2, 0.8, t));
    if (spotAlpha > 0.01) {
      const g = ctx.createRadialGradient(cx, floorY, 0, cx, floorY, FH * 0.55);
      g.addColorStop(0, `rgba(194,160,107,${spotAlpha})`);
      g.addColorStop(1, "rgba(194,160,107,0)");
      ctx.save();
      ctx.translate(cx, floorY);
      ctx.scale(1, 0.22);
      ctx.translate(-cx, -floorY);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h * 2);
      ctx.restore();
    }

    // ---- aura esmeralda atrás da figura (cresce com t)
    // é ela que faz a silhueta escura continuar legível no fundo escuro
    const auraAlpha = 0.6 * smoothstep(0.18, 0.75, t);
    if (auraAlpha > 0.01) {
      const gy = y0 - FH * 0.52;
      const g = ctx.createRadialGradient(cx, gy, FH * 0.05, cx, gy, FH * 0.85);
      g.addColorStop(0, `rgba(120,205,135,${auraAlpha})`);
      g.addColorStop(0.4, `rgba(63,124,82,${auraAlpha * 0.65})`);
      g.addColorStop(1, "rgba(29,74,50,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }

    // ---- crossfade com a foto real: a silhueta sai ANTES de a foto
    // terminar de entrar, para não sobrar um "fantasma" sobreposto
    const finalSrc = this.finalCutout ?? this.finalImage;
    const from = finalSrc?.revealFrom ?? 0.8;
    const reveal = (this._img && finalSrc) ? smoothstep(from, 1, t) : 0;
    let figAlpha = (this._img && finalSrc)
      ? 1 - smoothstep(from, from + (1 - from) * 0.55, t)
      : 1;
    // a silhueta só assume depois que a foto inicial se dissolve
    if (this._startImg) figAlpha *= smoothstep(0.06, 0.22, t);

    // ---- foto real do estado inicial (a atriz, antes da magia)
    if (this._startImg) {
      const startAlpha = 1 - smoothstep(0.04, 0.2, t);
      if (startAlpha > 0.01) {
        const img = this._startImg;
        const f = this.startImage.focus ?? { x: 0.5, y: 0.3 };
        const push = 1 + 0.05 * smoothstep(0.04, 0.2, t); // leve zoom ao sair
        const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight) * push;
        const dw = img.naturalWidth * scale;
        const dh = img.naturalHeight * scale;
        ctx.save();
        ctx.globalAlpha = startAlpha;
        ctx.drawImage(img, (w - dw) * f.x, (h - dh) * f.y, dw, dh);
        ctx.restore();
      }
    }

    ctx.save();
    ctx.globalAlpha = figAlpha;

    // ---- cores da personagem
    const skin = lerpColor("#d9a67e", "#6cbb77", smoothstep(0.3, 0.75, t));
    const dress = lerpColor("#4a2233", "#131b15", smoothstep(0.15, 0.7, t));
    const hair = lerpColor("#2b1c1a", "#101410", t);

    // ---- geometria
    const headR = FH * 0.062;
    const headY = y0 - FH + headR;
    const shoulderY = headY + headR * 1.9;
    const shoulderHW = FH * 0.088;
    const waistY = y0 - FH * 0.56;
    const waistHW = FH * 0.052;
    const hemHW = FH * (0.15 + 0.08 * smoothstep(0.3, 0.9, t)); // saia/capa abre

    // vestido (linha-A com leve curva de capa)
    ctx.fillStyle = dress;
    ctx.beginPath();
    ctx.moveTo(cx - shoulderHW, shoulderY);
    ctx.quadraticCurveTo(cx - waistHW * 1.3, waistY, cx - hemHW, y0);
    ctx.quadraticCurveTo(cx, y0 + FH * 0.012, cx + hemHW, y0);
    ctx.quadraticCurveTo(cx + waistHW * 1.3, waistY, cx + shoulderHW, shoulderY);
    ctx.closePath();
    ctx.fill();

    // braços — sobem de "relaxados" para o V do Defying Gravity
    const raise = smoothstep(0.5, 0.95, t);
    const armLen = FH * 0.3;
    const armW = FH * 0.03;
    ctx.strokeStyle = dress;
    ctx.lineWidth = armW;
    ctx.lineCap = "round";
    for (const side of [-1, 1]) {
      // ângulo a partir da vertical (0 = braço caído): 14° → 138°
      const ang = (14 + 124 * raise) * (Math.PI / 180);
      const sx = cx + side * shoulderHW * 0.85;
      const sy = shoulderY + FH * 0.02;
      const ex = sx + side * Math.sin(ang) * armLen;
      const ey = sy + Math.cos(ang) * armLen;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      // mão
      ctx.fillStyle = skin;
      ctx.beginPath();
      ctx.arc(ex, ey, armW * 0.62, 0, Math.PI * 2);
      ctx.fill();
    }

    // pescoço + cabeça
    ctx.fillStyle = skin;
    ctx.fillRect(cx - headR * 0.34, headY + headR * 0.6, headR * 0.68, headR * 1.5);
    ctx.beginPath();
    ctx.arc(cx, headY, headR, 0, Math.PI * 2);
    ctx.fill();

    // cabelo (coque de palco)
    ctx.fillStyle = hair;
    ctx.beginPath();
    ctx.arc(cx, headY - headR * 0.22, headR * 1.04, Math.PI * 0.95, Math.PI * 2.05);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, headY - headR * 1.15, headR * 0.42, 0, Math.PI * 2);
    ctx.fill();

    // chapéu de bruxa — cresce entre 45% e 80% do scroll
    const hatT = smoothstep(0.45, 0.8, t);
    if (hatT > 0.01) {
      ctx.save();
      ctx.translate(cx, headY - headR * 0.75);
      ctx.rotate(-0.09);
      ctx.scale(hatT, hatT);
      ctx.fillStyle = "#0a0f0c";
      // aba
      ctx.beginPath();
      ctx.ellipse(0, 0, headR * 2.1, headR * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
      // cone
      ctx.beginPath();
      ctx.moveTo(-headR * 1.05, 0);
      ctx.quadraticCurveTo(-headR * 0.2, -FH * 0.13, headR * 0.5, -FH * 0.24);
      ctx.quadraticCurveTo(headR * 0.55, -FH * 0.1, headR * 1.05, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    ctx.restore(); // fim do fade da silhueta

    // ---- a personagem real entra na mesma medida em que a silhueta some
    if (reveal > 0.01) {
      if (this.finalCutout && this._bbox && this.finalCutout.mode === "cover") {
        // sanduíche com o fundo original: o recorte usa a MESMA
        // geometria cover do CSS (--scene-flood), ficando registrado
        // pixel a pixel com a foto de fundo — o nome desliza entre os dois
        const img = this._img;
        const f = this.finalCutout.focus ?? { x: 0.5, y: 0.3 };
        const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
        const dw = img.naturalWidth * scale;
        const dh = img.naturalHeight * scale;
        ctx.save();
        ctx.globalAlpha = smoothstep(0, 0.3, reveal); // opaca cedo (sem vazar letras)
        ctx.drawImage(img, (w - dw) * f.x, (h - dh) * f.y, dw, dh);
        ctx.restore();
      } else if (this.finalCutout && this._bbox) {
        drawGroundedCutout(ctx, this._img, this._bbox, vp, reveal, this.finalCutout.heightFactor);
      } else {
        const buf = this._finalBuffer(vp);
        ctx.save();
        ctx.globalAlpha = reveal;
        ctx.drawImage(buf, 0, 0, w, h);
        ctx.restore();
      }
    }
  }
}

/* ============================================================
   ENTRADA DE PERSONAGEM — para os atos sem morph: a luz do palco
   muda de cor, partículas sobem e a foto da personagem se revela.
   Reutilizável: cada ato configura suas cores e sua foto.

   Exemplo (Elle Woods):
     new EntranceSource({
       image: { url: "assets/elle.jpg", focus: { x: 0.48, y: 0.28 } },
       washColor: [255, 143, 196],     // banho de luz
       sparkleColors: ["255,255,255", "255,182,216"],
     })
   ============================================================ */
export class EntranceSource {
  /**
   * Dois modos de foto:
   *  - cutout: PNG/WebP com fundo transparente (preferido) — a figura é
   *    ancorada no chão do palco e o nome passa atrás dela de verdade.
   *    { url, heightFactor?: {landscape, portrait} }
   *  - image: foto com fundo — entra com vinheta radial (fallback).
   *    { url, focus, vignette? }
   */
  constructor({
    frameCount = 120,
    cutout = null,
    image = null,
    washColor = [255, 143, 196],
    floorColor = [224, 110, 168],
    sparkleColors = ["255,255,255", "255,182,216"],
    particleStyle = "sparkles", // "sparkles" | "pages" | "hearts" | "fireflies"
    revealFrom = 0.28,
  } = {}) {
    this.frameCount = frameCount;
    this.cutout = cutout;
    this.image = image;
    this.washColor = washColor;
    this.floorColor = floorColor;
    this.sparkleColors = sparkleColors;
    this.particleStyle = particleStyle;
    this.revealFrom = revealFrom;
    this._img = null;
    this._bbox = null;
    this._buffer = null;
    this._bufferKey = "";
  }

  load(onFrameReady) {
    const src = this.cutout ?? this.image;
    if (!src) return;
    loadImage(src.url).then((img) => {
      this._img = img;
      if (this.cutout) this._bbox = alphaBbox(img);
      onFrameReady?.();
    }).catch(() => { /* sem foto, ficam a luz e as partículas */ });
  }

  ready() { return true; }

  _photoBuffer(vp) {
    const key = `${vp.w}x${vp.h}`;
    if (this._bufferKey !== key) {
      // vinheta mais apertada: fotos com fundo próprio não podem
      // engolir o teatro escuro (com recorte PNG isso deixa de importar)
      this._buffer = maskedCoverBuffer(this._img, vp, this.image.focus, {
        rIn: 0.24,
        rOut: 0.5,
        ...this.image.vignette,
      });
      this._bufferKey = key;
    }
    return this._buffer;
  }

  draw(ctx, index, vp) {
    const t = index / (this.frameCount - 1);
    const { w, h, portrait } = vp;
    const minwh = Math.min(w, h);
    const [wr, wg, wb] = this.washColor;
    const [fr, fg, fb] = this.floorColor;

    ctx.clearRect(0, 0, w, h);

    // ---- banho de luz descendo do urdimento
    const washAlpha = 0.34 * smoothstep(0.05, 0.5, t);
    if (washAlpha > 0.01) {
      const g = ctx.createRadialGradient(w / 2, -h * 0.25, 0, w / 2, -h * 0.25, h * 1.35);
      g.addColorStop(0, `rgba(${wr},${wg},${wb},${washAlpha})`);
      g.addColorStop(1, `rgba(${wr},${wg},${wb},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }

    // ---- brilho no chão do palco
    const floorAlpha = 0.22 * smoothstep(0.12, 0.6, t);
    if (floorAlpha > 0.01) {
      const g = ctx.createRadialGradient(w / 2, h, 0, w / 2, h, h * 0.6);
      g.addColorStop(0, `rgba(${fr},${fg},${fb},${floorAlpha})`);
      g.addColorStop(1, `rgba(${fr},${fg},${fb},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }

    const reveal = this._img ? smoothstep(this.revealFrom, 0.75, t) : 0;

    // ---- partículas (determinísticas por índice; 2/3 atrás da foto,
    // 1/3 na frente para dar profundidade)
    const gate = smoothstep(0.12, 0.35, t);

    const drawSparkles = (front) => {
      if (gate < 0.01) return;
      const count = portrait ? 26 : 42;
      for (let i = 0; i < count; i++) {
        if ((i % 3 === 0) !== front) continue;
        const r1 = seeded(i, 1), r2 = seeded(i, 2), r3 = seeded(i, 3), r4 = seeded(i, 4);
        const cycle = fract(t * (0.5 + r3 * 0.7) + r2);
        const x = (0.06 + r1 * 0.88) * w + Math.sin((t * 3 + r2 * 6.28) * 2) * w * 0.015;
        const y = h * (1.05 - cycle * 1.15);
        const alpha = gate * Math.sin(Math.PI * cycle) *
          (front ? 0.5 : 0.8) * (0.4 + r4 * 0.6);
        if (alpha < 0.02) continue;
        ctx.fillStyle = `rgba(${this.sparkleColors[i % this.sparkleColors.length]},${alpha})`;
        ctx.beginPath();
        ctx.arc(x, y, minwh * 0.0035 * (0.6 + r4 * 1.6), 0, Math.PI * 2);
        ctx.fill();
      }
    };

    // páginas do livro de fadas tombando no ar + vagalumes pulsantes
    const drawPages = (front) => {
      if (gate < 0.01) return;
      const count = portrait ? 9 : 14;
      for (let i = 0; i < count; i++) {
        if ((i % 3 === 0) !== front) continue;
        const r1 = seeded(i, 1), r2 = seeded(i, 2), r3 = seeded(i, 3), r4 = seeded(i, 4);
        const cycle = fract(t * (0.22 + r3 * 0.3) + r2); // bem mais lento
        const x = (0.08 + r1 * 0.84) * w + Math.sin((cycle * 2 + r2) * Math.PI * 2) * w * 0.06;
        const y = h * (1.08 - cycle * 1.2);
        const s = minwh * (0.016 + r4 * 0.018);
        const alpha = gate * Math.sin(Math.PI * cycle) * (front ? 0.4 : 0.6);
        if (alpha < 0.02) continue;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(r2 * 6.28 + cycle * (r1 > 0.5 ? 1 : -1) * 2.4);
        // "flutter": a página vira no ar (escala X oscila como um flip)
        ctx.scale(0.35 + 0.65 * Math.abs(Math.sin(cycle * Math.PI * 3 + r4 * 6)), 1);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = "#efe3bd";
        ctx.fillRect(-s * 0.7, -s, s * 1.4, s * 2);
        ctx.globalAlpha = alpha * 0.7;
        ctx.strokeStyle = "rgba(122, 100, 58, 0.7)"; // vinco central
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, -s * 0.85);
        ctx.lineTo(0, s * 0.85);
        ctx.stroke();
        ctx.restore();
      }
      // vagalumes de acento: halo pulsante, só na camada da frente
      if (front) {
        for (let i = 0; i < (portrait ? 3 : 5); i++) {
          const r1 = seeded(i, 7), r2 = seeded(i, 8), r3 = seeded(i, 9);
          const x = (0.1 + r1 * 0.8) * w + Math.sin(t * 4 + r2 * 6.28) * w * 0.04;
          const y = h * (0.22 + r2 * 0.6) + Math.sin(t * 5 + r3 * 6.28) * h * 0.04;
          const pulse = 0.35 + 0.65 * Math.abs(Math.sin(t * 22 + r3 * 6.28));
          const a = gate * pulse * 0.8;
          const r = minwh * 0.011;
          const halo = ctx.createRadialGradient(x, y, 0, x, y, r * 3.2);
          halo.addColorStop(0, `rgba(255,238,150,${a * 0.55})`);
          halo.addColorStop(1, "rgba(255,238,150,0)");
          ctx.fillStyle = halo;
          ctx.fillRect(x - r * 3.2, y - r * 3.2, r * 6.4, r * 6.4);
          ctx.fillStyle = `rgba(255,246,196,${a})`;
          ctx.beginPath();
          ctx.arc(x, y, r * 0.45, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    };

    // corações subindo, com balanço e leve giro
    const drawHearts = (front) => {
      if (gate < 0.01) return;
      const count = portrait ? 14 : 22;
      for (let i = 0; i < count; i++) {
        if ((i % 3 === 0) !== front) continue;
        const r1 = seeded(i, 1), r2 = seeded(i, 2), r3 = seeded(i, 3), r4 = seeded(i, 4);
        const cycle = fract(t * (0.35 + r3 * 0.5) + r2);
        const x = (0.06 + r1 * 0.88) * w + Math.sin((cycle * 2.5 + r2) * Math.PI * 2) * w * 0.03;
        const y = h * (1.06 - cycle * 1.18);
        const s = minwh * (0.008 + r4 * 0.014);
        const alpha = gate * Math.sin(Math.PI * cycle) * (front ? 0.55 : 0.8) * (0.4 + r4 * 0.6);
        if (alpha < 0.02) continue;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(Math.sin(cycle * Math.PI * 4 + r1 * 6.28) * 0.35);
        ctx.fillStyle = `rgba(${this.sparkleColors[i % this.sparkleColors.length]},${alpha})`;
        ctx.beginPath();
        ctx.moveTo(0, s * 0.6); // ponta inferior
        ctx.bezierCurveTo(-s * 1.1, -s * 0.2, -s * 0.45, -s * 0.85, 0, -s * 0.25);
        ctx.bezierCurveTo(s * 0.45, -s * 0.85, s * 1.1, -s * 0.2, 0, s * 0.6);
        ctx.fill();
        ctx.restore();
      }
    };

    // só vagalumes: vagam devagar, piscam, em duas camadas de profundidade
    const drawFireflies = (front) => {
      if (gate < 0.01) return;
      const count = portrait ? 10 : 18;
      for (let i = 0; i < count; i++) {
        if ((i % 3 === 0) !== front) continue;
        const r1 = seeded(i, 7), r2 = seeded(i, 8), r3 = seeded(i, 9), r4 = seeded(i, 10);
        const x = (0.05 + r1 * 0.9) * w + Math.sin(t * (3 + r4 * 3) + r2 * 6.28) * w * 0.05;
        const y = h * (0.12 + r2 * 0.75) + Math.sin(t * (4 + r3 * 2) + r3 * 6.28) * h * 0.05;
        const pulse = 0.3 + 0.7 * Math.abs(Math.sin(t * (16 + r4 * 14) + r3 * 6.28));
        const a = gate * pulse * (front ? 0.9 : 0.5);
        const r = minwh * (front ? 0.011 : 0.007) * (0.7 + r4 * 0.6);
        const halo = ctx.createRadialGradient(x, y, 0, x, y, r * 3.2);
        halo.addColorStop(0, `rgba(255,238,150,${a * 0.55})`);
        halo.addColorStop(1, "rgba(255,238,150,0)");
        ctx.fillStyle = halo;
        ctx.fillRect(x - r * 3.2, y - r * 3.2, r * 6.4, r * 6.4);
        ctx.fillStyle = `rgba(255,246,196,${a})`;
        ctx.beginPath();
        ctx.arc(x, y, r * 0.45, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const drawParticles =
      this.particleStyle === "pages" ? drawPages :
      this.particleStyle === "hearts" ? drawHearts :
      this.particleStyle === "fireflies" ? drawFireflies :
      drawSparkles;

    drawParticles(false);

    // ---- a personagem se revela
    if (reveal > 0.01 && this._img) {
      ctx.save();
      if (this.cutout && this._bbox && this.cutout.mode === "cover" && !portrait) {
        // sanduíche registrado com o fundo original (--scene-flood no CSS):
        // mesma geometria cover, sem subida — ela "descola" do próprio fundo.
        // No retrato o cover amplia demais: cai no modo ancorado abaixo.
        const img = this._img;
        const f = this.cutout.focus ?? { x: 0.5, y: 0.3 };
        const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
        const dw = img.naturalWidth * scale;
        const dh = img.naturalHeight * scale;
        ctx.globalAlpha = smoothstep(0, 0.3, reveal);
        ctx.drawImage(img, (w - dw) * f.x, (h - dh) * f.y, dw, dh);
      } else if (this.cutout && this._bbox) {
        drawGroundedCutout(ctx, this._img, this._bbox, vp, reveal, this.cutout.heightFactor);
      } else {
        // foto com fundo: vinheta pré-composta + leve zoom-out
        const buf = this._photoBuffer(vp);
        const e = 0.06 * (1 - reveal);
        ctx.globalAlpha = reveal;
        ctx.drawImage(buf, -w * e / 2, -h * e / 2, w * (1 + e), h * (1 + e));
      }
      ctx.restore();
    }

    drawParticles(true);
  }
}

/* ============================================================
   SEQUÊNCIA REAL — imagens numeradas (webp/jpg) ou frames de vídeo
   pré-exportados. Já implementada: trocar a fonte em js/main.js
   é a única mudança necessária.

   Exemplo:
     new ImageSequenceSource({
       frameCount: 120,
       urlFor: (i) => `assets/frames/elphaba/frame-${String(i).padStart(4, "0")}.webp`,
     })
   ============================================================ */
export class ImageSequenceSource {
  /**
   * @param {Object} opts
   * @param {number} opts.frameCount
   * @param {Function} opts.urlFor       (i) => url do frame i
   * @param {Object} [opts.focus]        ponto a manter em quadro no cover
   * @param {Object} [opts.vignette]     { from, to }: a partir de `from` do
   *   scroll, as bordas do frame ganham transparência progressiva (total em
   *   `to`) — é o que deixa o nome gigante espiar por trás do vídeo
   * @param {Object} [opts.finalCutout]  recorte registrado que entra no fim
   *   (sanduíche com o --scene-flood do CSS): { url, revealFrom, focus }
   */
  /**
   * alignFaces: match dissolve — o vídeo ganha zoom/deslocamento
   * progressivos para o rosto dele aterrissar EXATAMENTE sobre o rosto
   * do recorte final, em qualquer tamanho de tela. Âncoras em frações
   * das dimensões naturais de cada imagem: { x, y, h } (centro e altura
   * do rosto) + start (progresso onde a correção começa a entrar).
   */
  constructor({
    frameCount, urlFor, focus = { x: 0.5, y: 0.42 }, concurrency = 6,
    vignette = null, finalCutout = null, startImage = null, alignFaces = null,
    particles = null,
  }) {
    this.frameCount = frameCount;
    this.urlFor = urlFor;
    this.focus = focus;
    this.concurrency = concurrency;
    this.vignette = vignette;
    this.finalCutout = finalCutout;
    this.alignFaces = alignFaces;
    this.particles = particles;
    // foto original por cima no repouso: o frame 0 do vídeo veio
    // reenquadrado (16:9) e não pode ser a imagem "congelada" do topo
    this.startImage = startImage;
    this.images = new Array(frameCount).fill(null);
    this._cutoutImg = null;
    this._startImg = null;
    this._work = null;
    this._workKey = "";
  }

  load(onFrameReady) {
    if (this.finalCutout) {
      loadImage(this.finalCutout.url)
        .then((img) => {
          this._cutoutImg = img;
          this._cutoutBbox = alphaBbox(img); // p/ modo ancorado no retrato
          onFrameReady?.();
        })
        .catch(() => {});
    }
    if (this.startImage) {
      loadImage(this.startImage.url)
        .then((img) => { this._startImg = img; onFrameReady?.(); })
        .catch(() => {});
    }
    let next = 0;
    const loadOne = () => {
      if (next >= this.frameCount) return;
      const i = next++;
      loadImage(this.urlFor(i))
        .then((img) => {
          this.images[i] = img;
          onFrameReady?.(i);
        })
        .catch(() => { /* frame ausente: draw() usa o vizinho mais próximo */ })
        .finally(loadOne);
    };
    for (let k = 0; k < this.concurrency; k++) loadOne();
  }

  ready(index) {
    return !!this._nearest(index);
  }

  _nearest(index) {
    if (this.images[index]) return this.images[index];
    for (let d = 1; d < this.frameCount; d++) {
      if (this.images[index - d]) return this.images[index - d];
      if (this.images[index + d]) return this.images[index + d];
    }
    return null;
  }

  /** Canvas de trabalho para mascarar o frame antes de compor. */
  _workCanvas(vp) {
    const key = `${vp.w}x${vp.h}`;
    if (this._workKey !== key) {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this._work = document.createElement("canvas");
      this._work.width = Math.round(vp.w * dpr);
      this._work.height = Math.round(vp.h * dpr);
      this._work.getContext("2d").setTransform(dpr, 0, 0, dpr, 0, 0);
      this._workKey = key;
    }
    return this._work;
  }

  _coverRect(img, vp, focus) {
    const scale = Math.max(vp.w / img.naturalWidth, vp.h / img.naturalHeight);
    const dw = img.naturalWidth * scale;
    const dh = img.naturalHeight * scale;
    return [(vp.w - dw) * focus.x, (vp.h - dh) * focus.y, dw, dh];
  }

  draw(ctx, index, vp) {
    const t = index / (this.frameCount - 1);
    const { w, h } = vp;
    ctx.clearRect(0, 0, w, h);

    // match dissolve: o vídeo NÃO esmaece — o recorte entra por cima e
    // o cobre (se os dois ficassem translúcidos, as letras vazariam
    // pelo rosto). O alinhamento por rosto garante a coincidência.
    const from = this.finalCutout?.revealFrom ?? 0.75;
    const reveal = (this._cutoutImg) ? smoothstep(from, 1, t) : 0;
    const appear = smoothstep(0, 0.5, reveal);

    const img = this._nearest(index);
    if (img && appear < 0.999) {
      // retângulo do vídeo: cover normal, interpolando para o transform
      // que pousa o rosto do vídeo sobre o rosto do recorte
      let rect = this._coverRect(img, vp, this.focus);
      if (this.alignFaces && this._cutoutImg) {
        const af = this.alignFaces;
        const pr = this._coverRect(this._cutoutImg, vp, this.finalCutout.focus ?? { x: 0.5, y: 0.3 });
        const targetH = af.cutout.h * pr[3];
        const s2 = targetH / (af.video.h * img.naturalHeight);
        const dw2 = img.naturalWidth * s2;
        const dh2 = img.naturalHeight * s2;
        const aligned = [
          (pr[0] + af.cutout.x * pr[2]) - af.video.x * dw2,
          (pr[1] + af.cutout.y * pr[3]) - af.video.y * dh2,
          dw2,
          dh2,
        ];
        const k = smoothstep(af.start ?? 0.55, from, t);
        rect = rect.map((v, i) => v + (aligned[i] - v) * k);
      }

      // força da vinheta: 0 = full-bleed (abertura), 1 = bordas transparentes
      const strength = this.vignette
        ? smoothstep(this.vignette.from, this.vignette.to, t)
        : 0;

      ctx.save();
      if (strength < 0.02) {
        ctx.drawImage(img, ...rect);
      } else {
        // mascara o frame num canvas de trabalho (só quando o frame muda,
        // que é quando draw() roda — nunca em scroll parado)
        const work = this._workCanvas(vp);
        const wctx = work.getContext("2d");
        wctx.clearRect(0, 0, w, h);
        wctx.drawImage(img, ...rect);
        // máscara ancorada no retângulo DO VÍDEO (que encolhe no
        // alinhamento final) — senão as bordas dele apareceriam duras
        const mcx = rect[0] + rect[2] / 2;
        const mcy = rect[1] + rect[3] * 0.48;
        const mask = wctx.createRadialGradient(
          mcx, mcy, Math.min(rect[2], rect[3]) * 0.28,
          mcx, mcy, Math.max(rect[2], rect[3]) * 0.52
        );
        mask.addColorStop(0, "rgba(0,0,0,1)");
        mask.addColorStop(1, `rgba(0,0,0,${1 - strength})`);
        wctx.globalCompositeOperation = "destination-in";
        wctx.fillStyle = mask;
        wctx.fillRect(0, 0, w, h);
        wctx.globalCompositeOperation = "source-over";
        ctx.drawImage(work, 0, 0, w, h);
      }
      ctx.restore();
    }

    // foto original por cima no repouso, dissolvendo no vídeo ao rolar
    if (this._startImg) {
      const until = this.startImage.until ?? 0.12;
      const startAlpha = 1 - smoothstep(0.03, until, t);
      if (startAlpha > 0.01) {
        const f = this.startImage.focus ?? this.focus;
        ctx.save();
        ctx.globalAlpha = startAlpha;
        ctx.drawImage(this._startImg, ...this._coverRect(this._startImg, vp, f));
        ctx.restore();
      }
    }

    // chuva fina de luz: riscos diagonais caindo ATRÁS da personagem
    // (mesma linguagem dos feixes do céu de Oz da foto).
    // Desenhada ANTES do recorte = entre as letras e ela.
    if (this.particles) {
      const pFrom = this.particles.from ?? 0.35;
      const gate = smoothstep(pFrom, pFrom + 0.2, t);
      if (gate > 0.01) {
        const colors = this.particles.colors ?? ["190,235,200", "150,215,170"];
        const minwh = Math.min(w, h);
        const count = vp.portrait ? 26 : 44;
        ctx.save();
        ctx.lineCap = "round";
        for (let i = 0; i < count; i++) {
          const r1 = seeded(i, 11), r2 = seeded(i, 12), r3 = seeded(i, 13), r4 = seeded(i, 14);
          const cycle = fract(t * (0.5 + r3 * 0.55) + r2);
          const x = (r1 * 1.04 - 0.02) * w + cycle * w * 0.05; // deriva diagonal
          const y = (-0.08 + cycle * 1.16) * h;
          const len = minwh * (0.016 + r4 * 0.032);
          const alpha = gate * Math.sin(Math.PI * cycle) * (0.12 + r4 * 0.26);
          if (alpha < 0.02) continue;
          ctx.strokeStyle = `rgba(${colors[i % colors.length]},${alpha})`;
          ctx.lineWidth = 0.8 + r4 * 1.1;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x - len * 0.28, y - len);
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    // recorte registrado entra POR CIMA do vídeo (mesma geometria cover
    // do --scene-flood), cobrindo-o — dissolve sem janela de transparência
    if (this._cutoutImg && appear > 0.01) {
      const f = this.finalCutout.focus ?? { x: 0.5, y: 0.3 };
      ctx.save();
      ctx.globalAlpha = appear;
      ctx.drawImage(this._cutoutImg, ...this._coverRect(this._cutoutImg, vp, f));
      ctx.restore();
    }
  }
}
