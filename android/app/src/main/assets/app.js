(function () {
  const DAYS = {
    mon: { weekday: "Monday", short: "MON", section: "Additive Section", blurb: "Truck tippler, weigh feeder, 113BC080/100, HT crusher, stacker." },
    tue: { weekday: "Tuesday", short: "TUE", section: "Bauxite Section", blurb: "Bauxite feeders, crushers, and yard belts for the weekly PM round." },
    wed: { weekday: "Wednesday", short: "WED", section: "Gypsum Section", blurb: "Gypsum hoppers, feeders, crushers, and belt drives." },
    thu: { weekday: "Thursday", short: "THU", section: "LC-8 / Tippler", blurb: "Wagon tippler, LC-8 feed path, and associated conveyors." },
    fri: { weekday: "Friday", short: "FRI", section: "Coal Reclaimers", blurb: "Coal reclaimers, yard belts, and feed conveyors." },
    sat: { weekday: "Saturday", short: "SAT", section: "Coal Crusher & Stacker", blurb: "HT coal crusher, LRS, stacker, and reclaim path." },
  };
  const SHIFT_LABEL = {
    A: "A (06:00–14:00)",
    B: "B (14:00–22:00)",
    C: "C (22:00–06:00)",
    G: "General (09:00–18:00)",
  };
  const ACCOUNTS = [
    { username: "admin", password: "Chittapur-Admin-26", name: "Electrical Admin", role: "admin" },
    { username: "ramesh.k", password: "ShiftA-Ramesh-26", name: "Ramesh Kumar", role: "technician" },
    { username: "priya.m", password: "ShiftB-Priya-26", name: "Priya Menon", role: "technician" },
    { username: "suresh.n", password: "ShiftC-Suresh-26", name: "Suresh Naik", role: "technician" },
    { username: "anjali.p", password: "General-Anjali-26", name: "Anjali Patil", role: "technician" },
  ];

  const native = window.OCLNative;
  const CATALOGUE = window.ALL_DAYS_DATA || {};
  let session = null;
  let currentDay = "mon";
  let draft = emptyDraft();
  let lastRecord = null;

  function emptyDraft() {
    return { date: todayISO(), shift: "G", sup: "", equip: {}, common: {} };
  }
  function todayISO() {
    const d = new Date();
    const off = d.getTimezoneOffset();
    return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 10);
  }
  function show(id) {
    document.querySelectorAll(".screen").forEach((el) => el.classList.toggle("on", el.id === id));
    window.scrollTo(0, 0);
  }
  function openServer() {
    if (native && native.openServerSettings) native.openServerSettings();
    else alert("Enter the plant LAN address in the Android server screen.");
  }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function writeText(name, text) {
    try {
      if (native && native.writeText) return native.writeText(name, text);
    } catch (e) {}
    try {
      localStorage.setItem("oclfile:" + name, text);
      return true;
    } catch (e) {
      return false;
    }
  }
  function readText(name) {
    try {
      if (native && native.readText) {
        const v = native.readText(name);
        if (v != null && v !== "") return v;
      }
    } catch (e) {}
    try {
      return localStorage.getItem("oclfile:" + name);
    } catch (e) {
      return null;
    }
  }
  function writePhotoFile(id, dataUrl) {
    const comma = dataUrl.indexOf(",");
    const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
    try {
      if (native && native.writeBase64) return native.writeBase64("photo-" + id + ".jpg", b64);
    } catch (e) {}
    try {
      localStorage.setItem("oclphoto:" + id, dataUrl);
      return true;
    } catch (e) {
      return false;
    }
  }
  function readPhotoSrc(id) {
    try {
      if (native && native.readBase64) {
        const b64 = native.readBase64("photo-" + id + ".jpg");
        if (b64) return "data:image/jpeg;base64," + b64;
      }
    } catch (e) {}
    try {
      return localStorage.getItem("oclphoto:" + id);
    } catch (e) {
      return null;
    }
  }
  function newPhotoId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function storeGet(key) {
    try {
      if (native && native.getItem) {
        const v = native.getItem(key);
        if (v != null && v !== "") return v;
      }
    } catch (e) {}
    try {
      return localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }
  function storeSet(key, value) {
    if (value && value.length > 4000) {
      writeText("pref-" + key.replace(/[^A-Za-z0-9._-]/g, "_"), value);
      return;
    }
    try {
      if (native && native.setItem) native.setItem(key, value);
    } catch (e) {}
    try {
      localStorage.setItem(key, value);
    } catch (e) {}
  }
  function storeDel(key) {
    try {
      if (native && native.removeItem) native.removeItem(key);
    } catch (e) {}
    try {
      localStorage.removeItem(key);
    } catch (e) {}
  }

  function recordIndex() {
    try {
      return JSON.parse(readText("index.json") || storeGet("ocl_local_submissions") || "[]") || [];
    } catch (e) {
      return [];
    }
  }
  function saveIndex(rows) {
    writeText("index.json", JSON.stringify(rows.slice(0, 80)));
  }
  function loadRecord(id) {
    try {
      const raw = readText("record-" + id + ".json");
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    const rows = recordIndex();
    return rows.find((r) => r && r.id === id) || null;
  }
  function saveFullRecord(rec) {
    writeText("record-" + rec.id + ".json", JSON.stringify(rec));
    const idx = recordIndex().filter((r) => r.id !== rec.id);
    idx.unshift({
      id: rec.id,
      savedAt: rec.savedAt,
      status: rec.status,
      meta: rec.meta,
    });
    saveIndex(idx);
  }

  function photoRefs(list) {
    if (!list || !list.length) return [];
    return list
      .map((p) => {
        if (!p) return null;
        if (typeof p === "string") {
          if (p.startsWith("data:")) {
            const id = newPhotoId();
            writePhotoFile(id, p);
            return { id };
          }
          return { id: p };
        }
        if (p.id) return { id: p.id };
        if (p.src && String(p.src).startsWith("data:")) {
          const id = newPhotoId();
          writePhotoFile(id, p.src);
          return { id };
        }
        return null;
      })
      .filter(Boolean);
  }
  function photoSrc(p) {
    if (!p) return "";
    if (typeof p === "string") {
      if (p.startsWith("data:")) return p;
      return readPhotoSrc(p) || "";
    }
    if (p.src && String(p.src).startsWith("data:")) return p.src;
    if (p.id) return readPhotoSrc(p.id) || "";
    return "";
  }
  function persistPhotoList(list) {
    const refs = photoRefs(list);
    const srcs = refs.map((r) => photoSrc(r)).filter(Boolean);
    return { refs, srcs };
  }

  function compressFile(file, cb) {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const c = document.createElement("canvas");
      let w = img.width;
      let h = img.height;
      const max = 960;
      if (Math.max(w, h) > max) {
        const s = max / Math.max(w, h);
        w = Math.round(w * s);
        h = Math.round(h * s);
      }
      c.width = w;
      c.height = h;
      c.getContext("2d").drawImage(img, 0, 0, w, h);
      const dataUrl = c.toDataURL("image/jpeg", 0.55);
      URL.revokeObjectURL(url);
      const id = newPhotoId();
      const ok = writePhotoFile(id, dataUrl);
      cb(ok ? { id } : null, ok ? dataUrl : null);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      cb(null, null);
    };
    img.src = url;
  }

  function loadSession() {
    try {
      const raw = storeGet("ocl_local_session");
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  document.getElementById("open-server").onclick = openServer;
  document.getElementById("days-server").onclick = openServer;
  document.getElementById("log-server").onclick = openServer;
  document.getElementById("days-out").onclick = () => {
    session = null;
    storeDel("ocl_local_session");
    show("auth");
  };
  document.getElementById("open-history").onclick = renderHistory;
  document.getElementById("hist-back").onclick = () => show("days");
  document.getElementById("log-back").onclick = () => show("days");
  document.getElementById("done-days").onclick = () => show("days");
  document.getElementById("done-print").onclick = printLast;
  document.getElementById("rec-back").onclick = renderHistory;
  document.getElementById("rec-print").onclick = printLast;
  document.getElementById("submit").onclick = submitDraft;

  document.getElementById("login-form").onsubmit = (e) => {
    e.preventDefault();
    const u = document.getElementById("user").value.trim();
    const p = document.getElementById("pass").value;
    const hit = ACCOUNTS.find((a) => a.username === u && a.password === p);
    const err = document.getElementById("login-err");
    if (!hit) {
      err.textContent = "Username or password is not recognised.";
      return;
    }
    err.textContent = "";
    session = { username: hit.username, name: hit.name, role: hit.role };
    storeSet("ocl_local_session", JSON.stringify(session));
    renderDays();
  };

  function renderDays() {
    const list = document.getElementById("day-list");
    list.innerHTML = "";
    Object.keys(DAYS).forEach((key) => {
      const meta = DAYS[key];
      const day = CATALOGUE[key];
      const n = day && day.equip ? day.equip.length : 0;
      const common = day && day.common ? day.common.reduce((a, g) => a + (g.items ? g.items.length : 0), 0) : 0;
      const card = document.createElement("a");
      card.href = "#";
      card.className = "card day";
      card.innerHTML =
        '<div class="dow">' +
        meta.short +
        "</div><div><h2>" +
        meta.section +
        "</h2><p class='muted'>" +
        meta.blurb +
        "</p><p class='muted' style='margin-top:6px;font-size:12px'>" +
        n +
        " equipment · " +
        common +
        " common devices</p></div>";
      card.onclick = (ev) => {
        ev.preventDefault();
        openDay(key);
      };
      list.appendChild(card);
    });
    show("days");
  }

  function draftKey() {
    return "draft-" + session.username + "-" + currentDay + ".json";
  }
  function openDay(key) {
    currentDay = key;
    draft = emptyDraft();
    const saved = readText(draftKey()) || storeGet("ocl_local_draft:" + session.username + ":" + key);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.date) draft = parsed;
      } catch (e) {}
    }
    document.getElementById("log-title").textContent = CATALOGUE[key].formLabel;
    document.getElementById("date").value = draft.date || todayISO();
    document.getElementById("shift").value = draft.shift || "";
    document.getElementById("tech").value = session.name;
    document.getElementById("sup").value = draft.sup || "";
    bindMeta();
    renderEquip();
    renderCommon();
    updatePct();
    show("log");
  }

  function bindMeta() {
    ["date", "shift", "sup"].forEach((id) => {
      document.getElementById(id).oninput = persistDraft;
      document.getElementById(id).onchange = persistDraft;
    });
  }
  function persistDraft() {
    draft.date = document.getElementById("date").value;
    draft.shift = document.getElementById("shift").value;
    draft.sup = document.getElementById("sup").value;
    writeText(draftKey(), JSON.stringify(draft));
    updatePct();
  }
  function eqState(id) {
    if (!draft.equip[id]) {
      draft.equip[id] = {
        status: null,
        params: {},
        checks: {},
        stoppedChecks: {},
        remarks: "",
        photos: [],
        checkPhotos: {},
        stoppedPhotos: {},
      };
    }
    const st = draft.equip[id];
    if (!st.photos) st.photos = [];
    if (!st.checkPhotos) st.checkPhotos = {};
    if (!st.stoppedPhotos) st.stoppedPhotos = {};
    return st;
  }
  function cmState(id) {
    if (!draft.common[id]) draft.common[id] = { ok: null, remarks: "", photos: [] };
    if (!draft.common[id].photos) draft.common[id].photos = [];
    return draft.common[id];
  }

  function renderEquip() {
    const day = CATALOGUE[currentDay];
    const host = document.getElementById("equip-list");
    host.innerHTML = "";
    day.equip.forEach((item) => {
      const st = eqState(item.id);
      const det = document.createElement("details");
      det.className = "equip";
      const ht = item.isHT ? '<span class="pill ht">HT</span> ' : "";
      det.innerHTML =
        "<summary><span>" +
        ht +
        "<strong>" +
        item.tag +
        "</strong> " +
        item.name +
        '</span><span class="status-label muted"></span></summary><div class="body"></div>';
      const body = det.querySelector(".body");
      const tog = document.createElement("div");
      tog.className = "tog";
      tog.innerHTML =
        '<button type="button" data-s="R">RUNNING</button><button type="button" data-s="S">STOPPED</button>';
      body.appendChild(tog);
      const fields = document.createElement("div");
      body.appendChild(fields);
      function paint() {
        tog.querySelectorAll("button").forEach((b) => {
          b.className = "";
          if (st.status === "R" && b.dataset.s === "R") b.className = "on-r";
          if (st.status === "S" && b.dataset.s === "S") b.className = "on-s";
        });
        det.querySelector(".status-label").textContent =
          st.status === "R" ? "RUNNING" : st.status === "S" ? "STOPPED" : "PENDING";
        fields.innerHTML = "";
        if (st.status === "R") {
          fields.appendChild(paramBlock(item.runningParams, st));
          fields.appendChild(
            checkBlock(item.runningChecks, st.checks, st.checkPhotos, (next) => {
              st.checks = next;
              persistDraft();
            })
          );
        } else if (st.status === "S") {
          fields.appendChild(
            checkBlock(item.stoppedChecks, st.stoppedChecks, st.stoppedPhotos, (next) => {
              st.stoppedChecks = next;
              persistDraft();
            })
          );
        }
        const rem = document.createElement("label");
        rem.textContent = "Remarks";
        const ta = document.createElement("textarea");
        ta.rows = 2;
        ta.value = st.remarks;
        ta.oninput = () => {
          st.remarks = ta.value;
          persistDraft();
        };
        fields.appendChild(rem);
        fields.appendChild(ta);
        fields.appendChild(
          photoRow(st.photos, (photos) => {
            st.photos = photos;
            persistDraft();
          })
        );
      }
      tog.onclick = (ev) => {
        const b = ev.target.closest("button");
        if (!b) return;
        st.status = st.status === b.dataset.s ? null : b.dataset.s;
        persistDraft();
        paint();
      };
      paint();
      host.appendChild(det);
    });
  }

  function paramBlock(params, st) {
    const wrap = document.createElement("div");
    wrap.className = "grid two";
    (params || []).forEach((p) => {
      if (!st.params[p.id]) st.params[p.id] = {};
      const val = st.params[p.id];
      const box = document.createElement("div");
      box.innerHTML = "<label>" + esc(p.label) + (p.unit ? " (" + esc(p.unit) + ")" : "") + "</label>";
      if (p.phases) {
        ["r", "y", "b"].forEach((ph) => {
          const inp = document.createElement("input");
          inp.inputMode = "decimal";
          inp.placeholder = ph.toUpperCase();
          inp.value = val[ph] || "";
          inp.oninput = () => {
            val[ph] = inp.value;
            persistDraft();
          };
          box.appendChild(inp);
        });
      } else {
        const inp = document.createElement("input");
        inp.inputMode = "decimal";
        inp.value = val.v || "";
        inp.oninput = () => {
          val.v = inp.value;
          persistDraft();
        };
        box.appendChild(inp);
      }
      wrap.appendChild(box);
    });
    return wrap;
  }

  function checkBlock(checks, answers, photosByIndex, onChange) {
    const wrap = document.createElement("div");
    (checks || []).forEach((text, i) => {
      const row = document.createElement("div");
      row.className = "check";
      const key = String(i);
      if (!photosByIndex[key]) photosByIndex[key] = [];
      row.innerHTML =
        "<p>" +
        esc(text) +
        '</p><div class="tog"><button type="button" data-v="ok">OK</button><button type="button" data-v="fail">FAIL</button></div>';
      const tog = row.querySelector(".tog");
      const extra = document.createElement("div");
      function paint() {
        tog.querySelectorAll("button").forEach((b) => {
          b.className = "";
          if (answers[key] === "ok" && b.dataset.v === "ok") b.className = "on-ok";
          if (answers[key] === "fail" && b.dataset.v === "fail") b.className = "on-fail";
        });
        extra.innerHTML = "";
        if (answers[key] === "fail") {
          extra.appendChild(
            photoRow(photosByIndex[key], (photos) => {
              photosByIndex[key] = photos;
              persistDraft();
            })
          );
        }
      }
      tog.onclick = (ev) => {
        const b = ev.target.closest("button");
        if (!b) return;
        answers[key] = answers[key] === b.dataset.v ? null : b.dataset.v;
        onChange(answers);
        paint();
      };
      row.appendChild(extra);
      paint();
      wrap.appendChild(row);
    });
    return wrap;
  }

  function photoRow(photos, onChange) {
    const wrap = document.createElement("div");
    wrap.style.marginTop = "8px";
    const list = document.createElement("div");
    list.className = "photos row";
    function paint() {
      list.innerHTML = "";
      (photos || []).forEach((p, i) => {
        const src = photoSrc(p);
        if (!src) return;
        const img = document.createElement("img");
        img.src = src;
        img.alt = "Defect photo";
        img.onclick = () => {
          photos.splice(i, 1);
          onChange(photos);
          paint();
        };
        list.appendChild(img);
      });
    }
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn small";
    btn.textContent = "Attach defect photo";
    const file = document.createElement("input");
    file.type = "file";
    file.accept = "image/*";
    file.setAttribute("capture", "environment");
    file.className = "hidden-file";
    btn.onclick = () => file.click();
    file.onchange = () => {
      const f = file.files && file.files[0];
      if (!f) return;
      compressFile(f, (ref) => {
        if (ref) {
          photos.push(ref);
          onChange(photos);
          paint();
        }
      });
      file.value = "";
    };
    wrap.appendChild(list);
    wrap.appendChild(btn);
    wrap.appendChild(file);
    paint();
    return wrap;
  }

  function renderCommon() {
    const day = CATALOGUE[currentDay];
    const host = document.getElementById("common-list");
    host.innerHTML = "";
    (day.common || []).forEach((group) => {
      const card = document.createElement("div");
      card.className = "card";
      card.innerHTML = "<h2>" + esc(group.name) + "</h2>";
      (group.items || []).forEach((item) => {
        const st = cmState(item.id);
        const box = document.createElement("div");
        box.className = "check";
        box.innerHTML =
          "<p><strong>" +
          esc(item.tag) +
          "</strong> " +
          esc(item.device) +
          "</p><p class='muted'>" +
          esc(item.check) +
          '</p><div class="tog"><button type="button" data-v="ok">OK</button><button type="button" data-v="fail">FAIL</button></div>';
        const tog = box.querySelector(".tog");
        const extra = document.createElement("div");
        function paint() {
          tog.querySelectorAll("button").forEach((b) => {
            b.className = "";
            if (st.ok === "ok" && b.dataset.v === "ok") b.className = "on-ok";
            if (st.ok === "fail" && b.dataset.v === "fail") b.className = "on-fail";
          });
          extra.innerHTML = "";
          if (st.ok === "fail") {
            const ta = document.createElement("textarea");
            ta.placeholder = "Remarks";
            ta.value = st.remarks;
            ta.oninput = () => {
              st.remarks = ta.value;
              persistDraft();
            };
            extra.appendChild(ta);
            extra.appendChild(
              photoRow(st.photos, (photos) => {
                st.photos = photos;
                persistDraft();
              })
            );
          }
        }
        tog.onclick = (ev) => {
          const b = ev.target.closest("button");
          if (!b) return;
          st.ok = st.ok === b.dataset.v ? null : b.dataset.v;
          persistDraft();
          paint();
        };
        box.appendChild(extra);
        paint();
        card.appendChild(box);
      });
      host.appendChild(card);
    });
  }

  function progress() {
    const day = CATALOGUE[currentDay];
    let done = 0;
    let total = 0;
    day.equip.forEach((item) => {
      total += 1;
      const st = eqState(item.id);
      if (st.status) done += 1;
      const checks = st.status === "S" ? item.stoppedChecks : item.runningChecks;
      (checks || []).forEach((_, i) => {
        total += 1;
        const bag = st.status === "S" ? st.stoppedChecks : st.checks;
        if (bag[String(i)] === "ok" || bag[String(i)] === "fail") done += 1;
      });
    });
    (day.common || []).forEach((g) => {
      (g.items || []).forEach((item) => {
        total += 1;
        const st = cmState(item.id);
        if (st.ok === "ok" || st.ok === "fail") done += 1;
      });
    });
    const pct = total ? Math.round((100 * done) / total) : 0;
    return { done, total, pct };
  }
  function updatePct() {
    const p = progress();
    document.getElementById("log-pct").textContent = p.pct + "% · " + p.done + " / " + p.total;
    document.getElementById("sum-line").textContent =
      session.name + " · " + (SHIFT_LABEL[draft.shift] || "Shift not selected") + " · stored on this phone";
  }

  function freezePhotos(st) {
    st.photos = photoRefs(st.photos);
    const freezeMap = (map) => {
      const next = {};
      Object.keys(map || {}).forEach((k) => {
        next[k] = photoRefs(map[k]);
      });
      return next;
    };
    if (st.checkPhotos) st.checkPhotos = freezeMap(st.checkPhotos);
    if (st.stoppedPhotos) st.stoppedPhotos = freezeMap(st.stoppedPhotos);
  }

  function submitDraft() {
    persistDraft();
    const err = document.getElementById("submit-err");
    if (!draft.date || !draft.shift) {
      err.textContent = "Date and shift are required before this round can be archived.";
      return;
    }
    const p = progress();
    const equip = JSON.parse(JSON.stringify(draft.equip));
    const common = JSON.parse(JSON.stringify(draft.common));
    Object.keys(equip).forEach((id) => freezePhotos(equip[id]));
    Object.keys(common).forEach((id) => {
      common[id].photos = photoRefs(common[id].photos);
    });
    const rec = {
      id: "L" + Date.now().toString(36),
      savedAt: new Date().toISOString(),
      status: p.pct === 100 ? "COMPLETE" : "PENDING",
      offline: true,
      meta: {
        date: draft.date,
        shift: draft.shift,
        shiftLabel: SHIFT_LABEL[draft.shift],
        tech: session.name,
        username: session.username,
        sup: draft.sup,
        form: CATALOGUE[currentDay].formLabel,
        day: currentDay,
        pct: p.pct,
        done: p.done,
        total: p.total,
      },
      equip: equip,
      common: common,
      snapshot: CATALOGUE[currentDay],
      fails: deriveFails(CATALOGUE[currentDay], equip, common),
    };
    saveFullRecord(rec);
    writeText(draftKey(), "");
    storeDel("ocl_local_draft:" + session.username + ":" + currentDay);
    lastRecord = rec;
    document.getElementById("done-card").innerHTML =
      "<h2>" +
      esc(rec.meta.form) +
      "</h2><p>" +
      esc(rec.meta.date) +
      " · " +
      esc(rec.meta.shiftLabel) +
      " · " +
      esc(rec.meta.tech) +
      "</p><p class='muted'>Saved on this phone as " +
      esc(rec.id) +
      ". Open the record for full readings, checks, and photos.</p><p><button class='btn' type='button' id='done-open'>Open full record</button></p>";
    document.getElementById("done-open").onclick = () => openRecord(rec.id);
    show("done");
  }

  function deriveFails(day, equip, common) {
    const fails = [];
    (day.equip || []).forEach((item) => {
      const st = equip[item.id] || {};
      const checks = st.status === "S" ? item.stoppedChecks : item.runningChecks;
      const answers = st.status === "S" ? st.stoppedChecks : st.checks;
      (checks || []).forEach((c, i) => {
        if (answers && answers[String(i)] === "fail") {
          fails.push({ equipment: item.tag + " " + item.name, issue: c, type: st.status === "S" ? "Stopped Check" : "Running Check" });
        }
      });
      if (st.remarks && String(st.remarks).trim()) {
        fails.push({ equipment: item.tag + " " + item.name, issue: st.remarks, type: "Remark" });
      }
    });
    (day.common || []).forEach((g) => {
      (g.items || []).forEach((item) => {
        const st = common[item.id] || {};
        if (st.ok === "fail") {
          fails.push({
            equipment: item.tag + " " + item.device,
            issue: st.remarks || item.check,
            type: "Common Device",
          });
        }
      });
    });
    return fails;
  }

  function renderHistory() {
    const host = document.getElementById("hist-list");
    const rows = recordIndex().filter((r) => r.meta && r.meta.username === session.username);
    if (!rows.length) {
      host.innerHTML = "<p class='muted'>No on-device records yet.</p>";
      show("history");
      return;
    }
    host.innerHTML = "";
    rows.forEach((r) => {
      const el = document.createElement("div");
      el.className = "card";
      el.innerHTML =
        "<h2>" +
        esc(r.meta.form) +
        '</h2><p class="muted">' +
        esc(r.meta.date) +
        " · " +
        esc(r.meta.shiftLabel) +
        " · " +
        esc(r.meta.tech) +
        " · " +
        esc(r.id) +
        '</p><span class="pill warn">' +
        esc(r.status) +
        "</span> " +
        "<button class='btn small' type='button' data-act='open'>Open</button> " +
        "<button class='btn small' type='button' data-act='print'>Print / PDF</button>";
      el.querySelector("[data-act=open]").onclick = () => openRecord(r.id);
      el.querySelector("[data-act=print]").onclick = () => {
        lastRecord = loadRecord(r.id) || r;
        printLast();
      };
      host.appendChild(el);
    });
    show("history");
  }

  function imgsHtml(list) {
    return (list || [])
      .map((p) => {
        const src = photoSrc(p);
        return src ? '<img src="' + src + '" alt="Defect photo">' : "";
      })
      .join("");
  }

  function recordMarkup(rec) {
    const day = rec.snapshot || CATALOGUE[rec.meta.day] || { equip: [], common: [] };
    const meta = rec.meta || {};
    let html =
      "<article class='card'><p class='muted' style='letter-spacing:.08em;text-transform:uppercase;font-size:11px'>Orient Cement Limited · Electrical Department · Chittapur</p>" +
      "<h1>Weekly Electrical Maintenance Report</h1><p>" +
      esc(meta.form) +
      "</p><table><tbody>" +
      "<tr><td>Date</td><td>" +
      esc(meta.date) +
      "</td></tr><tr><td>Shift</td><td>" +
      esc(meta.shiftLabel) +
      "</td></tr><tr><td>Technician</td><td>" +
      esc(meta.tech) +
      "</td></tr><tr><td>Supervisor</td><td>" +
      esc(meta.sup || "—") +
      "</td></tr><tr><td>Completion</td><td>" +
      esc(meta.pct) +
      "% (" +
      esc(meta.done) +
      "/" +
      esc(meta.total) +
      ") · " +
      esc(rec.status) +
      "</td></tr><tr><td>Record</td><td>" +
      esc(rec.id) +
      "</td></tr></tbody></table></article>";

    const fails = rec.fails && rec.fails.length ? rec.fails : deriveFails(day, rec.equip || {}, rec.common || {});
    if (fails.length) {
      html += "<div class='card'><h3 class='fail'>Defects / failures</h3><ul>";
      fails.forEach((f) => {
        html += "<li><strong>" + esc(f.equipment) + "</strong> — " + esc(f.issue) + " <span class='muted'>(" + esc(f.type) + ")</span></li>";
      });
      html += "</ul></div>";
    }

    html += "<h3>Equipment</h3>";
    (day.equip || []).forEach((item) => {
      const st = (rec.equip || {})[item.id] || {};
      const status = st.status === "R" ? "RUNNING" : st.status === "S" ? "STOPPED" : "PENDING";
      const checks = st.status === "S" ? item.stoppedChecks : item.runningChecks;
      const answers = st.status === "S" ? st.stoppedChecks : st.checks;
      const byIndex = st.status === "S" ? st.stoppedPhotos : st.checkPhotos;
      html += "<div class='card'><div class='row' style='justify-content:space-between'><div><span class='muted'>" +
        esc(item.tag) +
        "</span> " +
        (item.isHT ? '<span class="pill ht">HT</span> ' : "") +
        "<strong>" +
        esc(item.name) +
        "</strong></div><span class='pill " +
        (st.status === "R" ? "ok" : "warn") +
        "'>" +
        status +
        "</span></div>";
      if (st.status === "R" && item.runningParams && item.runningParams.length) {
        html += "<table><tbody>";
        item.runningParams.forEach((p) => {
          const v = (st.params || {})[p.id] || {};
          const shown = p.phases
            ? "R " + (v.r || "—") + " / Y " + (v.y || "—") + " / B " + (v.b || "—")
            : v.v || "—";
          html +=
            "<tr><td>" +
            esc(p.label) +
            (p.unit ? " (" + esc(p.unit) + ")" : "") +
            "</td><td>" +
            esc(shown) +
            "</td><td class='muted'>" +
            esc(p.limit || "") +
            "</td></tr>";
        });
        html += "</tbody></table>";
      }
      (checks || []).forEach((c, i) => {
        const ans = answers ? answers[String(i)] : null;
        const label = ans === "ok" ? "OK" : ans === "fail" ? "FAIL" : "—";
        html += "<p class='" + (ans === "fail" ? "fail" : "") + "'>" + label + " · " + esc(c) + "</p>";
        if (byIndex && byIndex[String(i)] && byIndex[String(i)].length) {
          html += "<div class='photos row'>" + imgsHtml(byIndex[String(i)]) + "</div>";
        }
      });
      if (st.remarks) html += "<p class='fail'>Remarks: " + esc(st.remarks) + "</p>";
      if (st.photos && st.photos.length) html += "<div class='photos row'>" + imgsHtml(st.photos) + "</div>";
      html += "</div>";
    });

    html += "<h3>Common devices</h3>";
    (day.common || []).forEach((group) => {
      html += "<div class='card'><h2>" + esc(group.name) + "</h2>";
      (group.items || []).forEach((item) => {
        const st = (rec.common || {})[item.id] || {};
        const ans = st.ok === "ok" ? "OK" : st.ok === "fail" ? "FAIL" : "—";
        html +=
          "<p class='" +
          (st.ok === "fail" ? "fail" : "") +
          "'><strong>" +
          esc(item.tag) +
          "</strong> " +
          esc(item.device) +
          " — " +
          ans +
          (st.remarks ? " · " + esc(st.remarks) : "") +
          "</p>";
        if (st.photos && st.photos.length) html += "<div class='photos row'>" + imgsHtml(st.photos) + "</div>";
      });
      html += "</div>";
    });

    html +=
      "<div class='card row' style='justify-content:space-between'><div><p class='muted'>Technician Signature</p><p>" +
      esc(meta.tech) +
      "</p></div><div><p class='muted'>Supervisor Signature</p><p>" +
      esc(meta.sup || "_______________") +
      "</p></div></div>";
    return html;
  }

  function openRecord(id) {
    const rec = loadRecord(id);
    if (!rec) {
      alert("That record could not be opened.");
      return;
    }
    lastRecord = rec;
    document.getElementById("record-body").innerHTML = recordMarkup(rec);
    show("record");
  }

  function printLast() {
    if (!lastRecord) return;
    const rec = loadRecord(lastRecord.id) || lastRecord;
    lastRecord = rec;
    const body = recordMarkup(rec);
    const html =
      "<!DOCTYPE html><html><head><meta charset='utf-8'><style>" +
      "body{font-family:sans-serif;margin:12mm;color:#1a1a1a;} table{width:100%;border-collapse:collapse;} td{border-bottom:1px solid #ddd;padding:4px;font-size:10pt;} img{max-width:40mm;max-height:40mm;object-fit:cover;margin:4px;} h1{font-size:16pt;} h3{margin-top:12pt;} .fail{color:#b42318;}" +
      "</style></head><body>" +
      body +
      "</body></html>";
    if (native && native.printHtml) native.printHtml(html, "OCL Maintenance Report");
    else {
      const w = window.open("", "_blank");
      if (w) {
        w.document.write(html);
        w.document.close();
        w.focus();
        w.print();
      } else window.print();
    }
  }

  session = loadSession();
  if (session && session.username) renderDays();
  else show("auth");
})();
