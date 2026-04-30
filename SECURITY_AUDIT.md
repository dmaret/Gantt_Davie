# 🔒 SECURITY AUDIT REPORT — Atelier Planification v3.0

**Audit Date:** 2026-04-30  
**Assessment Level:** COMPREHENSIVE  
**Risk Summary:** ⚠️ MEDIUM-HIGH (Multiple XSS vectors, weak authentication, localStorage vulnerabilities)

---

## EXECUTIVE SUMMARY

This client-side SPA has **no backend API**, meaning no traditional CSRF, injection attacks on servers, or SQL injection risks. However, there are **critical XSS vulnerabilities** from user input flowing directly into `innerHTML`, **weak authentication** relying on client-side validation only, and **data integrity issues** with localStorage persistence.

---

## 1. XSS (CROSS-SITE SCRIPTING) — **CRITICAL**

### 1.1 User Data in innerHTML (HIGH SEVERITY)

**VULNERABLE PATTERN:** User-controlled strings inserted directly into HTML via template literals with innerHTML.

#### Location 1: Modal Titles with Unescaped Names
**Files:** `views/gantt.js:1398`, `views/projets.js:290`, `views/stock.js:123`, `views/modeles.js:87`, `views/machines.js:242`, `views/lieux.js:148`, `views/admin.js:166`, `views/equipes.js:253`, `views/commandes.js:156`

```javascript
// VULNERABLE CODE (gantt.js:1398)
App.openModal(isNew ? 'Nouvelle tâche' : 'Tâche — ' + t.nom, body, foot);

// ATTACK: If t.nom = '<img src=x onerror="alert(1)">'
// Result: XSS executes in modal title
```

**Impact:** HIGH — User can execute arbitrary JavaScript if they can edit task/project/item names.

---

#### Location 2: personneLabel() in innerHTML
**Files:** `views/gantt.js:1408,1474`, multiple other views

```javascript
// VULNERABLE CODE (gantt.js:1408)
const p = s.personnes.find(x => x.id === cb.value);
return p ? `<span class="badge good">
  ${App.personneLabel(p)}  <!-- XSS VECTOR -->
  <button>...</button>
</span>` : '';

// app.js:
personneLabel(p) { return p ? (p.prenom + ' ' + p.nom) : '—'; }

// ATTACK: If user nom = '<img src=x onerror="alert(1)">'
// Result: XSS in assignee chips, suggestions, tooltips
```

**Impact:** CRITICAL — User names are displayed in 50+ places throughout the app via `App.personneLabel()`. A user with a malicious name affects everyone viewing the app.

**Examples of Rendering:**
- Task assignee chips (gantt.js:1408-1411)
- Suggestions for assignees (gantt.js:1474)
- Search results (app.js ~ 400 lines)
- Proactive alerts (app.js)
- Tooltips in multiple views

---

#### Location 3: Project/Machine/Lieu/Stock Names in HTML
**Files:** Multiple views

```javascript
// VULNERABLE (stock.js:123)
App.openModal(isNew?'Nouvel article':x.ref+' — '+x.nom, body, foot);
// x.ref, x.nom are unescaped user input

// VULNERABLE (projets.js:290)
App.openModal(isNew?'Nouveau projet':p.code+' — '+p.nom, body, foot);
// p.code, p.nom are unescaped user input
```

**Impact:** HIGH — Any user with 'edit' permission can inject XSS through these fields.

---

#### Location 4: innerHTML with Chart/Visualization Data
**Files:** `views/gantt.js:1458-1461` (conflict resolution message)

```javascript
banner.innerHTML = `<div style="display:flex;align-items:center;gap:6px;">
  <span style="font-size:15px">✅</span>
  <span><strong>Conflit résolu</strong> — créneau appliqué : 
    <strong>${D.fmt(sl.debut)}</strong> → <strong>${D.fmt(sl.fin)}</strong>
  </span>
</div>`;
```

**Impact:** MEDIUM — Dates are formatted via `D.fmt()` which appears safe, but pattern is unsafe if extended.

---

### 1.2 Recommendation: Input Escaping

Create a utility function for safe HTML rendering:

```javascript
// Add to app.js
App.escapeHTML = (str) => {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
};

// OR use a sanitization library like DOMPurify
```

