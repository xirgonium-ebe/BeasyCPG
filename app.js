/* =====================================================
   STAR WARS ALFRESCO GENERATOR (v5.4)
   - Amélioration: Validation renforcée avec messages dans l'interface
   - Ajout: Aperçu en temps réel (debounced)
   - Amélioration: Gestion robuste des hash invalides
   - Amélioration: Accessibilité (ARIA)
   - Suppression: Redondances dans escXml
   ===================================================== */

const STORAGE_KEY = "alfresco_generator_project_starwars_v54";

// Utilitaire pour notifications
const notify = (message, type = "success") => {
  const notif = document.querySelector("#notification");
  if (!notif) return;
  notif.textContent = message;
  notif.className = `notification ${type}`;
  notif.style.display = "block";
  setTimeout(() => (notif.style.display = "none"), 3000);
};

// Utilitaire pour debounce
const debounce = (func, wait) => {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
};

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const ns = () => state.project.namespacePrefix || "ns";
const escXml = (s = "") =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

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
    console.warn("[state] parse error", e);
    notify("Erreur lors du chargement du projet", "error");
  }
}
function parsePastedSimple(text) {
  const rows = [];
  (text || "")
    .split(/\r?\n/)
    .forEach((line) => {
      const l = line.trim();
      if (!l) return;
      const sep = l.includes(":") ? ":" : l.includes(";") ? ";" : null;
      if (!sep) return;
      const [code, value] = l.split(sep);
      rows.push({ code: (code || "").trim(), value: (value || "").trim() });
    });
  return rows;
}

/* ================= State ================= */
const state = {
  project: {
    name: "",
    namespacePrefix: "swr",
    namespaceUri: "http://galactic.empire/swr/1.0",
    settings: {
      dynListConstraintQName: "fr.becpg.repo.dictionary.constraint.DynListConstraint",
      dynListPathParamName: "path",
      dynListConstraintTypeQName: "bcpg:listValue",
      dynListConstraintPropQName: "bcpg:lvValue",
      dynListAddEmptyValue: true,
      defaultLocale: "fr",
      includeContainers: true,
      containerProperties: true,
      containerAssociations: true,
      fieldSets: ["referentialData"],
    },
  },
  properties: [],
  associations: [],
  dynlists: [],
};

/* ================= Navigation ================= */
const Navigation = (() => {
  function ensureDefault() {
    const validTabs = ["tab-project", "tab-properties", "tab-assocs", "tab-dynlists", "tab-preview"];
    if (!location.hash || !validTabs.includes(location.hash.slice(1))) {
      location.replace("#tab-project");
    }
  }
  function setActive() {
    const hash = location.hash;
    $$(".tabs .tab").forEach((a) => a.setAttribute("aria-selected", a.getAttribute("href") === hash));
  }
  function bind() {
    ensureDefault();
    setActive();
    window.addEventListener("hashchange", setActive);
  }
  return { bind };
})();

