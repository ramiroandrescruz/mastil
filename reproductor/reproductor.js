// Reproductor de Guitar Pro de mastil.com.ar: alphaTab (MPL-2.0, alphatab.net) servido desde esta web.
// Va en un archivo aparte porque la CSP del sitio (script-src 'self') no permite scripts en línea.
(function () {
  const $ = (id) => document.getElementById(id);
  const estado = $("estado"), panel = $("panel"), partitura = $("partitura");
  const decir = (texto, error) => { estado.textContent = texto; estado.classList.toggle("error", !!error); };

  if (typeof alphaTab === "undefined") {
    decir("No se pudo cargar el reproductor. Probá recargar la página.", true);
    return;
  }

  // Los estilos que alphaTab inyecta (la @font-face de Bravura y los de .at-surface) los bloquea la CSP:
  // están copiados en reproductor.css con el mismo nombre de familia («alphaTab»), así la fuente igual carga.

  // alphaTab crea sus web workers (dibujo y sintetizador) con una URL blob:, que la CSP del sitio bloquea sin
  // lanzar error, y el reproductor queda mudo. Si crear la URL blob falla, alphaTab pasa a su plan B, un worker
  // con la URL del propio script (mismo origen, permitido). Se fuerza ese plan B haciendo fallar solo los blobs
  // de JavaScript; los demás usos de createObjectURL siguen igual.
  const crearObjectURL = URL.createObjectURL;
  URL.createObjectURL = function (obj) {
    if (obj instanceof Blob && obj.type === "application/javascript") throw new Error("worker blob: no permitido por la CSP");
    return crearObjectURL.call(URL, obj);
  };

  const api = new alphaTab.AlphaTabApi(partitura, {
    core: {
      fontDirectory: "alphatab/font/",
      smuflFontSources: new Map([[alphaTab.FontFileFormat.Woff2, "alphatab/font/Bravura.woff2"],
                                 [alphaTab.FontFileFormat.Woff, "alphatab/font/Bravura.woff"]]),
      scriptFile: "alphatab/alphaTab.min.js",
      logLevel: alphaTab.LogLevel.Warning,
    },
    player: {
      enablePlayer: true,
      soundFont: "alphatab/soundfont/sonivox.sf3",
      scrollElement: "html,body",
      scrollOffsetY: -90,
    },
    display: { scale: 1 },
  });
  window.reproductorApi = api;   // para probar desde la consola

  // alphaTab escribe el SVG con atributos style="…" (la fuente de los números de la tablatura, los textos, el
  // tamaño del dibujo). La CSP (style-src-attr) los ignora al insertarlos y los textos quedan sin fuente. Asignar
  // el mismo CSS por el CSSOM sí está permitido: cada vez que alphaTab agrega un trozo de partitura, se copia el
  // atributo a element.style.
  const aplicarEstilos = (raiz) => {
    if (raiz.nodeType !== 1) return;
    const todos = raiz.hasAttribute("style") ? [raiz, ...raiz.querySelectorAll("[style]")] : raiz.querySelectorAll("[style]");
    for (const el of todos) {
      if (el.style.length === 0) {
        const css = el.getAttribute("style");
        if (css) el.style.cssText = css;
      }
    }
  };
  new MutationObserver((cambios) => {
    for (const c of cambios) c.addedNodes.forEach(aplicarEstilos);
  }).observe(partitura, { childList: true, subtree: true });

  let visibles = [];        // pistas mostradas en la partitura
  let sonidosListos = false;
  api.soundFontLoaded.on(() => { sonidosListos = true; if (api.score) decir(""); });
  api.error.on((e) => decir("No se pudo abrir el archivo: " + (e && e.message ? e.message : e), true));

  // ---- abrir archivo
  $("archivo").addEventListener("change", async (ev) => {
    const archivo = ev.target.files && ev.target.files[0];
    if (!archivo) return;
    $("nombre-archivo").textContent = archivo.name;
    decir("Abriendo…");
    try {
      const datos = new Uint8Array(await archivo.arrayBuffer());
      if (!api.load(datos)) decir("Ese archivo no se reconoce como Guitar Pro.", true);
    } catch (e) {
      decir("No se pudo leer el archivo: " + e, true);
    }
  });

  api.scoreLoaded.on((score) => {
    panel.hidden = false;
    visibles = score.tracks.map((t) => t.index);
    armarPistas(score);
    armarSecciones(score);
    api.playbackRange = null;
    decir(sonidosListos ? "" : "Cargando los sonidos…");
    aplicarNotacion();
  });

  // ---- pistas: ver, silenciar, solo
  function armarPistas(score) {
    const ul = $("pistas");
    ul.innerHTML = "";
    score.tracks.forEach((t) => {
      const li = document.createElement("li");
      const punto = document.createElement("span");
      punto.className = "color";
      // la CSP no deja atributos style en línea: el color va por una propiedad CSS puesta desde JS
      punto.style.setProperty("background", t.color ? `rgb(${t.color.r},${t.color.g},${t.color.b})` : "var(--gris)");
      const label = document.createElement("label");
      const ver = document.createElement("input");
      ver.type = "checkbox"; ver.checked = true; ver.dataset.ver = String(t.index);
      label.appendChild(ver);
      label.appendChild(document.createTextNode(" " + (t.name || "Pista " + (t.index + 1))));
      const mute = document.createElement("button");
      mute.type = "button"; mute.className = "chico"; mute.dataset.mute = String(t.index);
      mute.setAttribute("aria-pressed", "false"); mute.textContent = "Silenciar";
      const solo = document.createElement("button");
      solo.type = "button"; solo.className = "chico"; solo.dataset.solo = String(t.index);
      solo.setAttribute("aria-pressed", "false"); solo.textContent = "Solo";
      li.append(punto, label, mute, solo);
      ul.appendChild(li);
    });
    ul.querySelectorAll("input[data-ver]").forEach((c) => c.addEventListener("change", () => {
      const i = +c.dataset.ver;
      visibles = c.checked ? [...visibles, i].sort((a, b) => a - b) : visibles.filter((x) => x !== i);
      if (!visibles.length) { c.checked = true; visibles = [i]; return; }
      api.renderTracks(visibles.map((k) => api.score.tracks[k]));
    }));
    ul.querySelectorAll("button[data-mute]").forEach((b) => b.addEventListener("click", () => {
      const on = b.getAttribute("aria-pressed") !== "true";
      b.setAttribute("aria-pressed", on);
      api.changeTrackMute([api.score.tracks[+b.dataset.mute]], on);
    }));
    ul.querySelectorAll("button[data-solo]").forEach((b) => b.addEventListener("click", () => {
      const on = b.getAttribute("aria-pressed") !== "true";
      b.setAttribute("aria-pressed", on);
      api.changeTrackSolo([api.score.tracks[+b.dataset.solo]], on);
    }));
  }

  // ---- secciones (los marcadores: «Ej. 14 · 8.1» en los ejemplos, «Estrofa 1» en las canciones)
  let tramos = [];   // [{nombre, inicio, fin}] en ticks
  function armarSecciones(score) {
    const sel = $("secciones");
    sel.innerHTML = "";
    const marcadas = score.masterBars.filter((m) => m.section && (m.section.text || m.section.marker));
    tramos = marcadas.map((m, k) => {
      const siguiente = marcadas[k + 1];
      const ultimo = score.masterBars[score.masterBars.length - 1];
      return { nombre: m.section.text || m.section.marker, inicio: m.start,
               fin: siguiente ? siguiente.start : ultimo.start + ultimo.calculateDuration() };
    });
    $("grupo-secciones").hidden = tramos.length === 0;
    const todo = document.createElement("option");
    todo.value = "-1"; todo.textContent = "Todo el archivo";
    sel.appendChild(todo);
    tramos.forEach((t, k) => {
      const o = document.createElement("option");
      o.value = String(k); o.textContent = t.nombre;
      sel.appendChild(o);
    });
    sel.value = "-1";
  }
  $("secciones").addEventListener("change", (ev) => {
    const k = +ev.target.value;
    if (k < 0) { api.playbackRange = null; api.tickPosition = 0; return; }
    const t = tramos[k];
    api.playbackRange = { startTick: t.inicio, endTick: t.fin };
    api.tickPosition = t.inicio;
  });

  // ---- reproducción
  const play = $("play");
  play.addEventListener("click", () => api.playPause());
  $("stop").addEventListener("click", () => api.stop());
  api.playerStateChanged.on((e) => {
    const tocando = e.state === alphaTab.synth.PlayerState.Playing;
    play.textContent = tocando ? "❚❚ Pausa" : "▶ Reproducir";
  });
  $("velocidad").addEventListener("change", (ev) => { api.playbackSpeed = parseFloat(ev.target.value); });
  $("loop").addEventListener("change", (ev) => { api.isLooping = ev.target.checked; });
  $("metronomo").addEventListener("change", (ev) => { api.metronomeVolume = ev.target.checked ? 1 : 0; });
  $("cuenta").addEventListener("change", (ev) => { api.countInVolume = ev.target.checked ? 1 : 0; });

  // ---- notación y diseño
  function aplicarNotacion() {
    const modo = $("notacion").value;
    api.score.tracks.forEach((t) => t.staves.forEach((s) => {
      if (s.isPercussion) return;
      s.showTablature = modo !== "penta";
      s.showStandardNotation = modo !== "tab";
    }));
    api.render();
  }
  $("notacion").addEventListener("change", aplicarNotacion);
  $("vista").addEventListener("change", (ev) => {
    const horizontal = ev.target.value === "horizontal";
    api.settings.display.layoutMode = horizontal ? alphaTab.LayoutMode.Horizontal : alphaTab.LayoutMode.Page;
    api.settings.player.scrollElement = horizontal ? partitura : "html,body";
    partitura.classList.toggle("horizontal", horizontal);
    api.updateSettings();
    api.render();
  });
})();