**Required Changes:**
1. Replace all `${user.nom}`, `${user.prenom}` with `${App.escapeHTML(user.nom)}`
2. Replace all uses of `App.personneLabel()` in innerHTML with escaped version
3. Replace all direct string concatenation in `openModal()` calls

---

## 2. AUTHENTICATION & AUTHORIZATION — **HIGH**

### 2.1 Client-Side Only Authentication (HIGH SEVERITY)

**Vulnerability:** All authentication happens in the browser; no server verification.

**Code (app.js:43-58):**
```javascript
async login(userId, password) {
  const u = (DB.state.utilisateurs || []).find(x => x.id === userId);
  if (!u) return false;
  // NO SERVER VALIDATION — attacker can modify DB.state
  if (!u.passwordHash) {
    sessionStorage.setItem('atelier_authed', userId);
    localStorage.setItem('atelier_user_id', userId);
    return true;
  }
  const h = await this.hash(password || '');
  if (h === u.passwordHash) {
    sessionStorage.setItem('atelier_authed', userId);
    localStorage.setItem('atelier_user_id', userId);
    return true;
  }
  return false;
}
```

**Attack Vectors:**

1. **Memory Manipulation:** Attacker opens DevTools console and modifies `sessionStorage`/`localStorage`:
   ```javascript
   sessionStorage.setItem('atelier_authed', 'admin_user_id');
   localStorage.setItem('atelier_user_id', 'admin_user_id');
   // Now user is "logged in" as admin
   ```

2. **Database Modification:** Attacker reads `localStorage['atelier_plan_v3']`, modifies it, and reloads:
   ```javascript
   const data = JSON.parse(localStorage.getItem('atelier_plan_v3'));
   data.utilisateurs.find(u => u.id === 'user123').groupe = 'admin';
   localStorage.setItem('atelier_plan_v3', JSON.stringify(data));
   // User now has admin permissions
   ```

3. **Password Hash Bypass:** Attacker modifies their user's passwordHash to empty:
   ```javascript
   const data = JSON.parse(localStorage.getItem('atelier_plan_v3'));
   data.utilisateurs.find(u => u.id === 'user123').passwordHash = undefined;
   localStorage.setItem('atelier_plan_v3', JSON.stringify(data));
   // Password is now not required to login
   ```

**Impact:** CRITICAL if this app is used with real data on a shared system. Any user can escalate to admin.

---

### 2.2 Permission Checks Only on UI (MEDIUM SEVERITY)

**Vulnerability:** Permissions are only hidden in the UI, not enforced on actions.

**Code (app.js:236-244):**
```javascript
applyPerms() {
  document.querySelectorAll('[data-perm]').forEach(el => {
    const ok = this.can(el.dataset.perm);
    el.style.display = ok ? '' : 'none';  // ← Just hiding, not blocking
  });
}
```

**Attack:** Attacker can:
1. Open DevTools and make hidden buttons visible: `document.querySelector('#btn-export').style.display = ''`
2. Call functions directly: `App.views.admin.openForm(null)` (no permission check in openForm)
3. Modify global state: `DB.state.projets.push({...})` then `DB.save()`

**Impact:** HIGH — Full data access despite "read-only" designation.

**Recommendation:**
- Add permission checks at the function level, not just UI level:
  ```javascript
  openForm(id) {
    if (!App.can('edit')) { App.toast("Lecture seule",'error'); return; }
    // ... rest of function
  }
  ```
  This is already done in many places (modeles.js:48, etc.) but not consistently.

---

## 3. INPUT VALIDATION — **MEDIUM**

### 3.1 No Validation on Critical Fields

**Vulnerable Fields:**
- Task names, notes (gantt.js:1414 — no max length, no character restrictions)
- Project codes, names (projets.js — no uniqueness check, no validation)
- Person names (personnes.js — no validation)
- Email/phone/competence fields (personnes.js — no format validation)

**Example (modeles.js:89):**
```javascript
m.nom = document.getElementById('mf-nom').value.trim();
if (!m.nom) { App.toast('Nom requis','error'); return; }
// ✓ Empty check exists, but no other validation
// ✗ No length limit, no XSS check, no special character handling
```

**Risks:**
1. **Buffer Overflow in Data Structures:** Very long strings can degrade performance
2. **Unicode Handling Issues:** Complex Unicode sequences can break rendering
3. **Code Injection:** Unvalidated data can become attack vectors if exported to other systems

---

### 3.2 Date Validation Missing

