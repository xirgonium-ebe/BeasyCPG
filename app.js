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
  dynlists: [] // { listName, listPath, entries:[{code,value,locale,active,order,parent}] }
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

function escXml(s=""){
  return String(s)
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;");
}

function detectDelimiter(line) {
  if (line.includes("\t")) return "\t";
  if (line.includes(";")) return ";";
  if (line.includes(",")) return ",";
  return ";";
}

function parsePasted(text){
  const lines = text.split(/\r?\n/).filter(l=>l.trim().length>0);
  if (lines.length === 0) return {header:[], rows:[]};

  const delim = detectDelimiter(lines[0]);
  const header = lines[0].split(delim).map(h=>h.trim().toLowerCase());
  const rows = lines.slice(1).map(l => l.split(delim).map(x=>x.trim()));

  // Map to objects by known headers
  const headerIndex = (h) => header.indexOf(h);
  return {
    header,
    rows: rows.map(cols=>{
      const get = (h)=> {
        const i = headerIndex(h);
        return i >= 0 ? cols[i] : "";
      };
      return {
        code: get("code"),
        value: get("value"),
        locale: get("locale"),
        active: (get("active") || "true").toLowerCase() === "true",
        order: Number(get("order") || "0"),
        parent: get("parent")
      };
    })
  };
}

function notify(msg) {
  // Simple toastless notification
  console.log(msg);
  alert(msg);
}

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

// --- Properties -------------------------------------------------------------
function renderProperties() {
  const tb = $("#tblProperties tbody");
  tb.innerHTML = "";
  state.properties.forEach((p, idx)=>{
    const tr = document.createElement("tr");
    const ns = state.project.namespacePrefix || "ns";
    const qname = `${ns}:${p.qnameLocal}`;
    const constraintLabel = p.constraint?.name ? `${p.constraint.name} (${p.constraint.type||""})` : "";
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
      <td><button class="btn btn-danger" data-del="${idx}">Suppr.</button></td>
    `;
    tb.appendChild(tr);
  });
  // bind deletes
  $all('[data-del]').forEach(b=>{
    b.addEventListener("click", ()=>{
      const i = Number(b.dataset.del);
      state.properties.splice(i,1);
      saveState();
      renderProperties();
    });
  });
}

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
  // constraint
  const cName = f.constraintName.value.trim();
  const cType = f.constraintType.value.trim();
  const dynPath = f.dynPath.value.trim();
  if (cName && cType) {
    prop.constraint = {
      name: cName,
      type: cType,
      params: {}
    };
    if (dynPath) {
      prop.constraint.params[state.project.settings.dynListPathParamName || "list-path"] = dynPath;
    }
  }
  // check duplicates
  if (state.properties.some(p => p.qnameLocal === prop.qnameLocal)) {
    notify("Nom technique déjà utilisé pour une autre propriété.");
    return;
  }
  state.properties.push(prop);
  saveState();
  e.currentTarget.reset();
  renderProperties();
});

// --- Associations -----------------------------------------------------------
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
      <td><button class="btn btn-danger" data-del="${idx}">Suppr.</button></td>
    `;
    tb.appendChild(tr);
  });
  $all('#tblAssocs [data-del]').forEach(b=>{
    b.addEventListener("click", ()=>{
      const i = Number(b.dataset.del);
      state.associations.splice(i,1);
      saveState();
      renderAssocs();
    });
  });
}

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
  if (state.associations.some(a => a.qnameLocal === assoc.qnameLocal)) {
    notify("Nom technique déjà utilisé pour une autre association.");
    return;
  }
  state.associations.push(assoc);
  saveState();
  e.currentTarget.reset();
  renderAssocs();
});

// --- DynLists ---------------------------------------------------------------
let lastParsedDyn = [];

$("#btnParseDyn").addEventListener("click", ()=>{
  const f = $("#formDyn");
  const txt = f.pasted.value;
  const parsed = parsePasted(txt);
  lastParsedDyn = parsed.rows;
  notify(`Analyse OK : ${lastParsedDyn.length} ligne(s).`);
});

function renderDyn() {
  const tb = $("#tblDyn tbody");
  tb.innerHTML = "";
  state.dynlists.forEach((d, idx)=>{
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><code>${escXml(d.listName)}</code></td>
      <td>${escXml(d.listPath)}</td>
      <td>${d.entries.length}</td>
      <td><button class="btn btn-danger" data-del="${idx}">Suppr.</button></td>
    `;
    tb.appendChild(tr);
  });
  $all('#tblDyn [data-del]').forEach(b=>{
    b.addEventListener("click", ()=>{
      const i = Number(b.dataset.del);
      state.dynlists.splice(i,1);
      saveState();
      renderDyn();
    });
  });
}

$("#formDyn").addEventListener("submit",(e)=>{
  e.preventDefault();
  const f = e.currentTarget;
  const listName = f.listName.value.trim();
  const listPath = f.listPath.value.trim();
  if (!listName || !listPath) { notify("Nom et chemin requis."); return; }
  if (state.dynlists.some(d => d.listName === listName)) {
    notify("Nom de liste déjà utilisé.");
    return;
  }
  const entries = lastParsedDyn.length ? lastParsedDyn.slice() : [];
  state.dynlists.push({ listName, listPath, entries });
  saveState();
  e.currentTarget.reset();
  lastParsedDyn = [];
  renderDyn();
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
  // constraints from properties
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
    // Exemple de control picker pour cm:person (facultatif, basique)
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
    const sel = b.dataset.copy;
    const el = $(sel);
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
    // minimal merge
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
  // Regénère avant export
  buildAllPreviews();

  const zip = new JSZip();
  const files = [];

  // Model fragments
  files.push({path:"model/fragment-model-properties.xml", content: $("#outProps").value});
  files.push({path:"model/fragment-model-associations.xml", content: $("#outAssocs").value});
  if ($("#outConstraints").value.trim().length){
    files.push({path:"model/fragment-model-constraints.xml", content: $("#outConstraints").value});
  }

  // Share
  files.push({path:"share/fragment-share-show.xml", content: $("#outShow").value});
  files.push({path:"share/fragment-share-field.xml", content: $("#outField").value});

  // CSV for DynLists (semicolon by default)
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

  // README
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

  // project.json for versioning
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
