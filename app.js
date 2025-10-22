// --- State & Persistence -----------------------------------------------------
const STORAGE_KEY = "alfresco_generator_project_v1";

const state = {
  project: {
    name: "",
    namespacePrefix: "",
    namespaceUri: "",
    settings: {
      dynListConstraintQName: "bcpg:dynListConstraint",
      dynListPathParamName: "list-path",
      defaultLocale: "fr",
      includeContainers: true,
      containerProperties: true,
      containerAssociations: true
    }
  },
  properties: [],
  associations: [],
  dynlists: []
};

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
    console.warn("Failed to parse saved state", e);
  }
}

// --- Helpers ----------------------------------------------------------------
function $(sel, root=document){ return root.querySelector(sel); }
function $all(sel, root=document){ return Array.from(root.querySelectorAll(sel)); }
function escXml(s=""){ return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
function detectDelimiter(line){ if(line.includes("\t"))return"\t"; if(line.includes(";"))return";"; if(line.includes(","))return","; return";"; }
function parsePasted(text){
  const lines = text.split(/\r?\n/).filter(l=>l.trim().length>0);
  if (!lines.length) return {header:[],rows:[]};
  const delim = detectDelimiter(lines[0]);
  const header = lines[0].split(delim).map(h=>h.trim().toLowerCase());
  const rows = lines.slice(1).map(l => l.split(delim).map(x=>x.trim()));
  const idx = h => header.indexOf(h);
  return {
    header,
    rows: rows.map(cols=>({
      code: idx("code")>=0 ? cols[idx("code")] : "",
      value: idx("value")>=0 ? cols[idx("value")] : "",
      locale: idx("locale")>=0 ? cols[idx("locale")] : "",
      active: ((idx("active")>=0 ? cols[idx("active")] : "true")||"").toLowerCase()==="true",
      order: Number(idx("order")>=0 ? cols[idx("order")] : "0"),
      parent: idx("parent")>=0 ? cols[idx("parent")] : ""
    }))
  };
}
function notify(msg){ console.log(msg); alert(msg); }

// --- UI: Tabs ---------------------------------------------------------------
$all(".tabs .tab").forEach(btn=>{
  btn.addEventListener("click", ()=>{
    $all(".tabs .tab").forEach(b=>b.classList.remove("active"));
    btn.classList.add("active");
    const tab = btn.dataset.tab;
    $all("main .panel").forEach(p=>p.classList.remove("active"));
    $(`#tab-${tab}`).classList.add("active");
  });
});

// --- Project form -----------------------------------------------------------
function populateProjectForm() {
  const f = $("#formProject");
  f.projectName.value = state.project.name || "";
  f.nsPrefix.value = state.project.namespacePrefix || "";
  f.nsUri.value = state.project.namespaceUri || "";
  f.dynQName.value = state.project.settings.dynListConstraintQName || "bcpg:dynListConstraint";
  f.dynPathParam.value = state.project.settings.dynListPathParamName || "list-path";
  f.defaultLocale.value = state.project.settings.defaultLocale || "fr";
  f.includeContainers.checked = !!state.project.settings.includeContainers;
  f.containerProperties.checked = !!state.project.settings.containerProperties;
  f.containerAssociations.checked = !!state.project.settings.containerAssociations;
}
$("#formProject").addEventListener("submit", (e)=>{
  e.preventDefault();
  const f = e.currentTarget;
  state.project.name = f.projectName.value.trim();
  state.project.namespacePrefix = f.nsPrefix.value.trim();
  state.project.namespaceUri = f.nsUri.value.trim();
  state.project.settings.dynListConstraintQName = f.dynQName.value.trim() || "bcpg:dynListConstraint";
  state.project.settings.dynListPathParamName = f.dynPathParam.value.trim() || "list-path";
  state.project.settings.defaultLocale = f.defaultLocale.value.trim() || "fr";
  state.project.settings.includeContainers = f.includeContainers.checked;
  state.project.settings.containerProperties = f.containerProperties.checked;
  state.project.settings.containerAssociations = f.containerAssociations.checked;
  saveState();
  notify("Projet enregistré.");
});

// --- Properties (CRUD + Edit mode) ------------------------------------------
let editingPropIndex = null;

function resetPropForm(){
  const f = $("#formProperty");
  f.reset();
  editingPropIndex = null;
  $("#propFormLegend").textContent = "Nouvelle propriété";
  $("#btnSaveProp").textContent = "Ajouter propriété";
  $("#btnCancelProp").style.display = "none";
}
function fillPropForm(p){
  const f = $("#formProperty");
  f.qnameLocal.value = p.qnameLocal || "";
  f.title.value = p.title || "";
  f.type.value = p.type || "d:text";
  f.multiple.checked = !!p.multiple;
  f.default.value = p.default || "";
  f.mandatoryModel.checked = !!p.mandatoryModel;
  f.mandatoryForm.checked = !!p.mandatoryForm;
  f.readOnlyForm.checked = !!p.readOnlyForm;
  f.constraintName.value = p.constraint?.name || "";
  f.constraintType.value = p.constraint?.type || (state.project.settings.dynListConstraintQName || "bcpg:dynListConstraint");
  f.dynPath.value = p.constraint?.params?.[state.project.settings.dynListPathParamName || "list-path"] || "";
}
function renderProperties() {
  const tb = $("#tblProperties tbody");
  tb.innerHTML = "";
  state.properties.forEach((p, idx)=>{
    const ns = state.project.namespacePrefix || "ns";
    const qname = `${ns}:${p.qnameLocal}`;
    const constraintLabel = p.constraint?.name ? `${p.constraint.name} (${p.constraint.type||""})` : "";
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><code>${qname}</code></td>
      <td>${escXml(p.title||"")}</td>
      <td>${p.type}</td>
      <td>${p.multiple}</td>
      <td>${escXml(p.default||"")}</td>
      <td>${p.mandatoryModel? "✓": ""}</td>
      <td>${p.mandatoryForm? "✓": ""}</td>
      <td>${p.readOnlyForm? "✓": ""}</td>
      <td>${escXml(constraintLabel)}</td>
      <td>
        <button class="btn" data-edit="${idx}">Éditer</button>
        <button class="btn btn-danger" data-del="${idx}">Suppr.</button>
      </td>
    `;
    tb.appendChild(tr);
  });
  // binds
  $all('#tblProperties [data-del]').forEach(b=>{
    b.addEventListener("click", ()=>{
      const i = Number(b.dataset.del);
      state.properties.splice(i,1);
      saveState();
      renderProperties(); buildAllPreviews();
      if (editingPropIndex === i) resetPropForm();
    });
  });
  $all('#tblProperties [data-edit]').forEach(b=>{
    b.addEventListener("click", ()=>{
      const i = Number(b.dataset.edit);
      editingPropIndex = i;
      $("#propFormLegend").textContent = "Éditer la propriété";
      $("#btnSaveProp").textContent = "Mettre à jour";
      $("#btnCancelProp").style.display = "inline-block";
      fillPropForm(state.properties[i]);
      // focus
      $("#formProperty input[name='title']").focus();
    });
  });
}
$("#btnCancelProp").addEventListener("click", resetPropForm);

$("#formProperty").addEventListener("submit",(e)=>{
  e.preventDefault();
  const f = e.currentTarget;
  const prop = {
    qnameLocal: f.qnameLocal.value.trim(),
    title: f.title.value.trim(),
    type: f.type.value,
    multiple: f.multiple.checked,
    default: f.default.value,
    mandatoryModel: f.mandatoryModel.checked,
    mandatoryForm: f.mandatoryForm.checked,
    readOnlyForm: f.readOnlyForm.checked,
    constraint: null
  };
  const cName = f.constraintName.value.trim();
  const cType = f.constraintType.value.trim();
  const dynPath = f.dynPath.value.trim();
  if (cName && cType) {
    prop.constraint = { name: cName, type: cType, params: {} };
    if (dynPath) prop.constraint.params[state.project.settings.dynListPathParamName || "list-path"] = dynPath;
  }

  // create vs update
  if (editingPropIndex === null) {
    if (state.properties.some(p => p.qnameLocal === prop.qnameLocal)) {
      notify("Nom technique déjà utilisé pour une autre propriété.");
      return;
    }
    state.properties.push(prop);
  } else {
    // empêcher collision si on change le nom
    const duplicate = state.properties.some((p, i) => i!==editingPropIndex && p.qnameLocal===prop.qnameLocal);
    if (duplicate) { notify("Nom technique déjà utilisé pour une autre propriété."); return; }
    state.properties[editingPropIndex] = prop;
  }
  saveState();
  renderProperties(); buildAllPreviews();
  resetPropForm();
});

// --- Associations (CRUD + Edit mode) ----------------------------------------
let editingAssocIndex = null;

function resetAssocForm(){
  const f = $("#formAssoc");
  f.reset();
  // valeur par défaut demandée : sourceMany = true
  f.sourceMany.value = "true";
  f.targetMany.value = "false";
  editingAssocIndex = null;
  $("#assocFormLegend").textContent = "Nouvelle association";
  $("#btnSaveAssoc").textContent = "Ajouter association";
  $("#btnCancelAssoc").style.display = "none";
}
function fillAssocForm(a){
  const f = $("#formAssoc");
  f.qnameLocal.value = a.qnameLocal || "";
  f.title.value = a.title || "";
  f.targetClass.value = a.targetClass || "cm:person";
  f.mandatoryModel.checked = !!a.mandatoryModel;
  f.mandatoryForm.checked = !!a.mandatoryForm;
  f.sourceMany.value = a.sourceMany ? "true" : "false";
  f.targetMany.value = a.targetMany ? "true" : "false";
}
function renderAssocs() {
  const tb = $("#tblAssocs tbody");
  tb.innerHTML = "";
  state.associations.forEach((a, idx)=>{
    const ns = state.project.namespacePrefix || "ns";
    const qname = `${ns}:${a.qnameLocal}`;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><code>${qname}</code></td>
      <td>${escXml(a.title||"")}</td>
      <td>${a.targetClass}</td>
      <td>${a.sourceMany}</td>
      <td>${a.targetMany}</td>
      <td>${a.mandatoryModel? "✓": ""}</td>
      <td>${a.mandatoryForm? "✓": ""}</td>
      <td>
        <button class="btn" data-edit="${idx}">Éditer</button>
        <button class="btn btn-danger" data-del="${idx}">Suppr.</button>
      </td>
    `;
    tb.appendChild(tr);
  });
  $all('#tblAssocs [data-del]').forEach(b=>{
    b.addEventListener("click", ()=>{
      const i = Number(b.dataset.del);
      state.associations.splice(i,1);
      saveState();
      renderAssocs(); buildAllPreviews();
      if (editingAssocIndex === i) resetAssocForm();
    });
  });
  $all('#tblAssocs [data-edit]').forEach(b=>{
    b.addEventListener("click", ()=>{
      const i = Number(b.dataset.edit);
      editingAssocIndex = i;
      $("#assocFormLegend").textContent = "Éditer l'association";
      $("#btnSaveAssoc").textContent = "Mettre à jour";
      $("#btnCancelAssoc").style.display = "inline-block";
      fillAssocForm(state.associations[i]);
      $("#formAssoc input[name='title']").focus();
    });
  });
}
$("#btnCancelAssoc").addEventListener("click", resetAssocForm);

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
    mandatoryForm: f.mandatoryForm.checked
  };

  if (editingAssocIndex === null) {
    if (state.associations.some(a => a.qnameLocal === assoc.qnameLocal)) {
      notify("Nom technique déjà utilisé pour une autre association.");
      return;
    }
    state.associations.push(assoc);
  } else {
    const duplicate = state.associations.some((a,i)=> i!==editingAssocIndex && a.qnameLocal===assoc.qnameLocal);
    if (duplicate) { notify("Nom technique déjà utilisé pour une autre association."); return; }
    state.associations[editingAssocIndex] = assoc;
  }
  saveState();
  renderAssocs(); buildAllPreviews();
  resetAssocForm();
});

