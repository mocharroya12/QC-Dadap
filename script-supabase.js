
/* ======================
   Supabase Config
   ====================== */
const SUPABASE_URL = "https://fgidlriiebyebwuzalnz.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZnaWRscmlpZWJ5ZWJ3dXphbG56Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgwMDA2ODYsImV4cCI6MjA3MzU3NjY4Nn0.HBv38h-qPLflK5OO5ciQVRTAldJ8tD75S6WBelwI8D0";
const DRIVE_WEBAPP_URL = "https://script.google.com/macros/s/AKfycby5QQi8xlMuumt90d-IP4aSiFJEfjM3OXwAEvKSwusMaX7U-gSgC87VUFkchbpwapM/exec";     // dari langkah B-5
const DRIVE_FOLDER_ID  = "1XE-9d3zcYQr7iECaGWseHJTbhA89-0Es"; // dari langkah A
if (!window.supabase) {
  console.error("Supabase JS belum dimuat. Pastikan <script src='https://unpkg.com/@supabase/supabase-js@2'></script> ada sebelum script ini.");
}
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
window.sb = sb;

/* ======================
   Utilities
   ====================== */
function el(id){ return document.getElementById(id); }
function escapeCsv(val){
  const s = String(val ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}
async function uploadPublic(bucket, path, file){
  const { error: upErr } = await sb.storage.from(bucket).upload(path, file, { upsert: true });
  if (upErr) { throw upErr; }
  const { data } = sb.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

/* ======================
   PROJECTS
   ====================== */
async function loadProjects(selectId=null, listId=null){
  const { data, error } = await sb.from("projects").select("*").order("created_at", { ascending: false });
  if (error) { console.error(error); return []; }

  if (selectId){
    const sel = el(selectId);
    if (sel){
      sel.innerHTML = (data || []).map(p => `<option value="${p.id}">${p.name}</option>`).join("");

      // pilih project terakhir jika ada, kalau tidak pakai yang pertama
      let targetId = data?.[0]?.id || "";
      try {
        const last = localStorage.getItem("lastProjectId");
        if (last && data?.some(p => p.id === last)) targetId = last;
      } catch {}

      if (targetId){
        sel.value = targetId;
        fireChange(sel);                // ← trigger render otomatis (bubbles)
      }

      // simpan pilihan saat user mengganti project (attach sekali saja)
      if (!sel.dataset.rememberAttached){
        sel.addEventListener("change", () => {
          try { localStorage.setItem("lastProjectId", sel.value); } catch {}
        });
        sel.dataset.rememberAttached = "1";
      }
    }
  }

  if (listId){
    const ul = el(listId);
    if (ul){
      ul.innerHTML = (data || []).map(p => `<li>${p.name} <button onclick="hapusProject('${p.id}')">Hapus</button></li>`).join("");
    }
  }
  return data;
}

async function tambahProject(){
  const name = (el("projectName")?.value || "").trim();
  if (!name) return alert("Nama project harus diisi!");
  const { error } = await sb.from("projects").insert([{ name }]);
  if (error){ alert("Gagal tambah project: " + error.message); return; }
  if (el("projectName")) el("projectName").value="";
  await loadProjects(null, "projectList");
}
async function hapusProject(id){
  if (!confirm("Hapus project ini?")) return;
  const { error } = await sb.from("projects").delete().eq("id", id);
  if (error){ alert("Gagal hapus project: " + error.message); return; }
  await loadProjects(null, "projectList");
}

/* ======================
   DRAWINGS
   ====================== */
async function loadDrawingsByProject(projectId, selectId) {
  const { data, error } = await sb
    .from("drawings")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  const sel = el(selectId);
  if (!sel) return;

  if (error) {
    console.error(error);
    sel.innerHTML = "<option disabled>Gagal memuat drawing</option>";
    return;
  }

  if (!data || data.length === 0) {
    sel.innerHTML = "<option disabled>Belum ada drawing</option>";
    return;
  }

  sel.innerHTML = data.map(d => `<option value="${d.id}">${d.name}</option>`).join("");
  // ✅ lifetime: pilih pertama + paksa event change
  sel.value = data[0].id;
  fireChange(sel);

}

/* ======================
   SIMPAN DRAWING
   ====================== */
async function simpanDrawing(){
  const projectId = document.getElementById("projectSelect")?.value;
  const name = document.getElementById("drawingName")?.value?.trim();
  const url = document.getElementById("drawingUrl")?.value?.trim();

  if (!projectId) return alert("Pilih project terlebih dahulu!");
  if (!name) return alert("Nama drawing harus diisi!");
  if (!url) return alert("Link PDF harus diisi!");

  try {
    const { error } = await sb.from("drawings").insert([{
      project_id: projectId,
      name,
      url
    }]);

    if (error) throw error;

    alert("Drawing berhasil disimpan.");

    // reset input
    document.getElementById("drawingName").value = "";
    document.getElementById("drawingUrl").value = "";

    // refresh daftar
    if (typeof tampilkanDrawing === "function") {
      await tampilkanDrawing();
    }
  } catch (err) {
    console.error(err);
    alert("Gagal simpan drawing: " + err.message);
  }
}

// supaya bisa dipanggil dari onclick di HTML
window.simpanDrawing = simpanDrawing;


document.getElementById("btnSimpanDrawing")?.addEventListener("click", simpanDrawing);


/* ======================
   TAMPILKAN DRAWING
   ====================== */

async function tampilkanDrawing(){
  const projectId = el("projectSelect")?.value;
  const container = el("drawingList");
  if (!container || !projectId) return;

  const { data, error } = await sb.from("drawings")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (error){ 
    console.error(error); 
    container.innerHTML="<p>Gagal memuat drawing.</p>"; 
    return; 
  }
  if (!data || data.length===0){ 
    container.innerHTML="<p>Belum ada Drawing.</p>"; 
    return; 
  }

  container.innerHTML = `
    <ul style="list-style:none; padding:0;">
      ${data.map(d => {
        const path = d.url.replace(/^.*\/o\//, "").split('?')[0];
        return `
        <div class="card">
          <li style="margin:6px 0; display:flex; align-items:center; gap:10px; position:relative;">
            <a href="${esc(d.url)}" target="_blank">📄 ${esc(d.name)}</a>
             
            <!-- User yang input -->
            <div class="small muted" style="margin-left:auto; text-align:right;">
              Input: <strong>${esc(d.created_name || "-")}</strong> • ${formatWIB(d.created_at)}<br>
              Update: <strong>${esc(d.updated_name || "-")}</strong> • ${formatWIB(d.updated_at)}
            </div>

            <!-- Preview button -->
            <button class="icon-btn" data-tooltip="Preview PDF" 
                    onclick="previewPdf('${d.url}')">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            </button>

            <!-- Edit button -->
            <button class="icon-btn edit" data-tooltip="Edit Nama"
                    onclick="editDrawingName('${d.id}', '${d.name}')">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M15.232 5.232l3.536 3.536M16.732 3.732a2.5 2.5 0 013.536 3.536L7.5 19.036H4v-3.572L16.732 3.732z"/>
              </svg>
            </button>

            <!-- Delete button -->
            <button class="icon-btn delete" data-tooltip="Hapus Drawing"
                    onclick="hapusDrawing('${d.id}')">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3m-7 0h8"/>
              </svg>
            </button>
          </li>
        </div>`;
      }).join("")}
    </ul>`;
}

/* ======================
   CONVERT DRIVE LINK
   ====================== */

function convertDriveLink(url){
  try {
    // Cek apakah link Google Drive
    if (url.includes("drive.google.com")) {
      // Ambil file ID dari link
      const match = url.match(/[-\w]{25,}/);
      if (match) {
        const fileId = match[0];
        return `https://drive.google.com/file/d/${fileId}/preview`;
      }
    }
    // Kalau bukan Google Drive, langsung pakai url
    return url;
  } catch {
    return url;
  }
}


/* ======================
   HAPUS DRAWING
   ====================== */
async function hapusDrawing(id){
  if (!confirm("Yakin mau hapus drawing ini?")) return;
  try {
    let { error } = await sb.from("drawings").delete().eq("id", id);
    if (error) throw error;

    alert("Drawing berhasil dihapus.");
    await tampilkanDrawing();
  } catch(err){
    console.error(err);
    alert("Gagal hapus drawing: " + err.message);
  }
}


/* ======================
   EDIT NAMA DRAWING
   ====================== */
async function editDrawingName(id, oldName){
  const newName = prompt("Ubah nama drawing:", oldName);
  if (!newName || newName.trim() === "" || newName === oldName) return;

  try {
    let { error } = await sb.from("drawings").update({ name: newName }).eq("id", id);
    if (error) throw error;
    alert("Nama drawing berhasil diubah.");
    await tampilkanDrawing(); // refresh daftar
  } catch(err){
    console.error(err);
    alert("Gagal mengubah nama: " + err.message);
  }
}

/* ======================
   PREVIEW
   ====================== */

function previewPdf(url){
  const modal = document.getElementById("pdfModal");
  const frame = document.getElementById("pdfFrame");
  frame.src = convertDriveLink(url); // ← pastikan lewat converter
  modal.style.display = "flex";
}

// tetap: tombol close & klik di backdrop menutup modal
const closeBtn = document.getElementById("closePdf");
if (closeBtn) closeBtn.onclick = function(){
  document.getElementById("pdfModal").style.display = "none";
  document.getElementById("pdfFrame").src = "";
}
window.onclick = function(e){
  const modal = document.getElementById("pdfModal");
  if (e.target === modal){
    modal.style.display = "none";
    document.getElementById("pdfFrame").src = "";
  }
}


/* ======================
   QC DATA (FITUP / VISUAL / NDT)
   ====================== */
async function simpanQCData(payload){
  try{
    // upload foto (jika ada)
    let foto_url = null;
    if (payload.fotoFile){
      const path = `project-${payload.project_id}/${Date.now()}_${payload.fotoFile.name}`;
      foto_url = await uploadPublic("photos", path, payload.fotoFile);
    }

    const insertObj = { ...payload };
    delete insertObj.fotoFile;
    if (foto_url) insertObj.photo_url = foto_url;

    // ⛔️ tidak perlu set created_*/updated_* di sini
    const { error } = await sb.from("qc_data").insert([insertObj]);
    if (error) throw error;

    alert("Data QC berhasil disimpan.");
  }catch(err){
    console.error(err);
    alert("Gagal simpan data QC: " + err.message);
  }
}

/* ======================
   HEADER BY KATEGORI
   ====================== */
function headerByKategori(k){
  if (k === "ndt")
    return ["Joint","Drawing","Material","Ukuran","Welder","Tanggal","Shift","Status","Jenis NDT","Catatan","Audit","Foto","Aksi"];
  if (k === "visual")
    return ["Joint","Drawing","Material","Ukuran","Welder","Tanggal","Shift","Status","Relasi Fitup","Catatan","Audit","Foto","Aksi"];
  return ["Joint","Drawing","Material","Ukuran","Welder","Tanggal","Shift","Status","Catatan","Audit","Foto","Aksi"]; // fitup
}


/* ======================
   TAMPIL DATA
   ====================== */

async function tampilkanData(kategori, projectId){
  const container = el("dataContainer");
  if (!container || !projectId) return;

  // BACA filter (kalau select-nya tidak ada, abaikan)
  const drawingId = document.getElementById("drawingFilter")?.value || "";
  const material  = document.getElementById("materialFilter")?.value  || "";

  // Query dasar
  let q = sb.from("qc_data")
    .select("*, drawings(name, url)")
    .eq("project_id", projectId)
    .eq("kategori", kategori);

  // Terapkan filter opsional
  if (drawingId) q = q.eq("drawing_id", drawingId);
  if (material)  q = q.eq("material", material);

  const { data, error } = await q.order("created_at", { ascending: false });

  if (error){ 
    console.error(error); 
    container.innerHTML="<p>Gagal memuat data.</p>"; 
    return; 
  }
  if (!data || data.length===0){ 
    container.innerHTML="<p>Belum ada data.</p>"; 
    return; 
  }

  // ... (lanjutan render baris kamu tetap sama) ...
  // pastikan headerByKategori(kategori) sudah ada

  const rows = data.map(d => {
    const statusText = d.status ?? "-";
    const statusClass = (statusText || "-").toLowerCase().replace(/\s+/g, "-");
    const statusCell  = `<span class="badge status-${esc(statusClass)}">${esc(statusText)}</span>`;
    const drawingCell = d.drawings
      ? `<a href="${esc(d.drawings.url)}" target="_blank">${esc(d.drawings.name)}</a>`
      : "-";
    
    let extraCell = "";
    if (kategori === "ndt") {
      extraCell = `<td>${d.ndtType ?? "-"}</td>`;
    } else if (kategori === "visual") {
      const relasiFitup = d.joint ? "✅" : "❌";
      extraCell = `<td style="text-align:center">${relasiFitup}</td>`;
    }
    const auditCell = `
    <td class="col-audit">
      <div class="audit">
        <div>Input: <strong>${esc(d.created_name || "-")}</strong></div>
        <div class="small muted">${formatWIB(d.created_at)}</div>
        <div>Update: <strong>${esc(d.updated_name || "-")}</strong></div>
        <div class="small muted">${formatWIB(d.updated_at)}</div>
      </div>
    </td>`;
    return `
      <tr>
        <td>${d.joint ?? "-"}</td>
        <td>${drawingCell}</td>
        <td>${d.material ?? "-"}</td>
        <td>${d.ukuran ?? "-"}</td>
        <td>${d.welder ?? "-"}</td>
        <td>${d.tanggal ?? "-"}</td>
        <td>${d.shift ?? "-"}</td>
        <td>${statusCell}</td>
        ${extraCell}
        <td style="max-width:250px;word-break:break-word;">${d.catatan ?? "-"}</td>
        ${auditCell}
        <td>
          ${
            Array.isArray(d.photo_urls) && d.photo_urls.length
            ? d.photo_urls.map(p => {
                const src = esc(p.displayUrl || p.viewUrl || p.downloadUrl || p.url || "");
                const href = esc(p.viewUrl || p.downloadUrl || p.url || src);
                return src ? `<a href="${href}" target="_blank" style="margin-right:6px"><img src="${src}" class="thumb"></a>` : "-";
              }).join("")
            : (d.photo_url ? `<img src="${esc(d.photo_url)}" class="thumb">` : "-")
          }
        </td>
        <td>
          <button onclick="openEditModal('${kategori}', '${d.id}', '${projectId}')">Edit</button>
          <button class="btn-danger" onclick="hapusData('${kategori}', '${d.id}', '${projectId}')">Hapus</button>
        </td>
      </tr>`;
  }).join("");

  const headers = headerByKategori(kategori);
  container.innerHTML = `
    <div style="overflow-x:auto;">
      <table>
        <thead><tr>${headers.map(h=>`<th>${h}</th>`).join("")}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}


/* ======================
   DASHBOARD RINGKASAN
   ====================== */
async function tampilkanRingkasan(){
  const wrap = el("summaryContainer");
  const chartEl = el("chartQC");
  if (!wrap) return;
  const { data, error } = await sb.from("qc_data").select("kategori,status");
  if (error){ console.error(error); return; }

  const cats = ["fitup","visual","ndt"];
  const count = { OK:0, Repair:0, Hold:0 };
  wrap.innerHTML="";
  cats.forEach(k => {
    const rows = data.filter(d => d.kategori===k);
    const ok   = rows.filter(r => (r.status||"").toUpperCase()==="OK").length;
    const rep  = rows.filter(r => (r.status||"").toUpperCase()==="REPAIR").length;
    const hold = rows.filter(r => (r.status||"").toUpperCase()==="HOLD").length;
    count.OK += ok; count.Repair += rep; count.Hold += hold;
    wrap.innerHTML += `
      <div class="card">
        <h3 style="margin:0;text-transform:capitalize">${k}</h3>
        <small class="muted">Total: ${rows.length}</small>
        <p>✅ OK: ${ok} | 🔧 Repair: ${rep} | ⏸ Hold: ${hold}</p>
      </div>`;
  });
  if (chartEl && window.Chart){
    new Chart(chartEl, {
      type:"pie",
      data:{ labels:["OK","Repair","Hold"], datasets:[{ data:[count.OK,count.Repair,count.Hold] }]},
      options:{ responsive:true, plugins:{ legend:{position:"bottom"}, title:{display:true,text:"Ringkasan QC Semua Kategori"} } }
    });
  }
}

/* ======================
   Helper upload
   ====================== */

async function filesToBase64List(fileList){
  const files = Array.from(fileList || []);
  const toB64 = (f) => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res({ name: f.name, mimeType: f.type || "application/octet-stream", base64: r.result.split(",")[1] });
    r.onerror = rej; r.readAsDataURL(f);
  });
  return Promise.all(files.map(toB64));
}

async function uploadToGoogleDrive(files){
  if (!files || !files.length) return [];
  const body = JSON.stringify({ folderId: DRIVE_FOLDER_ID, files });
  const resp = await fetch(DRIVE_WEBAPP_URL, { 
    method: "POST", 
    body: JSON.stringify ({ 
      folderId: DRIVE_FOLDER_ID, files 
    }) 
  });
  const json = await resp.json();
  if (json.error) throw new Error(json.error);
  return json.files || [];
}

/* ======================
   FORM HANDLER (anti double submit)
   ====================== */
function attachInputForm(){
  const form = el("formInputData");
  if (!form) return;

  // Jangan pasang listener dua kali kalau fungsi ini terpanggil lagi
  if (form.dataset.boundSubmit === "1") return;
  form.dataset.boundSubmit = "1";

  // Set default tanggal = hari ini
  const tgl = el("tanggalPekerjaan");
  if (tgl) tgl.value = new Date().toISOString().split("T")[0];

  // State & helper tombol simpan
  let isSaving = false;
  const saveBtn = document.querySelector('button[form="formInputData"]');
  const setSaving = (on) => {
    isSaving = !!on;
    if (saveBtn){
      saveBtn.disabled = on;
      saveBtn.textContent = on ? "Menyimpan..." : "💾 Simpan Data";
    }
  };

  form.addEventListener("submit", async (e)=>{
    e.preventDefault();
    if (isSaving) return;          // ⬅️ cegah trigger ganda
    setSaving(true);

    try {
      const kategori = document.querySelector('input[name="kategori"]:checked')?.value;
      const ndtType  = document.querySelector('input[name="ndtType"]:checked')?.value || null;

      let jointVal = null;
      let drawingId = el("drawingNumber")?.value || null;

      if (kategori === "visual"){
        const fitupId = el("jointNumber")?.value;
        if (fitupId){
          const { data: fitupRow } = await sb.from("qc_data")
            .select("joint,drawing_id")
            .eq("id", fitupId).single();
          if (fitupRow){
            jointVal = fitupRow.joint;
            drawingId = fitupRow.drawing_id; // pakai drawing asli dari fitup
          }
        }
      } else if (kategori === "ndt"){
        // jointNumber berisi id baris VISUAL; ambil teks joint agar yang disimpan tetap teks
        const visualId = el("jointNumber")?.value;
        if (visualId){
          const { data: visualRow } = await sb.from("qc_data")
            .select("joint,drawing_id,material,ukuran,welder")
            .eq("id", visualId).single();
          if (visualRow){
            jointVal  = visualRow.joint;
            drawingId = visualRow.drawing_id;
            // pastikan autofill sudah masuk; kalau belum, isi dari sini
            if (!el("material")?.value) el("material").value = visualRow.material || "";
            if (!el("ukuran")?.value)   el("ukuran").value   = visualRow.ukuran   || "";
            if (!el("welder")?.value)   el("welder").value   = visualRow.welder   || "";
          }
        }
      } else {
        // fitup
        jointVal = el("jointNumber")?.value || null;
      }

      const payload = {
        project_id: el("projectName")?.value || null,
        joint: jointVal,
        drawing_id: drawingId,
        material: el("material")?.value || null,
        ukuran: el("ukuran")?.value || null,
        welder: el("welder")?.value || null,
        tanggal: el("tanggalPekerjaan")?.value || null,
        shift: el("shift")?.value || null,
        kategori,
        status: el("status")?.value || "OK",
        catatan: el("catatan")?.value || null,
        ndtType: kategori==="ndt" ? ndtType : null
      };
      const fotoFilesInput = document.getElementById("fotoFiles");
      let photoMeta = [];
      if (fotoFilesInput?.files?.length){
        const b64List = await filesToBase64List(fotoFilesInput.files);
        photoMeta = await uploadToGoogleDrive(b64List); // [{id,name,webViewLink,webContentLink,displayUrl}]
      }
      if (photoMeta.length){
        payload.photo_urls = photoMeta.map(p => ({
          id: p.id,
          name: p.name,
          viewUrl: p.webViewLink || p.url,
          downloadUrl: p.webContentLink || p.url,
          displayUrl: p.displayUrl || p.webViewLink || p.url
        }));
        payload.photo_url = payload.photo_urls[0]?.displayUrl || null; // kompat foto tunggal
      }
      const fotoInput = el("foto");
      if (fotoInput?.files?.[0]) payload.fotoFile = fotoInput.files[0];

      if (!payload.project_id) { alert("Pilih project terlebih dahulu."); return; }
      await simpanQCData(payload);
      form.reset();
    } catch (err){
      console.error(err);
      alert("Gagal simpan: " + err.message);
    } finally {
      setSaving(false);            // aktifkan lagi tombol setelah selesai/erro
    }
  });
}



/* ======================
   Page Helpers (optional)
   ====================== */

function renderJointField(kategori){
  const wrap = el("jointWrapper");
  if (!wrap) return;

  if (kategori === "visual"){
    // dropdown kosong, akan diisi lewat loadJointsFromFitup
    wrap.innerHTML = `<select id="jointNumber"></select>`;
  } else {
    // input text biasa
    wrap.innerHTML = `<input type="text" id="jointNumber">`;
  }
}


// =====================
// JOINTS DARI FITUP
// =====================
// Ambil joint dari data fitup pada drawing terpilih
async function loadJointsFromFitup(projectId, drawingId, selectId){
  const { data: fitupRows, error } = await sb
    .from("qc_data")
    .select("id, joint")
    .eq("project_id", projectId)
    .eq("drawing_id", drawingId)
    .eq("kategori", "fitup");

  const sel = el(selectId);
  if (error || !sel) { console.error(error); return; }

  if (!fitupRows || fitupRows.length === 0){
    sel.innerHTML = `<option disabled selected>Belum ada joint fitup</option>`;
    return;
  }

  sel.innerHTML = fitupRows.map(d => `<option value="${d.id}">${d.joint}</option>`).join("");
  sel.value = fitupRows[0].id;
  fireChange(sel); // memicu autofill material/ukuran
}

// =====================
// AUTO FILL MATERIAL KATEGORI VISUAL KETIKA JOINT DIUBAH
// =====================
// Autofill material & ukuran dari baris fitup terpilih
async function autofillFromFitup(fitupId){
  const { data, error } = await sb
    .from("qc_data")
    .select("material, ukuran")
    .eq("id", fitupId)
    .single();

  if (error){ console.error(error); return; }
  if (data){
    const materialEl = el("material");
    const ukuranEl   = el("ukuran");
    if (materialEl) materialEl.value = data.material || "";
    if (ukuranEl)   ukuranEl.value   = data.ukuran   || "";
  }
}

// =====================
// DRAWING LOAD FROM FITUP
// =====================
// Ambil daftar drawing yang pernah dipakai di data fitup (unique)
async function loadDrawingsFromFitup(projectId, selectId){
  const { data, error } = await sb
    .from("qc_data")
    .select("drawing_id, drawings(name)")
    .eq("project_id", projectId)
    .eq("kategori", "fitup");

  if (error){ console.error(error); return; }

  // Hilangkan duplikat berdasarkan drawing_id
  const seen = new Set();
  const unique = [];
  (data || []).forEach(d => {
    if (d.drawing_id && !seen.has(d.drawing_id)) {
      seen.add(d.drawing_id);
      unique.push(d);
    }
  });

  const sel = el(selectId);
  if (!sel) return;

  if (unique.length === 0){
    sel.innerHTML = `<option disabled selected>Belum ada drawing dari data fitup</option>`;
    return;
  }

  sel.innerHTML = unique.map(d =>
    `<option value="${d.drawing_id}">${d.drawings?.name || "(tanpa nama)"}</option>`
  ).join("");

  // Pilih pertama + trigger change agar joints langsung diload
  sel.value = unique[0].drawing_id;
  fireChange(sel);
}

// =====================
// JOIN LOAD FROM VISUAL
// =====================
// Ambil daftar join yang pernah dipakai di data visual (unique)
function renderJointField(kategori){
  const wrap = document.getElementById("jointWrapper");
  if (!wrap) return;
  if (kategori === "fitup"){
    wrap.innerHTML = `<input type="text" id="jointNumber" placeholder="Masukkan joint">`;
  } else {
    // visual & ndt pakai SELECT, diisi oleh loader (from Fitup / from Visual)
    wrap.innerHTML = `<select id="jointNumber"></select>`;
  }
}

// =====================
// DRAWINGS DARI VISUAL (unique) — dipakai saat kategori NDT
// =====================
async function loadDrawingsFromVisual(projectId, selectId){
  const { data, error } = await sb
    .from("qc_data")
    .select("drawing_id, drawings(name)")
    .eq("project_id", projectId)
    .eq("kategori", "visual");

  if (error){ console.error(error); return; }

  const sel = el(selectId);
  if (!sel) return;

  // Hilangkan duplikat berdasarkan drawing_id
  const seen = new Set();
  const unique = [];
  (data || []).forEach(d => {
    if (d.drawing_id && !seen.has(d.drawing_id)) {
      seen.add(d.drawing_id);
      unique.push(d);
    }
  });

  if (unique.length === 0){
    sel.innerHTML = `<option disabled selected>Belum ada drawing di data Visual</option>`;
    return;
  }

  sel.innerHTML = unique.map(d =>
    `<option value="${d.drawing_id}">${d.drawings?.name || "(tanpa nama)"}</option>`
  ).join("");

  // pilih pertama + trigger change agar joints visual langsung diload
  sel.value = unique[0].drawing_id;
  fireChange(sel);
}

// =====================
// JOINTS DARI VISUAL — untuk kategori NDT
// =====================
async function loadJointsFromVisual(projectId, drawingId, selectId){
  const { data: visualRows, error } = await sb
    .from("qc_data")
    .select("id, joint")
    .eq("project_id", projectId)
    .eq("drawing_id", drawingId)
    .eq("kategori", "visual");

  const sel = el(selectId);
  if (error || !sel){ console.error(error); return; }

  if (!visualRows || visualRows.length === 0){
    sel.innerHTML = `<option disabled selected>Belum ada joint pada data Visual</option>`;
    return;
  }

  sel.innerHTML = visualRows.map(r => `<option value="${r.id}">${r.joint}</option>`).join("");
  sel.value = visualRows[0].id;
  fireChange(sel); // untuk autofill
}

// =====================
// AUTOFILL dari baris VISUAL — dipakai saat NDT memilih joint
// =====================
async function autofillFromVisual(visualId){
  const { data, error } = await sb
    .from("qc_data")
    .select("material, ukuran, welder")
    .eq("id", visualId)
    .single();

  if (error){ console.error(error); return; }
  if (data){
    const m = el("material");
    const u = el("ukuran");
    const w = el("welder");
    if (m) m.value = data.material || "";
    if (u) u.value = data.ukuran   || "";
    if (w) w.value = data.welder   || "";
  }
}


// =====================
// LATEGORY WELDER & NDT HIDE FITUP VISUAL
// =====================

// Tampilkan/sembunyikan field Welder sesuai kategori
function toggleWelderByKategori(kategori){
  const welder = document.getElementById("welder");
  const label  = welder ? welder.previousElementSibling : null; // <label> tepat sebelum input
  if (!welder || !label) return;

  if (kategori === "fitup"){
    welder.value = "";               // kosongkan supaya tidak kebawa
    welder.style.display = "none";   // sembunyikan input
    label.style.display  = "none";   // sembunyikan label
  } else {
    welder.type = "text";            // pastikan type text saat tampil
    welder.style.display = "";       // tampilkan input
    label.style.display  = "";       // tampilkan label
  }
}

// Tampilkan pilihan jenis NDT hanya saat kategori NDT
function toggleNdtTypeByKategori(kategori){
  const box = document.getElementById("ndtTypeWrapper");
  if (!box) return;
  box.style.display = (kategori === "ndt") ? "" : "none";
}
// =====================
// helper “bubble change”
// =====================

function fireChange(el){
  if (!el) return;
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

// =====================
// “polish” kecil yang berguna:
// =====================


// ====== simpan & load preferensi sederhana ======
function savePrefs(pid, kategori){
  try { localStorage.setItem("qc_prefs", JSON.stringify({ pid, kategori })); } catch {}
}
function loadPrefs(){
  try { return JSON.parse(localStorage.getItem("qc_prefs")) || {}; } catch { return {}; }
}

// =====================
// polish kecil (opsional) ingat project terakhir
// =====================

// ====== bersihkan form saat ganti kategori ======
function clearFormFields(){
  ["material","ukuran","welder","catatan"].forEach(id => { const elmt = el(id); if (elmt) elmt.value = ""; });
}
document.querySelectorAll('input[name="kategori"]').forEach(r=>{
  r.addEventListener("change", clearFormFields);
});

// script-supabase.js
function rememberProject(sel){
  if (sel?.value) localStorage.setItem("lastProjectId", sel.value);
}
function restoreProject(sel){
  const last = localStorage.getItem("lastProjectId");
  if (sel && last) {
    const opt = [...sel.options].find(o => o.value === last);
    if (opt) { sel.value = last; fireChange(sel); } // trigger render otomatis
  }
}

// =====================
// Tambahan helper untuk mengisi opsi filter
// =====================

// Muat opsi filter (drawing & material) yang BENAR-BENAR ada untuk kategori + project tsb
async function loadFiltersByKategori(kategori, projectId, drawingSelId = "drawingFilter", materialSelId = "materialFilter"){
  const drawSel = document.getElementById(drawingSelId);
  const matSel  = document.getElementById(materialSelId);
  if (!projectId) return;

  const { data, error } = await sb.from("qc_data")
    .select("drawing_id, drawings(name), material")
    .eq("project_id", projectId)
    .eq("kategori", kategori);

  if (error){ console.error(error); return; }

  // Unique drawing
  if (drawSel){
    const seenD = new Set();
    const uniqueDraw = [];
    (data || []).forEach(r => {
      if (r.drawing_id && !seenD.has(r.drawing_id)){
        seenD.add(r.drawing_id);
        uniqueDraw.push({ id: r.drawing_id, name: r.drawings?.name || "(tanpa nama)" });
      }
    });
    drawSel.innerHTML =
      `<option value="">Semua Drawing</option>` +
      uniqueDraw.map(d => `<option value="${d.id}">${d.name}</option>`).join("");
  }

  // Unique material (non-kosong)
  if (matSel){
    const seenM = new Set();
    const mats = [];
    (data || []).forEach(r => {
      const m = (r.material || "").trim();
      if (m && !seenM.has(m)){ seenM.add(m); mats.push(m); }
    });
    mats.sort((a,b)=>a.localeCompare(b));
    matSel.innerHTML =
      `<option value="">Semua Material</option>` +
      mats.map(m => `<option value="${m}">${m}</option>`).join("");
  }
}

/* =========================
   EDIT MODAL (reusable)
========================= */
let _editCtx = null;

function ensureEditModal(){
  if (document.getElementById("editModal")) return;
  const wrap = document.createElement("div");
  wrap.id = "editModal";
  wrap.style.cssText = "position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.35);z-index:9999;";
  wrap.innerHTML = `
    <div style="background:#0f172a;border-radius:12px;padding:16px;min-width:320px;max-width:520px;color:#e2e8f0;box-shadow:0 10px 40px rgba(0,0,0,.3)">
      <h3 style="margin:0 0 12px;font-size:18px;">Edit Data</h3>
      <div class="grid" style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <label>Joint<br><input id="editJoint" type="text"></label>
        <label>Material<br><input id="editMaterial" type="text"></label>
        <label>Ukuran<br><input id="editUkuran" type="text"></label>
        <label>Welder<br><input id="editWelder" type="text"></label>
        <label>Tanggal<br><input id="editTanggal" type="date"></label>
        <label>Shift<br>
          <select id="editShift"><option value="">-</option><option>Pagi</option><option>Siang</option><option>Malam</option></select>
        </label>
        <label>Status<br>
          <select id="editStatus"><option value="">-</option><option>OK</option><option>REPAIR</option><option>NG</option></select>
        </label>
        <div id="editNdtTypeWrap" style="display:none">
          <label>Jenis NDT<br>
            <select id="editNdtType">
              <option value="">-</option>
              <option>RT</option><option>UT</option><option>PT</option><option>MT</option><option>VT</option>
            </select>
          </label>
        </div>
        <label style="grid-column:1 / -1">Catatan<br><textarea id="editCatatan" rows="3" style="width:100%"></textarea></label>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px">
        <button id="btnSaveEdit" class="btn-primary">Simpan</button>
        <button id="btnCancelEdit" class="btn-danger" style="background:#334155">Batal</button>
      </div>
    </div>
  `;
  document.body.appendChild(wrap);
  wrap.querySelector("#btnCancelEdit").onclick = closeEditModal;
  wrap.querySelector("#btnSaveEdit").onclick = saveEditModal;
}

function openEditModal(kategori, rowId, projectId){
  ensureEditModal();
  _editCtx = { kategori, rowId, projectId };
  const box = document.getElementById("editModal");
  const ndtWrap = document.getElementById("editNdtTypeWrap");
  ndtWrap.style.display = (kategori === "ndt") ? "" : "none";

  // load data
  sb.from("qc_data")
    .select("joint, material, ukuran, welder, tanggal, shift, status, catatan, ndtType")
    .eq("id", rowId)
    .single()
    .then(({ data, error }) => {
      if (error){ console.error(error); alert("Gagal memuat data."); return; }
      document.getElementById("editJoint").value    = data.joint    || "";
      document.getElementById("editMaterial").value = data.material || "";
      document.getElementById("editUkuran").value   = data.ukuran   || "";
      document.getElementById("editWelder").value   = data.welder   || "";
      document.getElementById("editTanggal").value  = data.tanggal  || "";
      document.getElementById("editShift").value    = data.shift    || "";
      document.getElementById("editStatus").value   = data.status   || "";
      const ndtSel = document.getElementById("editNdtType");
      if (ndtSel) ndtSel.value = data.ndtType || "";
      document.getElementById("editCatatan").value  = data.catatan  || "";
      box.style.display = "flex";
    });
}

function closeEditModal(){
  const box = document.getElementById("editModal");
  if (box) box.style.display = "none";
  _editCtx = null;
}

async function saveEditModal(){
  if (!_editCtx) return;
  const { kategori, rowId, projectId } = _editCtx;
  
  // 1) VALIDASI ID (biar gak update massal tanpa filter)
  if (!rowId || !/^[0-9a-f-]{8}-[0-9a-f-]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(rowId)){
    alert("ID baris tidak valid. Batal menyimpan.");
    console.warn("Invalid rowId:", rowId);
    return;
  }
  

  // 2) KUMPUL PAYLOAD
  const payload = {
    joint:    document.getElementById("editJoint").value || null,
    material: document.getElementById("editMaterial").value || null,
    ukuran:   document.getElementById("editUkuran").value || null,
    welder:   document.getElementById("editWelder").value || null,
    tanggal:  document.getElementById("editTanggal").value || null,
    shift:    document.getElementById("editShift").value || null,
    status:   document.getElementById("editStatus").value || null,
    catatan:  document.getElementById("editCatatan").value || null,
  };
  if (kategori === "ndt"){
    payload.ndtType = document.getElementById("editNdtType").value || null;
  }

  console.log("UPDATE qc_data id=", rowId, "payload=", payload);

  // 3) UPDATE → kembalikan array row ter-ubah, biar kita bisa cek panjangnya
  const { data, error } = await sb
    .from("qc_data")
    .update(payload)
    .eq("id", rowId)
    .select();

  if (error){
    if (error.code === "23505" || /duplicate key value/i.test(error.message)){
      alert("Data duplikat untuk kombinasi (project, drawing, joint, tanggal, shift)"+(kategori==='ndt'?' + ndtType':'')+".");
    } else if (/row-level security|permission denied|Unauthorized/i.test(error.message)){
      alert("Gagal menyimpan karena RLS/izin UPDATE.");
    } else {
      alert("Gagal menyimpan: " + error.message);
    }
    console.error("UPDATE error:", error);
    return;
  }

  // 4) CEK HASIL UPDATE
  if (!data || data.length === 0){
    alert("Update tidak diterapkan (id tidak cocok / ditolak policy).");
    console.warn("No rows updated for id:", rowId);
    return;
  }
  if (data.length > 1){
    alert("Peringatan: lebih dari 1 baris ter-update. Cek filter ID di tombol Edit.");
    console.warn("Multiple rows updated for id:", rowId, data);
    // tetap lanjut refresh agar UI sesuai state DB saat ini
  }

  closeEditModal();
  await loadFiltersByKategori?.(kategori, projectId);
  await tampilkanData?.(kategori, projectId);
  alert("Berhasil diperbarui.");
}


/* =========================
   HAPUS PER ITEM (refresh filter juga)
========================= */
async function hapusData(kategori, id, projectId){
  if (!confirm("Hapus data ini?")) return;
  const { error } = await sb.from("qc_data").delete().eq("id", id);
  if (error){ alert("Gagal hapus: " + error.message); return; }
  await loadFiltersByKategori?.(kategori, projectId);  // ← tambah
  await tampilkanData?.(kategori, projectId);
}


/* =========================
   HAPUS SEMUA SESUAI FILTER AKTIF
========================= */
async function bulkDeleteFiltered(kategori){
  const projectId = document.getElementById("projectInput")?.value;
  if (!projectId){ alert("Pilih project dulu."); return; }
  const drawingId = document.getElementById("drawingFilter")?.value || "";
  const material  = document.getElementById("materialFilter")?.value || "";

  // hitung dulu
  let qCount = sb.from("qc_data")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId).eq("kategori", kategori);
  if (drawingId) qCount = qCount.eq("drawing_id", drawingId);
  if (material)  qCount = qCount.eq("material", material);
  const { count, error: e1 } = await qCount;
  if (e1){ console.error(e1); alert("Gagal menghitung data."); return; }
  if (!count){ alert("Tidak ada data yang cocok dengan filter."); return; }

  const ok = confirm(`Hapus ${count} data pada kategori ${kategori} sesuai filter?\nTindakan ini tidak dapat dibatalkan.`);
  if (!ok) return;

  // hapus
  let qDel = sb.from("qc_data").delete()
    .eq("project_id", projectId).eq("kategori", kategori);
  if (drawingId) qDel = qDel.eq("drawing_id", drawingId);
  if (material)  qDel = qDel.eq("material", material);

  const { error: e2 } = await qDel;
  if (e2){ console.error(e2); alert("Gagal menghapus: " + e2.message); return; }

  await loadFiltersByKategori?.(kategori, projectId);
  await tampilkanData?.(kategori, projectId);
  alert("Berhasil menghapus data sesuai filter.");
}

function esc(s){ return String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

//const statusCell = `<span class="badge status-${esc((d.status||'-').toLowerCase())}">${esc(d.status ?? "-")}</span>`;
//const drawingCell = d.drawings ? `<a href="${esc(d.drawings.url)}" target="_blank">${esc(d.drawings.name)}</a>` : "-";

// Cache sederhana biar nggak query berulang
let __meCache = null;
async function getCurrentProfile() {
  if (__meCache) return __meCache;
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { user: null, profile: null };

  // Coba ambil nama dari profiles (lebih konsisten)
  const { data: prof } = await sb
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .maybeSingle();

  __meCache = { user, profile: prof || { full_name: user.user_metadata?.full_name || '' } };
  return __meCache;
}

function formatWIB(iso) {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', hour12: false });
  } catch { return iso; }
}