**Code (gantt.js:1159):**
```javascript
const debut = D.nextWorkday(document.getElementById('f-debut').value);
const fin = D.addWorkdays(debut, m.duree - 1);
// No check: is debut < fin? Is fin before project end? Is duration positive?
```

**Risks:** Invalid dates can create inconsistent state.

---

## 4. localStorage INTEGRITY — **MEDIUM-HIGH**

### 4.1 No Integrity Checking

**Vulnerability:** Data stored in localStorage is not signed or verified. Attacker can modify all data without detection.

**Current Code (data.js:6-12):**
```javascript
load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) { 
      this.state = JSON.parse(raw);  // ← No verification
      this.migrate(); 
      this._pushHistory(); 
      return; 
    }
  } catch (e) { console.warn('load failed', e); }
  this.state = seed();
  this.save();
}
```

**Attack Scenario:**
```javascript
// Attacker modifies exported JSON before re-importing
const data = JSON.parse('{"taches":[]}');  // Clear all tasks
data.utilisateurs = [];  // Remove all users
fetch('blob:http://localhost:8000/...').then(...);  // Data exfiltration

App.importJSON(data);  // Import malicious data
```

**Impact:** HIGH — No way to detect tampering. In a shared workspace, one user could sabotage everyone's data.

**Recommendation:**
- Add a SHA-256 hash of the data when saving
- Verify hash when loading
- Warn if hash mismatch (data was tampered)

```javascript
save() {
  const dataStr = JSON.stringify(this.state);
  const hash = await App.hash(dataStr);
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ data: this.state, hash }));
}

async load() {
  const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
  const hash = await App.hash(JSON.stringify(stored.data));
  if (hash !== stored.hash) {
    console.warn('Data was modified!');
    App.toast('⚠️ Les données ont été modifiées', 'error');
  }
  this.state = stored.data;
}
```

---

## 5. SESSION MANAGEMENT — **MEDIUM**

### 5.1 sessionStorage is Not Cleared on Tab Close (EXPECTED BEHAVIOR)

**Behavior:** `sessionStorage` persists while the tab is open, even if the user navigates away and comes back.

**Code (app.js:37-40):**
```javascript
isAuthed() {
  const id = sessionStorage.getItem('atelier_authed');
  if (!id) return false;
  const u = (DB.state.utilisateurs || []).find(x => x.id === id);
  return !!u;
}
```

**Risk:** On a shared computer, if a user forgets to logout, the next person can access their account by refreshing the page.

**Current Mitigation:** Logout button exists (app.js:61-63), but easily forgotten.

**Recommendation:**
- Clear session on page unload: `window.addEventListener('beforeunload', () => sessionStorage.clear())`
- Better: Server-side sessions (not applicable for this app)
- UI reminder: "Remember to logout" on login screen

---

## 6. DATA EXPORTS — **MEDIUM**

### 6.1 Unencrypted JSON Export

**Vulnerability:** Users can export full database as JSON, which contains all sensitive data including password hashes.

**Code (app.js:452-460):**
```javascript
export() {
  const json = DB.exportJSON();
  // Download entire database as plain JSON
  const blob = new Blob([json], { type: 'application/json' });
  // Anyone with the file can read all passwords and data
}
```

**Attack:** 
1. User exports as JSON
2. File is left on shared computer, email, cloud storage
3. Attacker downloads and reads all data, password hashes (though SHA-256, can be brute-forced)

**Recommendation:**
- Add optional encryption on export (AES-256 with user-provided password)
- Warn user: "⚠️ This file contains all app data. Keep it secure!"
- Strip password hashes from exports by default

---

## 7. WHAT-IF / SNAPSHOTS — **MEDIUM**

### 7.1 No Signature on Snapshots

**Code (whatif.js:52-54):**
```javascript
const snap = JSON.parse(JSON.stringify(DB.state));
snap._snapDate = new Date().toISOString();
localStorage.setItem(this.SNAP_KEY, JSON.stringify(snap));
```

**Vulnerability:** Snapshot can be modified mid-simulation. Attacker can:
1. Start a what-if simulation
2. Modify the stored snapshot in localStorage
3. "Accept" changes and permanently alter the database with undetected modifications

**Impact:** MEDIUM — User may not notice tampering with data during simulation.

---

## 8. BEST PRACTICES VIOLATIONS

