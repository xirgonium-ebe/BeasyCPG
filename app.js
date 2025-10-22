/* Alfresco/beCPG Generator – app.js (v5)
 * - PROPRIÉTÉS
 *    • show: force / for-mode gérés par propriété
 *    • contrainte DynList: sélection d’une DynList existante (sinon aucune contrainte)
 * - DYNLISTS
 *    • Déclarées une seule fois (code:value)
 *    • Génère 1 contrainte centrale par DynList: name = ns:<listName>Constraint
 *    • Les propriétés référencent via <constraint ref="..."/>
 * - ASSOCIATIONS
 *    • autocomplete-association.ftl (+ ds, pageLinkTemplate)
 * - FIELDS
 *    • Attributs: mandatory/read-only/set/label-id
 *    • d:text → textfield/textarea (+ maxLength)
 *    • d:nodeRef hiérarchique → autocomplete.ftl (+ ds, parent chain)
 * - SETS
 *    • Ajout/refresh immédiat des selects
 */

const STORAGE_KEY = "alfresco_generator_project_v5";

/* ============================
   ========== STATE ============
   ============================ */
const state = {
  project: {
    name: "",
    namespacePrefix: "",
    namespaceUri: "",
    settings: {
      // DynListConstraint (beCPG)
      dynListConstraintQName: "fr.becpg.repo.dictionary.constraint.DynListConstraint",
      dynListPathParamName: "path",
      dynListConstraintTypeQName: "bcpg:listValue",
      dynListConstraintPropQName: "bcpg:lvValue",
      dynListAddEmptyValue: true,

      defaultLocale: "fr",
      includeContainers: true,
      containerProperties: true,
      containerAssociations: true,

      // Field sets
      fieldSets: ["referentialData"]
    }
  },
  // properties: [{ qnameLocal, title, type, multiple, default, labelId,
  //   mandatoryModel, mandatoryForm, readOnlyForm, fieldSet, fieldControl, maxLength,
  //   assocDs, assocPageLinkTemplate, nrDs, nrLevels, linkDynList,
  //   showForceProp, showForModeProp }]
  properties: [],
  // associations: [{...}]; (show handled only on properties as requested)
  associations: [],
  // dynlists: [{ listName, listPath, entries:[{code,value}] }]
  dynlists: []
};

/* ============================
   ====== HELPERS / CORE ======
   ============================ */
const $  = (s, r=document)=> r.querySelector(s);
const $$ = (s, r=document)=> Array.from(r.querySelectorAll(s));
const ns = ()=> state.project.namespacePrefix || "ns";
const escXml = (s="")=> String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
const toast = (m)=> alert(m);

