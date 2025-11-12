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
				clearTimeout(timer);
				timer = setTimeout(() => (el.style.display = "none"), timeout);
			},
		};
	})();

	const debounce = (fn, delay = 500) => {
		let t;
		return (...args) => {
			clearTimeout(t);
			t = setTimeout(() => fn(...args), delay);
		};
	};

	function downloadText(filename, text) {
		const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = filename;
		document.body.appendChild(a);
		a.click();
		a.remove();
		setTimeout(() => URL.revokeObjectURL(url), 1000);
	}

	function copyFrom(targetSelector) {
		const ta = $(targetSelector);
		if (!ta) return;
		ta.select();
		document.execCommand("copy");
		Toast.show("Contenu copié dans le presse-papiers OK");
	}

	function normalizeCsvSeparatorToSemicolon(text) {
		return text
			.replace(/\t/g, ";")   // gère le collage Excel (tabs)
			.replace(/,/g, ";");   // garde la compatibilité CSV “, ”
	}


	/***********************
	 * Gestion des onglets
	 ***********************/
	function initTabs() {
		const tabs = $$(".tabs .tab");
		const panels = $$(".tabpanel");

		function activate(tabBtn) {
			const name = tabBtn.dataset.tab;
			tabs.forEach((b) => {
				b.classList.toggle("active", b === tabBtn);
				b.setAttribute("aria-selected", b === tabBtn ? "true" : "false");
			});
			panels.forEach((p) => {
				p.classList.toggle("active", p.id === `tab-${name}`);
			});
		}

		tabs.forEach((btn) => {
			btn.addEventListener("click", () => activate(btn));
		});
	}

	/***********************
	 * Thème clair/sombre
	 ***********************/
	const Theme = (() => {
		const root = document.documentElement;
		const toggleBtn = $("#themeToggle");
		const themeBtns = $$("#tab-parametres [data-theme]");
		const SETTINGS_KEY = "themeMode";

		function apply(mode) {
			if (mode === "auto") {
				const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
				root.setAttribute("data-theme", prefersDark ? "dark" : "light");
			} else {
				root.setAttribute("data-theme", mode);
			}
			toggleBtn?.setAttribute("aria-pressed", root.getAttribute("data-theme") === "dark" ? "true" : "false");
		}

		function getSetting() {
			return Settings.get(SETTINGS_KEY) || "dark";
		}

		function setSetting(mode) {
			Settings.set(SETTINGS_KEY, mode);
		}

		function init() {
			const initial = getSetting();
			apply(initial);

			toggleBtn?.addEventListener("click", () => {
				const cur = root.getAttribute("data-theme");
				const next = cur === "dark" ? "light" : "dark";
				setSetting(next);
				apply(next);
			});

			themeBtns.forEach((b) =>
				b.addEventListener("click", () => {
					const mode = b.dataset.theme;
					setSetting(mode);
					apply(mode);
					Toast.show(`Thème: ${mode}`, "info");
				})
			);
		}

		return { init, apply };
	})();

	/***********************
	 * IndexedDB
	 ***********************/
	const DB_NAME = "holocron-db";
	const DB_VERSION = 1;
	const STORE_PROJECTS = "projects";
	const STORE_DYNLISTS = "dynlists";
	const STORE_SETTINGS = "settings";
	const STORE_VERSIONS = "versions";

	let db;

	function openDB() {
		return new Promise((resolve, reject) => {
			const req = window.indexedDB.open(DB_NAME, DB_VERSION);
			req.onupgradeneeded = (e) => {
				const db = req.result;
				if (!db.objectStoreNames.contains(STORE_PROJECTS)) {
					db.createObjectStore(STORE_PROJECTS, { keyPath: "id" });
				}
				if (!db.objectStoreNames.contains(STORE_DYNLISTS)) {
					db.createObjectStore(STORE_DYNLISTS, { keyPath: "id" });
				}
				if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
					db.createObjectStore(STORE_SETTINGS, { keyPath: "key" });
				}
				if (!db.objectStoreNames.contains(STORE_VERSIONS)) {
					db.createObjectStore(STORE_VERSIONS, { keyPath: "key" });
				}
			};
			req.onsuccess = () => {
				db = req.result;
				resolve(db);
			};
			req.onerror = () => reject(req.error);
		});
	}

	function tx(storeName, mode = "readonly") {
		const t = db.transaction(storeName, mode);
		return t.objectStore(storeName);
	}

	const DB = {
		async put(store, value) {
			return new Promise((resolve, reject) => {
				const r = tx(store, "readwrite").put(value);
				r.onsuccess = () => resolve(true);
				r.onerror = () => reject(r.error);
			});
		},
		async get(store, key) {
			return new Promise((resolve, reject) => {
				const r = tx(store).get(key);
				r.onsuccess = () => resolve(r.result);
				r.onerror = () => reject(r.error);
			});
		},
		async delete(store, key) {
			return new Promise((resolve, reject) => {
				const r = tx(store, "readwrite").delete(key);
				r.onsuccess = () => resolve(true);
				r.onerror = () => reject(r.error);
			});
		},
		async getAll(store) {
			return new Promise((resolve, reject) => {
				const req = tx(store).getAll();
				req.onsuccess = () => resolve(req.result || []);
				req.onerror = () => reject(req.error);
			});
		},
		async clear(store) {
			return new Promise((resolve, reject) => {
				const r = tx(store, "readwrite").clear();
				r.onsuccess = () => resolve(true);
				r.onerror = () => reject(r.error);
			});
		},
	};

	/***********************
	 * Settings helper
	 ***********************/
	const Settings = {
		async set(key, value) {
			await DB.put(STORE_SETTINGS, { key, value });
		},
		getSync(key) {
			return null;
		},
		async get(key) {
			const row = await DB.get(STORE_SETTINGS, key);
			return row ? row.value : null;
		},
	};

	/***********************
	 * État applicatif
	 ***********************/
	let currentProject = null; // { id, name, namespace, sets:string[], options, schemaVersion, props:[], assocs:[], dynlists:[] }
	const SCHEMA_VERSION = 1;

	const emptyProject = () => ({
		id: `p_${Date.now()}`,
		name: "",
		namespace: "jdi",
		sets: ["mainInfo"],
		options: { includeContainers: false }, // fragments par défaut
		schemaVersion: SCHEMA_VERSION,
		props: [],
		assocs: [],
		dynlists: [], // { id, techName, displayName, path, addEmptyValue, constraintName, items:[{code,value}] }
	});

	function refreshProjectPicker() {
		DB.getAll(STORE_PROJECTS).then((rows) => {
			const sel = $("#projectPicker");
			sel.innerHTML = "";
			rows.forEach((p) => {
				const opt = document.createElement("option");
				opt.value = p.id;
				opt.textContent = `${p.name || "(sans nom)"} — [${p.namespace}]`;
				sel.appendChild(opt);
			});
		});
	}

	function setSelectOptions(selectEl, values, selectedValue) {
		if (!selectEl) return;
		const uniq = Array.from(new Set(values && values.length ? values : ["mainInfo"]));
		if (!uniq.includes("mainInfo")) uniq.unshift("mainInfo");
		const prev = selectedValue ?? selectEl.value;
		selectEl.innerHTML = "";
		uniq.forEach((v) => {
			const opt = document.createElement("option");
			opt.value = v;
			opt.textContent = v;
			selectEl.appendChild(opt);
		});
		if (prev && uniq.includes(prev)) {
			selectEl.value = prev;
		} else {
			selectEl.value = "mainInfo";
		}
	}

	function refreshSetSelects() {
		const sets = currentProject?.sets || ["mainInfo"];
		setSelectOptions($("#propSet"), sets);
		setSelectOptions($("#assocSet"), sets);
	}

	function loadProjectIntoForm() {
		if (!currentProject) return;

		// MIGRATION: garantir general.multiple
		(currentProject.props || []).forEach(p => {
			p.general = p.general || {};
			if (typeof p.general.multiple === "undefined") {
				p.general.multiple = false;
			}
		});

		$("#projectName").value = currentProject.name || "";
		$("#projectNamespace").value = currentProject.namespace || "jdi";
		$("#projectSets").value = (currentProject.sets || []).join(", ");
		$("#toggleContainers").checked = !!currentProject.options?.includeContainers;

		// NEW: alimente les sélecteurs Set
		refreshSetSelects();

		// dynlist dropdown pour export unitaire
		refreshDynlistSelects();
		renderPropList();
		renderAssocList();
		renderDynList();
		generateAll();
	}

	const autoSave = debounce(async () => {
		if (!currentProject) return;
		await DB.put(STORE_PROJECTS, currentProject);
		Toast.show("Projet auto-sauvegardé 💾");
		refreshProjectPicker();
	}, 1200);

	/***********************
	 * Helpers UI conditionnels
	 ***********************/
	function updatePropConditional() {
		const type = $("#propType").value;
		$$("[data-conditional]").forEach((el) => {
			const cond = el.getAttribute("data-conditional");
			const [k, v] = cond.split("=");
			if (k === "propType") {
				el.style.display = type === v ? "" : "none";
			}
		});

		const hierFieldset = $('fieldset.stack[data-conditional="propType=d:noderef"]');
		if (hierFieldset) hierFieldset.style.display = type === "d:noderef" ? "" : "none";
	}

	// ——— Suggestion de nom technique à partir d’un libellé ———
	function stripDiacritics(s) {
		return (s || "")
			.normalize("NFD")
			.replace(/[\u0300-\u036f]/g, "");
	}
	function toLowerCamelFromLabel(label) {
		if (!label) return "";
		// Remplace tout ce qui n'est pas lettre/numéro par un séparateur
		const cleaned = stripDiacritics(label).replace(/[^a-zA-Z0-9]+/g, " ").trim();
		if (!cleaned) return "";
		const parts = cleaned.split(/\s+/);
		const first = parts[0].toLowerCase();
		const rest = parts.slice(1).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
		let out = [first, ...rest].join("");
		// Si ça commence par un chiffre, préfixer d'une lettre
		if (/^[0-9]/.test(out)) out = "x" + out;
		// Garde uniquement [a-zA-Z0-9_ -] pour respecter le pattern autorisé
		out = out.replace(/[^\w\-]/g, "");
		return out;
	}


	/***********************
	 * PROJET — handlers
	 ***********************/
	function initProjectForm() {
		$("#saveProjectBtn").addEventListener("click", async () => {
			if (!currentProject) currentProject = emptyProject();
			currentProject.name = $("#projectName").value.trim();
			currentProject.namespace = $("#projectNamespace").value.trim() || "jdi";
			const setsStr = $("#projectSets").value.trim();
			currentProject.sets = setsStr ? setsStr.split(",").map((s) => s.trim()).filter(Boolean) : ["mainInfo"];
			currentProject.options = {
				includeContainers: $("#toggleContainers").checked,
			};
			await DB.put(STORE_PROJECTS, currentProject);
			Toast.show("Projet sauvegardé OK", "info");
			refreshProjectPicker();
			refreshSetSelects(); // NEW
			generateAll();
		});

		$("#newProjectBtn").addEventListener("click", () => {
			currentProject = emptyProject();
			loadProjectIntoForm();
			Toast.show("Nouveau projet créé 🆕");
		});

		$("#deleteProjectBtn").addEventListener("click", async () => {
			if (!currentProject) return;
			if (!confirm("Supprimer ce projet ?")) return;
			await DB.delete(STORE_PROJECTS, currentProject.id);
			Toast.show("Projet supprimé 🗑️", "warn");
			currentProject = emptyProject();
			loadProjectIntoForm();
			refreshProjectPicker();
		});

		$("#openProjectBtn").addEventListener("click", async () => {
			const id = $("#projectPicker").value;
			if (!id) return;
			const proj = await DB.get(STORE_PROJECTS, id);
			if (proj) {
				currentProject = proj;
				loadProjectIntoForm();
				Toast.show("Projet chargé 📂");
			}
		});

		// Autosave project fields
		["projectName", "projectNamespace", "projectSets", "toggleContainers"].forEach((id) => {
			const el = document.getElementById(id);
			el.addEventListener("input", () => {
				if (!currentProject) return;
				currentProject.name = $("#projectName").value.trim();
				currentProject.namespace = $("#projectNamespace").value.trim() || "jdi";
				const setsStr = $("#projectSets").value.trim();
				currentProject.sets = setsStr ? setsStr.split(",").map((s) => s.trim()).filter(Boolean) : ["mainInfo"];
				currentProject.options.includeContainers = $("#toggleContainers").checked;
				refreshSetSelects(); // NEW
				autoSave();
				generateAll();
			});
		});
	}

	/***********************
	 * PROPRIÉTÉS — CRUD
	 ***********************/
	function updateMultipleAvailability() {
		const hasDynlist = ($("#propDynlistSelect").value || "").trim() !== "";
		const chk = $("#propMultiple");
		chk.disabled = !hasDynlist;
	}

	$("#propDynlistSelect")?.addEventListener("change", updateMultipleAvailability);
	document.addEventListener("DOMContentLoaded", updateMultipleAvailability);



	function propFormToObject() {
		const tech = $("#propTechName").value.trim();
		const title = $("#propTitle").value.trim();
		const type = $("#propType").value;
		const mandatoryModel = $("#propMandatoryModel").checked;
		const set = $("#propSet").value || "mainInfo";
		const mandatoryField = $("#propMandatoryField").checked;
		const readOnly = $("#propReadOnly").checked;
		const helpId = $("#propHelpId").value.trim();
		const textareaRows = $("#propTextareaRows").value ? parseInt($("#propTextareaRows").value, 10) : null;
		const autocompleteDs = $("#propAutocompleteDs").value.trim();
		const dynlistId = $("#propDynlistSelect").value || "";
		const showForView = $("#propShowForView").checked;
		const showForce = $("#propShowForce").checked;
		const multiple = !!$("#propMultiple")?.checked; 

		let hierarchy = null;
		if (type === "d:noderef") {
			const hierName = $("#hierName").value.trim();
			const hierDs = $("#hierDs").value.trim();
			const levels = [];
			$$("#hierLevelsList .level-row").forEach((row) => {
				const level = parseInt($(".hier-level", row).value || "0", 10);
				const id = $(".hier-id", row).value.trim();
				const parent = $(".hier-parent", row).value.trim();
				if (level && id) levels.push({ level, id, parent });
			});
			if (hierName && hierDs && levels.length) {
				hierarchy = { name: hierName, ds: hierDs, levels: levels.sort((a, b) => a.level - b.level) };
			}
		}

		return {
			tech,
			title,
			type,
			//general: { mandatoryModel },
			general: { mandatoryModel, multiple },
			field: { set, mandatoryField, readOnly, helpId, textareaRows, autocompleteDs, dynlistId },
			show: { forView: showForView, force: showForce },
			hierarchy,
		};
	}

	function setSelectValueOrAppend(selectEl, value) {
		if (!selectEl) return;
		if (!value) return;
		const exists = Array.from(selectEl.options).some((o) => o.value === value);
		if (!exists) {
			const opt = document.createElement("option");
			opt.value = value;
			opt.textContent = value;
			selectEl.appendChild(opt);
		}
		selectEl.value = value;
	}

	function renderPropList() {
		const ul = $("#propList");
		ul.innerHTML = "";
		const tpl = $("#tpl-item-row");
		(currentProject?.props || []).forEach((p, idx) => {
			const li = tpl.content.cloneNode(true);
			$(".item-label", li).textContent = `${p.tech} — ${p.type}`;
			const row = li.querySelector("li");
			$(".edit", row).addEventListener("click", () => {
				$("#propTechName").value = p.tech;
				$("#propTitle").value = p.title || "";
				$("#propType").value = p.type;
				$("#propMandatoryModel").checked = !!p.general?.mandatoryModel;
				$("#propMultiple").checked = !!p.general?.multiple;

				// Assure que le select Set contient la valeur
				refreshSetSelects();
				setSelectValueOrAppend($("#propSet"), p.field?.set || "mainInfo");

				$("#propMandatoryField").checked = !!p.field?.mandatoryField;
				$("#propReadOnly").checked = !!p.field?.readOnly;
				$("#propHelpId").value = p.field?.helpId || "";
				$("#propTextareaRows").value = p.field?.textareaRows || "";
				$("#propAutocompleteDs").value = p.field?.autocompleteDs || "";
				$("#propDynlistSelect").value = p.field?.dynlistId || "";
				updateMultipleAvailability(); // réactive/fige le switch selon présence dynlist

				$("#propShowForView").checked = !!p.show?.forView;
				$("#propShowForce").checked = !!p.show?.force;

				$("#propType").dispatchEvent(new Event("change"));
				if (p.type === "d:noderef") {
					$("#hierName").value = p.hierarchy?.name || "";
					$("#hierDs").value = p.hierarchy?.ds || "";
					const list = $("#hierLevelsList");
					list.innerHTML = "";
					(p.hierarchy?.levels || []).forEach((lvl) => addHierarchyLevelRow(lvl));
				}
				updatePropConditional();

			});
			$(".del", row).addEventListener("click", () => {
				if (!confirm(`Supprimer la propriété "${p.tech}" ?`)) return;
				currentProject.props.splice(idx, 1);
				renderPropList();
				refreshDynlistSelects();
				autoSave();
				generateAll();
			});
			ul.appendChild(li);
		});
	}

	function initPropForm() {

		// Bouton: générer nom technique depuis le libellé
		$("#btnSuggestPropTech")?.addEventListener("click", () => {
			const label = $("#propTitle").value.trim();
			const suggestion = toLowerCamelFromLabel(label);
			if (!suggestion) return Toast.show("Libellé vide ou invalide", "warn");
			$("#propTechName").value = suggestion;
			Toast.show(`Nom technique proposé: ${suggestion}`);
		});


		$("#propType").addEventListener("change", updatePropConditional);
		updatePropConditional();

		$("#addHierLevelBtn").addEventListener("click", () => addHierarchyLevelRow());

		// NEW — boutons "Valeur par défaut"
		$("#btnFillPropAutocompleteDs")?.addEventListener("click", () => fillDefaultFromPlaceholder("#propAutocompleteDs"));
		$("#btnFillHierDs")?.addEventListener("click", () => fillDefaultFromPlaceholder("#hierDs"));

		$("#addPropBtn").addEventListener("click", () => {
			if (!currentProject) currentProject = emptyProject();
			const obj = propFormToObject();
			if (!obj.tech) return Toast.show("Nom technique requis", "warn");
			const existsIdx = currentProject.props.findIndex((x) => x.tech === obj.tech);
			if (existsIdx >= 0) currentProject.props[existsIdx] = obj;
			else currentProject.props.push(obj);

			renderPropList();
			refreshDynlistSelects();
			updateMultipleAvailability();
			autoSave();
			generateAll();
			Toast.show("Propriété ajoutée/mise à jour OK");
		});
	}

	function addHierarchyLevelRow(prefill) {
		const ul = $("#hierLevelsList");
		const tpl = $("#tpl-hier-level");
		const node = tpl.content.cloneNode(true);
		const row = node.querySelector("li.level-row");
		if (prefill) {
			$(".hier-level", row).value = prefill.level ?? "";
			$(".hier-id", row).value = prefill.id ?? "";
			$(".hier-parent", row).value = prefill.parent ?? "";
		}
		$(".level-del", row).addEventListener("click", () => row.remove());
		ul.appendChild(row);
	}

	/***********************
	 * ASSOCIATIONS — CRUD
	 ***********************/
	function assocFormToObject() {
		const tech = $("#assocTechName").value.trim();
		const title = $("#assocTitle").value.trim();
		const targetClass = $("#assocTargetClass").value.trim();
		const sourceMany = $("#assocSourceMany").checked;
		const targetMany = $("#assocTargetMany").checked;
		const set = $("#assocSet").value || "mainInfo";
		const helpId = $("#assocHelpId").value.trim();
		const pageLinkTemplate = $("#assocPageLink").value.trim();
		const ds = $("#assocDs").value.trim();
		return {
			tech,
			title,
			targetClass,
			sourceMany,
			targetMany,
			field: { set, helpId, pageLinkTemplate, ds },
		};
	}

	function renderAssocList() {
		const ul = $("#assocList");
		ul.innerHTML = "";
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

		// Bouton: générer nom technique depuis le libellé (pour les assocs)
		$("#btnSuggestAssocTech")?.addEventListener("click", () => {
			const label = $("#assocTitle").value.trim();
			const suggestion = toLowerCamelFromLabel(label);
			if (!suggestion) return Toast.show("Libellé vide ou invalide", "warn");
			$("#assocTechName").value = suggestion;
			Toast.show(`Nom technique proposé: ${suggestion}`);
		});


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
			Toast.show("Association ajoutée/mise à jour OK");
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
			Toast.show("Dynlist ajoutée/mise à jour OK");
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
			let hasConstraint = false;

			if (p.type === "d:text" && p.field?.dynlistId) {
				const dl = (currentProject.dynlists || []).find((d) => d.techName === p.field.dynlistId);
				if (dl) {
					const cName = dl.constraintName || `${currentProject.namespace}:${dl.techName}Constraint`;
					constraint = `\n\t\t<constraints>\n\t\t\t<constraint ref="${cName}" />\n\t\t</constraints>`;
					hasConstraint = true;
				}
			}

			// NEW — multiple uniquement si une contrainte est présente
			const multiple = p.general?.multiple && hasConstraint ? `\n\t\t<multiple>true</multiple>` : "";
			return `\t<property name="${name}">\n\t\t<title>${escapeXml(p.title || p.tech)}</title>\n\t\t<type>${p.type}</type>${multiple}${mandatory}${constraint}\n\t</property>`;


			//return `\t<property name="${name}">\n\t\t<title>${escapeXml(p.title || p.tech)}</title>\n\t\t<type>${p.type}</type>${mandatory}${constraint}\n\t</property>`;
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
		const assocShow = (currentProject.assocs || []).map((p) => {
			const id = `${ns}:${p.tech}`;
			const attrs = [];
			//A rajouter pour faire comme prop. Oubli
			//if (p.show?.forView) attrs.push(`for-mode="view"`);
			//if (p.show?.force) attrs.push(`force="true"`);
			return `\t<show id="${id}"${attrs.length ? " " + attrs.join(" ") : ""} />`;
		});
		return items.join("\n")+assocShow.join("\n");
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
				Toast.show("Projet importé OK");
			});
		} catch (e) {
			console.error(e);
			Toast.show("JSON invalide !!!", "warn");
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
				Toast.show("Toutes les sections copiées OK");
			} catch {
				const ta = document.createElement("textarea");
				ta.value = all;
				document.body.appendChild(ta);
				ta.select();
				document.execCommand("copy");
				ta.remove();
				Toast.show("Toutes les sections copiées OK");
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
			Toast.show("IndexedDB réinitialisée !!", "warn");
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
