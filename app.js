/* Alfresco/beCPG Generator – app.js
 * - Propriétés / Associations / DynLists (code:value)
 * - Attributs form: mandatory="true|false", read-only="true|false", set="..."
 * - <show> options: force="true", for-mode="true"
 * - Fields:
 *    * Associations: autocomplete-association.ftl (+ ds, pageLinkTemplate)
 *    * Texte: textfield.ftl (maxLength) ou textarea.ftl
 *    * d:nodeRef hiérarchique: autocomplete.ftl (+ ds commun, parent automatique)
 * - DynList (beCPG) constraint: seuls name + path éditables, le reste fixé
 * - Lier une propriété à une DynList existante ou la créer depuis la propriété
 * - Edition des lignes (CRUD complet)
 */

const STORAGE_KEY = "alfresco_generator_project_v3";

const state = {
  project: {
    name: "",
    namespacePrefix: "",
    namespaceUri: "",
    settings: {
      // DynListConstraint (beCPG)
      dynListConstraintQName: "fr.becpg.repo.dictionary.constraint.DynListConstraint",
      dynListPathParamName: "path",               // param exposé
      dynListConstraintTypeQName: "bcpg:listValue",
      dynListConstraintPropQName: "bcpg:lvValue",
      dynListAddEmptyValue: true,

      defaultLocale: "fr",
      includeContainers: true,
      containerProperties: true,
      containerAssociations: true,

      // show options
      showForce: false,
      showForMode: false,

      // Field sets disponibles
      fieldSets: ["referentialData"]
    }
  },
  properties: [],
  associations: [],
  // DynLists : entries = [{code, value}]
  dynlists: []
};

// -------------------- Helpers --------------------
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const ns = () => state.project.namespacePrefix || "ns";
const escXml = (s = "") =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    const obj = JSON.parse(raw);
    Object.assign(state.project, obj.project || {});
    state.properties = obj.properties || [];
    state.associations = obj.associations || [];
    state.dynlists = obj.dynlists || [];
  } catch (e) {
    console.warn("parse state", e);
  }
}
function toast(m) { alert(m); }

// Coller DynList: lignes "code:value" (ou "code;value" toléré)
function parsePastedSimple(text) {
  const rows = [];
  (text || "").split(/\r?\n/).forEach((line) => {
    const l = line.trim();
    if (!l) return;
    const sep = l.includes(":") ? ":" : (l.includes(";") ? ";" : null);
    if (!sep) return; // ignore
    const [code, value] = l.split(sep);
    rows.push({ code: (code || "").trim(), value: (value || "").trim() });
  });
  return rows;
}

// -------------------- Tabs --------------------
$$(".tabs .tab").forEach((b) =>
  b.addEventListener("click", () => {
    $$(".tabs .tab").forEach((x) => x.classList.remove("active"));
    b.classList.add("active");
    const t = b.dataset.tab;
    $$("main .panel").forEach((p) => p.classList.remove("active"));
    $(`#tab-${t}`).classList.add("active");
  })
);

// -------------------- Projet --------------------
function renderFieldSets() {
  const ul = $("#ulFieldSets");
  ul.innerHTML = "";
  state.project.settings.fieldSets.forEach((s) => {
    const li = document.createElement("li");
    li.textContent = `- ${s}`;
    ul.appendChild(li);
  });

  const targets = [
    $("#formProperty select[name='fieldSet']"),
    $("#formAssoc select[name='fieldSet']")
  ];
  targets.forEach((sel) => {
    sel.innerHTML = "";
    state.project.settings.fieldSets.forEach((fs) => {
      const opt = document.createElement("option");
      opt.value = fs;
      opt.textContent = fs;
      sel.appendChild(opt);
    });
  });
}

function populateProjectForm() {
  const f = $("#formProject");
  f.projectName.value = state.project.name || "";
  f.nsPrefix.value = state.project.namespacePrefix || "";
  f.nsUri.value = state.project.namespaceUri || "";
  f.dynQName.value =
    state.project.settings.dynListConstraintQName ||
    "fr.becpg.repo.dictionary.constraint.DynListConstraint";
  f.dynPathParam.value =
    state.project.settings.dynListPathParamName || "path";
  f.defaultLocale.value = state.project.settings.defaultLocale || "fr";
  f.includeContainers.checked = !!state.project.settings.includeContainers;
  f.showForce.checked = !!state.project.settings.showForce;
  f.showForMode.checked = !!state.project.settings.showForMode;
  f.containerProperties.checked = !!state.project.settings.containerProperties;
  f.containerAssociations.checked =
    !!state.project.settings.containerAssociations;
  renderFieldSets();
}