/* ================= Project ================= */
const Project = (() => {
  function renderFieldSets() {
    const sets = state.project.settings.fieldSets || [];
    const ul = $("#ulFieldSets");
    if (ul) {
      ul.innerHTML = sets.map((s) => `<li>- ${escXml(s)}</li>`).join("");
    }
    $$("#formProperty select[name='fieldSet'], #formAssoc select[name='fieldSet']").forEach((sel) => {
      if (!sel) return;
      const prev = sel.value;
      sel.innerHTML = sets.map((fs) => `<option value="${escXml(fs)}">${escXml(fs)}</option>`).join("");
      sel.value = sets.includes(prev) ? prev : sets[0] || "";
    });
  }

  function populateForm() {
    const f = $("#formProject");
    if (!f) return;
    f.projectName.value = state.project.name || "";
    f.nsPrefix.value = state.project.namespacePrefix || "";
    f.nsUri.value = state.project.namespaceUri || "";
    f.dynQName.value = state.project.settings.dynListConstraintQName || "";
    f.dynPathParam.value = state.project.settings.dynListPathParamName || "path";
    f.defaultLocale.value = state.project.settings.defaultLocale || "fr";
    f.includeContainers.checked = !!state.project.settings.includeContainers;
    f.containerProperties.checked = !!state.project.settings.containerProperties;
    f.containerAssociations.checked = !!state.project.settings.containerAssociations;
    renderFieldSets();
  }

  function bind() {
    $("#formProject")?.addEventListener(
      "submit",
      (e) => {
        e.preventDefault();
        const f = e.currentTarget;
        if (!f.checkValidity()) {
          f.reportValidity();
          return;
        }
        state.project.name = f.projectName.value.trim();
        state.project.namespacePrefix = f.nsPrefix.value.trim();
        state.project.namespaceUri = f.nsUri.value.trim();
        state.project.settings.dynListConstraintQName = f.dynQName.value.trim() || "fr.becpg.repo.dictionary.constraint.DynListConstraint";
        state.project.settings.dynListPathParamName = f.dynPathParam.value.trim() || "path";
        state.project.settings.defaultLocale = f.defaultLocale.value.trim() || "fr";
        state.project.settings.includeContainers = f.includeContainers.checked;
        state.project.settings.containerProperties = f.containerProperties.checked;
        state.project.settings.containerAssociations = f.containerAssociations.checked;
        saveState();
        notify("Projet enregistré.");
        Preview.buildAll();
      }
    );

    $("#btnAddFieldSet")?.addEventListener("click", () => {
      const input = $("#formProject input[name='newFieldSet']");
      if (!input) return;
      const v = input.value.trim();
      if (!v) {
        notify("Nom de set requis.", "error");
        return;
      }
      const arr = state.project.settings.fieldSets;
      if (arr.some((s) => s.toLowerCase() === v.toLowerCase())) {
        notify("Nom de set déjà utilisé.", "error");
        return;
      }
      arr.push(v);
      saveState();
      renderFieldSets();
      input.value = "";
      notify("Set ajouté.");
    });

    // Aperçu en temps réel
    $("#formProject")?.addEventListener(
      "input",
      debounce(() => Preview.buildAll(), 300)
    );
  }

  return { populateForm, renderFieldSets, bind };
})();

