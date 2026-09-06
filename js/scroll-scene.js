/* ============================================================
   TransformationScene — cena de transformação controlada por scroll.

   Reutilizável: uma instância por personagem. Recebe a section,
   uma fonte de frames (placeholder ou sequência real) e cuida de:
     - pin da section (GSAP ScrollTrigger)
     - progresso do scroll -> índice de frame no canvas
     - revelação das letras do nome gigante
     - intro (nome da atriz) / legenda final / régua de progresso
     - DPR limitado + redraw só quando o frame muda (performance)
   ============================================================ */

const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const IS_COARSE = window.matchMedia("(pointer: coarse)").matches;

export class TransformationScene {
  /**
   * @param {Object} opts
   * @param {HTMLElement} opts.section       section com data-scene
   * @param {Object} opts.frameSource        fonte de frames (ver frame-sources.js)
   * @param {string} opts.name               nome exibido atrás da personagem
   * @param {number} [opts.scrollLength=2.6] duração do pin, em alturas de tela
   * @param {string} [opts.nameTint] cor que as letras gigantes ganham no fim
   * @param {Object} [opts.floodTiming] quando a cor/foto inunda o palco:
   *   { at, duration } em fração do scroll (padrão: cedo, para entradas)
   * @param {number} [opts.nameAt=0.22] quando as letras do nome começam a
   *   subir — antecipar permite ler a palavra completa antes de a
   *   personagem entrar e cobrir o meio dela
   * @param {number} [opts.nameFlipAt] se definido, o nome começa NA FRENTE
   *   da cena (legível por inteiro) e passa para trás neste ponto do
   *   scroll — trocar durante um momento só-névoa esconde a costura
   */
  constructor({
    section, frameSource, name, nameMobile = null, scrollLength = 2.6,
    nameTint = "#3f6b4c", floodTiming = { at: 0.18, duration: 0.4 },
    nameAt = 0.22, nameFlipAt = null,
  }) {
    this.section = section;
    this.source = frameSource;
    // no retrato, um nome curto permite letras bem maiores
    const portraitNow = window.matchMedia("(orientation: portrait)").matches;
    this.name = portraitNow && nameMobile ? nameMobile : name;
    this.scrollLength = scrollLength;
    this.nameTint = nameTint;
    this.floodTiming = floodTiming;
    this.nameAt = nameAt;
    this.nameFlipAt = nameFlipAt;

    this.canvas = section.querySelector("[data-scene-canvas]");
    this.ctx = this.canvas.getContext("2d", { alpha: true });
    this.nameEl = section.querySelector("[data-scene-name-el]");
    this.introEl = section.querySelector("[data-scene-intro]");
    this.captionEl = section.querySelector("[data-scene-caption]");
    this.progressEl = section.querySelector("[data-scene-progress] span");
    this.floodEl = section.querySelector("[data-scene-flood]");
    this.mistEl = section.querySelector("[data-scene-mist]");

    this.viewport = { w: 0, h: 0, portrait: false };
    this.lastFrame = -1;
  }

