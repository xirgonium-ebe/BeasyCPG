/* =====================================================
   STAR WARS ALFRESCO GENERATOR (v5.1)
   - Compatible index.html Star Wars
   - Fix DynList Analyse / Ajout
   - Sous-sections Modèle / Show / Field
   ===================================================== */

const STORAGE_KEY = "alfresco_generator_project_starwars_v51";

/* =====================================================
   ========== STATE ==========
   ===================================================== */
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

/* =====================================================
   ========== HELPERS ==========
   ===================================================== */
const $  = (s, r=document)=> r.querySelector(s);
const $$ = (s, r=document)=> Array.from(r.querySelectorAll(s));
const ns = ()=> state.project.namespacePrefix || "ns";
const escXml = (s="")=> String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
function toast(m){ alert(m); }
function saveState(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function loadState(){
  const raw = localStorage.getItem(STORAGE_KEY);
  if(!raw) return;
  try {
    const obj = JSON.parse(raw);
    Object.assign(state.project, obj.project || {});
    state.properties   = obj.properties   || [];
    state.associations = obj.associations || [];
    state.dynlists     = obj.dynlists     || [];
  } catch(e){ console.warn("parse state", e); }
}
function parsePastedSimple(text){
  const rows = [];
  (text||"").split(/\r?\n/).forEach(line=>{
    const l = line.trim();
    if(!l) return;
    const sep = l.includes(":") ? ":" : (l.includes(";") ? ";" : null);
    if(!sep) return;
    const [code,value] = l.split(sep);
    rows.push({ code:(code||"").trim(), value:(value||"").trim() });
  });
  return rows;
}

/* =====================================================
   ========== TABS ==========
   ===================================================== */
$$(".tabs .tab").forEach(b=> b.addEventListener("click", ()=>{
  $$(".tabs .tab").forEach(x=>x.classList.remove("active"));
  b.classList.add("active");
  const t = b.dataset.tab;
  $$("main .panel").forEach(p=>p.classList.remove("active"));
  $(`#tab-${t}`).classList.add("active");
  Project.renderFieldSets();
  Properties.feedDynSelect();
}));

/* =====================================================
   ========== PROJECT ==========
   ===================================================== */
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
    const sels = [
      $("#formProperty select[name='fieldSet']"),
      $("#formAssoc select[name='fieldSet']")
    ].filter(Boolean);
    sels.forEach(sel=>{
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
    f.nsPrefix.value = state.project.namespacePrefix || "";
    f.nsUri.value = state.project.namespaceUri || "";
    f.dynQName.value = state.project.settings.dynListConstraintQName;
    f.dynPathParam.value = state.project.settings.dynListPathParamName;
    f.defaultLocale.value = state.project.settings.defaultLocale;
    f.includeContainers.checked = !!state.project.settings.includeContainers;
    f.containerProperties.checked = !!state.project.settings.containerProperties;
    f.containerAssociations.checked = !!state.project.settings.containerAssociations;
    renderFieldSets();
  }

  function bind(){
    $("#btnAddFieldSet").addEventListener("click", ()=>{
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

    $("#formProject").addEventListener("submit",(e)=>{
      e.preventDefault();
      const f = e.currentTarget;
      state.project.name = f.projectName.value.trim();
      state.project.namespacePrefix = f.nsPrefix.value.trim();
      state.project.namespaceUri = f.nsUri.value.trim();
      state.project.settings.dynListConstraintQName = f.dynQName.value.trim();
      state.project.settings.dynListPathParamName = f.dynPathParam.value.trim();
      state.project.settings.defaultLocale = f.defaultLocale.value.trim();
      state.project.settings.includeContainers = f.includeContainers.checked;
      state.project.settings.containerProperties = f.containerProperties.checked;
      state.project.settings.containerAssociations = f.containerAssociations.checked;
      saveState();
      toast("Projet enregistré.");
    });
  }
  return { populateForm, renderFieldSets, bind };
})();

/* =====================================================
   ========== PROPERTIES ==========
   ===================================================== */
const Properties = (()=>{
  let editingIndex = null;

  function feedDynSelect(){
    const sel = $("#formProperty select[name='linkDynList']");
    if(!sel) return;
    sel.innerHTML = `<option value="">— aucune —</option>` +
      state.dynlists.map(d=> `<option value="${escXml(d.listName)}">${escXml(d.listName)}</option>`).join("");
    if(editingIndex!==null){
      const curr = state.properties[editingIndex]?.linkDynList || "";
      sel.value = curr;
    }
  }

  function showConditionalBlocks(){
    const f = $("#formProperty");
    const ctrl = f.fieldControl.value;
    $("#propAssocOptions").style.display = (ctrl==="assoc-auto") ? "" : "none";
    $("#propNodeRefOptions").style.display = (ctrl==="noderef-auto") ? "" : "none";
  }

  function resetForm(){
    const f = $("#formProperty");
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
    if(state.project.settings.fieldSets.length)
      f.fieldSet.value = state.project.settings.fieldSets[0];
  }

  function render(){
    const tb = $("#tblProperties tbody");
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
      if(editingIndex===i) resetForm();
    }));
  }

  function fillForm(p){
    const f = $("#formProperty");
    for(const k in p){ if(f[k]!==undefined){ f[k].value = p[k]; } }
    f.multiple.checked = !!p.multiple;
    f.mandatoryModel.checked = !!p.mandatoryModel;
    f.mandatoryForm.checked = !!p.mandatoryForm;
    f.readOnlyForm.checked = !!p.readOnlyForm;
    f.showForceProp.checked = !!p.showForceProp;
    f.showForModeProp.checked = !!p.showForModeProp;
    showConditionalBlocks();
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
        linkDynList: f.linkDynList.value || "",
        showForceProp: f.showForceProp.checked,
        showForModeProp: f.showForModeProp.checked
      };
      if(editingIndex===null){
        if(state.properties.some(p=>p.qnameLocal===prop.qnameLocal)){ toast("Nom déjà utilisé."); return; }
        state.properties.push(prop);
      } else {
        state.properties[editingIndex] = prop;
      }
      saveState(); render(); Preview.buildAll(); resetForm();
    });
  }
  return { render, bind, resetForm, feedDynSelect };
})();

