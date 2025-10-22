/* =====================================================
   STAR WARS ALFRESCO GENERATOR (v5.3)
   - Fix: "Enregistrer le projet" ne casse plus les onglets
   - Remplace export ZIP par export CSV DynLists (1 fichier / liste)
   - En-tête CSV configurable dans le code
   - Show par propriété (force/for-mode), contraintes DynList centrales
   ===================================================== */

const STORAGE_KEY = "alfresco_generator_project_starwars_v53";

/* ====== Config export DynList ====== */
/** Inclure une en-tête par fichier CSV ? */
const DYNLIST_CSV_INCLUDE_HEADER = true;
/** Générateur d’en-tête (tu peux modifier le format librement) */
const DYNLIST_CSV_HEADER_FN = (list) => {
  // list: { listName, listPath, entries:[{code,value}] }
  // Exemple: lignes de meta en commentaires + ligne de colonnes (facultative)
  return [
    `# DynList: ${list.listName}`,
    `# Path: ${list.listPath}`,
    `# Rows: ${list.entries.length}`,
    `# Format: code:value`,
  ].join("\n");
};

const $  = (s, r=document)=> r.querySelector(s);
const $$ = (s, r=document)=> Array.from(r.querySelectorAll(s));
const ns = ()=> state.project.namespacePrefix || "ns";
const escXml = (s="")=> String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
const toast = (m)=> alert(m);

function saveState(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function loadState(){
  const raw = localStorage.getItem(STORAGE_KEY);
  if(!raw) return;
  try{
    const obj = JSON.parse(raw);
    Object.assign(state.project, obj.project || {});
    state.properties   = obj.properties   || [];
    state.associations = obj.associations || [];
    state.dynlists     = obj.dynlists     || [];
  }catch(e){ console.warn("[state] parse error", e); }
}
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

      fieldSets: ["referentialData"]
    }
  },
  properties: [],
  associations: [],
  dynlists: []
};

/* ================= Project ================= */
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
    const f = $("#formProject"); if (!f) return;
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

  function bind(){
    // IMPORTANT: on n’utilise plus submit; on clique sur un bouton type="button"
    $("#btnSaveProject")?.addEventListener("click", ()=>{
      const f = $("#formProject"); if (!f) return;
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
      // aucun changement de hash → l’onglet actif reste visible
      Preview.buildAll();
    });

    $("#btnAddFieldSet")?.addEventListener("click", ()=>{
      const input = $("#formProject input[name='newFieldSet']");
      if(!input) return;
      const v = (input.value||"").trim();
      if(!v){ toast("Nom de set requis."); return; }
      const arr = state.project.settings.fieldSets;
      const exists = arr.some(s=> s.toLowerCase()===v.toLowerCase());
      if(!exists){ arr.push(v); saveState(); }
      renderFieldSets();
      input.value = "";
    });
  }

  return { populateForm, renderFieldSets, bind };
})();

