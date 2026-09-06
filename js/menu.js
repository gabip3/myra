/* ============================================================
   Menu de tela inteira — "um novo ato".

   Módulo independente: não toca nas cenas nem no scroll do site.
   - Hambúrguer (2 traços) vira X no mesmo lugar.
   - Abertura: a cortina (fundo) entra primeiro, depois os itens
     sobem em sequência, como títulos entrando em cena.
   - Fechamento: o inverso, um pouco mais rápido.
   - Hover (só desktop): itens com data-image revelam uma imagem
     de área na coluna direita, atrás do texto.
   - Links sociais: preencher as URLs em SOCIAL_LINKS abaixo.
   ============================================================ */

const SOCIAL_LINKS = {
  instagram: "#", // colocar a URL do Instagram aqui
  youtube: "#",   // colocar a URL do YouTube aqui
};

const toggle = document.querySelector("[data-menu-toggle]");
const toggleLabel = document.querySelector("[data-menu-label]");
const menu = document.querySelector("[data-menu]");
const items = menu.querySelectorAll(".menu__item");
const signature = menu.querySelector(".menu__signature");
const imageLayer = menu.querySelector(".menu__image");
const imageEl = menu.querySelector("[data-menu-img]");

const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const CAN_HOVER = window.matchMedia("(hover: hover)").matches;

let isOpen = false;

/* ---------- timeline de abertura (reversível) ---------- */
const tl = gsap.timeline({
  paused: true,
  defaults: { ease: "power3.out" },
  onReverseComplete: () => {
    gsap.set(menu, { visibility: "hidden" });
    document.documentElement.style.overflow = "";
  },
});

if (REDUCED) {
  tl.set(menu, { visibility: "visible", opacity: 1 });
  tl.set([items, signature], { opacity: 1, y: 0 });
} else {
  // 1. a cortina desce
  tl.set(menu, { visibility: "visible" });
  tl.fromTo(
    menu,
    { clipPath: "inset(0 0 100% 0)" },
    { clipPath: "inset(0 0 0% 0)", duration: 0.55, ease: "power3.inOut" }
  );
  // 2. os títulos entram em cena
  tl.fromTo(
    items,
    { opacity: 0, y: 34 },
    { opacity: 1, y: 0, duration: 0.5, stagger: 0.055 },
    "-=0.12"
  );
  // 3. a assinatura
  tl.fromTo(
    signature,
    { opacity: 0, y: 16 },
    { opacity: 1, y: 0, duration: 0.45 },
    "-=0.35"
  );
}

function openMenu() {
  isOpen = true;
  toggle.classList.add("is-open");
  toggle.setAttribute("aria-expanded", "true");
  toggle.setAttribute("aria-label", "Fechar menu");
  toggleLabel.textContent = "fechar";
  menu.setAttribute("aria-hidden", "false");
  document.documentElement.style.overflow = "hidden"; // trava o scroll do palco
  tl.timeScale(1).play();
}

function closeMenu() {
  isOpen = false;
  toggle.classList.remove("is-open");
  toggle.setAttribute("aria-expanded", "false");
  toggle.setAttribute("aria-label", "Abrir menu");
  toggleLabel.textContent = "menu";
  menu.setAttribute("aria-hidden", "true");
  hideImage();
  tl.timeScale(1.5).reverse();
}

toggle.addEventListener("click", () => (isOpen ? closeMenu() : openMenu()));

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && isOpen) closeMenu();
});

/* ---------- navegação ---------- */
items.forEach((item) => {
  item.addEventListener("click", (e) => {
    e.preventDefault();
    closeMenu();
    if (item.dataset.target === "top") {
      window.scrollTo({ top: 0, behavior: REDUCED ? "auto" : "smooth" });
    }
    // demais destinos entram quando as seções existirem
  });
});

/* ---------- links sociais ---------- */
menu.querySelectorAll("[data-social]").forEach((a) => {
  const url = SOCIAL_LINKS[a.dataset.social];
  if (url && url !== "#") {
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener";
  }
});

/* ---------- imagem de área no hover (só desktop) ---------- */
let currentSrc = "";

function showImage(src) {
  if (currentSrc !== src) {
    currentSrc = src;
    imageEl.src = src;
  }
  gsap.to(imageLayer, { opacity: 1, duration: 0.5, ease: "power2.out" });
  gsap.fromTo(
    imageEl,
    { scale: 1.05 },
    { scale: 1, duration: 0.9, ease: "power2.out" }
  );
}

function hideImage() {
  gsap.to(imageLayer, { opacity: 0, duration: 0.35, ease: "power2.out" });
}

if (CAN_HOVER && !REDUCED) {
  // imagem ausente (ainda não adicionada): permanece invisível
  imageEl.addEventListener("error", () => gsap.set(imageLayer, { opacity: 0 }));

  items.forEach((item) => {
    const src = item.dataset.image;
    if (!src) {
      item.addEventListener("mouseenter", hideImage);
      return;
    }
    item.addEventListener("mouseenter", () => showImage(src));
    item.addEventListener("mouseleave", hideImage);
  });
}
