// Talk & Heal — Blog İçerik Paneli render mantığı (Madde 5, 2026-08-19).
// Veri: backend GET /blog-posts (public, panel.html'in "Blog Paneli" formundan besleniyor — bkz.
// form-backend/src/routes/blog.ts). events-box.js ile aynı desen, TEK fark: mevcut 3 elle yazılmış
// #blogGrid kartına DOKUNULMUYOR, panelden gelen yazılar bunların YANINA ekleniyor (kullanıcının
// zaten sitede olan içeriği silmeden). data-blog-category değerleri blog.html'in filtre
// butonlarıyla (data-blog-filter) BİREBİR aynı slug'ları kullanıyor, o yüzden mevcut filtre JS'i
// (blog.html içinde, bu dosyadan bağımsız) hiç değişmeden yeni kartları da süzüyor.
(function () {
  var grid = document.getElementById('blogGrid');
  if (!grid) return;

  var API_BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.protocol === 'file:')
    ? 'http://localhost:8787'
    : 'https://form-backend.engintass19-358.workers.dev';

  function bilingualSpan(en, tr) {
    var wrap = document.createDocumentFragment();
    var spanEn = document.createElement('span');
    spanEn.setAttribute('data-en', '');
    spanEn.textContent = en;
    var spanTr = document.createElement('span');
    spanTr.setAttribute('data-tr', '');
    spanTr.textContent = tr;
    wrap.appendChild(spanEn);
    wrap.appendChild(spanTr);
    return wrap;
  }

  // youtube.com/watch?v=ID, youtu.be/ID, youtube.com/embed/ID hepsini kapsar.
  function youtubeEmbedUrl(url) {
    var m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([A-Za-z0-9_-]{6,})/);
    return m ? 'https://www.youtube-nocookie.com/embed/' + m[1] : null;
  }

  function postCard(post) {
    var card = document.createElement('article');
    card.className = 'service-card';
    card.setAttribute('data-blog-category', post.category);

    var title = document.createElement('h2');
    title.appendChild(bilingualSpan(post.titleEn, post.titleTr));
    card.appendChild(title);

    var gorunum = post.gorunum || 'metin';
    if ((gorunum === 'gorsel' || gorunum === 'ikisi') && post.gorselUrl) {
      var img = document.createElement('img');
      img.className = 'event-image'; // events-box.js ile aynı görsel stil, yeniden tanım gerekmiyor
      img.src = post.gorselUrl;
      img.alt = post.titleEn || post.titleTr || '';
      img.loading = 'lazy';
      card.appendChild(img);
    }

    if (post.videoUrl) {
      var embedUrl = youtubeEmbedUrl(post.videoUrl);
      if (embedUrl) {
        var wrap = document.createElement('div');
        wrap.className = 'blog-video-wrap';
        var iframe = document.createElement('iframe');
        iframe.src = embedUrl;
        iframe.title = post.titleEn || post.titleTr || 'Video';
        iframe.loading = 'lazy';
        iframe.allowFullscreen = true;
        iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture');
        wrap.appendChild(iframe);
        card.appendChild(wrap);
      }
    }

    if (gorunum !== 'gorsel') {
      var p = document.createElement('p');
      p.appendChild(bilingualSpan(post.bodyEn, post.bodyTr));
      card.appendChild(p);
    }

    return card;
  }

  fetch(API_BASE + '/blog-posts')
    .then(function (r) { return r.ok ? r.json() : { posts: [] }; })
    .then(function (data) {
      var posts = data.posts || [];
      posts.forEach(function (post) { grid.appendChild(postCard(post)); });
      // Sayfa ilk yüklendiğinde grid tamamen boşsa (henüz ne elle yazılmış kart ne panelden
      // eklenmiş yazı var) blog.html'in kendi boş-durum mesajını göster — filtre butonuna
      // tıklanınca zaten aynı mantık çalışıyor, burada sadece ilk yükleme anı için tetikleniyor.
      var emptyMsg = document.getElementById('blogFilterEmpty');
      if (emptyMsg && !grid.querySelector('.service-card')) emptyMsg.classList.remove('hidden');
    })
    .catch(function () { /* sessiz düş — statik kartlar zaten sayfada, panel yazıları eksik kalır */ });
})();
