// app.js

(() => {
  const qs  = (sel, el = document) => el.querySelector(sel);
  const qsa = (sel, el = document) => Array.from(el.querySelectorAll(sel));

  const STORAGE_KEY = "beasycpg_state_v2";

  const state = {
    project: {
      projectName: "",
      projectCode: "",
      author: "",
      comment: "",
    },
    model: {
      id: "",
      title: "",
      namespace: "",
      description: "",
      associations: [], // {name, targetType, cardinality, mandatory, siteRole}
    },
    shows: [], // {id, title, desc, condition, order}
    fields: [], // {prop, type, required, readonly, constraint}
    dynlists: [], // {name, code, label, value, path}
    export: {
      dynlistHeaders: "path,name,code,label,value",
      dynlistPathPrefix: "/System/Lists/bcpg:entityLists/",
    },
  };

  // ---------- INIT ----------
  document.addEventListener("DOMContentLoaded", () => {
    initTabs();
    bindButtons();
    restoreFromStorage();
    renderAll();
  });

  // ---------- TABS ----------
  function initTabs() {
    const tabs = qsa(".tab");
    const panels = qsa(".panel");

    function activateTab(tab) {
      tabs.forEach(t => {
        t.classList.toggle("is-active", t === tab);
        t.setAttribute("aria-selected", t === tab ? "true" : "false");
      });
      panels.forEach(p => p.classList.toggle("is-active", p.id === tab.getAttribute("aria-controls")));
      const panel = qs(`#${tab.getAttribute("aria-controls")}`);
      if (panel) panel.focus({ preventScroll: true });
    }

    document.addEventListener("click", (e) => {
      const btn = e.target.closest(".tab");
      if (!btn) return;
      activateTab(btn);
    });

    // Accessibilité clavier
    document.addEventListener("keydown", (e) => {
      const current = document.activeElement.closest(".tab");
      if (!current) return;
      const list = qsa(".tab");
      const idx = list.indexOf(current);
      if (e.key === "ArrowRight") {
        e.preventDefault();
        list[(idx + 1) % list.length].focus();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        list[(idx - 1 + list.length) % list.length].focus();
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        activateTab(current);
      }
    });
  }

  // ---------- BUTTONS / ACTIONS ----------
  function bindButtons() {
    // Prevent default form submit clearing the page
    const form = qs("#projectForm");
    form.addEventListener("submit", (e) => e.preventDefault());

    qs("#btnSaveProject").addEventListener("click", onSaveProject);
    qs("#btnExportDynlistCsv").addEventListener("click", onExportDynlistCsv);
    qs("#btnExportDynlistJson").addEventListener("click", onExportDynlistJson);

    // Delegation: tables add/remove
    document.addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;

      // Adders
      if (btn.matches("[data-action='add-assoc']")) {
        addAssociationRow();
      } else if (btn.matches("[data-action='add-show']")) {
        addShowRow();
      } else if (btn.matches("[data-action='add-field']")) {
        addFieldRow();
      } else if (btn.matches("[data-action='add-dynrow']")) {
        addDynRow();
      }

      // Removers
      if (btn.dataset.removeRow === "true") {
        const tr = btn.closest("tr");
        if (tr) tr.remove();
        // no immediate persist; wait for save
      }
    });

    // inputs for export settings
    qs("#dynlistHeaders").addEventListener("input", (e) => {
      state.export.dynlistHeaders = e.target.value.trim();
    });
    qs("#dynlistPathPrefix").addEventListener("input", (e) => {
      state.export.dynlistPathPrefix = e.target.value.trim();
      updateDynlistAutoPaths();
    });
  }

  // ---------- RENDER ----------
  function renderAll() {
    renderProject();
    renderModel();
    renderShows();
    renderFields();
    renderDynlists();
  }

  function renderProject() {
    const form = qs("#projectForm");
    form.projectName.value = state.project.projectName || "";
    form.projectCode.value = state.project.projectCode || "";
    form.author.value = state.project.author || "";
    form.comment.value = state.project.comment || "";
  }

  function renderModel() {
    qs("[name='model.id']").value = state.model.id || "";
    qs("[name='model.title']").value = state.model.title || "";
    qs("[name='model.namespace']").value = state.model.namespace || "";
    qs("[name='model.description']").value = state.model.description || "";

    const tbody = qs("#tableAssociations tbody");
    tbody.innerHTML = "";
    (state.model.associations || []).forEach(addAssociationRow);
  }

  function renderShows() {
    const tbody = qs("#tableShows tbody");
    tbody.innerHTML = "";
    (state.shows || []).forEach(addShowRow);
  }

  function renderFields() {
    const tbody = qs("#tableFields tbody");
    tbody.innerHTML = "";
    (state.fields || []).forEach(addFieldRow);
  }

  function renderDynlists() {
    qs("#dynlistHeaders").value = state.export.dynlistHeaders || "path,name,code,label,value";
    qs("#dynlistPathPrefix").value = state.export.dynlistPathPrefix || "/System/Lists/bcpg:entityLists/";
    const tbody = qs("#tableDynLists tbody");
    tbody.innerHTML = "";
    (state.dynlists || []).forEach(addDynRow);
  }

  // ---------- ROW FACTORIES ----------
  function trFromCells(cells) {
    const tr = document.createElement("tr");
    cells.forEach((html) => {
      const td = document.createElement("td");
      td.innerHTML = html;
      tr.appendChild(td);
    });
    const tdAct = document.createElement("td");
    tdAct.innerHTML = `<button class="btn danger" data-remove-row="true" title="Supprimer">Suppr.</button>`;
    tr.appendChild(tdAct);
    return tr;
  }

  function addAssociationRow(data = {}) {
    const tbody = qs("#tableAssociations tbody");
    const tr = trFromCells([
      `<input type="text" class="cell-input" data-key="name" value="${safe(data.name)}" placeholder="sw:carrier" />`,
      `<input type="text" class="cell-input" data-key="targetType" value="${safe(data.targetType)}" placeholder="cm:person" />`,
      `<select class="cell-input" data-key="cardinality">
         ${options(["one","many"], data.cardinality)}
       </select>`,
      `<select class="cell-input" data-key="mandatory">
         ${options(["false","true"], data.mandatory)}
       </select>`,
      `<select class="cell-input" data-key="siteRole">
         ${options(["SiteManager","SiteContributor","SiteConsumer"], data.siteRole || "SiteContributor")}
       </select>`,
    ]);
    tbody.appendChild(tr);
  }

  function addShowRow(data = {}) {
    const tbody = qs("#tableShows tbody");
    const tr = trFromCells([
      `<input type="text" class="cell-input" data-key="id" value="${safe(data.id)}" placeholder="sw:showBlade" />`,
      `<input type="text" class="cell-input" data-key="title" value="${safe(data.title)}" placeholder="Détails de la lame" />`,
      `<input type="text" class="cell-input" data-key="desc" value="${safe(data.desc)}" placeholder="Zone d’affichage…"/>`,
      `<input type="text" class="cell-input" data-key="condition" value="${safe(data.condition)}" placeholder="ex: ${'model.id == \"sw:lightsaber\"'}" />`,
      `<input type="number" class="cell-input" data-key="order" value="${safe(data.order ?? "")}" min="0" step="1" />`,
    ]);
    tbody.appendChild(tr);
  }

  function addFieldRow(data = {}) {
    const tbody = qs("#tableFields tbody");
    const tr = trFromCells([
      `<input type="text" class="cell-input" data-key="prop" value="${safe(data.prop)}" placeholder="sw:kyberCrystal" />`,
      `<select class="cell-input" data-key="type">
         ${options(["d:text","d:int","d:date","d:boolean","d:mltext"], data.type || "d:text")}
       </select>`,
      `<select class="cell-input" data-key="required">
         ${options(["false","true"], data.required)}
       </select>`,
      `<select class="cell-input" data-key="readonly">
         ${options(["false","true"], data.readonly)}
       </select>`,
      `<input type="text" class="cell-input" data-key="constraint" value="${safe(data.constraint)}" placeholder="sw:kyberListConstraint" />`,
    ]);
    tbody.appendChild(tr);
  }

  function addDynRow(data = {}) {
    const tbody = qs("#tableDynLists tbody");
    const prefix = qs("#dynlistPathPrefix").value.trim() || state.export.dynlistPathPrefix;
    const computedPath = data.path || (prefix ? `${prefix}${(data.name || "").trim()}` : "");
    const tr = trFromCells([
      `<input type="text" class="cell-input" data-key="name" value="${safe(data.name)}" placeholder="sw_kyber_crystals" />`,
      `<input type="text" class="cell-input" data-key="code" value="${safe(data.code)}" placeholder="KYB01" />`,
      `<input type="text" class="cell-input" data-key="label" value="${safe(data.label)}" placeholder="Cristal bleu" />`,
      `<input type="text" class="cell-input" data-key="value" value="${safe(data.value)}" placeholder="BLUE" />`,
      `<input type="text" class="cell-input" data-key="path" value="${safe(computedPath)}" />`,
    ]);
    tbody.appendChild(tr);
  }

  function updateDynlistAutoPaths() {
    const prefix = qs("#dynlistPathPrefix").value.trim();
    qsa("#tableDynLists tbody tr").forEach(tr => {
      const name = qs('[data-key="name"]', tr)?.value?.trim() || "";
      const pathInput = qs('[data-key="path"]', tr);
      if (pathInput && prefix && name) {
        pathInput.value = `${prefix}${name}`;
      }
    });
  }

  // ---------- SAVE / RESTORE ----------
  function onSaveProject() {
    readProjectFormIntoState();
    readTablesIntoState();

    persist();
    flashStatus("Projet enregistré (localStorage).");
  }

  function readProjectFormIntoState() {
    const form = qs("#projectForm");
    state.project.projectName = form.projectName.value.trim();
    state.project.projectCode = form.projectCode.value.trim();
    state.project.author     = form.author.value.trim();
    state.project.comment    = form.comment.value.trim();

    state.model.id          = qs("[name='model.id']").value.trim();
    state.model.title       = qs("[name='model.title']").value.trim();
    state.model.namespace   = qs("[name='model.namespace']").value.trim();
    state.model.description = qs("[name='model.description']").value.trim();
  }

  function readTablesIntoState() {
    state.model.associations = qsa("#tableAssociations tbody tr").map(tr => ({
      name: getCell(tr, "name"),
      targetType: getCell(tr, "targetType"),
      cardinality: getCell(tr, "cardinality"),
      mandatory: getCell(tr, "mandatory"),
      siteRole: getCell(tr, "siteRole"),
    }));

    state.shows = qsa("#tableShows tbody tr").map(tr => ({
      id: getCell(tr, "id"),
      title: getCell(tr, "title"),
      desc: getCell(tr, "desc"),
      condition: getCell(tr, "condition"),
      order: numOrNull(getCell(tr, "order")),
    }));

    state.fields = qsa("#tableFields tbody tr").map(tr => ({
      prop: getCell(tr, "prop"),
      type: getCell(tr, "type"),
      required: getCell(tr, "required"),
      readonly: getCell(tr, "readonly"),
      constraint: getCell(tr, "constraint"),
    }));

    state.dynlists = qsa("#tableDynLists tbody tr").map(tr => ({
      name: getCell(tr, "name"),
      code: getCell(tr, "code"),
      label: getCell(tr, "label"),
      value: getCell(tr, "value"),
      path: getCell(tr, "path"),
    }));

    state.export.dynlistHeaders = qs("#dynlistHeaders").value.trim() || state.export.dynlistHeaders;
    state.export.dynlistPathPrefix = qs("#dynlistPathPrefix").value.trim() || state.export.dynlistPathPrefix;
  }

  function restoreFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        // seed a couple of demo rows
        state.model.associations = [
          { name: "sw:carrier", targetType: "cm:person", cardinality: "one", mandatory: "true", siteRole: "SiteManager" },
        ];
        state.shows = [
          { id: "sw:showBlade", title: "Détails de la lame", desc: "Couleur / Cristal", condition: "", order: 1 },
        ];
        state.fields = [
          { prop: "sw:kyberCrystal", type: "d:text", required: "true", readonly: "false", constraint: "sw:kyberListConstraint" },
        ];
        state.dynlists = [
          { name: "sw_kyber_crystals", code: "KYB01", label: "Bleu", value: "BLUE", path: `${state.export.dynlistPathPrefix}sw_kyber_crystals` },
        ];
        return;
      }
      const parsed = JSON.parse(raw);
      mergeDeep(state, parsed);
    } catch (e) {
      console.warn("Restore failed", e);
    }
  }

  function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  // ---------- EXPORT DYNLIST ----------
  function onExportDynlistCsv() {
    readTablesIntoState();
    const headers = parseHeaders(state.export.dynlistHeaders); // array
    const rows = state.dynlists.map(row => headers.map(h => row[h] ?? ""));
    const csv = toCsv([headers, ...rows]);
    downloadText(csv, `dynlists_${safeFile(state.project.projectCode || "project")}.csv`, "text/csv");
  }

  function onExportDynlistJson() {
    readTablesIntoState();
    const payload = {
      meta: {
        project: state.project,
        exportHeaders: parseHeaders(state.export.dynlistHeaders),
        generatedAt: new Date().toISOString(),
      },
      data: state.dynlists,
    };
    downloadText(JSON.stringify(payload, null, 2), `dynlists_${safeFile(state.project.projectCode || "project")}.json`, "application/json");
  }

  function parseHeaders(s) {
    return (s || "")
      .split(",")
      .map(h => h.trim())
      .filter(Boolean);
  }

  // ---------- HELPERS ----------
  function getCell(tr, key) {
    const el = qs(`[data-key="${key}"]`, tr);
    return el ? (el.type === "checkbox" ? String(!!el.checked) : el.value || "") : "";
  }

  function numOrNull(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function options(arr, selected) {
    return arr.map(v => `<option value="${v}" ${String(v)===String(selected)?"selected":""}>${v}</option>`).join("");
  }

  function safe(s) {
    if (s == null) return "";
    return String(s).replace(/"/g, "&quot;");
  }

  function safeFile(s) {
    return s.replace(/[^\w.-]+/g, "_");
  }

  function toCsv(rows) {
    return rows
      .map(r => r.map(cell => {
        const str = String(cell ?? "");
        if (/[",\n]/.test(str)) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      }).join(","))
      .join("\n");
  }

  function downloadText(text, filename, mime) {
    const blob = new Blob([text], { type: mime || "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      a.remove();
    }, 0);
  }

  function flashStatus(msg) {
    const el = qs("#saveStatus");
    el.textContent = msg;
    el.classList.add("show");
    setTimeout(() => el.classList.remove("show"), 1800);
  }

  function mergeDeep(target, src) {
    for (const k of Object.keys(src || {})) {
      if (isPlainObject(src[k])) {
        if (!isPlainObject(target[k])) target[k] = {};
        mergeDeep(target[k], src[k]);
      } else {
        target[k] = src[k];
      }
    }
  }

  function isPlainObject(x) {
    return x && typeof x === "object" && !Array.isArray(x);
  }
})();
