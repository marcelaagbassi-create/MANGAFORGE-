// ══════════════════════════════════════════════════════
//  MANGAFORGE WIDGET — Activités & Notifications
//  Gère les badges, notifications push et widget summary
// ══════════════════════════════════════════════════════

const WIDGET_CHECK_INTERVAL = 5 * 60 * 1000; // 5 min

// ── Badge API — affiche un compteur sur l'icône ──
async function setBadge(count) {
  if ('setAppBadge' in navigator) {
    try {
      if (count > 0) {
        await navigator.setAppBadge(count);
      } else {
        await navigator.clearAppBadge();
      }
    } catch(e) {
      console.warn('[Widget] Badge API non supportée:', e.message);
    }
  }
}

// ── Demander la permission de notifications ──
async function requestNotificationPermission() {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

// ── Envoyer une notification locale ──
function sendLocalNotification(title, body, data = {}) {
  if (Notification.permission !== 'granted') return;
  if (!('serviceWorker' in navigator)) return;

  navigator.serviceWorker.ready.then(reg => {
    reg.showNotification(title, {
      body,
      icon: './icon-192x192.png',
      badge: './icon-72x72.png',
      vibrate: [200, 100, 200],
      tag: data.tag || 'mangaforge-activity',
      renotify: true,
      data: { url: data.url || './', ...data },
      actions: data.actions || []
    });
  });
}

// ── Collecter les activités depuis Firestore ──
async function collectActivities(db, userId) {
  const activities = {
    newEpisodes: 0,
    newMessages: 0,
    newFollowers: 0,
    newLikes: 0,
    items: []
  };

  try {
    // Nouveaux épisodes publiés depuis hier
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    // Posts récents dans le fil
    const { getDocs, collection, query, orderBy, limit, where, Timestamp } = await import(
      'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js'
    );

    const postsSnap = await getDocs(
      query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(20))
    );

    postsSnap.docs.forEach(doc => {
      const p = doc.data();
      const ts = p.createdAt?.toDate?.() || new Date(0);
      if (ts > yesterday && p.uid !== userId) {
        if (p.isEpisodePost) {
          activities.newEpisodes++;
          activities.items.push({
            type: 'episode',
            title: p.storyTitle || 'Nouvel épisode',
            sub: p.text?.split('\n')[0] || '',
            url: './#feed'
          });
        }
      }
      // Likes sur mes posts
      if (p.uid === userId && (p.likedBy || []).length > 0) {
        activities.newLikes += (p.likedBy || []).length;
      }
    });

    // Nouveaux followers
    const myProfile = await getDocs(
      query(collection(db, 'users'), where('following', 'array-contains', userId))
    );
    activities.newFollowers = myProfile.docs.length;

  } catch(e) {
    console.warn('[Widget] Erreur collecte activités:', e.message);
  }

  return activities;
}

// ── Générer le résumé des activités ──
function buildActivitySummary(activities) {
  const parts = [];
  if (activities.newEpisodes > 0)
    parts.push(`📺 ${activities.newEpisodes} nouvel${activities.newEpisodes > 1 ? 's' : ''} épisode${activities.newEpisodes > 1 ? 's' : ''}`);
  if (activities.newMessages > 0)
    parts.push(`💬 ${activities.newMessages} message${activities.newMessages > 1 ? 's' : ''}`);
  if (activities.newFollowers > 0)
    parts.push(`👥 ${activities.newFollowers} follower${activities.newFollowers > 1 ? 's' : ''}`);
  if (activities.newLikes > 0)
    parts.push(`❤️ ${activities.newLikes} like${activities.newLikes > 1 ? 's' : ''}`);
  return parts;
}

// ── Mise à jour du widget ──
async function updateWidget(db, userId) {
  const activities = await collectActivities(db, userId);
  const total = activities.newEpisodes + activities.newMessages + activities.newFollowers;

  // Mettre à jour le badge
  await setBadge(total);

  // Sauvegarder dans localStorage pour affichage dans l'app
  const summary = buildActivitySummary(activities);
  localStorage.setItem('mf_widget_data', JSON.stringify({
    total,
    summary,
    items: activities.items,
    updatedAt: Date.now()
  }));

  // Notifier si activités > 0
  if (total > 0 && summary.length > 0) {
    sendLocalNotification(
      '⛩ MangaForge — Activités',
      summary.join(' • '),
      {
        tag: 'mf-widget-summary',
        url: './#feed',
        actions: [
          { action: 'open', title: '📖 Ouvrir' },
          { action: 'dismiss', title: 'Plus tard' }
        ]
      }
    );
  }

  return { total, summary, items: activities.items };
}

// ── Démarrer le widget ──
async function startWidget(db, userId) {
  if (!userId) return;

  // Demander permission notifications
  await requestNotificationPermission();

  // Première vérification
  await updateWidget(db, userId);

  // Vérification périodique
  setInterval(() => updateWidget(db, userId), WIDGET_CHECK_INTERVAL);
}

// Export
window.MFWidget = { startWidget, setBadge, sendLocalNotification, requestNotificationPermission };