/* =====================================================
   ========== ASSOCIATIONS ==========
   ===================================================== */
const Assocs = (()=>{
  let editingIndex = null;
  function resetForm(){
    const f = $("#formAssoc"); f.reset();
    f.sourceMany.value = "true";
    f.targetMany.value = "false";
    editingIndex = null;
    $("#btnCancelAssoc").style.display="none";
  }
  function fillForm(a){
    const f = $("#formAssoc");
    for(const k in a){ if(f[k]!==undefined){ f[k].value=a[k]; } }
    f.mandatoryModel.checked = !!a.mandatoryModel;
    f.mandatoryForm.checked = !!a.mandatoryForm;
  }
  function render(){
    const tb=$("#tblAssocs tbody"); tb.innerHTML="";
    state.associations.forEach((a,i)=>{
      const q=`${ns()}:${a.qnameLocal}`;
      const tr=document.createElement("tr");
      tr.innerHTML=`<td><code>${q}</code></td><td>${a.title}</td><td>${a.targetClass}</td>
        <td>${a.sourceMany}</td><td>${a.targetMany}</td>
        <td>${a.mandatoryModel?"✓":""}</td><td>${a.mandatoryForm?"✓":""}</td><td>${a.fieldSet}</td>
        <td><button class="btn" data-edit="${i}">✏️</button>
        <button class="btn btn-danger" data-del="${i}">🗑️</button></td>`;
      tb.appendChild(tr);
    });
    $$("#tblAssocs [data-edit]").forEach(b=>b.addEventListener("click",()=>{
      editingIndex=Number(b.dataset.edit); fillForm(state.associations[editingIndex]);
      $("#btnCancelAssoc").style.display="inline-block";
    }));
    $$("#tblAssocs [data-del]").forEach(b=>b.addEventListener("click",()=>{
      const i=Number(b.dataset.del); state.associations.splice(i,1);
      saveState(); render(); Preview.buildAll();
    }));
  }
  function bind(){
    $("#btnCancelAssoc").addEventListener("click",resetForm);
    $("#formAssoc").addEventListener("submit",(e)=>{
      e.preventDefault();
      const f=e.currentTarget;
      const assoc={
        qnameLocal:f.qnameLocal.value.trim(),
        title:f.title.value.trim(),
        targetClass:f.targetClass.value.trim(),
        sourceMany:f.sourceMany.value==="true",
        targetMany:f.targetMany.value==="true",
        mandatoryModel:f.mandatoryModel.checked,
        mandatoryForm:f.mandatoryForm.checked,
        fieldSet:f.fieldSet.value||"",
        assocDs:f.assocDs.value.trim(),
        assocPageLinkTemplate:f.assocPageLinkTemplate.value.trim()
      };
      if(editingIndex===null){ state.associations.push(assoc); }
      else{ state.associations[editingIndex]=assoc; }
      saveState(); render(); Preview.buildAll(); resetForm();
    });
  }
  return {render,bind,resetForm};
})();