// --- DynLists (CRUD + Edit mode) --------------------------------------------
let lastParsedDyn = [];
let editingDynIndex = null;

$("#btnParseDyn").addEventListener("click", ()=>{
  const f = $("#formDyn");
  const parsed = parsePasted(f.pasted.value||"");
  lastParsedDyn = parsed.rows;
  notify(`Analyse OK : ${lastParsedDyn.length} ligne(s).`);
});

function resetDynForm(){
  const f = $("#formDyn");
  f.reset();
  editingDynIndex = null;
  lastParsedDyn = [];
  $("#dynFormLegend").textContent = "Nouvelle DynList";
  $("#btnSaveDyn").textContent = "Ajouter DynList";
  $("#btnCancelDyn").style.display = "none";
}
function fillDynForm(d){
  const f = $("#formDyn");
  f.listName.value = d.listName || "";
  f.listPath.value = d.listPath || "";
  // On remplit la zone avec le CSV actuel
  const lines = ["code;value;locale;active;order;parent"];
  d.entries.forEach(e=>{
    lines.push(
      [e.code||"",e.value||"",e.locale||"", e.active===false?"false":"true", String(Number(e.order||0)), e.parent||""]
      .join(";")
    );
  });
  f.pasted.value = lines.join("\n");
  lastParsedDyn = d.entries.slice();
}
function renderDyn() {
  const tb = $("#tblDyn tbody");
  tb.innerHTML = "";
  state.dynlists.forEach((d, idx)=>{
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><code>${escXml(d.listName)}</code></td>
      <td>${escXml(d.listPath)}</td>
      <td>${d.entries.length}</td>
      <td>
        <button class="btn" data-edit="${idx}">Éditer</button>
        <button class="btn btn-danger" data-del="${idx}">Suppr.</button>
      </td>
    `;
    tb.appendChild(tr);
  });
  $all('#tblDyn [data-del]').forEach(b=>{
    b.addEventListener("click", ()=>{
      const i = Number(b.dataset.del);
      state.dynlists.splice(i,1);
      saveState();
      renderDyn(); buildAllPreviews();
      if (editingDynIndex === i) resetDynForm();
    });
  });
  $all('#tblDyn [data-edit]').forEach(b=>{
    b.addEventListener("click", ()=>{
      const i = Number(b.dataset.edit);
      editingDynIndex = i;
      $("#dynFormLegend").textContent = "Éditer la DynList";
      $("#btnSaveDyn").textContent = "Mettre à jour";
      $("#btnCancelDyn").style.display = "inline-block";
      fillDynForm(state.dynlists[i]);
      $("#formDyn input[name='listName']").focus();
    });
  });
}
$("#btnCancelDyn").addEventListener("click", resetDynForm);

$("#formDyn").addEventListener("submit",(e)=>{
  e.preventDefault();
  const f = e.currentTarget;
  const listName = f.listName.value.trim();
  const listPath = f.listPath.value.trim();
  if (!listName || !listPath) { notify("Nom et chemin requis."); return; }

  // si l'utilisateur n'a pas cliqué "Analyser" après édition, on essaye de parser au submit
  if (!lastParsedDyn.length && (f.pasted.value||"").trim().length){
    lastParsedDyn = parsePasted(f.pasted.value).rows;
  }

  if (editingDynIndex === null) {
    if (state.dynlists.some(d => d.listName === listName)) {
      notify("Nom de liste déjà utilisé.");
      return;
    }
    state.dynlists.push({ listName, listPath, entries: lastParsedDyn.slice() });
  } else {
    const duplicate = state.dynlists.some((d,i)=> i!==editingDynIndex && d.listName===listName);
    if (duplicate) { notify("Nom de liste déjà utilisé."); return; }
    state.dynlists[editingDynIndex] = { listName, listPath, entries: lastParsedDyn.slice() };
  }
  saveState();
  renderDyn(); buildAllPreviews();
  resetDynForm();
});

// --- Preview generation ------------------------------------------------------
function buildModelProperties(includeContainers){
  const ns = state.project.namespacePrefix || "ns";
  const lines = [];
  if (includeContainers && state.project.settings.containerProperties) lines.push("<properties>");
  state.properties.forEach(p=>{
    lines.push(`  <property name="${ns}:${p.qnameLocal}">`);
    lines.push(`    <type>${p.type}</type>`);
    lines.push(`    <multiple>${p.multiple}</multiple>`);
    lines.push(`    <mandatory>${!!p.mandatoryModel}</mandatory>`);
    if (p.default !== undefined && p.default !== null && String(p.default).length){
      lines.push(`    <default>${escXml(p.default)}</default>`);
    }
    if (p.constraint){
      lines.push(`    <constraints>`);
      lines.push(`      <constraint name="${p.constraint.name}" type="${p.constraint.type}">`);
      const params = p.constraint.params || {};
      for (const [k,v] of Object.entries(params)){
        lines.push(`        <parameter name="${k}">${escXml(v)}</parameter>`);
      }
      lines.push(`      </constraint>`);
      lines.push(`    </constraints>`);
    }
    lines.push(`  </property>`);
  });
  if (includeContainers && state.project.settings.containerProperties) lines.push("</properties>");
  return lines.join("\n");
}
function buildModelAssociations(includeContainers){
  if (!state.project.settings.containerAssociations && includeContainers) includeContainers = false;
  const ns = state.project.namespacePrefix || "ns";
  const lines = [];
  if (includeContainers) lines.push("<associations>");
  state.associations.forEach(a=>{
    lines.push(`  <association name="${ns}:${a.qnameLocal}">`);
    if (a.title) lines.push(`    <title>${escXml(a.title)}</title>`);
    lines.push(`    <source>`);
    lines.push(`      <mandatory>${!!a.mandatoryModel}</mandatory>`);
    lines.push(`      <many>${!!a.sourceMany}</many>`);
    lines.push(`    </source>`);
    lines.push(`    <target>`);
    lines.push(`      <class>${a.targetClass}</class>`);
    lines.push(`      <mandatory>false</mandatory>`);
    lines.push(`      <many>${!!a.targetMany}</many>`);
    lines.push(`    </target>`);
    lines.push(`  </association>`);
  });
  if (includeContainers) lines.push("</associations>");
  return lines.join("\n");
}
function buildConstraints(includeContainers){
  const lines = [];
  const seen = new Set();
  state.properties.forEach(p=>{
    if (p.constraint && !seen.has(p.constraint.name)) {
      seen.add(p.constraint.name);
      lines.push(`  <constraint name="${p.constraint.name}" type="${p.constraint.type}">`);
      const params = p.constraint.params || {};
      for (const [k,v] of Object.entries(params)){
        lines.push(`    <parameter name="${k}">${escXml(v)}</parameter>`);
      }
      lines.push(`  </constraint>`);
    }
  });
  if (!lines.length) return "";
  if (includeContainers) lines.unshift("<constraints>");
  if (includeContainers) lines.push("</constraints>");
  return lines.join("\n");
}
function buildShow(){
  const ns = state.project.namespacePrefix || "ns";
  const out = [];
  state.properties.forEach(p=> out.push(`<show id="${ns}:${p.qnameLocal}" />`));
  state.associations.forEach(a=> out.push(`<show id="${ns}:${a.qnameLocal}" />`));
  return out.join("\n");
}
function buildField(){
  const ns = state.project.namespacePrefix || "ns";
  const out = [];
  state.properties.forEach(p=>{
    out.push(`<field id="${ns}:${p.qnameLocal}">`);
    out.push(`  <mandatory>${!!p.mandatoryForm}</mandatory>`);
    out.push(`  <read-only>${!!p.readOnlyForm}</read-only>`);
    out.push(`</field>`);
  });
  state.associations.forEach(a=>{
    out.push(`<field id="${ns}:${a.qnameLocal}">`);
    out.push(`  <mandatory>${!!a.mandatoryForm}</mandatory>`);
    if (a.targetClass === "cm:person") {
      out.push(`  <control template="/org/alfresco/components/form/controls/authority.ftl">`);
      out.push(`    <control-param name="allowMultipleSelections">${a.targetMany}</control-param>`);
      out.push(`    <control-param name="authorityType">cm:person</control-param>`);
      out.push(`  </control>`);
    }
    out.push(`</field>`);
  });
  return out.join("\n");
}
function buildAllPreviews(){
  const includeContainers = !!state.project.settings.includeContainers;
  $("#outProps").value = buildModelProperties(includeContainers);
  $("#outAssocs").value = buildModelAssociations(includeContainers);
  $("#outConstraints").value = buildConstraints(includeContainers);
  $("#outShow").value = buildShow();
  $("#outField").value = buildField();
}
$("#btnBuild").addEventListener("click", buildAllPreviews);

// Copy buttons
$all(".btn-copy").forEach(b=>{
  b.addEventListener("click", async ()=>{
    const el = $(b.dataset.copy);
    await navigator.clipboard.writeText(el.value || el.textContent || "");
    b.textContent = "Copié !";
    setTimeout(()=> b.textContent="Copier", 900);
  });
});

// --- Export JSON / Import JSON ----------------------------------------------
$("#btnExportJSON").addEventListener("click", ()=>{
  const blob = new Blob([JSON.stringify(state, null, 2)], {type:"application/json"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = (state.project.name || "project") + ".json";
  a.click();
  URL.revokeObjectURL(a.href);
});
$("#fileImportJSON").addEventListener("change", async (e)=>{
  const file = e.target.files[0];
  if (!file) return;
  const text = await file.text();
  try{
    const obj = JSON.parse(text);
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
    notify("Projet importé.");
  }catch(err){
    notify("Fichier JSON invalide.");
  } finally {
    e.target.value = "";
  }
});
$("#btnReset").addEventListener("click", ()=>{
  if (!confirm("Réinitialiser le projet (localStorage) ?")) return;
  localStorage.removeItem(STORAGE_KEY);
  location.reload();
});

// --- ZIP Download ------------------------------------------------------------
$("#btnDownloadZip").addEventListener("click", async ()=>{
  buildAllPreviews();
  const zip = new JSZip();
  const files = [];
  files.push({path:"model/fragment-model-properties.xml", content: $("#outProps").value});
  files.push({path:"model/fragment-model-associations.xml", content: $("#outAssocs").value});
  if ($("#outConstraints").value.trim().length){
    files.push({path:"model/fragment-model-constraints.xml", content: $("#outConstraints").value});
  }
  files.push({path:"share/fragment-share-show.xml", content: $("#outShow").value});
  files.push({path:"share/fragment-share-field.xml", content: $("#outField").value});

  state.dynlists.forEach(d=>{
    const lines = [];
    lines.push("code;value;locale;active;order;parent");
    d.entries.forEach(e=>{
      const row = [
        e.code ?? "",
        e.value ?? "",
        e.locale ?? (state.project.settings.defaultLocale || "fr"),
        e.active === false ? "false" : "true",
        String(Number(e.order||0)),
        e.parent ?? ""
      ].map(v => String(v).replace(/;/g, ","));
      lines.push(row.join(";"));
    });
    files.push({path:`constraints/${d.listName}.csv`, content: lines.join("\n")});
  });

  const readme = `# Fragments générés

Projet: ${state.project.name || "-"}
Namespace: ${state.project.namespacePrefix || "ns"} (${state.project.namespaceUri || "-"})

## Contenu
- model/fragment-model-properties.xml
- model/fragment-model-associations.xml
- model/fragment-model-constraints.xml (si présent)
- share/fragment-share-show.xml
- share/fragment-share-field.xml
- constraints/*.csv (une par DynList)

> Paramètre DynList: ${state.project.settings.dynListPathParamName || "list-path"}
> QName contrainte: ${state.project.settings.dynListConstraintQName || "bcpg:dynListConstraint"}
`;
  files.push({path:"README.md", content: readme});
  files.push({path:"project.json", content: JSON.stringify(state, null, 2)});

  files.forEach(f=> zip.file(f.path, f.content));
  const blob = await zip.generateAsync({type:"blob"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  const safeName = (state.project.name || "alfresco-fragments").replace(/[^\w\-]+/g,"_");
  a.download = `${safeName}.zip`;
  a.click();
  URL.revokeObjectURL(a.href);
});

// --- Init -------------------------------------------------------------------
loadState();
populateProjectForm();
renderProperties();
renderAssocs();
renderDyn();
buildAllPreviews();

// Assurer la valeur par défaut de sourceMany=true quand on arrive sur l’onglet Associations
// (utile si le navigateur a gardé un ancien état du form)
$("#formAssoc select[name='sourceMany']").value ||= "true";