/* ================= Properties ================= */
const Properties = (() => {
  let editingIndex = null;

  function feedDynSelect() {
    const sel = $("#formProperty select[name='linkDynList']");
    if (!sel) return;
    sel.innerHTML = `<option value="">— aucune —</option>` + state.dynlists.map((d) => `<option value="${escXml(d.listName)}">${escXml(d.listName)}</option>`).join("");
    if (editingIndex !== null) sel.value = state.properties[editingIndex]?.linkDynList || "";
  }

  function showConditionalBlocks() {
    const f = $("#formProperty");
    if (!f) return;
    const ctrl = f.fieldControl.value;
    $("#propAssocOptions").style.display = ctrl === "assoc-auto" ? "" : "none";
    $("#propNodeRefOptions").style.display = ctrl === "noderef-auto" ? "" : "none";
  }

  function resetForm() {
    const f = $("#formProperty");
    if (!f) return;
    f.reset();
    f.fieldControl.value = "auto";
    f.nrLevels.value = 1;
    f.showForceProp.checked = false;
    f.showForModeProp.checked = false;
    editingIndex = null;
    $("#btnSaveProp").textContent = "Ajouter propriété";
    $("#btnCancelProp").style.display = "none";
    showConditionalBlocks();
    feedDynSelect();
    if (state.project.settings.fieldSets.length) f.fieldSet.value = state.project.settings.fieldSets[0];
  }

  function fillForm(p) {
    const f = $("#formProperty");
    if (!f) return;
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
    f.linkDynList.value = p.linkDynList || "";
    f.showForceProp.checked = !!p.showForceProp;
    f.showForModeProp.checked = !!p.showForModeProp;
    showConditionalBlocks();
  }

  function render() {
    const tb = $("#tblProperties tbody");
    if (!tb) return;
    tb.innerHTML = state.properties
      .map(
        (p, i) => `
        <tr>
          <td><code>${ns()}:${escXml(p.qnameLocal)}</code></td>
          <td>${escXml(p.title || "")}</td>
          <td>${escXml(p.type)}</td>
          <td>${p.multiple ? "✓" : ""}</td>
          <td>${p.mandatoryModel ? "✓" : ""}</td>
          <td>${p.mandatoryForm ? "✓" : ""}</td>
          <td>${p.readOnlyForm ? "✓" : ""}</td>
          <td>${escXml(p.linkDynList || "")}</td>
          <td>${escXml(p.fieldSet || "")}</td>
          <td>
            <button class="btn" data-edit="${i}" aria-label="Éditer la propriété">✏️</button>
            <button class="btn btn-danger" data-del="${i}" aria-label="Supprimer la propriété">🗑️</button>
          </td>
        </tr>`
      )
      .join("");

    $$("#tblProperties [data-edit]").forEach((b) =>
      b.addEventListener("click", () => {
        editingIndex = Number(b.dataset.edit);
        fillForm(state.properties[editingIndex]);
        $("#btnSaveProp").textContent = "Mettre à jour";
        $("#btnCancelProp").style.display = "inline-block";
      })
    );
    $$("#tblProperties [data-del]").forEach((b) =>
      b.addEventListener("click", () => {
        const i = Number(b.dataset.del);
        state.properties.splice(i, 1);
        saveState();
        render();
        Preview.buildAll();
        if (editingIndex === i) resetForm();
        notify("Propriété supprimée.");
      })
    );
  }

  function bind() {
    $("#formProperty select[name='fieldControl']")?.addEventListener("change", showConditionalBlocks);
    $("#btnCancelProp")?.addEventListener("click", resetForm);

    $("#formProperty")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const f = e.currentTarget;
      if (!f.checkValidity()) {
        f.reportValidity();
        return;
      }
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
        showForceProp: f.showForceProp.checked,
        showForModeProp: f.showForModeProp.checked,
      };
      if (state.properties.some((p) => p.qnameLocal === prop.qnameLocal && editingIndex !== state.properties.indexOf(p))) {
        notify("Nom technique déjà utilisé.", "error");
        return;
      }
      if (editingIndex === null) {
        state.properties.push(prop);
        notify("Propriété ajoutée.");
      } else {
        state.properties[editingIndex] = prop;
        notify("Propriété mise à jour.");
      }
      saveState();
      render();
      Preview.buildAll();
      resetForm();
    });

    $("#formProperty")?.addEventListener(
      "input",
      debounce(() => Preview.buildAll(), 300)
    );
  }

  return { render, bind, resetForm, feedDynSelect };
})();

/* ================= Associations ================= */
const Assocs = (() => {
  let editingIndex = null;

  function resetForm() {
    const f = $("#formAssoc");
    if (!f) return;
    f.reset();
    f.sourceMany.value = "true";
    f.targetMany.value = "false";
    editingIndex = null;
    $("#btnCancelAssoc").style.display = "none";
  }

  function fillForm(a) {
    const f = $("#formAssoc");
    if (!f) return;
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

  function render() {
    const tb = $("#tblAssocs tbody");
    if (!tb) return;
    tb.innerHTML = state.associations
      .map(
        (a, i) => `
        <tr>
          <td><code>${ns()}:${escXml(a.qnameLocal)}</code></td>
          <td>${escXml(a.title || "")}</td>
          <td>${escXml(a.targetClass)}</td>
          <td>${a.sourceMany ? "✓" : ""}</td>
          <td>${a.targetMany ? "✓" : ""}</td>
          <td>${a.mandatoryModel ? "✓" : ""}</td>
          <td>${a.mandatoryForm ? "✓" : ""}</td>
          <td>${escXml(a.fieldSet || "")}</td>
          <td>
            <button class="btn" data-edit="${i}" aria-label="Éditer l'association">✏️</button>
            <button class="btn btn-danger" data-del="${i}" aria-label="Supprimer l'association">🗑️</button>
          </td>
        </tr>`
      )
      .join("");

    $$("#tblAssocs [data-edit]").forEach((b) =>
      b.addEventListener("click", () => {
        editingIndex = Number(b.dataset.edit);
        fillForm(state.associations[editingIndex]);
        $("#btnCancelAssoc").style.display = "inline-block";
      })
    );
    $$("#tblAssocs [data-del]").forEach((b) =>
      b.addEventListener("click", () => {
        const i = Number(b.dataset.del);
        state.associations.splice(i, 1);
        saveState();
        render();
        Preview.buildAll();
        if (editingIndex === i) resetForm();
        notify("Association supprimée.");
      })
    );
  }

  function bind() {
    $("#btnCancelAssoc")?.addEventListener("click", resetForm);
    $("#formAssoc")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const f = e.currentTarget;
      if (!f.checkValidity()) {
        f.reportValidity();
        return;
      }
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
        assocPageLinkTemplate: f.assocPageLinkTemplate.value.trim(),
      };
      if (state.associations.some((a) => a.qnameLocal === assoc.qnameLocal && editingIndex !== state.associations.indexOf(a))) {
        notify("Nom technique déjà utilisé.", "error");
        return;
      }
      if (editingIndex === null) {
        state.associations.push(assoc);
        notify("Association ajoutée.");
      } else {
        state.associations[editingIndex] = assoc;
        notify("Association mise à jour.");
      }
      saveState();
      render();
      Preview.buildAll();
      resetForm();
    });

    $("#formAssoc")?.addEventListener(
      "input",
      debounce(() => Preview.buildAll(), 300)
    );
  }

  return { render, bind, resetForm };
})();