/* ================= Properties ================= */
const Properties = (()=>{
  let editingIndex = null;

  function feedDynSelect(){
    const sel = $("#formProperty select[name='linkDynList']");
    if(!sel) return;
    sel.innerHTML = `<option value="">— aucune —</option>` +
      state.dynlists.map(d=> `<option value="${escXml(d.listName)}">${escXml(d.listName)}</option>`).join("");
    if (editingIndex!==null){
      const curr = state.properties[editingIndex]?.linkDynList || "";
      sel.value = curr;
    }
  }

  function showConditionalBlocks(){
    const f = $("#formProperty"); if (!f) return;
    const ctrl = f.fieldControl.value;
    const a = $("#propAssocOptions"), n = $("#propNodeRefOptions");
    if (a) a.style.display = (ctrl==="assoc-auto") ? "" : "none";
    if (n) n.style.display = (ctrl==="noderef-auto") ? "" : "none";
  }

  function resetForm(){
    const f = $("#formProperty"); if (!f) return;
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
    if (state.project.settings.fieldSets.length)
      f.fieldSet.value = state.project.settings.fieldSets[0];
  }

  function fillForm(p){
    const f = $("#formProperty"); if (!f) return;
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
    f.showForceProp.checked   = !!p.showForceProp;
    f.showForModeProp.checked = !!p.showForModeProp;
    showConditionalBlocks();
  }

  function render(){
    const tb = $("#tblProperties tbody"); if (!tb) return;
    tb.innerHTML = "";
    state.properties.forEach((p,i)=>{
      const q = `${ns()}:${p.qnameLocal}`;
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><code>${q}</code></td>
        <td>${escXml(p.title||"")}</td>
        <td>${p.type}</td>
        <td>${p.multiple}</td>
        <td>${p.mandatoryModel?"✓":""}</td>
        <td>${p.mandatoryForm?"✓":""}</td>
        <td>${p.readOnlyForm?"✓":""}</td>
        <td>${escXml(p.linkDynList||"")}</td>
        <td>${escXml(p.fieldSet||"")}</td>
        <td>
          <button class="btn" data-edit="${i}">✏️</button>
          <button class="btn btn-danger" data-del="${i}">🗑️</button>
        </td>`;
      tb.appendChild(tr);
    });

    $$("#tblProperties [data-edit]").forEach(b=> b.addEventListener("click", ()=>{
      editingIndex = Number(b.dataset.edit);
      fillForm(state.properties[editingIndex]);
      $("#btnSaveProp").textContent = "Mettre à jour";
      $("#btnCancelProp").style.display = "inline-block";
    }));
    $$("#tblProperties [data-del]").forEach(b=> b.addEventListener("click", ()=>{
      const i = Number(b.dataset.del);
      state.properties.splice(i,1);
      saveState(); render(); Preview.buildAll();
      if (editingIndex===i) resetForm();
    }));
  }

  function bind(){
    $("#formProperty select[name='fieldControl']")?.addEventListener("change", showConditionalBlocks);
    $("#btnCancelProp")?.addEventListener("click", resetForm);

    $("#formProperty")?.addEventListener("submit",(e)=>{
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
        linkDynList: f.linkDynList.value || "",
        showForceProp: f.showForceProp.checked,
        showForModeProp: f.showForModeProp.checked
      };
      if (!prop.qnameLocal){ toast("Nom technique requis."); return; }

      if (editingIndex===null){
        if (state.properties.some(p=>p.qnameLocal===prop.qnameLocal)){ toast("Nom déjà utilisé."); return; }
        state.properties.push(prop);
      } else {
        state.properties[editingIndex] = prop;
      }
      saveState(); render(); Preview.buildAll(); resetForm();
    });
  }

  return { render, bind, resetForm, feedDynSelect };
})();

/* ================= Associations ================= */
const Assocs = (()=>{
  let editingIndex = null;

  function resetForm(){
    const f = $("#formAssoc"); if (!f) return;
    f.reset();
    f.sourceMany.value = "true";
    f.targetMany.value = "false";
    editingIndex = null;
    $("#btnCancelAssoc").style.display="none";
  }

  function fillForm(a){
    const f = $("#formAssoc"); if (!f) return;
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

  function render(){
    const tb = $("#tblAssocs tbody"); if (!tb) return;
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
        <td>${a.mandatoryModel?"✓":""}</td>
        <td>${a.mandatoryForm?"✓":""}</td>
        <td>${escXml(a.fieldSet||"")}</td>
        <td>
          <button class="btn" data-edit="${i}">✏️</button>
          <button class="btn btn-danger" data-del="${i}">🗑️</button>
        </td>`;
      tb.appendChild(tr);
    });

    $$("#tblAssocs [data-edit]").forEach(b=> b.addEventListener("click", ()=>{
      editingIndex = Number(b.dataset.edit);
      fillForm(state.associations[editingIndex]);
      $("#btnCancelAssoc").style.display="inline-block";
    }));
    $$("#tblAssocs [data-del]").forEach(b=> b.addEventListener("click", ()=>{
      const i = Number(b.dataset.del);
      state.associations.splice(i,1);
      saveState(); render(); Preview.buildAll();
      if (editingIndex===i) resetForm();
    }));
  }

  function bind(){
    $("#btnCancelAssoc")?.addEventListener("click", resetForm);
    $("#formAssoc")?.addEventListener("submit",(e)=>{
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
      if (!assoc.qnameLocal){ toast("Nom technique requis."); return; }
      if (editingIndex===null){
        if (state.associations.some(a=>a.qnameLocal===assoc.qnameLocal)){ toast("Nom déjà utilisé."); return; }
        state.associations.push(assoc);
      } else {
        state.associations[editingIndex] = assoc;
      }
      saveState(); render(); Preview.buildAll(); resetForm();
    });
  }

  return { render, bind, resetForm };
})();