function saveState(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function loadState(){
  const raw = localStorage.getItem(STORAGE_KEY); if(!raw) return;
  try{
    const obj = JSON.parse(raw);
    Object.assign(state.project, obj.project || {});
    state.properties   = obj.properties   || [];
    state.associations = obj.associations || [];
    state.dynlists     = obj.dynlists     || [];
  }catch(e){ console.warn("parse state", e); }
}

// Parse “code:value” (tolère “code;value”)
function parsePastedSimple(text){
  const rows = [];
  (text||"").split(/\r?\n/).forEach(line=>{
    const l = line.trim(); if(!l) return;
    const sep = l.includes(":") ? ":" : (l.includes(";") ? ";" : null);
    if(!sep) return;
    const [code,value] = l.split(sep);
    rows.push({ code:(code||"").trim(), value:(value||"").trim() });
  });
  return rows;
}

/* ============================
   ========== TABS ============
   ============================ */
$$(".tabs .tab").forEach(b=> b.addEventListener("click", ()=>{
  $$(".tabs .tab").forEach(x=>x.classList.remove("active"));
  b.classList.add("active");
  const t = b.dataset.tab;
  $$("main .panel").forEach(p=>p.classList.remove("active"));
  $(`#tab-${t}`).classList.add("active");
  // garde les selects (sets/dynlists) synchro
  Project.renderFieldSets();
  Properties.feedDynSelect();
}));

/* ============================
   ========= PROJECT ==========
   ============================ */
const Project = (()=>{
  function renderFieldSets(){
    const sets = state.project.settings.fieldSets || [];

    const ul = $("#ulFieldSets");
    if (ul){
      ul.innerHTML = "";
      sets.forEach(s=>{
        const li = document.createElement("li");
        li.textContent = `- ${s}`;
        ul.appendChild(li);
      });
    }

    // alimente les selects “fieldSet” de Propriétés / Associations
    [$("#formProperty select[name='fieldSet']"),
     $("#formAssoc select[name='fieldSet']")]
     .filter(Boolean).forEach(sel=>{
        const prev = sel.value;
        sel.innerHTML = "";
        sets.forEach(fs=>{
          const opt = document.createElement("option");
          opt.value = fs; opt.textContent = fs;
          sel.appendChild(opt);
        });
        if (sets.includes(prev)) sel.value = prev;
        else if (sets.length) sel.value = sets[0];
     });
  }

  function populateForm(){
    const f = $("#formProject");
    f.projectName.value = state.project.name || "";
    f.nsPrefix.value    = state.project.namespacePrefix || "";
    f.nsUri.value       = state.project.namespaceUri || "";
    f.dynQName.value    = state.project.settings.dynListConstraintQName || "fr.becpg.repo.dictionary.constraint.DynListConstraint";
    f.dynPathParam.value= state.project.settings.dynListPathParamName || "path";
    f.defaultLocale.value = state.project.settings.defaultLocale || "fr";
    f.includeContainers.checked     = !!state.project.settings.includeContainers;
    f.containerProperties.checked   = !!state.project.settings.containerProperties;
    f.containerAssociations.checked = !!state.project.settings.containerAssociations;
    renderFieldSets();
  }

  function bind(){
    $("#btnAddFieldSet").addEventListener("click", (ev)=>{
      ev.preventDefault();
      const input = $("#formProject input[name='newFieldSet']");
      if(!input) return;
      const v = (input.value||"").trim();
      if(!v){ toast("Nom de set requis."); return; }
      const arr = state.project.settings.fieldSets || (state.project.settings.fieldSets = []);
      const exists = arr.some(s=> s.toLowerCase()===v.toLowerCase());
      if(!exists){ arr.push(v); saveState(); }
      renderFieldSets();
      const selProp  = $("#formProperty select[name='fieldSet']");
      const selAssoc = $("#formAssoc select[name='fieldSet']");
      if (selProp)  selProp.value  = v;
      if (selAssoc) selAssoc.value = v;
      input.value = "";
    });

    $("#formProject").addEventListener("submit",(e)=>{
      e.preventDefault();
      const f = e.currentTarget;
      state.project.name = f.projectName.value.trim();
      state.project.namespacePrefix = f.nsPrefix.value.trim();
      state.project.namespaceUri = f.nsUri.value.trim();
      state.project.settings.dynListConstraintQName = f.dynQName.value.trim() || "fr.becpg.repo.dictionary.constraint.DynListConstraint";
      state.project.settings.dynListPathParamName   = f.dynPathParam.value.trim() || "path";
      state.project.settings.defaultLocale = f.defaultLocale.value.trim() || "fr";
      state.project.settings.includeContainers   = f.includeContainers.checked;
      state.project.settings.containerProperties = f.containerProperties.checked;
      state.project.settings.containerAssociations = f.containerAssociations.checked;
      saveState();
      toast("Projet enregistré.");
    });
  }

  return { populateForm, renderFieldSets, bind };
})();

/* ============================
   ======== PROPERTIES ========
   ============================ */
const Properties = (()=>{
  let editingIndex = null;

  function feedDynSelect(){
    const sel = $("#formProperty select[name='linkDynList']");
    if (!sel) return;
    sel.innerHTML = `<option value="">— aucune —</option>` +
      state.dynlists.map(d=> `<option value="${escXml(d.listName)}">${escXml(d.listName)}</option>`).join("");
    // si on est en édition, essaye de conserver la valeur actuelle
    if (editingIndex !== null){
      const curr = state.properties[editingIndex]?.linkDynList || "";
      sel.value = curr;
    }
  }

  function showConditionalBlocks(){
    const f = $("#formProperty");
    const ctrl = f.fieldControl.value;
    $("#propAssocOptions").style.display   = (ctrl==="assoc-auto")   ? "" : "none";
    $("#propNodeRefOptions").style.display = (ctrl==="noderef-auto") ? "" : "none";
  }

  function resetForm(){
    const f = $("#formProperty");
    f.reset();
    f.fieldControl.value = "auto";
    f.nrLevels.value = 1;
    f.showForceProp.checked   = false;
    f.showForModeProp.checked = false;
    editingIndex = null;
    $("#propFormLegend").textContent = "Nouvelle propriété";
    $("#btnSaveProp").textContent = "Ajouter propriété";
    $("#btnCancelProp").style.display = "none";
    showConditionalBlocks();
    feedDynSelect();
    if (state.project.settings.fieldSets.length)
      f.fieldSet.value = state.project.settings.fieldSets[0];
  }

  function fillForm(p){
    const f = $("#formProperty");
    f.qnameLocal.value = p.qnameLocal || "";
    f.title.value      = p.title || "";
    f.type.value       = p.type || "d:text";
    f.multiple.checked = !!p.multiple;
    f.default.value    = p.default || "";
    f.labelId.value    = p.labelId || "";
    f.mandatoryModel.checked = !!p.mandatoryModel;
    f.mandatoryForm.checked  = !!p.mandatoryForm;
    f.readOnlyForm.checked   = !!p.readOnlyForm;
    f.fieldSet.value  = p.fieldSet || (state.project.settings.fieldSets[0] || "");

    f.fieldControl.value = p.fieldControl || "auto";
    f.maxLength.value    = p.maxLength || "";

    f.assocDs.value = p.assocDs || "";
    f.assocPageLinkTemplate.value = p.assocPageLinkTemplate || "";

    f.nrDs.value     = p.nrDs || "";
    f.nrLevels.value = p.nrLevels || 1;

    f.linkDynList.value = p.linkDynList || "";

    // show (par propriété)
    f.showForceProp.checked   = !!p.showForceProp;
    f.showForModeProp.checked = !!p.showForModeProp;

    showConditionalBlocks();
  }

  function render(){
    const tb = $("#tblProperties tbody");
    tb.innerHTML = "";
    state.properties.forEach((p,i)=>{
      const q = `${ns()}:${p.qnameLocal}`;
      const linked = p.linkDynList ? p.linkDynList : "";
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><code>${q}</code></td>
        <td>${escXml(p.title||"")}</td>
        <td>${p.type}</td>
        <td>${p.multiple}</td>
        <td>${p.mandatoryModel? "✓": ""}</td>
        <td>${p.mandatoryForm? "✓": ""}</td>
        <td>${p.readOnlyForm? "✓": ""}</td>
        <td>${escXml(linked)}</td>
        <td>${escXml(p.fieldSet||"")}</td>
        <td>
          <button class="btn" data-edit="${i}">Éditer</button>
          <button class="btn btn-danger" data-del="${i}">Suppr.</button>
        </td>
      `;
      tb.appendChild(tr);
    });

    $$("#tblProperties [data-edit]").forEach(b=> b.addEventListener("click", ()=>{
      editingIndex = Number(b.dataset.edit);
      $("#propFormLegend").textContent = "Éditer la propriété";
      $("#btnSaveProp").textContent = "Mettre à jour";
      $("#btnCancelProp").style.display = "inline-block";
      fillForm(state.properties[editingIndex]);
    }));
    $$("#tblProperties [data-del]").forEach(b=> b.addEventListener("click", ()=>{
      const i = Number(b.dataset.del);
      state.properties.splice(i,1);
      saveState(); render(); Preview.buildAll();
      if (editingIndex === i) resetForm();
    }));
  }

  function bind(){
    $("#formProperty select[name='fieldControl']").addEventListener("change", showConditionalBlocks);
    $("#btnCancelProp").addEventListener("click", resetForm);

    $("#formProperty").addEventListener("submit",(e)=>{
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
        nrLevels: Math.max(1, Number(f.nrLevels.value)||1),

        // sélection d’une DynList existante (ou aucune)
        linkDynList: f.linkDynList.value || "",

        // show per-property
        showForceProp:   f.showForceProp.checked,
        showForModeProp: f.showForModeProp.checked
      };

      if (editingIndex === null){
        if (state.properties.some(p=>p.qnameLocal===prop.qnameLocal)){ toast("Nom technique déjà utilisé."); return; }
        state.properties.push(prop);
      } else {
        const dup = state.properties.some((p,i)=> i!==editingIndex && p.qnameLocal===prop.qnameLocal);
        if (dup){ toast("Nom technique déjà utilisé."); return; }
        state.properties[editingIndex] = prop;
      }
      saveState(); render(); Preview.buildAll(); resetForm();
    });
  }

  return { render, resetForm, bind, feedDynSelect };
})();

/* ============================
   ======== ASSOCIATIONS ======
   ============================ */
const Assocs = (()=>{
  let editingIndex = null;

  function resetForm(){
    const f = $("#formAssoc"); f.reset();
    f.sourceMany.value = "true";
    f.targetMany.value = "false";
    editingIndex = null;
    $("#assocFormLegend").textContent = "Nouvelle association";
    $("#btnSaveAssoc").textContent = "Ajouter association";
    $("#btnCancelAssoc").style.display = "none";
    if (state.project.settings.fieldSets.length) f.fieldSet.value = state.project.settings.fieldSets[0];
  }
  function fillForm(a){
    const f = $("#formAssoc");
    f.qnameLocal.value = a.qnameLocal || "";
    f.title.value      = a.title || "";
    f.targetClass.value= a.targetClass || "cm:person";
    f.mandatoryModel.checked = !!a.mandatoryModel;
    f.mandatoryForm.checked  = !!a.mandatoryForm;
    f.fieldSet.value   = a.fieldSet || (state.project.settings.fieldSets[0] || "");
    f.sourceMany.value = a.sourceMany ? "true":"false";
    f.targetMany.value = a.targetMany ? "true":"false";
    f.assocDs.value = a.assocDs || "";
    f.assocPageLinkTemplate.value = a.assocPageLinkTemplate || "";
  }
  function render(){
    const tb = $("#tblAssocs tbody");
    tb.innerHTML = "";
    state.associations.forEach((a,i)=>{
      const q = `${ns()}:${a.qnameLocal}`;
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><code>${q}</code></td>
        <td>${escXml(a.title||"")}</td>
        <td>${a.targetClass}</td>
        <td>${a.sourceMany}</td>
        <td>${a.targetMany}</td>
        <td>${a.mandatoryModel? "✓": ""}</td>
        <td>${a.mandatoryForm? "✓": ""}</td>
        <td>${escXml(a.fieldSet||"")}</td>
        <td>
          <button class="btn" data-edit="${i}">Éditer</button>
          <button class="btn btn-danger" data-del="${i}">Suppr.</button>
        </td>
      `;
      tb.appendChild(tr);
    });
    $$("#tblAssocs [data-edit]").forEach(b=> b.addEventListener("click", ()=>{
      editingIndex = Number(b.dataset.edit);
      $("#assocFormLegend").textContent = "Éditer l'association";
      $("#btnSaveAssoc").textContent = "Mettre à jour";
      $("#btnCancelAssoc").style.display = "inline-block";
      fillForm(state.associations[editingIndex]);
    }));
    $$("#tblAssocs [data-del]").forEach(b=> b.addEventListener("click", ()=>{
      const i = Number(b.dataset.del);
      state.associations.splice(i,1);
      saveState(); render(); Preview.buildAll();
      if (editingIndex === i) resetForm();
    }));
  }
  function bind(){
    $("#btnCancelAssoc").addEventListener("click", resetForm);
    $("#formAssoc").addEventListener("submit",(e)=>{
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
      if (editingIndex === null){
        if (state.associations.some(a=>a.qnameLocal===assoc.qnameLocal)){ toast("Nom technique déjà utilisé."); return; }
        state.associations.push(assoc);
      } else {
        const dup = state.associations.some((a,i)=> i!==editingIndex && a.qnameLocal===assoc.qnameLocal);
        if (dup){ toast("Nom technique déjà utilisé."); return; }
        state.associations[editingIndex] = assoc;
      }
      saveState(); render(); Preview.buildAll(); resetForm();
    });
  }

  return { render, bind, resetForm };
})();

/* ============================
   ========= DYNLISTS =========
   ============================ */
const Dyn = (()=>{
  let editingIndex = null;
  let lastParsed = [];

  function render(){
    const tb = $("#tblDyn tbody");
    tb.innerHTML = "";
    state.dynlists.forEach((d,i)=>{
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

    $$("#tblDyn [data-edit]").forEach(b=> b.addEventListener("click", ()=>{
      editingIndex = Number(b.dataset.edit);
      $("#dynFormLegend").textContent = "Éditer la DynList";
      $("#btnSaveDyn").textContent = "Mettre à jour";
      $("#btnCancelDyn").style.display = "inline-block";
      const d = state.dynlists[editingIndex];
      const f = $("#formDyn");
      f.listName.value = d.listName;
      f.listPath.value = d.listPath;
      f.pasted.value = d.entries.map(e=> `${e.code||""}:${e.value||""}`).join("\n");
      lastParsed = d.entries.slice();
      // rafraîchir le select des propriétés
      Properties.feedDynSelect();
    }));

    $$("#tblDyn [data-del]").forEach(b=> b.addEventListener("click", ()=>{
      const i = Number(b.dataset.del);
      const removed = state.dynlists[i];
      state.dynlists.splice(i,1);
      saveState(); render(); Properties.feedDynSelect(); Preview.buildAll();
      if (editingIndex === i) resetForm();
      // Nettoyer les propriétés qui pointaient vers cette liste
      const name = removed?.listName;
      if (name){
        state.properties.forEach(p=> { if (p.linkDynList===name) p.linkDynList=""; });
        saveState(); Properties.render(); Preview.buildAll();
      }
    }));
  }

  function resetForm(){
    const f = $("#formDyn"); f.reset();
    editingIndex = null; lastParsed = [];
    $("#dynFormLegend").textContent = "Nouvelle DynList";
    $("#btnSaveDyn").textContent = "Ajouter DynList";
    $("#btnCancelDyn").style.display = "none";
  }

  function bind(){
    $("#btnParseDyn").addEventListener("click", ()=>{
      const f = $("#formDyn");
      lastParsed = parsePastedSimple(f.pasted.value);
      toast(`Analyse OK : ${lastParsed.length} ligne(s).`);
    });
    $("#btnInlineAdd").addEventListener("click", ()=>{
      const f = $("#formDyn");
      const e = { code:(f.il_code.value||"").trim(), value:(f.il_value.value||"").trim() };
      if (!e.code && !e.value){ toast("Code ou Value requis."); return; }
      lastParsed.push(e);
      f.il_code.value = ""; f.il_value.value = "";
    });
    $("#btnCancelDyn").addEventListener("click", resetForm);

    $("#formDyn").addEventListener("submit",(e)=>{
      e.preventDefault();
      const f = e.currentTarget;
      const listName = f.listName.value.trim();
      const listPath = f.listPath.value.trim();
      if (!listName || !listPath){ toast("Nom et path requis."); return; }
      if (!lastParsed.length && (f.pasted.value||"").trim().length){
        lastParsed = parsePastedSimple(f.pasted.value);
      }

      if (editingIndex === null){
        if (state.dynlists.some(d=>d.listName===listName)){ toast("Nom de liste déjà utilisé."); return; }
        state.dynlists.push({ listName, listPath, entries: lastParsed.slice() });
      } else {
        const dup = state.dynlists.some((d,i)=> i!==editingIndex && d.listName===listName);
        if (dup){ toast("Nom de liste déjà utilisé."); return; }
        const oldName = state.dynlists[editingIndex].listName;
        state.dynlists[editingIndex] = { listName, listPath, entries: lastParsed.slice() };
        // si le nom a changé, recaler les propriétés qui pointaient dessus
        if (oldName !== listName){
          state.properties.forEach(p=> { if (p.linkDynList===oldName) p.linkDynList=listName; });
        }
      }
      saveState(); render(); Properties.feedDynSelect(); Preview.buildAll(); resetForm();
    });
  }

  return { render, bind, resetForm };
})();

/* ============================
   ========= PREVIEW ==========
   ============================ */
const Preview = (()=>{
  // helper: trouve la contrainte name d’une DynList
  const constraintNameForList = (listName)=> `${ns()}:${listName}Constraint`;

  function buildModelProperties(includeContainers){
    const out = [];
    if (includeContainers && state.project.settings.containerProperties)
      out.push("<properties>");

    state.properties.forEach(p=>{
      out.push(`  <property name="${ns()}:${p.qnameLocal}">`);
      out.push(`    <type>${p.type}</type>`);
      out.push(`    <multiple>${p.multiple}</multiple>`);
      out.push(`    <mandatory>${!!p.mandatoryModel}</mandatory>`);
      if (p.default!==undefined && p.default!==null && String(p.default).length){
        out.push(`    <default>${escXml(p.default)}</default>`);
      }
      // si une DynList est sélectionnée ET existe, on référence la contrainte centrale
      if (p.linkDynList && state.dynlists.some(d=>d.listName===p.linkDynList)){
        const refName = constraintNameForList(p.linkDynList);
        out.push(`    <constraints>`);
        out.push(`      <constraint ref="${refName}" />`);
        out.push(`    </constraints>`);
      }
      out.push(`  </property>`);
    });

    if (includeContainers && state.project.settings.containerProperties)
      out.push("</properties>");
    return out.join("\n");
  }

  function buildModelAssociations(includeContainers){
    const out = [];
    if (includeContainers && state.project.settings.containerAssociations)
      out.push("<associations>");

    state.associations.forEach(a=>{
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

  // CONTRAINTES CENTRALES : 1 par DynList
  function buildConstraints(includeContainers){
    if (!state.dynlists.length) return "";
    const out = [];
    if (includeContainers) out.push("<constraints>");
    state.dynlists.forEach(d=>{
      const name = constraintNameForList(d.listName);
      out.push(`  <constraint name="${name}" type="${state.project.settings.dynListConstraintQName}">`);
      out.push(`    <parameter name="${state.project.settings.dynListPathParamName}"><list><value>${escXml(d.listPath)}</value></list></parameter>`);
      out.push(`    <parameter name="constraintType"><value>${state.project.settings.dynListConstraintTypeQName}</value></parameter>`);
      out.push(`    <parameter name="constraintProp"><value>${state.project.settings.dynListConstraintPropQName}</value></parameter>`);
      out.push(`    <parameter name="addEmptyValue"><value>${state.project.settings.dynListAddEmptyValue?"true":"false"}</value></parameter>`);
      out.push(`  </constraint>`);
    });
    if (includeContainers) out.push("</constraints>");
    return out.join("\n");
  }

  // SHOW : per-property flags (force / for-mode)
  function buildShow(){
    const out = [];
    // propriétés
    state.properties.forEach(p=>{
      const id = `${ns()}:${p.qnameLocal}`;
      const attrs = [];
      if (p.showForceProp)   attrs.push(`force="true"`);
      if (p.showForModeProp) attrs.push(`for-mode="true"`);
      const a = attrs.length ? " " + attrs.join(" ") : "";
      out.push(`<show id="${id}"${a} />`);
    });
    // associations (pas de flags demandés)
    state.associations.forEach(a=>{
      const id = `${ns()}:${a.qnameLocal}`;
      out.push(`<show id="${id}" />`);
    });
    return out.join("\n");
  }

  function buildField(){
    const out = [];
    const fieldAttrs = (x)=>{
      const attrs = [];
      attrs.push(`mandatory="${x.mandatoryForm?"true":"false"}"`);
      attrs.push(`read-only="${x.readOnlyForm?"true":"false"}"`);
      if (x.fieldSet) attrs.push(`set="${x.fieldSet}"`);
      if (x.labelId)  attrs.push(`label-id="${x.labelId}"`);
      return attrs.join(" ");
    };

    // Propriétés
    state.properties.forEach(p=>{
      const id = `${ns()}:${p.qnameLocal}`;
      // d:nodeRef hiérarchique
      if (p.type==="d:nodeRef" && p.fieldControl==="noderef-auto"){
        const levels = Math.max(1, Number(p.nrLevels)||1);
        const ds = p.nrDs || "";
        for (let i=0;i<levels;i++){
          const suffix = i===0?"Lvl0":`Lvl${i}`;
          const fieldId = levels>1 ? `${id}${suffix}` : id;
          const attrs = fieldAttrs(p);
          out.push(`  <field id="${fieldId}" ${attrs}>`);
          out.push(`    <control template="/org/alfresco/components/form/controls/autocomplete.ftl">`);
          if (ds) out.push(`      <control-param name="ds">${escXml(ds)}</control-param>`);
          if (i>0){
            const parentUnderscore = levels>1 ? `${ns()}_${p.qnameLocal}${i===1?"Lvl0":`Lvl${i-1}`}` : id.replace(":","_");
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
      if (control==="textfield"){
        out.push(`    <control template="/org/alfresco/components/form/controls/textfield.ftl">`);
        if (p.maxLength) out.push(`      <control-param name="maxLength">${p.maxLength}</control-param>`);
        out.push(`    </control>`);
      } else if (control==="textarea"){
        out.push(`    <control template="/org/alfresco/components/form/controls/textarea.ftl"></control>`);
      } else if (control==="assoc-auto"){
        out.push(`    <control template="/org/alfresco/components/form/controls/autocomplete-association.ftl">`);
        if (p.assocDs) out.push(`      <control-param name="ds">${escXml(p.assocDs)}</control-param>`);
        if (p.assocPageLinkTemplate) out.push(`      <control-param name="pageLinkTemplate">${escXml(p.assocPageLinkTemplate)}</control-param>`);
        out.push(`    </control>`);
      } else {
        // auto: si d:text + maxLength
        if (p.type==="d:text" && p.maxLength){
          out.push(`    <control template="/org/alfresco/components/form/controls/textfield.ftl">`);
          out.push(`      <control-param name="maxLength">${p.maxLength}</control-param>`);
          out.push(`    </control>`);
        }
      }
      out.push(`  </field>`);
    });

    // Associations
    state.associations.forEach(a=>{
      const id = `${ns()}:${a.qnameLocal}`;
      const attrs = fieldAttrs(a);
      out.push(`  <field id="${id}" ${attrs}>`);
      out.push(`    <control template="/org/alfresco/components/form/controls/autocomplete-association.ftl">`);
      if (a.assocDs) out.push(`      <control-param name="ds">${escXml(a.assocDs)}</control-param>`);
      if (a.assocPageLinkTemplate) out.push(`      <control-param name="pageLinkTemplate">${escXml(a.assocPageLinkTemplate)}</control-param>`);
      out.push(`      <control-param name="allowMultipleSelections">${a.targetMany?"true":"false"}</control-param>`);
      out.push(`    </control>`);
      out.push(`  </field>`);
    });

    return out.join("\n");
  }

  function buildAll(){
    const include = !!state.project.settings.includeContainers;
    $("#outProps").value       = buildModelProperties(include);
    $("#outAssocs").value      = buildModelAssociations(include);
    $("#outConstraints").value = buildConstraints(include);
    $("#outShow").value        = buildShow();
    $("#outField").value       = buildField();
  }

  return { buildAll };
})();

/* ============================
   ===== EXPORT / IMPORT ======
   ============================ */
const IO = (()=>{
  function bind(){
    $("#btnExportJSON").addEventListener("click", ()=>{
      const blob = new Blob([JSON.stringify(state,null,2)], {type:"application/json"});
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = (state.project.name || "project") + ".json";
      a.click(); URL.revokeObjectURL(a.href);
    });

    $("#fileImportJSON").addEventListener("change", async (e)=>{
      const file = e.target.files[0]; if(!file) return;
      try{
        const obj = JSON.parse(await file.text());
        Object.assign(state.project, obj.project || {});
        state.properties   = obj.properties   || [];
        state.associations = obj.associations || [];
        state.dynlists     = obj.dynlists     || [];
        saveState();
        Project.populateForm();
        Properties.render(); Assocs.render(); Dyn.render();
        Properties.feedDynSelect();
        Preview.buildAll();
        toast("Projet importé.");
      }catch(err){ toast("Fichier JSON invalide."); }
      e.target.value = "";
    });

    $("#btnReset").addEventListener("click", ()=>{
      if (!confirm("Réinitialiser le projet (localStorage) ?")) return;
      localStorage.removeItem(STORAGE_KEY); location.reload();
    });

    $("#btnDownloadZip").addEventListener("click", async ()=>{
      Preview.buildAll();
      const zip = new JSZip();
      const files = [];
      files.push({path:"model/fragment-model-properties.xml",   content: $("#outProps").value});
      files.push({path:"model/fragment-model-associations.xml",content: $("#outAssocs").value});
      if ($("#outConstraints").value.trim().length)
        files.push({path:"model/fragment-model-constraints.xml", content: $("#outConstraints").value});
      files.push({path:"share/fragment-share-show.xml",  content: $("#outShow").value});
      files.push({path:"share/fragment-share-field.xml", content: $("#outField").value});

      // DynList export: lignes "code:value"
      state.dynlists.forEach(d=>{
        const lines = d.entries.map(e=> `${e.code??""}:${e.value??""}`);
        files.push({path:`constraints/${d.listName}.csv`, content: lines.join("\n")});
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
- constraints/*.csv (format: code:value par ligne)

> DynListConstraint: ${state.project.settings.dynListConstraintQName}
> Paramètre path: ${state.project.settings.dynListPathParamName}
> constraintType: ${state.project.settings.dynListConstraintTypeQName}
> constraintProp: ${state.project.settings.dynListConstraintPropQName}
> addEmptyValue: ${state.project.settings.dynListAddEmptyValue}
`;
      files.push({path:"README.md", content: readme});
      files.push({path:"project.json", content: JSON.stringify(state, null, 2)});

      files.forEach(f=> zip.file(f.path, f.content));
      const blob = await zip.generateAsync({type:"blob"});
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${(state.project.name || "alfresco-fragments").replace(/[^\w\-]+/g,"_")}.zip`;
      a.click(); URL.revokeObjectURL(a.href);
    });
  }
  return { bind };
})();

/* ============================
   ========== INIT ============
   ============================ */
(function init(){
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

  Preview.buildAll();

  // défaut côté assoc (au cas où le navigateur se souvient)
  $("#formAssoc select[name='sourceMany']").value ||= "true";
})();
