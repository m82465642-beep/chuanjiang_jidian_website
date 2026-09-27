/* =========================================================
   广州川将机电设备有限公司 · 企业官网
   前端逻辑：路由 / 云数据库 / 登录 / 后台管理 / 云存储
   ========================================================= */

// 云服务公开配置（由云服务激活时下发，随应用发布）
const PUBLIC_CONFIG = {
  endpoint: 'https://chuanjiang-jidian.app.workbuddy.host',
  publishableKey: 'wbpk_q9M4vJqpx4UajFeUAxgLeL_lr93YzvRY8gBgdGdCwbXnaW0TwXZsB2R'
};

const CATEGORY_ICONS = {
  '灌装配件': '💉',
  '分液分配': '🧪',
  '泵阀组件': '🔩',
  '传动配件': '🔗',
  '螺旋输送': '🌀',
  '输送理罐': '📦',
  '计量分装': '⚖️'
};

let cloud = null;
let currentProducts = [];
let currentCategory = '全部';
let editingId = null;
let pendingImageUrl = null;   // 后台上传后得到的图片地址（暂存）

/* ---------- 初始化 ---------- */
function initCloud() {
  if (window.WorkBuddyCloud && window.WorkBuddyCloud.createWorkBuddyCloud) {
    cloud = window.WorkBuddyCloud.createWorkBuddyCloud({
      endpoint: PUBLIC_CONFIG.endpoint,
      publishableKey: PUBLIC_CONFIG.publishableKey
    });
  } else {
    console.warn('云服务 SDK 未加载');
  }
}

/* ---------- 路由 ---------- */
const ROUTES = {
  '': 'home',
  '/': 'home',
  '/about': 'about',
  '/products': 'products',
  '/contact': 'contact',
  '/admin': 'admin'
};