/* ================= DynLists ================= */
const Dyn = (()=>{
  let editingIndex = null;
  let lastParsed = [];

  function resetForm(){
    const f = $("#formDyn"); if (!f) return;
    f.reset();
    editingIndex = null;
    lastParsed = [];
    $("#btnCancelDyn").style.display="none";
  }

  function render(){
    const tb = $("#tblDyn tbody"); if (!tb) return;
    tb.innerHTML = "";
    state.dynlists.forEach((d,i)=>{
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><code>${escXml(d.listName)}</code></td>
        <td>${escXml(d.listPath)}</td>
        <td>${d.entries.length}</td>
        <td>
          <button class="btn" data-edit="${i}">✏️</button>
          <button class="btn btn-danger" data-del="${i}">🗑️</button>
        </td>`;
      tb.appendChild(tr);
    });

    $$("#tblDyn [data-edit]").forEach(b=> b.addEventListener("click", ()=>{
      editingIndex = Number(b.dataset.edit);
      const d = state.dynlists[editingIndex];
      const f = $("#formDyn");
      f.listName.value = d.listName;
      f.listPath.value = d.listPath;
      f.pasted.value = d.entries.map(e=> `${e.code||""}:${e.value||""}`).join("\n");
      lastParsed = d.entries.slice();
      $("#btnCancelDyn").style.display = "inline-block";
      Properties.feedDynSelect();
    }));
    $$("#tblDyn [data-del]").forEach(b=> b.addEventListener("click", ()=>{
      const i = Number(b.dataset.del);
      state.dynlists.splice(i,1);
      saveState(); render(); Properties.feedDynSelect(); Preview.buildAll();
      resetForm();
    }));
  }

  function bind(){
    const form = $("#formDyn");
    const btnParse = $("#btnParseDyn");
    const btnAdd = $("#btnInlineAdd");
    const btnCancel = $("#btnCancelDyn");

    btnParse?.addEventListener("click", ()=>{
      try{
        lastParsed = parsePastedSimple(form.pasted?.value || "");
        toast(`Analyse OK : ${lastParsed.length} ligne(s).`);
      }catch(err){ console.error("[Dyn] parse error", err); toast("Erreur d'analyse DynList"); }
    });

    btnAdd?.addEventListener("click", ()=>{
      try{
        const e = { code:(form.il_code?.value||"").trim(), value:(form.il_value?.value||"").trim() };
        if(!e.code && !e.value){ toast("Code ou Value requis."); return; }
        lastParsed.push(e);
        if (form.il_code) form.il_code.value = "";
        if (form.il_value) form.il_value.value = "";
      }catch(err){ console.error("[Dyn] inline add error", err); toast("Erreur d'ajout inline"); }
    });

    btnCancel?.addEventListener("click", resetForm);

    form?.addEventListener("submit",(e)=>{
      e.preventDefault();
      try{
        const listName = (form.listName?.value || "").trim();
        const listPath = (form.listPath?.value || "").trim();
        if (!listName || !listPath){ toast("Nom et path requis."); return; }
        if (!lastParsed.length && (form.pasted?.value || "").trim().length){
          lastParsed = parsePastedSimple(form.pasted.value);
        }
        if (editingIndex===null){
          if (state.dynlists.some(d=>d.listName===listName)){ toast("Nom de liste déjà utilisé."); return; }
          state.dynlists.push({ listName, listPath, entries: lastParsed.slice() });
        } else {
          state.dynlists[editingIndex] = { listName, listPath, entries: lastParsed.slice() };
        }
        saveState(); render(); Properties.feedDynSelect(); Preview.buildAll(); resetForm();
      }catch(err){ console.error("[Dyn] submit error", err); toast("Erreur de sauvegarde DynList"); }
    });
  }

  return { render, bind, resetForm };
})();

/* ================= Preview ================= */
const Preview = (()=>{
  const constraintNameForList = (listName)=> `${ns()}:${listName}Constraint`;

  function buildModelProperties(includeContainers){
    const out=[];
    if (includeContainers && state.project.settings.containerProperties) out.push("<properties>");
    state.properties.forEach(p=>{
      out.push(`  <property name="${ns()}:${p.qnameLocal}">`);
      out.push(`    <type>${p.type}</type>`);
      out.push(`    <multiple>${p.multiple}</multiple>`);
      out.push(`    <mandatory>${!!p.mandatoryModel}</mandatory>`);
      if (p.default!==undefined && p.default!==null && String(p.default).length){
        out.push(`    <default>${escXml(p.default)}</default>`);
      }
      if (p.linkDynList && state.dynlists.some(d=>d.listName===p.linkDynList)){
        const refName = constraintNameForList(p.linkDynList);
        out.push(`    <constraints>`);
        out.push(`      <constraint ref="${refName}" />`);
        out.push(`    </constraints>`);
      }
      out.push(`  </property>`);
    });
    if (includeContainers && state.project.settings.containerProperties) out.push("</properties>");
    return out.join("\n");
  }

  function buildModelAssociations(includeContainers){
    const out=[];
    if (includeContainers && state.project.settings.containerAssociations) out.push("<associations>");
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
    if (includeContainers && state.project.settings.containerAssociations) out.push("</associations>");
    return out.join("\n");
  }

  function buildConstraints(includeContainers){
    if (!state.dynlists.length) return "";
    const out=[];
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

  function buildShow(){
    const out=[];
    state.properties.forEach(p=>{
      const id = `${ns()}:${p.qnameLocal}`;
      const attrs = [];
      if (p.showForceProp)   attrs.push(`force="true"`);
      if (p.showForModeProp) attrs.push(`for-mode="true"`);
      const a = attrs.length ? " " + attrs.join(" ") : "";
      out.push(`<show id="${id}"${a} />`);
    });
    state.associations.forEach(a=>{
      const id = `${ns()}:${a.qnameLocal}`;
      out.push(`<show id="${id}" />`);
    });
    return out.join("\n");
  }

  function buildField(){
    const out=[];
    const fieldAttrs = (x)=>{
      const arr=[];
      arr.push(`mandatory="${x.mandatoryForm?"true":"false"}"`);
      arr.push(`read-only="${x.readOnlyForm?"true":"false"}"`);
      if (x.fieldSet) arr.push(`set="${x.fieldSet}"`);
      if (x.labelId)  arr.push(`label-id="${x.labelId}"`);
      return arr.join(" ");
    };

    // Properties
    state.properties.forEach(p=>{
      const id = `${ns()}:${p.qnameLocal}`;
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
    $("#outProps")?.value       = buildModelProperties(include);
    $("#outAssocs")?.value      = buildModelAssociations(include);
    $("#outConstraints")?.value = buildConstraints(include);
    $("#outShow")?.value        = buildShow();
    $("#outField")?.value       = buildField();
  }

  return { buildAll };
})();

/* ================= IO (export/import/CSV) ================= */
const IO = (()=>{
  function bind(){
    // Copier
    $$(".btn-copy").forEach(b=> b.addEventListener("click", async ()=>{
      const sel = b.getAttribute("data-copy");
      const el = sel ? $(sel) : null;
      if (!el) return;
      await navigator.clipboard.writeText(el.value || el.textContent || "");
      const old = b.textContent; b.textContent = "Copié !";
      setTimeout(()=> b.textContent = old, 900);
    }));

    // Export JSON
    $("#btnExportJSON")?.addEventListener("click", ()=>{
      const blob = new Blob([JSON.stringify(state,null,2)], {type:"application/json"});
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = (state.project.name || "project") + ".json";
      a.click(); URL.revokeObjectURL(a.href);
    });

    // Import JSON
    $("#fileImportJSON")?.addEventListener("change", async (e)=>{
      const file = e.target.files[0]; if (!file) return;
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

    // Export CSV DynLists (un fichier par liste)
    $("#btnExportDynCSVs")?.addEventListener("click", ()=>{
      if (!state.dynlists.length){ toast("Aucune DynList à exporter."); return; }
      state.dynlists.forEach(list=>{
        const lines = [];
        if (DYNLIST_CSV_INCLUDE_HEADER){
          lines.push(DYNLIST_CSV_HEADER_FN(list));
        }
        // Données au format demandé: "code:value"
        list.entries.forEach(e=>{
          const code  = (e.code??"").toString().trim();
          const value = (e.value??"").toString().trim();
          lines.push(`${code}:${value}`);
        });
        const blob = new Blob([lines.join("\n")], {type:"text/plain;charset=utf-8"});
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `${list.listName}.csv`; // tu peux mettre .txt si tu préfères
        a.click();
        URL.revokeObjectURL(a.href);
      });
    });

    // Reset
    $("#btnReset")?.addEventListener("click", ()=>{
      if (!confirm("Réinitialiser le projet (localStorage) ?")) return;
      localStorage.removeItem(STORAGE_KEY); location.reload();
    });
  }
  return { bind };
})();

/* ================= INIT ================= */
document.addEventListener("DOMContentLoaded", ()=>{
  try{
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
    Preview.buildAll();

    // Valeur par défaut au cas où
    $("#formAssoc select[name='sourceMany']")?.value ||= "true";
  }catch(e){
    console.error("[init] erreur de démarrage:", e);
    alert("Erreur de démarrage de l'application (voir console).");
  }
});