$("#btnAddFieldSet").addEventListener("click", () => {
  const v = $("#formProject input[name='newFieldSet']").value.trim();
  if (!v) return;
  if (!state.project.settings.fieldSets.includes(v)) {
    state.project.settings.fieldSets.push(v);
    $("#formProject input[name='newFieldSet']").value = "";
    saveState();
    renderFieldSets();
  }
});

$("#formProject").addEventListener("submit", (e) => {
  e.preventDefault();
  const f = e.currentTarget;
  state.project.name = f.projectName.value.trim();
  state.project.namespacePrefix = f.nsPrefix.value.trim();
  state.project.namespaceUri = f.nsUri.value.trim();
  state.project.settings.dynListConstraintQName =
    f.dynQName.value.trim() ||
    "fr.becpg.repo.dictionary.constraint.DynListConstraint";
  state.project.settings.dynListPathParamName =
    f.dynPathParam.value.trim() || "path";
  state.project.settings.defaultLocale = f.defaultLocale.value.trim() || "fr";
  state.project.settings.includeContainers = f.includeContainers.checked;
  state.project.settings.showForce = f.showForce.checked;
  state.project.settings.showForMode = f.showForMode.checked;
  state.project.settings.containerProperties = f.containerProperties.checked;
  state.project.settings.containerAssociations =
    f.containerAssociations.checked;
  saveState();
  toast("Projet enregistré.");
});

// -------------------- Propriétés --------------------
let editingPropIndex = null;

function dynlistOptionsHtml() {
  const opts = [`<option value="">— aucune —</option>`];
  state.dynlists.forEach((d) => {
    opts.push(
      `<option value="${escXml(d.listName)}">${escXml(d.listName)}</option>`
    );
  });
  return opts.join("");
}
function feedPropFormDynSelect() {
  $("#formProperty select[name='linkDynList']").innerHTML = dynlistOptionsHtml();
}

function showPropConditionalBlocks() {
  const f = $("#formProperty");
  const ctrl = f.fieldControl.value;
  $("#propAssocOptions").style.display =
    ctrl === "assoc-auto" ? "" : "none";
  $("#propNodeRefOptions").style.display =
    ctrl === "noderef-auto" ? "" : "none";
}
$("#formProperty select[name='fieldControl']").addEventListener(
  "change",
  showPropConditionalBlocks
);

function resetPropForm() {
  const f = $("#formProperty");
  f.reset();
  f.fieldControl.value = "auto";
  f.nrLevels.value = 1;
  editingPropIndex = null;
  $("#propFormLegend").textContent = "Nouvelle propriété";
  $("#btnSaveProp").textContent = "Ajouter propriété";
  $("#btnCancelProp").style.display = "none";
  showPropConditionalBlocks();
  feedPropFormDynSelect();
  if (state.project.settings.fieldSets.length)
    f.fieldSet.value = state.project.settings.fieldSets[0];
}
function fillPropForm(p) {
  const f = $("#formProperty");
  f.qnameLocal.value = p.qnameLocal || "";
  f.title.value = p.title || "";
  f.type.value = p.type || "d:text";
  f.multiple.checked = !!p.multiple;
  f.default.value = p.default || "";
  f.labelId.value = p.labelId || "";
  f.mandatoryModel.checked = !!p.mandatoryModel;
  f.mandatoryForm.checked = !!p.mandatoryForm;
  f.readOnlyForm.checked = !!p.readOnlyForm;
  f.fieldSet.value = p.fieldSet || (state.project.settings.fieldSets[0] || "");

  f.fieldControl.value = p.fieldControl || "auto";
  f.maxLength.value = p.maxLength || "";

  f.assocDs.value = p.assocDs || "";
  f.assocPageLinkTemplate.value = p.assocPageLinkTemplate || "";

  f.nrDs.value = p.nrDs || "";
  f.nrLevels.value = p.nrLevels || 1;

  f.constraintName.value = p.constraint?.name || "";
  f.dynPath.value =
    p.constraint?.params?.[state.project.settings.dynListPathParamName] || "";
  f.linkDynList.value = p.linkDynList || "";
  showPropConditionalBlocks();
}