function currentRoute() {
  const hash = location.hash.replace(/^#/, '');
  return ROUTES[hash] || 'home';
}

function showPage(name) {
  document.querySelectorAll('.page').forEach(p => (p.hidden = true));
  const el = document.getElementById('page-' + name);
  if (el) el.hidden = false;

  document.querySelectorAll('.main-nav a').forEach(a => {
    a.classList.toggle('active', (a.getAttribute('href') || '').replace(/^#/, '') === (location.hash || '#/'));
  });

  // 关闭移动端菜单
  document.getElementById('mainNav').classList.remove('open');

  window.scrollTo({ top: 0, behavior: 'auto' });

  if (name === 'products') loadProducts();
  if (name === 'admin') initAdmin();
}

function router() {
  showPage(currentRoute());
}

/* ---------- 产品加载与渲染 ---------- */
async function loadProducts() {
  const grid = document.getElementById('productGrid');
  grid.innerHTML = '<div class="loading">正在加载产品数据…</div>';

  const categories = ['全部', ...Object.keys(CATEGORY_ICONS)];
  renderFilterBar(categories);

  if (!cloud) {
    grid.innerHTML = '<div class="empty">云服务未连接，请稍后刷新</div>';
    return;
  }

  const { data, error } = await cloud.database
    .from('products')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('id', { ascending: true });

  if (error) {
    grid.innerHTML = '<div class="empty">产品加载失败：' + escapeHtml(error.message || '未知错误') + '</div>';
    return;
  }

  currentProducts = data || [];
  renderProducts();
}

function renderFilterBar(categories) {
  const bar = document.getElementById('filterBar');
  bar.innerHTML = '';
  categories.forEach(c => {
    const btn = document.createElement('button');
    btn.className = 'filter-btn' + (c === currentCategory ? ' active' : '');
    btn.textContent = c;
    btn.onclick = () => { currentCategory = c; renderFilterBar(categories); renderProducts(); };
    bar.appendChild(btn);
  });
}

function renderProducts() {
  const grid = document.getElementById('productGrid');
  const list = currentCategory === '全部'
    ? currentProducts
    : currentProducts.filter(p => p.category === currentCategory);

  if (!list.length) {
    grid.innerHTML = '<div class="empty">该分类下暂无产品</div>';
    return;
  }

  grid.innerHTML = '';
  list.forEach(p => {
    const card = document.createElement('div');
    card.className = 'product-card';
    const icon = CATEGORY_ICONS[p.category] || '🔩';
    const thumbHtml = p.image_url && (/^https?:\/\//.test(p.image_url) || p.image_url.startsWith('img/'))
      ? `<img src="${escapeAttr(p.image_url)}" alt="${escapeAttr(p.name)}" loading="lazy" onerror="this.parentNode.innerHTML='${icon}'">`
      : icon;
    card.innerHTML = `
      <div class="product-thumb">${thumbHtml}</div>
      <div class="product-info">
        <span class="p-cat">${escapeHtml(p.category)}</span>
        <h3>${escapeHtml(p.name)}</h3>
        <p>${escapeHtml(p.description || '')}</p>
      </div>`;
    grid.appendChild(card);
  });
}

/* ---------- 后台：登录与面板 ---------- */
async function initAdmin() {
  const loginBox = document.getElementById('adminLogin');
  const panel = document.getElementById('adminPanel');

  if (!cloud) {
    loginBox.hidden = false; panel.hidden = true;
    return;
  }

  const { data: session } = await cloud.auth.getSession();
  if (session) {
    loginBox.hidden = true;
    panel.hidden = false;
    const { data: user } = await cloud.auth.getUser();
    document.getElementById('adminEmail').textContent = (user && user.email) || session.user?.email || '管理员';
    loadAdminTable();
  } else {
    loginBox.hidden = false;
    panel.hidden = true;
  }
}

async function loadAdminTable() {
  const tbody = document.getElementById('adminTableBody');
  tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#8a97a5;">加载中…</td></tr>';

  const { data, error } = await cloud.database
    .from('products')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('id', { ascending: true });

  if (error) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#d64545;">加载失败：' + escapeHtml(error.message || '') + '</td></tr>';
    return;
  }

  currentProducts = data || [];
  if (!currentProducts.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#8a97a5;">暂无产品，点击右上角「新增产品」开始</td></tr>';
    return;
  }

  tbody.innerHTML = '';
  currentProducts.forEach(p => {
    const tr = document.createElement('tr');
    const thumb = p.image_url && (/^https?:\/\//.test(p.image_url) || p.image_url.startsWith('img/'))
      ? `<img class="p-thumb" src="${escapeAttr(p.image_url)}" alt="">`
      : '<span class="no-img">无图</span>';
    tr.innerHTML = `
      <td>${escapeHtml(p.name)}</td>
      <td>${escapeHtml(p.category)}</td>
      <td style="max-width:260px;">${escapeHtml((p.description || '').slice(0, 40))}</td>
      <td>${thumb}</td>
      <td>
        <div class="table-actions">
          <button class="btn-sm" data-edit="${p.id}">编辑</button>
          <button class="btn-sm danger" data-del="${p.id}">删除</button>
        </div>
      </td>`;
    tbody.appendChild(tr);
  });
}

/* ---------- 登录 / 注册 ---------- */
async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const msg = document.getElementById('loginMsg');
  msg.textContent = ''; msg.className = 'auth-msg';

  const { data: session, error } = await cloud.auth.signInWithPassword({ email, password });
  if (error) {
    msg.textContent = '登录失败：邮箱或密码错误';
    msg.className = 'auth-msg err';
    return;
  }
  msg.textContent = '登录成功';
  msg.className = 'auth-msg ok';
  setTimeout(() => initAdmin(), 300);
}

let pendingVerificationId = null;
let pendingSignupEmail = null;
let pendingIsExisting = null;

async function handleSendOtp() {
  const email = document.getElementById('signupEmail').value.trim();
  const msg = document.getElementById('signupMsg');
  msg.textContent = ''; msg.className = 'auth-msg';
  if (!email) { msg.textContent = '请先填写邮箱'; msg.className = 'auth-msg err'; return; }

  const sent = await cloud.auth.sendOtp({ email });
  if (sent.error) {
    msg.textContent = '验证码发送失败：' + (sent.error.message || '');
    msg.className = 'auth-msg err';
    return;
  }
  pendingVerificationId = sent.data.verificationId;
  pendingSignupEmail = email;
  pendingIsExisting = sent.data.isExistingUser;
  msg.textContent = '验证码已发送至邮箱，请查收';
  msg.className = 'auth-msg ok';
  document.getElementById('sendOtpBtn').disabled = true;
}

async function handleSignup(e) {
  e.preventDefault();
  const email = document.getElementById('signupEmail').value.trim();
  const otp = document.getElementById('signupOtp').value.trim();
  const password = document.getElementById('signupPassword').value;
  const msg = document.getElementById('signupMsg');
  msg.textContent = ''; msg.className = 'auth-msg';

  if (!pendingVerificationId || pendingSignupEmail !== email) {
    msg.textContent = '请先点击「发送验证码」';
    msg.className = 'auth-msg err';
    return;
  }
  if (pendingIsExisting) {
    msg.textContent = '该邮箱已注册，请切换到「密码登录」';
    msg.className = 'auth-msg err';
    return;
  }
  if (!password || password.length < 6) {
    msg.textContent = '密码至少 6 位';
    msg.className = 'auth-msg err';
    return;
  }

  const completed = await cloud.auth.verifyOtp({
    verificationId: pendingVerificationId,
    token: otp,
    email,
    isExistingUser: pendingIsExisting,
    password
  });

  if (completed.error) {
    msg.textContent = '注册失败：' + (completed.error.message || '验证码错误');
    msg.className = 'auth-msg err';
    return;
  }
  msg.textContent = '注册成功，已自动登录';
  msg.className = 'auth-msg ok';
  setTimeout(() => initAdmin(), 300);
}

async function handleLogout() {
  await cloud.auth.signOut();
  currentProducts = [];
  initAdmin();
}

/* ---------- 产品 CRUD ---------- */
function openProductModal(id) {
  editingId = id || null;
  pendingImageUrl = null;
  document.getElementById('modalTitle').textContent = id ? '编辑产品' : '新增产品';
  document.getElementById('pName').value = '';
  document.getElementById('pCategory').value = '灌装配件';
  document.getElementById('pDesc').value = '';
  document.getElementById('pImage').value = '';
  document.getElementById('imgHint').textContent = '';

  if (id) {
    const p = currentProducts.find(x => x.id === id);
    if (p) {
      document.getElementById('pName').value = p.name || '';
      document.getElementById('pCategory').value = p.category || '灌装配件';
      document.getElementById('pDesc').value = p.description || '';
      document.getElementById('imgHint').textContent = p.image_url ? '当前已有图片' : '';
    }
  }
  document.getElementById('productModal').hidden = false;
}

function closeProductModal() {
  document.getElementById('productModal').hidden = true;
}

async function handleImageChange(e) {
  const file = e.target.files[0];
  const hint = document.getElementById('imgHint');
  if (!file) return;
  hint.textContent = '正在上传到云端存储…';

  const { data: session } = await cloud.auth.getSession();
  if (!session) { hint.textContent = '上传失败：请先登录'; return; }

  const safeName = (file.name || 'image').replace(/[^\w.\-\u4e00-\u9fa5]/g, '_');
  const path = cloud.storage.sharedPath(session.user.id, 'products/' + Date.now() + '-' + safeName);

  try {
    const up = await cloud.storage.upload(path, file, { contentType: file.type || 'image/jpeg' });
    if (up.error) { hint.textContent = '上传失败：' + (up.error.message || ''); return; }

    // 生成短期签名地址用于预览与前台临时展示
    let url = '';
    try {
      const su = await cloud.storage.createSignedUrl(path, 3600);
      url = (su.data && (su.data.url || su.data)) || '';
    } catch (_) {}

    pendingImageUrl = url;
    hint.textContent = '已上传到云端存储' + (url ? '（已生成访问地址）' : '');
  } catch (err) {
    hint.textContent = '上传失败：' + (err && err.message ? err.message : '未知错误');
  }
}

async function handleSaveProduct(e) {
  e.preventDefault();
  const name = document.getElementById('pName').value.trim();
  const category = document.getElementById('pCategory').value;
  const desc = document.getElementById('pDesc').value.trim();
  if (!name) { alert('请填写产品名称'); return; }

  const payload = { name, category, description: desc };
  if (pendingImageUrl) payload.image_url = pendingImageUrl;

  let result;
  if (editingId) {
    result = await cloud.database.from('products').update(payload).eq('id', editingId).select();
  } else {
    // 新增时按数量递增排序
    payload.sort_order = (currentProducts.length + 1) * 10;
    result = await cloud.database.from('products').insert(payload).select();
  }

  if (result.error) {
    alert('保存失败：' + (result.error.message || ''));
    return;
  }

  closeProductModal();
  loadAdminTable();
}

async function handleDeleteProduct(id) {
  if (!confirm('确定删除该产品吗？此操作不可恢复。')) return;
  const { data } = await cloud.database.from('products').delete().eq('id', id).select();
  const removed = Array.isArray(data) ? data : [];
  if (removed.length === 0) {
    alert('删除失败，可能是权限不足或产品不存在');
    return;
  }
  loadAdminTable();
}

/* ---------- 事件绑定 ---------- */
function bindEvents() {
  // 移动端菜单
  document.getElementById('navToggle').onclick = () => {
    document.getElementById('mainNav').classList.toggle('open');
  };

  // 登录 tab 切换
  document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.onclick = () => {
      document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const isLogin = tab.dataset.authTab === 'login';
      document.getElementById('loginForm').hidden = !isLogin;
      document.getElementById('signupForm').hidden = isLogin;
    };
  });

  document.getElementById('loginForm').onsubmit = handleLogin;
  document.getElementById('signupForm').onsubmit = handleSignup;
  document.getElementById('sendOtpBtn').onclick = handleSendOtp;
  document.getElementById('logoutBtn').onclick = handleLogout;
  document.getElementById('addProductBtn').onclick = () => openProductModal(null);
  document.getElementById('cancelModalBtn').onclick = closeProductModal;
  document.getElementById('productForm').onsubmit = handleSaveProduct;
  document.getElementById('pImage').onchange = handleImageChange;

  // 表格操作（事件委托）
  document.getElementById('adminTableBody').onclick = (e) => {
    const editBtn = e.target.closest('[data-edit]');
    const delBtn = e.target.closest('[data-del]');
    if (editBtn) openProductModal(Number(editBtn.dataset.edit));
    if (delBtn) handleDeleteProduct(Number(delBtn.dataset.del));
  };
}

/* ---------- 工具 ---------- */
function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function escapeAttr(s) {
  return escapeHtml(s);
}

/* ---------- 启动 ---------- */
document.addEventListener('DOMContentLoaded', () => {
  initCloud();
  bindEvents();
  router();
});
window.addEventListener('hashchange', router);
