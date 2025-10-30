
// auth.js — Guard + widget (Supabase)
(function () {
  const ADMIN_ONLY_PAGES = ["projects.html","drawing.html","user-stats.html"];
  const PUBLIC_PAGES     = ["index.html","login.html","register.html","update-password.html"];

  const pageName = () => (location.pathname.split("/").pop() || "index.html").toLowerCase();

  // Anti-race: tunggu sb muncul (maks 3s)
  async function waitForSupabase(timeoutMs = 3000) {
    const t0 = Date.now();
    while (typeof sb === "undefined") {
      if (Date.now() - t0 > timeoutMs) {
        console.error("Supabase client (sb) belum tersedia. Pastikan script-supabase.js dimuat sebelum auth.js (pakai defer).");
        return false;
      }
      await new Promise(r => setTimeout(r, 25));
    }
    return true;
  }

  async function getMyRole(userId){
    const { data, error } = await sb.from('profiles').select('role').eq('id', userId).single();
    if (error) { console.warn('getMyRole:', error.message); return 'user'; }
    return data?.role || 'user';
  }

  function hideAdminLinks(pages = ADMIN_ONLY_PAGES){
    const adminHrefs = new Set(pages.map(p => p.toLowerCase()));
    document.querySelectorAll('.sidebar a[href]').forEach(a => {
      const href = a.getAttribute('href')?.toLowerCase();
      if (href && adminHrefs.has(href)) a.style.display = 'none';
    });
  }

  function mountAuthWidget(session, role='user') {
    const aside = document.querySelector(".sidebar");
    if (!aside) return;

    document.getElementById("authWidget")?.remove();

    const box = document.createElement("div");
    box.id = "authWidget";
    box.className = "card mt-3";

    if (session) {
      box.innerHTML = `
        <div class="small">Masuk sebagai<br><strong>${session.user.email}</strong></div>
        <div class="muted small">Role: ${role}</div>
        <button id="btnLogout" class="btn-danger mt-2">Keluar</button>`;
    } else {
      box.innerHTML = `
        <div class="small">Belum masuk</div>
        <div style="display:flex;gap:8px;margin-top:8px">
          <a class="btn" href="login.html">Login</a>
          <a class="btn" href="register.html">Register</a>
        </div>`;
    }

    aside.appendChild(box);

    const logoutBtn = document.getElementById("btnLogout");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", async () => {
        await sb.auth.signOut();
        if (!PUBLIC_PAGES.includes(pageName())) location.href = "index.html";
      });
    }
  }

  // auth.js

async function boot() {
  const ok = await waitForSupabase();
  if (!ok) return;

  const current = pageName();
  const { data: { session } } = await sb.auth.getSession();

  // Wajib login untuk non-public
  if (!session && !PUBLIC_PAGES.includes(current)) {
    location.href = 'login.html?next=' + encodeURIComponent(location.pathname);
    return;
  }

  // Hitung role (kalau login)
  let role = 'user';
  if (session) role = await getMyRole(session.user.id);

  // Admin-only pages
  if (ADMIN_ONLY_PAGES.includes(current) && role !== 'admin') {
    hideAdminLinks();
    location.href = 'index.html?denied=admin';
    return;
  }

  // Rapikan UI non-admin
  if (role !== 'admin') hideAdminLinks();

  // Render widget terakhir
  mountAuthWidget(session, role);

  // ⬇⬇⬇ TAMBAHKAN INI ⬇⬇⬇
  document.dispatchEvent(new CustomEvent('auth:ready', {
    detail: { session, role }
  }));
}


  // Re-run saat auth berubah (agar guard & widget ikut berubah)
  document.addEventListener('DOMContentLoaded', () => {
    if (typeof sb === 'undefined') return;
    sb.auth.onAuthStateChange(async (_event, newSession) => {
      if (newSession?.user) {
        const u = newSession.user;
        sb.from('profiles').upsert({
          id: u.id,
          full_name: u.user_metadata?.full_name ?? '',
          provider: u.app_metadata?.provider ?? 'email',
          last_login_at: new Date().toISOString()
        });
      }
      boot();
    });
    boot();
  });
})();