/* ================= DynLists ================= */
const Dyn = (() => {
  let editingIndex = null;
  let lastParsed = [];

  function resetForm() {
    const f = $("#formDyn");
    if (!f) return;
    f.reset();
    editingIndex = null;
    lastParsed = [];
    $("#btnCancelDyn").style.display = "none";
  }

  function render() {
    const tb = $("#tblDyn tbody");
    if (!tb) return;
    tb.innerHTML = state.dynlists
      .map(
        (d, i) => `
        <tr>
          <td><code>${escXml(d.listName)}</code></td>
          <td>${escXml(d.listPath)}</td>
          <td>${d.entries.length}</td>
          <td>
            <button class="btn" data-edit="${i}" aria-label="Éditer la DynList">✏️</button>
            <button class="btn btn-danger" data-del="${i}" aria-label="Supprimer la DynList">🗑️</button>
          </td>
        </tr>`
      )
      .join("");

    $$("#tblDyn [data-edit]").forEach((b) =>
      b.addEventListener("click", () => {
        editingIndex = Number(b.dataset.edit);
        const d = state.dynlists[editingIndex];
        const f = $("#formDyn");
        f.listName.value = d.listName;
        f.listPath.value = d.listPath;
        f.pasted.value = d.entries.map((e) => `${e.code || ""}:${e.value || ""}`).join("\n");
        lastParsed = d.entries.slice();
        $("#btnCancelDyn").style.display = "inline-block";
        Properties.feedDynSelect();
      })
    );
    $$("#tblDyn [data-del]").forEach((b) =>
      b.addEventListener("click", () => {
        const i = Number(b.dataset.del);
        state.dynlists.splice(i, 1);
        saveState();
        render();
        Properties.feedDynSelect();
        Preview.buildAll();
        resetForm();
        notify("DynList supprimée.");
      })
    );
  }

  function bind() {
    const form = $("#formDyn");
    const btnParse = $("#btnParseDyn");
    const btnAdd = $("#btnInlineAdd");
    const btnCancel = $("#btnCancelDyn");

    btnParse?.addEventListener("click", () => {
      try {
        lastParsed = parsePastedSimple(form.pasted?.value || "");
        notify(`Analyse OK : ${lastParsed.length} ligne(s).`);
      } catch (err) {
        console.error("[Dyn] parse error", err);
        notify("Erreur d'analyse DynList", "error");
      }
    });

    btnAdd?.addEventListener("click", () => {
      try {
        const e = { code: (form.il_code?.value || "").trim(), value: (form.il_value?.value || "").trim() };
        if (!e.code && !e.value) {
          notify("Code ou valeur requis.", "error");
          return;
        }
        lastParsed.push(e);
        if (form.il_code) form.il_code.value = "";
        if (form.il_value) form.il_value.value = "";
        notify("Ligne ajoutée.");
      } catch (err) {
        console.error("[Dyn] inline add error", err);
        notify("Erreur d'ajout inline", "error");
      }
    });

    btnCancel?.addEventListener("click", resetForm);

    form?.addEventListener("submit", (e) => {
      e.preventDefault();
      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }
      const listName = (form.listName?.value || "").trim();
      const listPath = (form.listPath?.value || "").trim();
      if (!listName || !listPath) {
        notify("Nom et path requis.", "error");
        return;
      }
      if (!lastParsed.length && (form.pasted?.value || "").trim().length) {
        lastParsed = parsePastedSimple(form.pasted.value);
      }
      if (state.dynlists.some((d) => d.listName === listName && editingIndex !== state.dynlists.indexOf(d))) {
        notify("Nom de liste déjà utilisé.", "error");
        return;
      }
      if (editingIndex === null) {
        state.dynlists.push({ listName, listPath, entries: lastParsed.slice() });
        notify("DynList ajoutée.");
      } else {
        state.dynlists[editingIndex] = { listName, listPath, entries: lastParsed.slice() };
        notify("DynList mise à jour.");
      }
      saveState();
      render();
      Properties.feedDynSelect();
      Preview.buildAll();
      resetForm();
    });

    form?.addEventListener(
      "input",
      debounce(() => Preview.buildAll(), 300)
    );
  }

  return { render, bind, resetForm };
})();