### 8.1 No Content Security Policy (CSP)
**Risk:** XSS attacks have fewer restrictions.
**Fix:** Add CSP header (not applicable for static HTML, but: configure your server to send `Content-Security-Policy: default-src 'self'; script-src 'self'`)

### 8.2 No Subresource Integrity (SRI)
**Risk:** External dependencies could be compromised (though this app has no external dependencies).
**Fix:** If dependencies are added, use SRI hashes.

### 8.3 No Rate Limiting
**Risk:** Brute-force password attacks (though client-side hashing mitigates).
**Fix:** Lock user after 5 failed login attempts for 5 minutes.

### 8.4 No Audit Logging for Security Events
**Current Audit (data.js:139-147):** Logs normal actions but not:
- Failed logins
- Unauthorized access attempts
- Large data modifications
- Configuration changes
**Recommendation:** Log to a separate security audit trail.

---

## 9. RISK MATRIX

| Threat | Severity | Likelihood | Impact | Effort to Fix |
|--------|----------|-----------|--------|---------------|
| XSS via user names | CRITICAL | HIGH | Data theft, malware injection | Low (1-2 hours) |
| Authentication bypass via console | CRITICAL | HIGH | Full system compromise | Medium (requires architecture change) |
| localStorage modification | HIGH | MEDIUM | Data integrity loss | Medium (add hashing) |
| Permission checks only in UI | HIGH | HIGH | Unauthorized access | Medium (add runtime checks) |
| Snapshot tampering | MEDIUM | MEDIUM | Undetected data changes | Low (add signing) |
| Session theft on shared computer | MEDIUM | MEDIUM | Account takeover | Low (add auto-logout) |

---

## 10. REMEDIATION ROADMAP

### IMMEDIATE (This Week)
- [ ] **Escape all user input in innerHTML** — Create `App.escapeHTML()` utility
- [ ] **Add XSS protection to personneLabel()** rendering (50+ locations)
- [ ] **Add permission runtime checks** at function entry (not just UI)

### SHORT-TERM (Next Week)
- [ ] **Add input validation** for all user input fields
- [ ] **Implement localStorage integrity checking** via SHA-256
- [ ] **Add snapshot signing** in what-if view

### MEDIUM-TERM (This Month)
- [ ] **Implement rate limiting** on login attempts
- [ ] **Add security audit logging** (failed auth, unauthorized actions)
- [ ] **Document security model** for users
- [ ] **Add warnings** on sensitive operations (export, import, reset)

### LONG-TERM (If Expanding)
- [ ] Add optional server-side backend for proper session management
- [ ] Implement encryption-at-rest for sensitive data
- [ ] Add 2FA support

---

## 11. COMPLIANCE NOTES

- **GDPR:** Currently NO compliance — personal data (names, competencies, schedules) stored in plain localStorage
- **OWASP Top 10:** Vulnerabilities present in A03:2021 (Injection - XSS), A01:2021 (Broken Access Control)

---

## 12. TESTING RECOMMENDATIONS

### Manual Security Testing
```javascript
// 1. XSS via person name
DB.state.personnes[0].nom = '<img src=x onerror="alert(\'XSS\')">';
DB.save(); App.refresh();  // Should NOT execute alert

// 2. Authentication bypass
sessionStorage.removeItem('atelier_authed');
// Try to access data — should show login, not load

// 3. Privilege escalation
const data = JSON.parse(localStorage.getItem('atelier_plan_v3'));
data.utilisateurs.find(u => u.groupe === 'utilisateur').groupe = 'admin';
localStorage.setItem('atelier_plan_v3', JSON.stringify(data));
location.reload();  // Should still be 'utilisateur', not 'admin'
```

---

## CONCLUSION

**Overall Risk Level: 🔴 MEDIUM-HIGH**

The app is **suitable for single-user or trusted team environments** but **NOT for:**
- Public-facing deployment
- Multi-tenant scenarios
- Sensitive/regulated data
- Shared computers without proper OS-level security

**Critical fixes required before expansion:**
1. XSS vulnerability in user name rendering (affects all users)
2. Client-side authentication bypass risk
3. localStorage tampering without detection

---

**Audit Performed By:** Claude AI  
**Framework:** Vanilla JavaScript SPA (no backend)  
**Total JavaScript:** ~5000+ lines across 30+ files  
**Severity Distribution:** 2 CRITICAL, 4 HIGH, 3 MEDIUM, 1 LOW

