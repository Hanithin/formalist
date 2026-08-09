/**
 * chat-widget.js - bulle de messagerie, commune à toutes les pages.
 *
 * Le widget était dupliqué dans le tableau de bord et le formulaire de création ;
 * il est désormais injecté ici, en un seul exemplaire, pour éviter que les copies
 * divergent. La page n'a qu'à charger ce script après common.js.
 *
 * Ne s'installe pas dans un cadre (révision avocat) ni sur une page qui porte
 * déjà le widget en dur.
 */
(function () {
  if (window.self !== window.top) return;              // page ouverte dans un cadre
  if (document.getElementById('chatFab')) return;      // déjà présent dans la page


  var MARKUP = `  <button class="chat-fab" id="chatFab" onclick="toggleChatPanel()">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
    <span class="chat-fab-badge" id="chatBadge">0</span>
  </button>

  <!-- Chat Panel -->
  <div class="chat-panel" id="chatPanel">
    <div class="chat-header">
      <div class="chat-header-title">Messages</div>
      <div class="chat-tabs">
        <button class="chat-tab active" data-tab="avocat" onclick="switchChatTab('avocat')">Mon avocat</button>
        <button class="chat-tab" data-tab="support" onclick="switchChatTab('support')">Support</button>
      </div>
    </div>

    <!-- Avocat tab content -->
    <div id="chatTabAvocat" style="flex:1;flex-direction:column;min-height:0;display:flex;">
      <div class="chat-select" id="chatFormaliteSelect"></div>
      <div id="chatAvocatInfo"></div>
      <div class="chat-messages" id="chatAvocatMessages"></div>
      <div class="chat-input-area" id="chatAvocatInput">
        <input type="file" id="chatAvocatFile" accept=".pdf,.jpg,.jpeg,.png,.docx">
        <button class="chat-btn-attach" onclick="document.getElementById('chatAvocatFile').click()" title="Joindre un fichier">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
        </button>
        <input type="text" id="chatAvocatText" placeholder="Votre message..." onkeydown="if(event.key==='Enter')sendAvocatMessage()">
        <button class="chat-btn-send" id="chatAvocatSendBtn" onclick="sendAvocatMessage()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        </button>
      </div>
    </div>

    <!-- Support tab content -->
    <div id="chatTabSupport" style="display:none;flex:1;flex-direction:column;min-height:0;">
      <div class="chat-messages" id="chatSupportMessages"></div>
      <div class="chat-input-area">
        <input type="file" id="chatSupportFile" accept=".pdf,.jpg,.jpeg,.png,.docx">
        <button class="chat-btn-attach" onclick="document.getElementById('chatSupportFile').click()" title="Joindre un fichier">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
        </button>
        <input type="text" id="chatSupportText" placeholder="Votre message..." onkeydown="if(event.key==='Enter')sendSupportMessage()">
        <button class="chat-btn-send" id="chatSupportSendBtn" onclick="sendSupportMessage()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        </button>
      </div>
    </div>
  </div>`;

  function installer() {
    if (document.getElementById('chatFab')) return;
    // Feuille commune, déjà utilisée par le formulaire de création
    if (!document.querySelector('link[href="/css/chat.css"]')) {
      var lien = document.createElement('link');
      lien.rel = 'stylesheet';
      lien.href = '/css/chat.css';
      document.head.appendChild(lien);
    }

    var conteneur = document.createElement('div');
    conteneur.innerHTML = MARKUP;
    while (conteneur.firstChild) document.body.appendChild(conteneur.firstChild);

    demarrer();
  }

  function demarrer() {
    // Le widget ne doit dépendre d'aucune fonction de la page hôte : il tournait
    // jusqu'ici dans le tableau de bord, qui lui fournissait escapeHtml.
    var escapeHtml = window.escapeHtml || function (s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    };
    // Lu à l'usage, pas capturé : common.js le renseigne après son appel réseau


  (function() {
    var chatOpen = false;
    var currentTab = 'avocat';
    var selectedFormaliteId = null;
    var formalitesList = [];
    var avocatSSE = null;
    var supportSSE = null;
    var totalUnread = 0;
    // Ferme les EventSource avant la navigation
    window.addEventListener('beforeunload', function() {
      if (avocatSSE) { try { avocatSSE.close(); } catch(_) {} avocatSSE = null; }
      if (supportSSE) { try { supportSSE.close(); } catch(_) {} supportSSE = null; }
    });
    window.addEventListener('pagehide', function() {
      if (avocatSSE) { try { avocatSSE.close(); } catch(_) {} avocatSSE = null; }
      if (supportSSE) { try { supportSSE.close(); } catch(_) {} supportSSE = null; }
    });

    window.toggleChatPanel = function() {
      chatOpen = !chatOpen;
      document.getElementById('chatPanel').classList.toggle('open', chatOpen);
      if (chatOpen) {
        if (currentTab === 'avocat') loadAvocatChat();
        else loadSupportChat();
      }
    };

    /**
     * Ouvre la messagerie prête à écrire : panneau ouvert, bon onglet, curseur
     * dans le champ. Appelé depuis "Écrire un message" sur l'accueil.
     */
    window.openChatPanel = function(tab) {
      var wanted = tab || 'avocat';
      if (!chatOpen) {
        chatOpen = true;
        document.getElementById('chatPanel').classList.add('open');
      }
      if (wanted !== currentTab) window.switchChatTab(wanted);
      else if (wanted === 'avocat') loadAvocatChat();
      else loadSupportChat();

      // Le panneau s'ouvre en 0,25 s : on attend la fin pour que le focus prenne
      setTimeout(function() {
        var field = document.getElementById(wanted === 'support' ? 'chatSupportText' : 'chatAvocatText');
        if (field) field.focus();
      }, 280);
    };

    window.switchChatTab = function(tab) {
      currentTab = tab;
      document.querySelectorAll('.chat-tab').forEach(function(t) { t.classList.toggle('active', t.dataset.tab === tab); });
      var avocatTab = document.getElementById('chatTabAvocat');
      var supportTab = document.getElementById('chatTabSupport');
      if (tab === 'avocat') {
        avocatTab.style.display = 'flex';
        supportTab.style.display = 'none';
        loadAvocatChat();
      } else {
        avocatTab.style.display = 'none';
        supportTab.style.display = 'flex';
        loadSupportChat();
      }
    };

    var hasAvocat = false;

    function loadFormalitesForChat() {
      fetch('/api/formalites').then(function(r) { return r.json(); }).then(function(data) {
        formalitesList = (data.formalites || []).filter(function(f) { return f.status !== 'terminee'; });
        var avocatFormalites = formalitesList.filter(function(f) { return f.assigned_avocat_id; });
        hasAvocat = avocatFormalites.length > 0;
        updateTabsVisibility();

        var sel = document.getElementById('chatFormaliteSelect');
        if (avocatFormalites.length === 0) {
          sel.innerHTML = '';
          document.getElementById('chatAvocatMessages').innerHTML = '';
          if (!hasAvocat && currentTab === 'avocat') {
            switchChatTab('support');
          }
          return;
        }
        var html = '<select id="chatFormaliteDropdown" onchange="window._onFormaliteChange(this.value)">';
        avocatFormalites.forEach(function(f) {
          html += '<option value="' + f.id + '">' + escapeHtml(f.societe || 'Formalit\u00e9 #' + f.id) + ' (' + (f.forme || '') + ')</option>';
        });
        html += '</select>';
        sel.innerHTML = html;
        selectedFormaliteId = avocatFormalites[0].id;
        loadAvocatChat();
      });
    }

    function updateTabsVisibility() {
      var avocatTab = document.querySelector('.chat-tab[data-tab="avocat"]');
      if (hasAvocat) {
        avocatTab.style.display = '';
      } else {
        avocatTab.style.display = 'none';
      }
    }

    window._onFormaliteChange = function(val) {
      selectedFormaliteId = parseInt(val);
      loadAvocatChat();
    };

    function loadAvocatChat() {
      if (!selectedFormaliteId) { loadFormalitesForChat(); return; }
      if (formalitesList.length === 0) { loadFormalitesForChat(); return; }
      fetch('/api/messages?formalite_id=' + selectedFormaliteId).then(function(r) { return r.json(); }).then(function(data) {
        renderAvocatMessages(data.messages || []);
        fetch('/api/messages/read?formalite_id=' + selectedFormaliteId, { method: 'PUT' });
      });
      if (avocatSSE) avocatSSE.close();
      avocatSSE = new EventSource('/api/messages/stream?formalite_id=' + selectedFormaliteId);
      avocatSSE.onmessage = function(e) {
        try {
          var msg = JSON.parse(e.data);
          appendAvocatMessage(msg);
          fetch('/api/messages/read?formalite_id=' + selectedFormaliteId, { method: 'PUT' });
        } catch(err) {}
      };
    }

    function renderAvocatMessages(messages) {
      var container = document.getElementById('chatAvocatMessages');
      container.innerHTML = '';
      messages.forEach(function(m) { appendAvocatMessage(m, true); });
      container.scrollTop = container.scrollHeight;
    }

    function appendAvocatMessage(m, noscroll) {
      var container = document.getElementById('chatAvocatMessages');
      var moi = window._currentUser;
      var isMine = moi && m.sender_id === moi.id;
      var div = document.createElement('div');
      div.className = 'chat-msg ' + (isMine ? 'sent' : 'received');
      var time = formatTime(m.created_at);
      var html = '';
      if (!isMine) html += '<div class="chat-msg-sender">' + escapeHtml(m.sender_name || '') + '</div>';
      html += '<div>' + escapeHtml(m.content || '') + '</div>';
      html += '<div class="chat-msg-time">' + time + '</div>';
      div.innerHTML = html;
      container.appendChild(div);
      if (!noscroll) container.scrollTop = container.scrollHeight;
    }

    window.sendAvocatMessage = function() {
      var input = document.getElementById('chatAvocatText');
      var text = input.value.trim();
      if (!text || !selectedFormaliteId) return;
      input.value = '';
      fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formalite_id: selectedFormaliteId, content: text })
      });
    };

    document.getElementById('chatAvocatFile').addEventListener('change', function() {
      var file = this.files[0];
      if (!file || !selectedFormaliteId) return;
      var fd = new FormData();
      fd.append('file', file);
      fd.append('doc_name', file.name);
      fd.append('status', 'uploaded');
      fetch('/api/formalites/' + selectedFormaliteId + '/documents', { method: 'POST', body: fd }).then(function(r) { return r.json(); }).then(function(data) {
        if (data.ok) {
          fetch('/api/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ formalite_id: selectedFormaliteId, content: '\ud83d\udcce ' + file.name })
          });
        }
      });
      this.value = '';
    });

    function loadSupportChat() {
      fetch('/api/support').then(function(r) { return r.json(); }).then(function(data) {
        renderSupportMessages(data.messages || []);
      });
      if (supportSSE) supportSSE.close();
      supportSSE = new EventSource('/api/support/stream');
      supportSSE.onmessage = function(e) {
        try {
          var msg = JSON.parse(e.data);
          appendSupportMessage(msg);
        } catch(err) {}
      };
    }

    function renderSupportMessages(messages) {
      var container = document.getElementById('chatSupportMessages');
      container.innerHTML = '';
      if (messages.length === 0) {
        container.innerHTML = '<div style="text-align:center;padding:40px 20px;color:#888;font-size:13px">Envoyez un message pour contacter le support Formalist</div>';
      }
      messages.forEach(function(m) { appendSupportMessage(m, true); });
      container.scrollTop = container.scrollHeight;
    }

    function appendSupportMessage(m, noscroll) {
      var container = document.getElementById('chatSupportMessages');
      var placeholder = container.querySelector('div[style*="text-align:center"]');
      if (placeholder) placeholder.remove();
      var moi = window._currentUser;
      var isMine = moi && m.sender_id === moi.id;
      var div = document.createElement('div');
      if (m.file_path && !m.content.startsWith('\ud83d\udcce')) {
        var a = document.createElement('a');
        a.className = 'chat-msg-file';
        a.href = '/api/file?path=' + encodeURIComponent(m.file_path);
        a.target = '_blank';
        a.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>' + escapeHtml(m.content || m.file_path);
        container.appendChild(a);
      } else {
        div.className = 'chat-msg ' + (isMine ? 'sent' : 'received');
        var time = formatTime(m.created_at);
        var html = '';
        if (!isMine) html += '<div class="chat-msg-sender">' + escapeHtml(m.sender_name || 'Support') + '</div>';
        html += '<div>' + escapeHtml(m.content || '') + '</div>';
        html += '<div class="chat-msg-time">' + time + '</div>';
        div.innerHTML = html;
        container.appendChild(div);
      }
      if (!noscroll) container.scrollTop = container.scrollHeight;
    }

    window.sendSupportMessage = function() {
      var input = document.getElementById('chatSupportText');
      var text = input.value.trim();
      if (!text) return;
      input.value = '';
      fetch('/api/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text })
      });
    };

    document.getElementById('chatSupportFile').addEventListener('change', function() {
      var file = this.files[0];
      if (!file) return;
      var fd = new FormData();
      fd.append('file', file);
      fd.append('content', file.name);
      fetch('/api/support', { method: 'POST', body: fd });
      this.value = '';
    });

    function setupSendBtn(inputId, btnId) {
      var input = document.getElementById(inputId);
      var btn = document.getElementById(btnId);
      if (!input || !btn) return;
      input.addEventListener('input', function() {
        btn.classList.toggle('active', input.value.trim().length > 0);
      });
    }
    setupSendBtn('chatAvocatText', 'chatAvocatSendBtn');
    setupSendBtn('chatSupportText', 'chatSupportSendBtn');

    function updateUnreadBadge() {
      var total = 0;
      var done = 0;
      var needed = 1;
      fetch('/api/formalites').then(function(r) { return r.json(); }).then(function(data) {
        (data.formalites || []).forEach(function(f) { total += (f.unread_messages || 0); });
        done++;
        if (done >= needed) showBadge(total);
      });
      fetch('/api/support/unread').then(function(r) { return r.json(); }).then(function(data) {
        total += (data.count || 0);
        needed++;
        done++;
        if (done >= needed) showBadge(total);
      });
    }

    function showBadge(count) {
      var badge = document.getElementById('chatBadge');
      if (count > 0) {
        badge.textContent = count > 99 ? '99+' : count;
        badge.style.display = 'flex';
      } else {
        badge.style.display = 'none';
      }
    }

    setInterval(updateUnreadBadge, 30000);
    setTimeout(updateUnreadBadge, 2000);
    setTimeout(loadFormalitesForChat, 1000);

    function formatTime(isoStr) {
      if (!isoStr) return '';
      var d = new Date(isoStr);
      return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
    }
  })();
  
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installer);
  } else {
    installer();
  }
})();
