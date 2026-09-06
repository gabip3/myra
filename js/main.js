/* ============================================================
   MYRA · estudo de cena — bootstrap

   Registro de cenas: uma entrada por transformação de personagem.
   Para usar assets reais, troque `source` por um ImageSequenceSource
   (ver exemplo comentado abaixo e o README).
   ============================================================ */
import {
  PlaceholderTransformationSource,
  EntranceSource,
  ImageSequenceSource,
} from "./frame-sources.js";
import { TransformationScene } from "./scroll-scene.js";

gsap.registerPlugin(ScrollTrigger);

// A barra de endereço do celular muda a altura da tela ao rolar;
// sem isto, o ScrollTrigger recalcularia tudo e a cena "pularia".
ScrollTrigger.config({ ignoreMobileResize: true });

// Em aparelhos de toque, normaliza o scroll: mantém o pin firme
// (sem ele, a cena "sobe" durante o gesto no iOS/Android).
// Desligado no desktop: lá ele conflita com browsers embutidos.
if (ScrollTrigger.isTouch === 1) {
  ScrollTrigger.normalizeScroll(true);
}

const SCENES = [
  {
    id: "scene-elphaba",
    name: "ELPHABA",
    scrollLength: 2.6, // o pin dura 2.6 alturas de tela
    nameAt: 0.3, // sobe NA FRENTE durante a virada (legível por inteiro)…
    nameFlipAt: 0.8, // …e desliza para trás no beat de névoa
    nameTint: "#c9d8c4", // clara do início ao fim (escura vira lama no celular)
    // A SEQUÊNCIA REAL: o vídeo da virada em 120 frames WebP.
    // Abre full-bleed na Myra P&B; a vinheta cresce junto com as letras;
    // no fim, crossfade para o sanduíche (céu de Oz + recorte registrado).
    source: new ImageSequenceSource({
      frameCount: 120,
      urlFor: (i) => `assets/frames/elphaba/frame-${String(i).padStart(4, "0")}.webp`,
      focus: { x: 0.5, y: 0.3 },
      // no repouso mostra a foto original (o frame 0 do vídeo veio
      // reenquadrado na origem); dissolve no vídeo ao começar a rolar
      startImage: { url: "assets/myra.jpg", focus: { x: 0.5, y: 0.3 }, until: 0.12 },
      vignette: { from: 0.16, to: 0.36 },
      // match dissolve: âncoras do rosto medidas em cada imagem
      // (frações das dimensões naturais: centro x/y e altura do rosto)
      alignFaces: {
        start: 0.55,
        video: { x: 0.494, y: 0.472, h: 0.25 },     // último frame do vídeo
        cutout: { x: 0.492, y: 0.469, h: 0.1875 },  // elphaba-cutout.png
      },
      finalCutout: {
        url: "assets/elphaba-cutout.png",
        revealFrom: 0.84, // o vídeo já morreu na névoa quando ele entra
        focus: { x: 0.5, y: 0.3 }, // igual ao "center 30%" do CSS
      },
    }),
    // o céu de Oz chega no "beat" entre o vídeo e o pôster
    floodTiming: { at: 0.78, duration: 0.12 },
  },
  {
    id: "scene-fiona",
    name: "PRINCESA FIONA",
    nameMobile: "FIONA",
    scrollLength: 2.2,
    nameTint: "#e8d9a0", // dourado quente sobre a torre escurecida
    nameAt: 0.06, // a palavra completa lê-se ANTES de ela entrar
    source: new EntranceSource({
      frameCount: 120,
      revealFrom: 0.45, // ela espera o nome terminar de subir
      // ancorada no chão, um pouco maior que a Elle
      cutout: {
        url: "assets/fiona-cutout.png",
        heightFactor: { landscape: 0.8, portrait: 0.8 },
      },
      washColor: [193, 214, 116],   // lima quente do pântano
      floorColor: [214, 178, 90],   // dourado de conto de fadas
      particleStyle: "fireflies",   // só vagalumes piscando no pântano
    }),
    // a torre já chega meio-acesa: a cena nunca abre preta
    floodTiming: { at: 0.05, duration: 0.3, base: 0.5 },
  },
  {
    id: "scene-elle",
    name: "ELLE WOODS",
    nameMobile: "ELLE",
    scrollLength: 2.2, // entrada é mais curta que um morph
    nameTint: "#8f2e63",
    nameAt: 0.06, // a palavra completa lê-se ANTES de ela entrar
    source: new EntranceSource({
      frameCount: 120,
      revealFrom: 0.45, // ela espera o nome terminar de subir
      // recorte com fundo transparente: o nome passa atrás dela de verdade
      cutout: {
        url: "assets/elle-cutout.png",
        heightFactor: { landscape: 0.74, portrait: 0.76 },
      },
      washColor: [255, 143, 196],
      floorColor: [224, 110, 168],
      particleStyle: "hearts",
      sparkleColors: ["255,255,255", "255,158,205", "240,98,166"], // tons dos corações
    }),
    // um brilho rosa já recebe o visitante antes de a luz inundar
    floodTiming: { at: 0.1, duration: 0.35, base: 0.35 },
  },
  {
    id: "scene-evita",
    name: "EVITA PERÓN",
    nameMobile: "EVITA",
    scrollLength: 2.2,
    nameTint: "#cdb684", // champanhe mais quente no clímax
    nameAt: 0.06,
    source: new EntranceSource({
      frameCount: 120,
      revealFrom: 0.45,
      // sanduíche registrado: fundo (evita.png no CSS) → nome → ela
      cutout: {
        url: "assets/evita-cutout.png",
        mode: "cover",
        focus: { x: 0.5, y: 0.3 }, // igual ao "center 30%" do CSS
      },
      washColor: [235, 225, 205],   // holofote marfim
      floorColor: [217, 193, 138],  // dourado do balcão
      particleStyle: "sparkles",    // brilho de holofote / glitter
      sparkleColors: ["255,255,255", "233,214,175", "203,224,232"],
    }),
    // o cenário já chega meio-aceso
    floodTiming: { at: 0.05, duration: 0.3, base: 0.45 },
  },
];