/* =====================================================
   ========== DYNLISTS ==========
   ===================================================== */
const Dyn = (()=>{
  let editingIndex = null;
  let lastParsed = [];

  function resetForm(){
    const f=$("#formDyn"); f.reset();
    editingIndex=null; lastParsed=[];
    $("#btnCancelDyn").style.display="none";
  }

  function render(){
    const tb=$("#tblDyn tbody"); tb.innerHTML="";
    state.dynlists.forEach((d,i)=>{
      const tr=document.createElement("tr");
      tr.innerHTML=`<td><code>${d.listName}</code></td><td>${d.listPath}</td>
      <td>${d.entries.length}</td>
      <td><button class="btn" data-edit="${i}">✏️</button><button class="btn btn-danger" data-del="${i}">🗑️</button></td>`;
      tb.appendChild(tr);
    });
    $$("#tblDyn [data-edit]").forEach(b=>b.addEventListener("click",()=>{
      editingIndex=Number(b.dataset.edit);
      const d=state.dynlists[editingIndex];
      const f=$("#formDyn");
      f.listName.value=d.listName; f.listPath.value=d.listPath;
      f.pasted.value=d.entries.map(e=>`${e.code}:${e.value}`).join("\n");
      lastParsed=d.entries.slice();
      $("#btnCancelDyn").style.display="inline-block";
      Properties.feedDynSelect();
    }));
    $$("#tblDyn [data-del]").forEach(b=>b.addEventListener("click",()=>{
      const i=Number(b.dataset.del);
      state.dynlists.splice(i,1); saveState(); render(); Properties.feedDynSelect(); Preview.buildAll();
      resetForm();
    }));
  }

  function bind(){
    const form=$("#formDyn");
    const btnParse=$("#btnParseDyn");
    const btnAdd=$("#btnInlineAdd");
    const btnCancel=$("#btnCancelDyn");

    btnParse?.addEventListener("click",()=>{
      lastParsed=parsePastedSimple(form.pasted.value);
      toast(`Analyse OK : ${lastParsed.length} ligne(s).`);
    });

    btnAdd?.addEventListener("click",()=>{
      const e={code:(form.il_code.value||"").trim(),value:(form.il_value.value||"").trim()};
      if(!e.code&&!e.value){toast("Code ou Value requis.");return;}
      lastParsed.push(e); form.il_code.value=""; form.il_value.value="";
    });

    btnCancel?.addEventListener("click",resetForm);

    form.addEventListener("submit",(e)=>{
      e.preventDefault();
      const listName=form.listName.value.trim(), listPath=form.listPath.value.trim();
      if(!listName||!listPath){toast("Nom et path requis.");return;}
      if(!lastParsed.length && form.pasted.value.trim()) lastParsed=parsePastedSimple(form.pasted.value);
      if(editingIndex===null){
        if(state.dynlists.some(d=>d.listName===listName)){toast("Nom déjà utilisé.");return;}
        state.dynlists.push({listName,listPath,entries:lastParsed.slice()});
      } else {
        state.dynlists[editingIndex]={listName,listPath,entries:lastParsed.slice()};
      }
      saveState(); render(); Properties.feedDynSelect(); Preview.buildAll(); resetForm();
    });
  }

  return { render, bind, resetForm };
})();

/* =====================================================
   ========== PREVIEW ==========
   ===================================================== */
const Preview = (()=>{
  function buildModelProperties(){
    const out=[];
    if(state.project.settings.includeContainers && state.project.settings.containerProperties) out.push("<properties>");
    state.properties.forEach(p=>{
      out.push(`  <property name="${ns()}:${p.qnameLocal}">`);
      out.push(`    <type>${p.type}</type>`);
      out.push(`    <multiple>${p.multiple}</multiple>`);
      out.push(`    <mandatory>${!!p
