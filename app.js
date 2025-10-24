/* Holocron — Générateur de balises Alfresco
   app.js — Vanilla JS, sans dépendances.
   DB locale: IndexedDB (holocron-db) avec stores: projects, dynlists, settings, versions
*/

(() => {
  "use strict";

  /***********************
   * Utilitaires généraux
   ***********************/
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

  const Toast = (() => {
    const el = $("#toast");
    let timer;
    return {
      show(msg, type = "info", timeout = 2200) {
        el.textContent = msg;
        el.className = `toast ${type}`;
        el.style.display = "block";
    const tpl = $("#tpl-item-row");
    (currentProject?.assocs || []).forEach((a, idx) => {
      const li = tpl.content.cloneNode(true);
      $(".item-label", li).textContent = `${a.tech} — ${a.targetClass} (S:${a.sourceMany ? "many" : "one"} / T:${a.targetMany ? "many" : "one"})`;
      const row = li.querySelector("li");
      $(".edit", row).addEventListener("click", () => {
        $("#assocTechName").value = a.tech;
        $("#assocTitle").value = a.title || "";
        $("#assocTargetClass").value = a.targetClass || "";
        $("#assocSourceMany").checked = !!a.sourceMany;
        $("#assocTargetMany").checked = !!a.targetMany;

        refreshSetSelects();
        setSelectValueOrAppend($("#assocSet"), a.field?.set || "mainInfo");

        $("#assocHelpId").value = a.field?.helpId || "";
        $("#assocPageLink").value = a.field?.pageLinkTemplate || "";
        $("#assocDs").value = a.field?.ds || "";
      });
      $(".del", row).addEventListener("click", () => {
        if (!confirm(`Supprimer l'association "${a.tech}" ?`)) return;
        currentProject.assocs.splice(idx, 1);
        renderAssocList();
        autoSave();
        generateAll();
      });
      ul.appendChild(li);
    });
  }

  function initAssocForm() {
    // NEW — boutons "Valeur par défaut"
    $("#btnFillAssocPageLink")?.addEventListener("click", () => fillDefaultFromPlaceholder("#assocPageLink"));
    $("#btnFillAssocDs")?.addEventListener("click", () => fillDefaultFromPlaceholder("#assocDs"));

    $("#addAssocBtn").addEventListener("click", () => {
      if (!currentProject) currentProject = emptyProject();
      const obj = assocFormToObject();
      if (!obj.tech) return Toast.show("Nom technique requis", "warn");
      const existsIdx = currentProject.assocs.findIndex((x) => x.tech === obj.tech);
      if (existsIdx >= 0) currentProject.assocs[existsIdx] = obj;
      else currentProject.assocs.push(obj);

      renderAssocList();
      autoSave();
      generateAll();
      Toast.show("Association ajoutée/mise à jour ✅");
    });
  }

  /***********************
   * DYNLISTS — CRUD
   ***********************/
  function dynFormToObject() {
    const techName = $("#dynTechName").value.trim();
    const displayName = $("#dynDisplayName").value.trim();
    let path = $("#dynPath").value.trim();
    if (!path && techName) path = `/System/Lists/bcpg:entityLists/${techName}`;
    const addEmptyValue = $("#dynAddEmpty").checked;
    let constraintName = $("#dynConstraintName").value.trim();
    if (!constraintName && currentProject && techName) {
      constraintName = `${currentProject.namespace}:${techName}Constraint`;
    }
    const items = readDynEditorRows();
    return {
      id: `list_${techName}`,
      techName,
      displayName,
      path,
      addEmptyValue,
      constraintName,
      items,
    };
  }

  function readDynEditorRows() {
    const rows = $$("#dynForm .table-editor .row");
    const items = [];
    rows.forEach((r) => {
      const code = $(".cell.code", r).value.trim();
      const value = $(".cell.value", r).value.trim();
      if (code || value) items.push({ code, value });
    });
    return items;
  }

  function renderDynList() {
    const ul = $("#dynList");
    ul.innerHTML = "";
    const tpl = $("#tpl-item-row");
    (currentProject?.dynlists || []).forEach((d, idx) => {
      const li = tpl.content.cloneNode(true);
      $(".item-label", li).textContent = `${d.techName} — ${d.displayName || "(sans titre)"} — ${d.items?.length || 0} valeurs`;
      const row = li.querySelector("li");
      $(".edit", row).addEventListener("click", () => {
        $("#dynTechName").value = d.techName;
        $("#dynDisplayName").value = d.displayName || "";
        $("#dynPath").value = d.path || "";
        $("#dynAddEmpty").checked = !!d.addEmptyValue;
        $("#dynConstraintName").value = d.constraintName || "";
        const editor = $("#dynForm .table-editor");
        editor.innerHTML = "";
        (d.items || []).forEach((it) => addDynEditorRow(it.code, it.value));
        if ((d.items || []).length === 0) addDynEditorRow("", "");
      });
      $(".del", row).addEventListener("click", () => {
        if (!confirm(`Supprimer la liste "${d.techName}" ?`)) return;
        currentProject.dynlists.splice(idx, 1);
        renderDynList();
        refreshDynlistSelects();
        autoSave();
        generateAll();
      });
      ul.appendChild(li);
    });
    refreshDynlistSelects();
  }

  function addDynEditorRow(code = "", value = "") {
    const editor = $("#dynForm .table-editor");
    const div = document.createElement("div");
    div.className = "row";
    div.innerHTML = `
      <input class="cell code" type="text" placeholder="LVL_PADAWAN" value="${escapeHtml(code)}" />
      <input class="cell value" type="text" placeholder="Padawan" value="${escapeHtml(value)}" />
      <button type="button" class="row-del btn small danger" title="Supprimer">✖</button>
    `;
    $(".row-del", div).addEventListener("click", () => div.remove());
    editor.appendChild(div);
  }

  function initDynForm() {
    $("#dynAddRowBtn").addEventListener("click", () => addDynEditorRow());

    $("#dynCsvPaste").addEventListener("paste", (e) => {
      setTimeout(() => {
        const ta = e.target;
        ta.value = normalizeCsvSeparatorToSemicolon(ta.value);
        const lines = ta.value.split(/\r?\n/).filter((l) => l.trim());
        const editor = $("#dynForm .table-editor");
        editor.innerHTML = "";
        lines.forEach((line) => {
          if (line.trim().startsWith("#")) return;
          const parts = line.split(";");
          if (parts.length >= 2) {
            addDynEditorRow(parts[0].trim(), parts[1].trim());
          }
        });
      }, 0);
    });

    // NEW — bouton "Valeur par défaut" avec logique spéciale
    $("#btnFillDynPath")?.addEventListener("click", () => {
      const tech = $("#dynTechName").value.trim();
      const input = $("#dynPath");
      const current = input.value.trim();
      if (tech && !current) {
        input.value = `/System/Lists/bcpg:entityLists/${tech}`;
      } else {
        fillDefaultFromPlaceholder("#dynPath");
      }
    });

    $("#addDynBtn").addEventListener("click", () => {
      if (!currentProject) currentProject = emptyProject();
      const obj = dynFormToObject();
      if (!obj.techName) return Toast.show("Nom technique de la liste requis", "warn");
      const idx = currentProject.dynlists.findIndex((x) => x.techName === obj.techName);
      if (idx >= 0) currentProject.dynlists[idx] = obj;
      else currentProject.dynlists.push(obj);

      renderDynList();
      refreshDynlistSelects();
      autoSave();
      generateAll();
      Toast.show("Dynlist ajoutée/mise à jour ✅");
    });
  }

  function refreshDynlistSelects() {
    const sel = $("#propDynlistSelect");
    if (sel) {
      sel.innerHTML = `<option value="">— aucune —</option>`;
      (currentProject?.dynlists || []).forEach((d) => {
        const opt = document.createElement("option");
        opt.value = d.techName;
        opt.textContent = `${d.techName} (${d.displayName || "—"})`;
        sel.appendChild(opt);
      });
    }
    const sel2 = $("#csvOneConstraint");
    if (sel2) {
      sel2.innerHTML = `<option value="">— sélectionner une dynlist —</option>`;
      (currentProject?.dynlists || []).forEach((d) => {
        const opt = document.createElement("option");
        opt.value = d.techName;
        opt.textContent = `${d.techName} (${d.displayName || "—"})`;
        sel2.appendChild(opt);
      });
    }
    const cont = $("#gen-imports-list");
    if (cont) {
      cont.innerHTML = "";
      (currentProject?.dynlists || []).forEach((d) => {
        const btn = document.createElement("button");
        btn.className = "btn xsmall";
        btn.textContent = `⬇️ ${d.techName}.csv`;
        btn.addEventListener("click", () => downloadCsvForList(d));
        cont.appendChild(btn);
      });
    }
  }

  /***********************
   * GÉNÉRATION — builders
   ***********************/
  function generateAll() {
    $("#gen-model-constraints").value = buildModelConstraints();
    $("#gen-model-properties").value = buildModelProperties();
    $("#gen-model-associations").value = buildModelAssociations();

    $("#gen-form-fields").value = buildFormFields();
    $("#gen-form-shows").value = buildFormShows();
  }

  function nsId(tech) {
    const ns = currentProject?.namespace || "jdi";
    return `${ns}:${tech}`;
  }

  function buildModelConstraints() {
    if (!currentProject) return "";
    const lines = [];
    (currentProject.dynlists || []).forEach((d) => {
      const addEmpty = d.addEmptyValue ? "true" : "false";
      const cName = d.constraintName || `${currentProject.namespace}:${d.techName}Constraint`;
      lines.push(
        `\t<constraint name="${cName}" type="fr.becpg.repo.dictionary.constraint.DynListConstraint">`,
        `\t\t<parameter name="path">`,
        `\t\t\t<list>`,
        `\t\t\t\t<value>${d.path}</value>`,
        `\t\t\t</list>`,
        `\t\t</parameter>`,
        `\t\t<parameter name="constraintType">`,
        `\t\t\t<value>bcpg:listValue</value>`,
        `\t\t</parameter>`,
        `\t\t<parameter name="constraintProp">`,
        `\t\t\t<value>bcpg:lvValue</value>`,
        `\t\t</parameter>`,
        `\t\t<parameter name="addEmptyValue">`,
        `\t\t\t<value>${addEmpty}</value>`,
        `\t\t</parameter>`,
        `\t</constraint>`
      );
    });

    const wrap = currentProject?.options?.includeContainers;
    if (wrap && lines.length) {
      return `<constraints>\n${lines.join("\n")}\n</constraints>`;
    }
    return lines.join("\n");
  }

  function buildModelProperties() {
    if (!currentProject) return "";
    const items = (currentProject.props || []).map((p) => {
      const name = nsId(p.tech);
      const mandatory = p.general?.mandatoryModel ? `\n\t\t\t<mandatory>true</mandatory>` : "";
      let constraint = "";
      if (p.type === "d:text" && p.field?.dynlistId) {
        const dl = (currentProject.dynlists || []).find((d) => d.techName === p.field.dynlistId);
        if (dl) {
          const cName = dl.constraintName || `${currentProject.namespace}:${dl.techName}Constraint`;
          constraint = `\n\t\t\t<constraints>\n\t\t\t\t<constraint ref="${cName}" />\n\t\t\t</constraints>`;
        }
      }
      return `\t<property name="${name}">\n\t\t<title>${escapeXml(p.title || p.tech)}</title>\n\t\t<type>${p.type}</type>${mandatory}${constraint}\n\t</property>`;
    });

    const wrap = currentProject?.options?.includeContainers;
    if (wrap && items.length) return `<properties>\n${items.join("\n")}\n</properties>`;
    return items.join("\n");
  }

  function buildModelAssociations() {
    if (!currentProject) return "";
    const items = (currentProject.assocs || []).map((a) => {
      const name = nsId(a.tech);
      return [
        `\t<association name="${name}">`,
        `\t\t<title>${escapeXml(a.title || a.tech)}</title>`,
        `\t\t<source>`,
        `\t\t\t<mandatory>false</mandatory>`,
        `\t\t\t<many>${a.sourceMany ? "true" : "false"}</many>`,
        `\t\t</source>`,
        `\t\t<target>`,
        `\t\t\t<class>${escapeXml(a.targetClass || "cm:content")}</class>`,
        `\t\t\t<mandatory enforced="false">false</mandatory>`,
        `\t\t\t<many>${a.targetMany ? "true" : "false"}</many>`,
        `\t\t</target>`,
        `\t</association>`,
      ].join("\n");
    });

    const wrap = currentProject?.options?.includeContainers;
    if (wrap && items.length) return `<associations>\n${items.join("\n")}\n</associations>`;
    return items.join("\n");
  }

  function buildFormFields() {
    if (!currentProject) return "";
    const ns = currentProject.namespace || "jdi";
    const sets = (s) => (s && s.trim() ? s.trim() : "mainInfo");

    const propFields = (currentProject.props || []).map((p) => {
      const id = nsId(p.tech);
      const attrs = [];
      if (p.field?.mandatoryField) attrs.push(`mandatory="true"`);
      if (p.field?.readOnly) attrs.push(`read-only="true"`);
      attrs.push(`set="${escapeXml(sets(p.field?.set))}"`);
      const help = p.field?.helpId ? ` help="${escapeXml(p.field.helpId)}"` : "";
      let inner = "";

      if (p.type === "d:text" && p.field?.textareaRows) {
        inner = [
          `\t\t<control template="/org/alfresco/components/form/controls/textarea.ftl">`,
          `\t\t\t<control-param name="rows">${p.field.textareaRows}</control-param>`,
          `\t\t</control>`,
        ].join("\n");
      } else if (p.type === "d:noderef" && p.field?.autocompleteDs && !p.hierarchy) {
        inner = [
          `\t\t<control template="/org/alfresco/components/form/controls/autocomplete.ftl">`,
          `\t\t\t<control-param name="ds">${escapeXml(p.field.autocompleteDs)}</control-param>`,
          `\t\t</control>`,
        ].join("\n");
      } else if (p.type === "d:noderef" && p.hierarchy) {
        return null;
      }

      return `\t<field id="${id}"${help}${attrs.length ? " " + attrs.join(" ") : ""}>${inner ? "\n" + inner + "\n\t" : ""}</field>`;
    }).filter(Boolean);

    const hierFields = [];
    (currentProject.props || [])
      .filter((p) => p.type === "d:noderef" && p.hierarchy)
      .forEach((p) => {
        const set = escapeXml(sets(p.field?.set));
        const help = p.field?.helpId ? ` help-id="${escapeXml(p.field.helpId)}"` : "";
        const ds = escapeXml(p.hierarchy.ds);
        const levels = p.hierarchy.levels || [];
        levels.forEach((lvl, i) => {
          const fieldId = `${ns}:${lvl.id}`;
          const inner = [
            `\t\t<control template="/org/alfresco/components/form/controls/autocomplete.ftl">`,
            `\t\t\t<control-param name="ds">${ds}</control-param>`,
          ];
          if (i > 0) {
            const prev = levels[i - 1].id;
            const parentRef = `${ns}_${prev.replace(/:/g, "_")}`;
            inner.push(`\t\t\t<control-param name="parent">${parentRef}</control-param>`);
          }
          inner.push(`\t\t</control>`);
          hierFields.push(`\t<field id="${fieldId}"${help} set="${set}">\n${inner.join("\n")}\n\t</field>`);
        });
      });

    const assocFields = (currentProject.assocs || []).map((a) => {
      const id = nsId(a.tech);
      const help = a.field?.helpId ? ` help-id="${escapeXml(a.field.helpId)}"` : "";
      const set = escapeXml(a.field?.set || "mainInfo");
      const ds = escapeXml(a.field?.ds || "");
      const pageLink = a.field?.pageLinkTemplate
        ? `\n\t\t\t<control-param name="pageLinkTemplate">${escapeXml(a.field.pageLinkTemplate)}</control-param>`
        : "";
      return [
        `\t<field id="${id}"${help} set="${set}">`,
        `\t\t<control template="/org/alfresco/components/form/controls/autocomplete-association.ftl">`,
        `\t\t\t<control-param name="ds">${ds}</control-param>${pageLink}`,
        `\t\t</control>`,
        `\t</field>`,
      ].join("\n");
    });

    return [...propFields, ...hierFields, ...assocFields].join("\n");
  }

  function buildFormShows() {
    if (!currentProject) return "";
    const ns = currentProject.namespace || "jdi";
    const items = (currentProject.props || []).map((p) => {
      const id = `${ns}:${p.tech}`;
      const attrs = [];
      if (p.show?.forView) attrs.push(`for-mode="view"`);
      if (p.show?.force) attrs.push(`force="true"`);
      return `\t<show id="${id}"${attrs.length ? " " + attrs.join(" ") : ""} />`;
    });
    return items.join("\n");
  }

  /***********************
   * EXPORT / IMPORT
   ***********************/
  function buildProjectJSON() {
    return JSON.stringify(currentProject || emptyProject(), null, 2);
  }

  function initExportImport() {
    $("#exportProjectBtn").addEventListener("click", () => {
      const name = (currentProject?.name || "project").replace(/\s+/g, "_");
      downloadText(`${name}.json`, buildProjectJSON());
    });

    $("#importFile").addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const text = await file.text();
      importProjectFromJSON(text);
    });

    const drop = $("#importDrop");
    drop.addEventListener("dragover", (e) => {
      e.preventDefault();
      drop.classList.add("dragover");
    });
    drop.addEventListener("dragleave", () => drop.classList.remove("dragover"));
    drop.addEventListener("drop", async (e) => {
      e.preventDefault();
      drop.classList.remove("dragover");
      const file = e.dataTransfer.files?.[0];
      if (!file) return;
      const text = await file.text();
      importProjectFromJSON(text);
    });

    $("#downloadAllCsvBtn").addEventListener("click", () => {
      (currentProject?.dynlists || []).forEach(downloadCsvForList);
    });

    $("#downloadOneCsvBtn").addEventListener("click", () => {
      const tech = $("#csvOneConstraint").value;
      if (!tech) return;
      const d = (currentProject?.dynlists || []).find((x) => x.techName === tech);
      if (d) downloadCsvForList(d);
    });
  }

  function importProjectFromJSON(text) {
    try {
      const obj = JSON.parse(text);
      if (!obj.id) obj.id = `p_${Date.now()}`;
      currentProject = obj;
      DB.put(STORE_PROJECTS, currentProject).then(() => {
        loadProjectIntoForm();
        refreshProjectPicker();
        Toast.show("Projet importé ✅");
      });
    } catch (e) {
      console.error(e);
      Toast.show("JSON invalide ❌", "warn");
    }
  }

  function downloadCsvForList(d) {
    const sep = ";";
    const lines = [];
    const parentPath = d.path.endsWith("/")
    ? d.path
    : d.path.substring(0, d.path.lastIndexOf("/") + 1);

  // 🔹 Première ligne : utiliser le chemin parent
  lines.push(`PATH${sep}${parentPath}`);
    lines.push(`DISABLED_POLICIES${sep}dl:dataList`);
    lines.push(`TYPE${sep}dl:dataList`);
    lines.push(`COLUMNS${sep}cm:name${sep}cm:title${sep}dl:dataListItemType`);
    lines.push(`VALUES${sep}${lastPathPart(d.path)}${sep}${d.displayName || ""}${sep}bcpg:listValue`);
    lines.push("");
    lines.push(`MAPPING${sep}Default`);
    lines.push(`TYPE${sep}bcpg:listValue`);
    lines.push(`PATH${sep}${d.path}`);
    lines.push(`ENTITY_TYPE${sep}bcpg:systemEntity`);
    lines.push(`DELETE_DATALIST${sep}false`);
    lines.push(`STOP_ON_FIRST_ERROR${sep}false`);
    lines.push(`COLUMNS${sep}bcpg:lvCode${sep}bcpg:lvValue`);
    lines.push(`#${sep}Code${sep}Valeur`);
    (d.items || []).forEach((it) => {
      lines.push(`VALUES${sep}${it.code || ""}${sep}${it.value || ""}`);
    });

    const fname = `${d.techName}.csv`;
    downloadText(fname, lines.join("\n"));
  }

  function lastPathPart(path) {
    const x = path.split("/").filter(Boolean);
    return x[x.length - 1] || "";
  }

  /***********************
   * COPIES — Génération
   ***********************/
  function initGenerationActions() {
    $$("#tab-generation [data-copy]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const sel = btn.getAttribute("data-copy");
        copyFrom(sel);
      });
    });
    $("#copyAllBtn").addEventListener("click", async () => {
      const t1 = $("#gen-model-constraints").value;
      const t2 = $("#gen-model-properties").value;
      const t3 = $("#gen-model-associations").value;
      const t4 = $("#gen-form-fields").value;
      const t5 = $("#gen-form-shows").value;
      const all = [
        "<!-- model: constraints -->",
        t1,
        "",
        "<!-- model: properties -->",
        t2,
        "",
        "<!-- model: associations -->",
        t3,
        "",
        "<!-- form: fields -->",
        t4,
        "",
        "<!-- form: shows -->",
        t5,
      ].join("\n");
      try {
        await navigator.clipboard.writeText(all);
        Toast.show("Toutes les sections copiées ✅");
      } catch {
        const ta = document.createElement("textarea");
        ta.value = all;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
        Toast.show("Toutes les sections copiées ✅");
      }
    });
  }

  /***********************
   * PARAMÈTRES — DB ops
   ***********************/
  function initParams() {
    $("#resetDbBtn").addEventListener("click", async () => {
      if (!confirm("Réinitialiser toute la base locale (IndexedDB) ?")) return;
      await DB.clear(STORE_PROJECTS);
      await DB.clear(STORE_DYNLISTS);
      await DB.clear(STORE_SETTINGS);
      await DB.clear(STORE_VERSIONS);
      currentProject = emptyProject();
      loadProjectIntoForm();
      refreshProjectPicker();
      Toast.show("IndexedDB réinitialisée 🧨", "warn");
    });

    $("#vacuumDbBtn").addEventListener("click", async () => {
      if (!currentProject) return;
      currentProject.props = (currentProject.props || []).filter((p) => p && p.tech);
      currentProject.assocs = (currentProject.assocs || []).filter((a) => a && a.tech);
      currentProject.dynlists = (currentProject.dynlists || []).filter((d) => d && d.techName);
      await DB.put(STORE_PROJECTS, currentProject);
      Toast.show("Nettoyage effectué 🧹");
      generateAll();
      renderPropList();
      renderAssocList();
      renderDynList();
    });
  }

  /***********************
   * Helpers — default fill
   ***********************/
  function fillDefaultFromPlaceholder(selector) {
    const el = $(selector);
    if (!el) return;
    const ph = el.getAttribute("placeholder") || "";
    el.value = ph;
    el.dispatchEvent(new Event("input"));
  }

  /***********************
   * Escapes XML/HTML
   ***********************/
  function escapeXml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  /***********************
   * Boot
   ***********************/
  async function boot() {
    await openDB();
    Theme.init();
    initTabs();

    initProjectForm();
    initPropForm();
    initAssocForm();
    initDynForm();
    initGenerationActions();
    initExportImport();
    initParams();

    const all = await DB.getAll(STORE_PROJECTS);
    if (all.length) {
      currentProject = all[all.length - 1];
    } else {
      currentProject = emptyProject();
      await DB.put(STORE_PROJECTS, currentProject);
    }
    loadProjectIntoForm();
    refreshProjectPicker();

    $$("#tab-generation [data-copy]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const sel = btn.getAttribute("data-copy");
        copyFrom(sel);
      });
    });
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