/* Névoa entre atos: deriva e crossfade esmeralda → rosa,
   presos ao scroll (sem pin — a section apenas atravessa a tela). */
function initActTransition(el) {
  const tl = gsap.timeline({
    defaults: { ease: "none" },
    scrollTrigger: {
      trigger: el,
      start: "top bottom",
      end: "bottom top",
      scrub: 0.8,
    },
  });
  tl.fromTo(el.querySelector(".fog--a"), { xPercent: -8, opacity: 0.95 }, { xPercent: 16, yPercent: -25, opacity: 0 }, 0);
  tl.fromTo(el.querySelector(".fog--b"), { xPercent: 6, opacity: 0.8 }, { xPercent: -14, yPercent: -18, opacity: 0 }, 0);
  tl.fromTo(el.querySelector(".fog--c"), { xPercent: -10, opacity: 0 }, { xPercent: 12, yPercent: -12, opacity: 0.9 }, 0.25);
  tl.fromTo(el.querySelector(".fog--d"), { xPercent: 10, opacity: 0 }, { xPercent: -10, yPercent: -20, opacity: 0.85 }, 0.35);
}

const scenes = [];
for (const cfg of SCENES) {
  const section = document.getElementById(cfg.id);
  if (!section) continue;
  const scene = new TransformationScene({
    section,
    name: cfg.name,
    scrollLength: cfg.scrollLength,
    nameTint: cfg.nameTint,
    floodTiming: cfg.floodTiming,
    nameAt: cfg.nameAt,
    nameFlipAt: cfg.nameFlipAt,
    nameMobile: cfg.nameMobile,
    frameSource: cfg.source,
  });
  scene.init();
  scenes.push(scene);
}

document.querySelectorAll("[data-act-transition]").forEach(initActTransition);

/* Entreatos: revelação editorial suave, uma vez, ao entrar na tela */
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
document.querySelectorAll(".entreato").forEach((el) => {
  gsap.from(el.querySelectorAll("[data-reveal]"), {
    opacity: 0,
    y: reduceMotion ? 0 : 28,
    duration: 0.9,
    ease: "power2.out",
    stagger: 0.12,
    scrollTrigger: { trigger: el, start: "top 70%" },
  });
});

// handle de debug no console: __scenes[0]._render(frame, true)
window.__scenes = scenes;