  init() {
    this._buildName();
    this._sizeCanvas();
    this._buildTimeline();

    // fonte pode carregar frames aos poucos: redesenha o frame atual
    this.source.load?.(() => this._render(this.lastFrame < 0 ? 0 : this.lastFrame, true));
    this._render(0, true);

    // resize: redimensiona uma vez ao mudar de fato o tamanho do layout
    // (ScrollTrigger.config em main.js já ignora o resize da barra do iOS)
    let raf = 0;
    new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        this._sizeCanvas();
        this._render(this.lastFrame, true);
      });
    }).observe(this.section);
  }

  /* ---------- nome gigante: uma <span> por letra ---------- */
  _buildName() {
    this.nameEl.innerHTML = "";
    this.letters = [];
    for (const ch of this.name) {
      const s = document.createElement("span");
      if (ch === " ") {
        s.className = "space"; // vira respiro no desktop, some no retrato
      } else {
        s.textContent = ch;
        this.letters.push(s); // só letras de verdade entram na animação
      }
      this.nameEl.appendChild(s);
    }
  }

  /* ---------- canvas: tamanho CSS x buffer com DPR limitado ---------- */
  _sizeCanvas() {
    const rect = this.section.getBoundingClientRect();
    // celular: DPR 1.5 já é nítido e desenha ~2x menos pixels que 3.0
    const dpr = Math.min(window.devicePixelRatio || 1, IS_COARSE ? 1.5 : 2);
    this.canvas.width = Math.round(rect.width * dpr);
    this.canvas.height = Math.round(rect.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.viewport = {
      w: rect.width,
      h: rect.height,
      portrait: rect.height > rect.width,
    };
  }

  /* ---------- scroll -> animação ---------- */
  _buildTimeline() {
    const tl = gsap.timeline({
      defaults: { ease: "none" },
      scrollTrigger: {
        trigger: this.section,
        start: "top top",
        end: () => `+=${window.innerHeight * this.scrollLength}`,
        pin: true,
        anticipatePin: 1,
        // scrub numérico = interpolação suave entre posições de scroll
        // (essencial para a roda do mouse não "pular" frames)
        scrub: REDUCED_MOTION ? true : 0.7,
        onUpdate: (self) => this._onProgress(self.progress),
      },
    });

    // 0 → 18%: intro sai de cena (nem toda cena tem)
    if (this.introEl) {
      tl.to(this.introEl, { opacity: 0, y: 30, duration: 0.18 }, 0);
    }

    // a cor do número inunda o palco (cenas que têm [data-scene-flood]).
    // `base` > 0 = o cenário já chega meio-aceso: a cena nunca abre preta
    if (this.floodEl) {
      tl.fromTo(
        this.floodEl,
        { opacity: this.floodTiming.base ?? 0 },
        { opacity: 1, duration: this.floodTiming.duration },
        this.floodTiming.at
      );
    }

    // letras do nome sobem de trás do palco, uma a uma (ver nameAt)
    // stagger com "amount" fixo: nomes longos completam no mesmo tempo
    tl.to(
      this.letters,
      {
        opacity: 1,
        duration: 0.22,
        stagger: { amount: 0.1, from: "center" },
      },
      this.nameAt
    );
    if (!REDUCED_MOTION) {
      tl.from(
        this.letters,
        {
          yPercent: 42,
          duration: 0.3,
          stagger: { amount: 0.1, from: "center" },
        },
        this.nameAt
      );
      // as letras ganham um respiro de cor no fim (tom da personagem)
      tl.to(this.nameEl, { color: this.nameTint, duration: 0.25 }, 0.72);
    }

    // fumaça de palco: sobe junto com o clímax da cena
    if (this.mistEl) {
      tl.fromTo(this.mistEl, { opacity: 0 }, { opacity: 1, duration: 0.3 }, 0.55);
    }

    // 82% → 100%: legenda final (se a cena tiver uma)
    if (this.captionEl) {
      tl.fromTo(
        this.captionEl,
        { opacity: 0, y: 14 },
        { opacity: 1, y: 0, duration: 0.16 },
        0.82
      );
    }

    // régua de progresso acompanha o scroll inteiro
    tl.fromTo(this.progressEl, { scaleY: 0 }, { scaleY: 1, duration: 1 }, 0);
  }

  _onProgress(progress) {
    // nome na frente no começo (legível por inteiro), atrás após o flip
    if (this.nameFlipAt != null) {
      this.nameEl.style.zIndex = progress < this.nameFlipAt ? "4" : "1";
    }
    const frame = Math.round(progress * (this.source.frameCount - 1));
    this._render(frame);
  }

  /** Desenha apenas quando o índice de frame muda (ou em force). */
  _render(frame, force = false) {
    if (!force && frame === this.lastFrame) return;
    this.lastFrame = frame;
    this.source.draw(this.ctx, frame, this.viewport);
  }
}