function renderProperties() {
  const tb = $("#tblProperties tbody");
  tb.innerHTML = "";
  state.properties.forEach((p, i) => {
    const q = `${ns()}:${p.qnameLocal}`;
    const c = p.constraint?.name ? `${p.constraint.name}` : "";
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><code>${q}</code></td>
      <td>${escXml(p.title || "")}</td>
      <td>${p.type}</td>
      <td>${p.multiple}</td>
      <td>${p.mandatoryModel ? "✓" : ""}</td>
      <td>${p.mandatoryForm ? "✓" : ""}</td>
      <td>${p.readOnlyForm ? "✓" : ""}</td>
      <td>${escXml(c)}</td>
      <td>${escXml(p.fieldSet || "")}</td>
      <td>
        <button class="btn" data-edit="${i}">Éditer</button>
        <button class="btn btn-danger" data-del="${i}">Suppr.</button>
      </td>
    `;
    tb.appendChild(tr);
  });

  $$("#tblProperties [data-edit]").forEach((b) =>
    b.addEventListener("click", () => {
      editingPropIndex = Number(b.dataset.edit);
      $("#propFormLegend").textContent = "Éditer la propriété";
      $("#btnSaveProp").textContent = "Mettre à jour";
      $("#btnCancelProp").style.display = "inline-block";
      fillPropForm(state.properties[editingPropIndex]);
    })
  );
  $$("#tblProperties [data-del]").forEach((b) =>
    b.addEventListener("click", () => {
      const i = Number(b.dataset.del);
      state.properties.splice(i, 1);
      saveState();
      renderProperties();
      buildAllPreviews();
      if (editingPropIndex === i) resetPropForm();
    })
  );
}
$("#btnCancelProp").addEventListener("click", resetPropForm);

// créer dynlist depuis la propriété
$("#btnCreateDynFromProp").addEventListener("click", () => {
  const f = $("#formProperty");
  const pfx = state.project.namespacePrefix || "ns";
  const propLocal = f.qnameLocal.value.trim() || "list";
  const listName = `${pfx}_${propLocal}`;
  const listPath = `/System/Lists/bcpg:entityLists/${listName}`;
  if (state.dynlists.some((d) => d.listName === listName)) {
    toast("Une DynList de ce nom existe déjà.");
    return;
  }
  state.dynlists.push({ listName, listPath, entries: [] });
  // lier à la propriété
  f.linkDynList.value = listName;
  if (!f.constraintName.value) f.constraintName.value = `${pfx}:${propLocal}Constraint`;
  if (!f.dynPath.value) f.dynPath.value = listPath;
  saveState();
  renderDyn();
  feedPropFormDynSelect();
  toast(`DynList créée: ${listName}`);
});

$("#formProperty").addEventListener("submit", (e) => {
  e.preventDefault();
  const f = e.currentTarget;

  const prop = {
    qnameLocal: f.qnameLocal.value.trim(),
    title: f.title.value.trim(),
    type: f.type.value,
    multiple: f.multiple.checked,
    default: f.default.value,
    labelId: f.labelId.value.trim(),
    mandatoryModel: f.mandatoryModel.checked,
    mandatoryForm: f.mandatoryForm.checked,
    readOnlyForm: f.readOnlyForm.checked,
    fieldSet: f.fieldSet.value || "",

    fieldControl: f.fieldControl.value,
    maxLength: f.maxLength.value ? Number(f.maxLength.value) : undefined,

    assocDs: f.assocDs.value.trim(),
    assocPageLinkTemplate: f.assocPageLinkTemplate.value.trim(),

    nrDs: f.nrDs.value.trim(),
    nrLevels: Math.max(1, Number(f.nrLevels.value) || 1),

    linkDynList: f.linkDynList.value || "",
    constraint: null
  };

  // contrainte (seuls name et path | dynListPathParamName exposés)
  const cName = f.constraintName.value.trim();
  const cPath = f.dynPath.value.trim();
  if (cName && cPath) {
    prop.constraint = {
      name: cName,
      type: state.project.settings.dynListConstraintQName,
      params: { [state.project.settings.dynListPathParamName]: cPath }
    };
  } else if (prop.linkDynList) {
    // si une dynlist est choisie, auto-déduire path si vide
    const dl = state.dynlists.find((d) => d.listName === prop.linkDynList);
    if (dl) {
      const autoName = `${ns()}:${prop.qnameLocal}Constraint`;
      prop.constraint = {
        name: cName || autoName,
        type: state.project.settings.dynListConstraintQName,
        params: { [state.project.settings.dynListPathParamName]: dl.listPath }
      };
    }
  }

  // create vs update
  if (editingPropIndex === null) {
    if (state.properties.some((p) => p.qnameLocal === prop.qnameLocal)) {
      toast("Nom technique déjà utilisé.");
      return;
    }
    state.properties.push(prop);
  } else {
    const dup = state.properties.some(
      (p, i) => i !== editingPropIndex && p.qnameLocal === prop.qnameLocal
    );
    if (dup) {
      toast("Nom technique déjà utilisé.");
      return;
    }
    state.properties[editingPropIndex] = prop;
  }
  saveState();
  renderProperties();
  buildAllPreviews();
  resetPropForm();
});

// -------------------- Associations --------------------
let editingAssocIndex = null;

function resetAssocForm() {
  const f = $("#formAssoc");
  f.reset();
  f.sourceMany.value = "true"; // défaut demandé
  f.targetMany.value = "false";
  editingAssocIndex = null;
  $("#assocFormLegend").textContent = "Nouvelle association";
  $("#btnSaveAssoc").textContent = "Ajouter association";
  $("#btnCancelAssoc").style.display = "none";
  if (state.project.settings.fieldSets.length)
    f.fieldSet.value = state.project.settings.fieldSets[0];
}
function fillAssocForm(a) {
  const f = $("#formAssoc");
  f.qnameLocal.value = a.qnameLocal || "";
  f.title.value = a.title || "";
  f.targetClass.value = a.targetClass || "cm:person";
  f.mandatoryModel.checked = !!a.mandatoryModel;
  f.mandatoryForm.checked = !!a.mandatoryForm;
  f.fieldSet.value = a.fieldSet || (state.project.settings.fieldSets[0] || "");
  f.sourceMany.value = a.sourceMany ? "true" : "false";
  f.targetMany.value = a.targetMany ? "true" : "false";
  f.assocDs.value = a.assocDs || "";
  f.assocPageLinkTemplate.value = a.assocPageLinkTemplate || "";
}
function renderAssocs() {
  const tb = $("#tblAssocs tbody");
  tb.innerHTML = "";
  state.associations.forEach((a, i) => {
    const q = `${ns()}:${a.qnameLocal}`;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><code>${q}</code></td>
      <td>${escXml(a.title || "")}</td>
      <td>${a.targetClass}</td>
      <td>${a.sourceMany}</td>
      <td>${a.targetMany}</td>
      <td>${a.mandatoryModel ? "✓" : ""}</td>
      <td>${a.mandatoryForm ? "✓" : ""}</td>
      <td>${escXml(a.fieldSet || "")}</td>
      <td>
        <button class="btn" data-edit="${i}">Éditer</button>
        <button class="btn btn-danger" data-del="${i}">Suppr.</button>
      </td>
    `;
    tb.appendChild(tr);
  });
  $$("#tblAssocs [data-edit]").forEach((b) =>
    b.addEventListener("click", () => {
      editingAssocIndex = Number(b.dataset.edit);
      $("#assocFormLegend").textContent = "Éditer l'association";
      $("#btnSaveAssoc").textContent = "Mettre à jour";
      $("#btnCancelAssoc").style.display = "inline-block";
      fillAssocForm(state.associations[editingAssocIndex]);
    })
  );
  $$("#tblAssocs [data-del]").forEach((b) =>
    b.addEventListener("click", () => {
      const i = Number(b.dataset.del);
      state.associations.splice(i, 1);
      saveState();
      renderAssocs();
      buildAllPreviews();
      if (editingAssocIndex === i) resetAssocForm();
    })
  );
}
$("#btnCancelAssoc").addEventListener("click", resetAssocForm);

