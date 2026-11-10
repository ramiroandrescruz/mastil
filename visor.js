// Visor de la galería «Hojear»: agranda la página al tocarla. En archivo aparte para cumplir la CSP del sitio (script-src 'self').
(() => {
  const visor = document.getElementById("visor");
  if (!visor || typeof visor.showModal !== "function") return;
  const img = document.getElementById("visor-img"), titulo = document.getElementById("visor-titulo");
  document.querySelectorAll(".galeria a").forEach(a => a.addEventListener("click", e => {
    e.preventDefault();
    img.src = a.href; img.alt = a.querySelector("img").alt;
    titulo.textContent = a.dataset.pagina ? `Página ${a.dataset.pagina} · ${a.dataset.titulo}` : a.dataset.titulo;
    visor.showModal();
  }));
  document.getElementById("visor-cerrar").addEventListener("click", () => visor.close());
  visor.addEventListener("click", e => { if (e.target === visor) visor.close(); });
})();