/* ================= Preview ================= */
const Preview = (() => {
  const constraintNameForList = (listName) => `${ns()}:${listName}Constraint`;

  function buildModelProperties(includeContainers) {
    const out = [];
    if (includeContainers && state.project.settings.containerProperties) out.push("<properties>");
    state.properties.forEach((p) => {
      out.push(`  <property name="${ns()}:${escXml(p.qnameLocal)}">`);
      out.push(`    <type>${escXml(p.type)}</type>`);
      out.push(`    <multiple>${p.multiple}</multiple>`);
      out.push(`    <mandatory>${!!p.mandatoryModel}</mandatory>`);
      if (p.default !== undefined && p.default !== null && String(p.default).length) {
        out.push(`    <default>${escXml(p.default)}</default>`);
      }
      if (p.linkDynList && state.dynlists.some((d) => d.listName === p.linkDynList)) {
        const refName = constraintNameForList(p.linkDynList);
        out.push(`    <constraints>`);
        out.push(`      <constraint ref="${escXml(refName)}" />`);
        out.push(`    </constraints>`);
      }
      out.push(`  </property>`);
    });
    if (includeContainers && state.project.settings.containerProperties) out.push("</properties>");
    return out.join("\n");
  }

  function buildModelAssociations(includeContainers) {
    const out = [];
    if (includeContainers && state.project.settings.containerAssociations) out.push("<associations>");
    state.associations.forEach((a) => {
      out.push(`  <association name="${ns()}:${escXml(a.qnameLocal)}">`);
      if (a.title) out.push(`    <title>${escXml(a.title)}</title>`);
      out.push(`    <source>`);
      out.push(`      <mandatory>${!!a.mandatoryModel}</mandatory>`);
      out.push(`      <many>${!!a.sourceMany}</many>`);
      out.push(`    </source>`);
      out.push(`    <target>`);
      out.push(`      <class>${escXml(a.targetClass)}</class>`);
      out.push(`      <mandatory>false</mandatory>`);
      out.push(`      <many>${!!a.targetMany}</many>`);
      out.push(`    </target>`);
      out.push(`  </association>`);
    });
    if (includeContainers && state.project.settings.containerAssociations) out.push("</associations>");
    return out.join("\n");
  }

  function buildConstraints(includeContainers) {
    if (!state.dynlists.length) return "";
    const out = [];
    if (includeContainers) out.push("<constraints>");
    state.dynlists.forEach((d) => {
      const name = constraintNameForList(d.listName);
      out.push(`  <constraint name="${escXml(name)}" type="${escXml(state.project.settings.dynListConstraintQName)}">`);
      out.push(`    <parameter name="${escXml(state.project.settings.dynListPathParamName)}"><list><value>${escXml(d.listPath)}</value></list></parameter>`);
      out.push(`    <parameter name="constraintType"><value>${escXml(state.project.settings.dynListConstraintTypeQName)}</value></parameter>`);
      out.push(`    <parameter name="constraintProp"><value>${escXml(state.project.settings.dynListConstraintPropQName)}</value></parameter>`);
      out.push(`    <parameter name="addEmptyValue"><value>${state.project.settings.dynListAddEmptyValue ? "true" : "false"}</value></parameter>`);
      out.push(`  </constraint>`);
    });
    if (includeContainers) out.push("</constraints>");
    return out.join("\n");
  }

  function buildShow() {
    const out = [];
    state.properties.forEach((p) => {
      const id = `${ns()}:${escXml(p.qnameLocal)}`;
      const attrs = [];
      if (p.showForceProp) attrs.push(`force="true"`);
      if (p.showForModeProp) attrs.push(`for-mode="true"`);
      const a = attrs.length ? " " + attrs.join(" ") : "";
      out.push(`<show id="${id}"${a} />`);
    });
    state.associations.forEach((a) => {
      const id = `${ns()}:${escXml(a.qnameLocal)}`;
      out.push(`<show id="${id}" />`);
    });
    return out.join("\n");
  }

  function buildField() {
    const out = [];
    const fieldAttrs = (x) => {
      const arr = [];
      arr.push(`mandatory="${x.mandatoryForm ? "true" : "false"}"`);
      arr.push(`read-only="${x.readOnlyForm ? "true" : "false"}"`);
      if (x.fieldSet) arr.push(`set="${escXml(x.fieldSet)}"`);
      if (x.labelId) arr.push(`label-id="${escXml(x.labelId)}"`);
      return arr.join(" ");
    };

    state.properties.forEach((p) => {
      const id = `${ns()}:${escXml(p.qnameLocal)}`;
      if (p.type === "d:nodeRef" && p.fieldControl === "noderef-auto") {
        const levels = Math.max(1, Number(p.nrLevels) || 1);
        const ds = p.nrDs || "";
        for (let i = 0; i < levels; i++) {
          const suffix = i === 0 ? "Lvl0" : `Lvl${i}`;
          const fieldId = levels > 1 ? `${id}${suffix}` : id;
          const attrs = fieldAttrs(p);
          out.push(`  <field id="${fieldId}" ${attrs}>`);
          out.push(`    <control template="/org/alfresco/components/form/controls/autocomplete.ftl">`);
          if (ds) out.push(`      <control-param name="ds">${escXml(ds)}</control-param>`);
          if (i > 0) {
            const parentUnderscore = levels > 1 ? `${ns().replace(":", "_")}_${p.qnameLocal}${i === 1 ? "Lvl0" : `Lvl${i - 1}`}` : id.replace(":", "_");
            out.push(`      <control-param name="parent">${escXml(parentUnderscore)}</control-param>`);
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
        out.push(`    <control template="/org/alfresco/components/form/controls/textfield.ftl">`);
        if (p.maxLength) out.push(`      <control-param name="maxLength">${p.maxLength}</control-param>`);
        out.push(`    </control>`);
      } else if (control === "textarea") {
        out.push(`    <control template="/org/alfresco/components/form/controls/textarea.ftl"></control>`);
      } else if (control === "assoc-auto") {
        out.push(`    <control template="/org/alfresco/components/form/controls/autocomplete-association.ftl">`);
        if (p.assocDs) out.push(`      <control-param name="ds">${escXml(p.assocDs)}</control-param>`);
        if (p.assocPageLinkTemplate) out.push(`      <control-param name="pageLinkTemplate">${escXml(p.assocPageLinkTemplate)}</control-param>`);
        out.push(`    </control>`);
      } else if (p.type === "d:text" && p.maxLength) {
        out.push(`    <control template="/org/alfresco/components/form/controls/textfield.ftl">`);
        out.push(`      <control-param name="maxLength">${p.maxLength}</control-param>`);
        out.push(`    </control>`);
      }
      out.push(`  </field>`);
    });

    state.associations.forEach((a) => {
      const id = `${ns()}:${escXml(a.qnameLocal)}`;
      const attrs = fieldAttrs(a);
      out.push(`  <field id="${id}" ${attrs}>`);
      out.push(`    <control template="/org/alfresco/components/form/controls/autocomplete-association.ftl">`);
      if (a.assocDs) out.push(`      <control-param name="ds">${escXml(a.assocDs)}</control-param>`);
      if (a.assocPageLinkTemplate) out.push(`      <control-param name="pageLinkTemplate">${escXml(a.assocPageLinkTemplate)}</control-param>`);
      out.push(`      <control-param name="allowMultipleSelections">${a.targetMany ? "true" : "false"}</control-param>`);
      out.push(`    </control>`);
      out.push(`  </field>`);
    });

    return out.join("\n");
  }

  function buildAll() {
    const include = !!state.project.settings.includeContainers;
    $("#outProps").value = buildModelProperties(include);
    $("#outAssocs").value = buildModelAssociations(include);
    $("#outConstraints").value = buildConstraints(include);
    $("#outShow").value = buildShow();
    $("#outField").value = buildField();
  }

  return { buildAll };
})();

/* ================= IO (export/import/CSV) ================= */
const IO = (() => {
  const DYNLIST_CSV_INCLUDE_HEADER = true;
  const DYNLIST_CSV_HEADER_FN = (list) =>
    [
      `# DynList: ${escXml(list.listName)}`,
      `# Path: ${escXml(list.listPath)}`,
      `# Rows: ${list.entries.length}`,
      `# Format: code:value`,
    ].join("\n");

  function bind() {
    $$(".btn-copy").forEach((b) =>
      b.addEventListener("click", async () => {
        const sel = b.getAttribute("data-copy");
        const el = sel ? $(sel) : null;
        if (!el) return;
        await navigator.clipboard.writeText(el.value || el.textContent || "");
        const old = b.textContent;
        b.textContent = "Copié !";
        setTimeout(() => (b.textContent = old), 900);
        notify("Texte copié.");
      })
    );

    $("#btnExportJSON")?.addEventListener("click", () => {
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = (state.project.name || "project") + ".json";
      a.click();
      URL.revokeObjectURL(a.href);
      notify("Projet exporté en JSON.");
    });

    $("#fileImportJSON")?.addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const obj = JSON.parse(await file.text());
        Object.assign(state.project, obj.project || {});
        state.properties = obj.properties || [];
        state.associations = obj.associations || [];
        state.dynlists = obj.dynlists || [];
        saveState();
        Project.populateForm();
        Properties.render();
        Assocs.render();
        Dyn.render();
        Properties.feedDynSelect();
        Preview.buildAll();
        notify("Projet importé.");
      } catch (err) {
        notify("Fichier JSON invalide.", "error");
      }
      e.target.value = "";
    });

    $("#btnExportDynCSVs")?.addEventListener("click", () => {
      if (!state.dynlists.length) {
        notify("Aucune DynList à exporter.", "error");
        return;
      }
      state.dynlists.forEach((list) => {
        const lines = [];
        if (DYNLIST_CSV_INCLUDE_HEADER) {
          lines.push(DYNLIST_CSV_HEADER_FN(list));
        }
        list.entries.forEach((e) => {
          const code = (e.code ?? "").toString().trim();
          const value = (e.value ?? "").toString().trim();
          lines.push(`${code}:${value}`);
        });
        const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `${list.listName}.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
      });
      notify("DynLists exportées en CSV.");
    });

    $("#btnReset")?.addEventListener("click", () => {
      if (!confirm("Réinitialiser le projet (localStorage) ?")) return;
      localStorage.removeItem(STORAGE_KEY);
      location.reload();
    });
  }
  return { bind };
})();

/* ================= INIT ================= */
document.addEventListener("DOMContentLoaded", () => {
  try {
    loadState();
    Project.populateForm();
    Project.bind();
    Properties.bind();
    Properties.resetForm();
    Properties.render();
    Assocs.bind();
    Assocs.resetForm();
    Assocs.render();
    Dyn.bind();
    Dyn.resetForm();
    Dyn.render();
    IO.bind();
    Navigation.bind();
    Preview.buildAll();
    $("#formAssoc select[name='sourceMany']")?.value ||= "true";
  } catch (e) {
    console.error("[init] erreur de démarrage:", e);
    notify("Erreur de démarrage de l'application.", "error");
  }
});