$("#formAssoc").addEventListener("submit", (e) => {
  e.preventDefault();
  const f = e.currentTarget;
  const assoc = {
    qnameLocal: f.qnameLocal.value.trim(),
    title: f.title.value.trim(),
    targetClass: f.targetClass.value.trim() || "cm:person",
    sourceMany: f.sourceMany.value === "true",
    targetMany: f.targetMany.value === "true",
    mandatoryModel: f.mandatoryModel.checked,
    mandatoryForm: f.mandatoryForm.checked,
    fieldSet: f.fieldSet.value || "",
    assocDs: f.assocDs.value.trim(),
    assocPageLinkTemplate: f.assocPageLinkTemplate.value.trim()
  };

  if (editingAssocIndex === null) {
    if (state.associations.some((a) => a.qnameLocal === assoc.qnameLocal)) {
      toast("Nom technique déjà utilisé.");
      return;
    }
    state.associations.push(assoc);
  } else {
    const dup = state.associations.some(
      (a, i) => i !== editingAssocIndex && a.qnameLocal === assoc.qnameLocal
    );
    if (dup) {
      toast("Nom technique déjà utilisé.");
      return;
    }
    state.associations[editingAssocIndex] = assoc;
  }
  saveState();
  renderAssocs();
  buildAllPreviews();
  resetAssocForm();
});

