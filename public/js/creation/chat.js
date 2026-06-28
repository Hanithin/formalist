/**
 * Formalist Chat Module
 * Chat panel toggle, SSE messaging, avocat/support tabs
 */
window.Formalist = window.Formalist || {};

(function() {
  var chatOpen = false;
  var currentTab = 'avocat';
  var selectedFormaliteId = null;
  var formalitesList = [];
  var avocatSSE = null;
  var supportSSE = null;

  function _escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  window.toggleChatPanel = function() {
    chatOpen = !chatOpen;
    document.getElementById('chatPanel').classList.toggle('open', chatOpen);
    if (chatOpen) {
      if (currentTab === 'avocat') loadAvocatChat();
      else loadSupportChat();
    }
  };

  window.switchChatTab = function(tab) {
    currentTab = tab;
    document.querySelectorAll('.chat-tab').forEach(function(t) { t.classList.toggle('active', t.dataset.tab === tab); });
    var avocatTab = document.getElementById('chatTabAvocat');
    var supportTab = document.getElementById('chatTabSupport');
    if (tab === 'avocat') {
      avocatTab.style.display = '';
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
        html += '<option value="' + f.id + '">' + _escapeHtml(f.societe || 'Formalit\u00e9 #' + f.id) + ' (' + (f.forme || '') + ')</option>';
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
    var isMine = _currentUser && m.sender_id === _currentUser.id;
    var div = document.createElement('div');
    div.className = 'chat-msg ' + (isMine ? 'sent' : 'received');
    var time = _formatTime(m.created_at);
    var html = '';
    if (!isMine) html += '<div class="chat-msg-sender">' + _escapeHtml(m.sender_name || '') + '</div>';
    html += '<div>' + _escapeHtml(m.content || '') + '</div>';
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
    document.getElementById('chatAvocatSendBtn').classList.remove('active');
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
    var isMine = _currentUser && m.sender_id === _currentUser.id;
    var div = document.createElement('div');
    if (m.file_path && !m.content.startsWith('\ud83d\udcce')) {
      var a = document.createElement('a');
      a.className = 'chat-msg-file';
      a.href = '/api/file?path=' + encodeURIComponent(m.file_path);
      a.target = '_blank';
      a.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>' + _escapeHtml(m.content || m.file_path);
      container.appendChild(a);
    } else {
      div.className = 'chat-msg ' + (isMine ? 'sent' : 'received');
      var time = _formatTime(m.created_at);
      var html = '';
      if (!isMine) html += '<div class="chat-msg-sender">' + _escapeHtml(m.sender_name || 'Support') + '</div>';
      html += '<div>' + _escapeHtml(m.content || '') + '</div>';
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
    document.getElementById('chatSupportSendBtn').classList.remove('active');
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

  function _formatTime(isoStr) {
    if (!isoStr) return '';
    var d = new Date(isoStr);
    return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
  }
})();

Formalist.chat = {};