// -------------------- DynLists (code:value) --------------------
let editingDynIndex = null;
let lastParsedDyn = [];

$("#btnParseDyn").addEventListener("click", () => {
  const f = $("#formDyn");
  lastParsedDyn = parsePastedSimple(f.pasted.value);
  toast(`Analyse OK : ${lastParsedDyn.length} ligne(s).`);
});

$("#btnInlineAdd").addEventListener("click", () => {
  const f = $("#formDyn");
  const e = {
    code: (f.il_code.value || "").trim(),
    value: (f.il_value.value || "").trim()
  };
  if (!e.code && !e.value) {
    toast("Code ou Value requis.");
    return;
  }
  lastParsedDyn.push(e);
  f.il_code.value = "";
  f.il_value.value = "";
});

function renderDyn() {
  const tb = $("#tblDyn tbody");
  tb.innerHTML = "";
  state.dynlists.forEach((d, i) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><code>${escXml(d.listName)}</code></td>
      <td>${escXml(d.listPath)}</td>
      <td>${d.entries.length}</td>
      <td>
        <button class="btn" data-edit="${i}">Éditer</button>
        <button class="btn btn-danger" data-del="${i}">Suppr.</button>
      </td>
    `;
    tb.appendChild(tr);
  });

  $$("#tblDyn [data-edit]").forEach((b) =>
    b.addEventListener("click", () => {
      editingDynIndex = Number(b.dataset.edit);
      $("#dynFormLegend").textContent = "Éditer la DynList";
      $("#btnSaveDyn").textContent = "Mettre à jour";
      $("#btnCancelDyn").style.display = "inline-block";
      const d = state.dynlists[editingDynIndex];
      const f = $("#formDyn");
      f.listName.value = d.listName;
      f.listPath.value = d.listPath;
      f.pasted.value = d.entries
        .map((e) => `${e.code || ""}:${e.value || ""}`)
        .join("\n");
      lastParsedDyn = d.entries.slice();
    })
  );

  $$("#tblDyn [data-del]").forEach((b) =>
    b.addEventListener("click", () => {
      const i = Number(b.dataset.del);
      state.dynlists.splice(i, 1);
      saveState();
      renderDyn();
      buildAllPreviews();
      if (editingDynIndex === i) resetDynForm();
    })
  );
}

function resetDynForm() {
  const f = $("#formDyn");
  f.reset();
  editingDynIndex = null;
  lastParsedDyn = [];
  $("#dynFormLegend").textContent = "Nouvelle DynList";
  $("#btnSaveDyn").textContent = "Ajouter DynList";
  $("#btnCancelDyn").style.display = "none";
}

$("#btnCancelDyn").addEventListener("click", resetDynForm);

$("#formDyn").addEventListener("submit", (e) => {
  e.preventDefault();
  const f = e.currentTarget;
  const listName = f.listName.value.trim();
  const listPath = f.listPath.value.trim();
  if (!listName || !listPath) {
    toast("Nom et path requis.");
    return;
  }
  if (!lastParsedDyn.length && (f.pasted.value || "").trim().length) {
    lastParsedDyn = parsePastedSimple(f.pasted.value);
  }

  if (editingDynIndex === null) {
    if (state.dynlists.some((d) => d.listName === listName)) {
      toast("Nom de liste déjà utilisé.");
      return;
    }
    state.dynlists.push({
      listName,
      listPath,
      entries: lastParsedDyn.slice()
    });
  } else {
    const dup = state.dynlists.some(
      (d, i) => i !== editingDynIndex && d.listName === listName
    );
    if (dup) {
      toast("Nom de liste déjà utilisé.");
      return;
    }
    state.dynlists[editingDynIndex] = {
      listName,
      listPath,
      entries: lastParsedDyn.slice()
    };
  }
  saveState();
  renderDyn();
  buildAllPreviews();
  resetDynForm();
});

// -------------------- PREVIEW builders --------------------

// Model: Properties
function buildModelProperties(includeContainers) {
  const out = [];
  if (includeContainers && state.project.settings.containerProperties)
    out.push("<properties>");

  state.properties.forEach((p) => {
    out.push(`  <property name="${ns()}:${p.qnameLocal}">`);
    out.push(`    <type>${p.type}</type>`);
    out.push(`    <multiple>${p.multiple}</multiple>`);
    out.push(`    <mandatory>${!!p.mandatoryModel}</mandatory>`);
    if (p.default !== undefined && p.default !== null && String(p.default).length) {
      out.push(`    <default>${escXml(p.default)}</default>`);
    }

    // Contrainte locale dans la propriété (optionnel)
    if (p.constraint) {
      out.push(`    <constraints>`);
      out.push(
        `      <constraint name="${p.constraint.name}" type="${state.project.settings.dynListConstraintQName}">`
      );
      out.push(
        `        <parameter name="${state.project.settings.dynListPathParamName}">`
      );
      out.push(
        `          <list><value>${escXml(p.constraint.params[state.project.settings.dynListPathParamName])}</value></list>`
      );
      out.push(`        </parameter>`);
      out.push(
        `        <parameter name="constraintType"><value>${state.project.settings.dynListConstraintTypeQName}</value></parameter>`
      );
      out.push(
        `        <parameter name="constraintProp"><value>${state.project.settings.dynListConstraintPropQName}</value></parameter>`
      );
      out.push(
        `        <parameter name="addEmptyValue"><value>${state.project.settings.dynListAddEmptyValue ? "true" : "false"}</value></parameter>`
      );
      out.push(`      </constraint>`);
      out.push(`    </constraints>`);
    }

    out.push(`  </property>`);
  });

  if (includeContainers && state.project.settings.containerProperties)
    out.push("</properties>");
  return out.join("\n");
}

// Model: Associations
function buildModelAssociations(includeContainers) {
  const out = [];
  if (includeContainers && state.project.settings.containerAssociations)
    out.push("<associations>");

  state.associations.forEach((a) => {
    out.push(`  <association name="${ns()}:${a.qnameLocal}">`);
    if (a.title) out.push(`    <title>${escXml(a.title)}</title>`);
    out.push(`    <source>`);
    out.push(`      <mandatory>${!!a.mandatoryModel}</mandatory>`);
    out.push(`      <many>${!!a.sourceMany}</many>`);
    out.push(`    </source>`);
    out.push(`    <target>`);
    out.push(`      <class>${a.targetClass}</class>`);
    out.push(`      <mandatory>false</mandatory>`);
    out.push(`      <many>${!!a.targetMany}</many>`);
    out.push(`    </target>`);
    out.push(`  </association>`);
  });

  if (includeContainers && state.project.settings.containerAssociations)
    out.push("</associations>");
  return out.join("\n");
}

// Constraints (centralisées)
function buildConstraints(includeContainers) {
  const out = [];
  const seen = new Set();
  state.properties.forEach((p) => {
    if (p.constraint && !seen.has(p.constraint.name)) {
      seen.add(p.constraint.name);
      out.push(
        `  <constraint name="${p.constraint.name}" type="${state.project.settings.dynListConstraintQName}">`
      );
      out.push(
        `    <parameter name="${state.project.settings.dynListPathParamName}"><list><value>${escXml(p.constraint.params[state.project.settings.dynListPathParamName])}</value></list></parameter>`
      );
      out.push(
        `    <parameter name="constraintType"><value>${state.project.settings.dynListConstraintTypeQName}</value></parameter>`
      );
      out.push(
        `    <parameter name="constraintProp"><value>${state.project.settings.dynListConstraintPropQName}</value></parameter>`
      );
      out.push(
        `    <parameter name="addEmptyValue"><value>${state.project.settings.dynListAddEmptyValue ? "true" : "false"}</value></parameter>`
      );
      out.push(`  </constraint>`);
    }
  });
  if (!out.length) return "";
  if (includeContainers) out.unshift("<constraints>");
  if (includeContainers) out.push("</constraints>");
  return out.join("\n");
}

// Share: <show>
function buildShow() {
  const out = [];
  const addAttrs = (id) => {
    const attrs = [];
    if (state.project.settings.showForce) attrs.push(`force="true"`);
    if (state.project.settings.showForMode) attrs.push(`for-mode="true"`);
    const a = attrs.length ? " " + attrs.join(" ") : "";
    out.push(`<show id="${id}"${a} />`);
  };
  state.properties.forEach((p) => addAttrs(`${ns()}:${p.qnameLocal}`));
  state.associations.forEach((a) => addAttrs(`${ns()}:${a.qnameLocal}`));
  return out.join("\n");
}

// Share: <field>
function buildField() {
  const out = [];

  const fieldAttrs = (x) => {
    const attrs = [];
    attrs.push(`mandatory="${x.mandatoryForm ? "true" : "false"}"`);
    attrs.push(`read-only="${x.readOnlyForm ? "true" : "false"}"`);
    if (x.fieldSet) attrs.push(`set="${x.fieldSet}"`);
    if (x.labelId) attrs.push(`label-id="${x.labelId}"`);
    return attrs.join(" ");
  };

  // properties
  state.properties.forEach((p) => {
    const id = `${ns()}:${p.qnameLocal}`;

    // d:nodeRef hiérarchique
    if (p.type === "d:nodeRef" && p.fieldControl === "noderef-auto") {
      const levels = Math.max(1, Number(p.nrLevels) || 1);
      const ds = p.nrDs || "";
      for (let i = 0; i < levels; i++) {
        const suffix = i === 0 ? "Lvl0" : `Lvl${i}`;
        const fieldId = levels > 1 ? `${id}${suffix}` : id;

        const attrs = fieldAttrs(p);
        out.push(`  <field id="${fieldId}" ${attrs}>`);
        out.push(
          `    <control template="/org/alfresco/components/form/controls/autocomplete.ftl">`
        );
        if (ds) out.push(`      <control-param name="ds">${escXml(ds)}</control-param>`);
        if (i > 0) {
          // parent = id précédent, en underscore comme l’exemple
          const parentUnderscore =
            levels > 1
              ? `${ns()}_${p.qnameLocal}${i === 1 ? "Lvl0" : `Lvl${i - 1}`}`
              : id.replace(":", "_");
          out.push(
            `      <control-param name="parent">${escXml(parentUnderscore)}</control-param>`
          );
        }
        out.push(`    </control>`);
        out.push(`  </field>`);
      }
      return;
    }

    const attrs = fieldAttrs(p);
    out.push(`  <field id="${id}" ${attrs}>`);

    const control = p.fieldControl || "auto";
    if (control === "textfield") {
      out.push(
        `    <control template="/org/alfresco/components/form/controls/textfield.ftl">`
      );
      if (p.maxLength)
        out.push(
          `      <control-param name="maxLength">${p.maxLength}</control-param>`
        );
      out.push(`    </control>`);
    } else if (control === "textarea") {
      out.push(
        `    <control template="/org/alfresco/components/form/controls/textarea.ftl"></control>`
      );
    } else if (control === "assoc-auto") {
      out.push(
        `    <control template="/org/alfresco/components/form/controls/autocomplete-association.ftl">`
      );
      if (p.assocDs)
        out.push(`      <control-param name="ds">${escXml(p.assocDs)}</control-param>`);
      if (p.assocPageLinkTemplate)
        out.push(
          `      <control-param name="pageLinkTemplate">${escXml(p.assocPageLinkTemplate)}</control-param>`
        );
      out.push(`    </control>`);
    } else {
      // auto
      if (p.type === "d:text" && p.maxLength) {
        out.push(
          `    <control template="/org/alfresco/components/form/controls/textfield.ftl">`
        );
        out.push(
          `      <control-param name="maxLength">${p.maxLength}</control-param>`
        );
        out.push(`    </control>`);
      }
    }

    out.push(`  </field>`);
  });

  // associations
  state.associations.forEach((a) => {
    const id = `${ns()}:${a.qnameLocal}`;
    const attrs = fieldAttrs(a);
    out.push(`  <field id="${id}" ${attrs}>`);
    out.push(
      `    <control template="/org/alfresco/components/form/controls/autocomplete-association.ftl">`
    );
    if (a.assocDs) out.push(`      <control-param name="ds">${escXml(a.assocDs)}</control-param>`);
    if (a.assocPageLinkTemplate)
      out.push(
        `      <control-param name="pageLinkTemplate">${escXml(a.assocPageLinkTemplate)}</control-param>`
      );
    out.push(
      `      <control-param name="allowMultipleSelections">${a.targetMany ? "true" : "false"}</control-param>`
    );
    out.push(`    </control>`);
    out.push(`  </field>`);
  });

  return out.join("\n");
}

function buildAllPreviews() {
  const include = !!state.project.settings.includeContainers;
  $("#outProps").value = buildModelProperties(include);
  $("#outAssocs").value = buildModelAssociations(include);
  $("#outConstraints").value = buildConstraints(include);
  $("#outShow").value = buildShow();
  $("#outField").value = buildField();
}
$("#btnBuild").addEventListener("click", buildAllPreviews);

// copy buttons
$$(".btn-copy").forEach((b) =>
  b.addEventListener("click", async () => {
    const el = $(b.dataset.copy);
    await navigator.clipboard.writeText(el.value || el.textContent || "");
    b.textContent = "Copié !";
    setTimeout(() => (b.textContent = "Copier"), 900);
  })
);

// -------------------- Export / Import / Reset / ZIP --------------------
$("#btnExportJSON").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], {
    type: "application/json"
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = (state.project.name || "project") + ".json";
  a.click();
  URL.revokeObjectURL(a.href);
});

$("#fileImportJSON").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const obj = JSON.parse(await file.text());
    Object.assign(state.project, obj.project || {});
    state.properties = obj.properties || [];
    state.associations = obj.associations || [];
    state.dynlists = obj.dynlists || [];
    saveState();
    populateProjectForm();
    renderProperties();
    renderAssocs();
    renderDyn();
    buildAllPreviews();
    toast("Projet importé.");
  } catch (err) {
    toast("Fichier JSON invalide.");
  }
  e.target.value = "";
});

$("#btnReset").addEventListener("click", () => {
  if (!confirm("Réinitialiser le projet (localStorage) ?")) return;
  localStorage.removeItem(STORAGE_KEY);
  location.reload();
});

$("#btnDownloadZip").addEventListener("click", async () => {
  buildAllPreviews();
  const zip = new JSZip();
  const files = [];
  files.push({
    path: "model/fragment-model-properties.xml",
    content: $("#outProps").value
  });
  files.push({
    path: "model/fragment-model-associations.xml",
    content: $("#outAssocs").value
  });
  if ($("#outConstraints").value.trim().length)
    files.push({
      path: "model/fragment-model-constraints.xml",
      content: $("#outConstraints").value
    });
  files.push({ path: "share/fragment-share-show.xml", content: $("#outShow").value });
  files.push({
    path: "share/fragment-share-field.xml",
    content: $("#outField").value
  });

  // Export DynList files: une ligne "code:value" par entrée
  state.dynlists.forEach((d) => {
    const lines = d.entries.map((e) => `${e.code ?? ""}:${e.value ?? ""}`);
    files.push({
      path: `constraints/${d.listName}.csv`,
      content: lines.join("\n")
    });
  });

  const readme = `# Fragments générés
Projet: ${state.project.name || "-"}
Namespace: ${ns()} (${state.project.namespaceUri || "-"})

## Contenu
- model/fragment-model-properties.xml
- model/fragment-model-associations.xml
- model/fragment-model-constraints.xml (si présent)
- share/fragment-share-show.xml
- share/fragment-share-field.xml
- constraints/*.csv  (format: code:value par ligne)

> DynListConstraint: ${state.project.settings.dynListConstraintQName}
> Paramètre path: ${state.project.settings.dynListPathParamName}
> constraintType: ${state.project.settings.dynListConstraintTypeQName}
> constraintProp: ${state.project.settings.dynListConstraintPropQName}
> addEmptyValue: ${state.project.settings.dynListAddEmptyValue}
`;
  files.push({ path: "README.md", content: readme });
  files.push({ path: "project.json", content: JSON.stringify(state, null, 2) });

  files.forEach((f) => zip.file(f.path, f.content));
  const blob = await zip.generateAsync({ type: "blob" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${(state.project.name || "alfresco-fragments")
    .replace(/[^\w\-]+/g, "_")}.zip`;
  a.click();
  URL.revokeObjectURL(a.href);
});

// -------------------- Init --------------------
loadState();
populateProjectForm();
renderProperties();
renderAssocs();
renderDyn();
buildAllPreviews();
// défauts pour le form assoc si navigateur a gardé un ancien état
$("#formAssoc select[name='sourceMany']").value ||= "true";
