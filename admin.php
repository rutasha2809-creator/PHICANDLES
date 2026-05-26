<?php
require_once __DIR__ . '/config.php';
session_start();

// Выход
if (isset($_GET['logout'])) {
    session_destroy();
    header('Location: admin.php');
    exit;
}

// Вход
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['password'])) {
    if ($_POST['password'] === ADMIN_PASS) {
        $_SESSION['admin'] = true;
        header('Location: admin.php');
        exit;
    } else {
        $error = 'Неверный пароль';
    }
}

$isAdmin = !empty($_SESSION['admin']);

// Получить заказы
$orders = [];
if ($isAdmin) {
    try {
        $pdo = new PDO(
            'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4',
            DB_USER, DB_PASS,
            [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
        );
        $filter = $_GET['status'] ?? '';
        if ($filter && in_array($filter, ['Принят','В работе','Отправлен','Доставлен'])) {
            $stmt = $pdo->prepare('SELECT * FROM orders WHERE status = ? ORDER BY created_at DESC');
            $stmt->execute([$filter]);
        } else {
            $stmt = $pdo->query('SELECT * FROM orders ORDER BY created_at DESC');
        }
        $orders = $stmt->fetchAll(PDO::FETCH_ASSOC);
    } catch (Exception $e) {
        $dbError = $e->getMessage();
    }
}

function statusColor($s) {
    return [
        'Принят'    => '#888',
        'В работе'  => '#b07d2e',
        'Отправлен' => '#2e6eb0',
        'Доставлен' => '#3a8a4a',
    ][$s] ?? '#888';
}
?>
<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Админ — PHICANDLES</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; background: #f5f5f3; color: #222; font-size: 14px; }
  .login { max-width: 360px; margin: 120px auto; background: #fff; padding: 40px; border: 1px solid #ddd; }
  .login h1 { font-size: 1.4rem; margin-bottom: 24px; font-weight: 500; }
  .login input { width: 100%; border: 1px solid #ddd; padding: 10px 12px; font-size: 0.95rem; margin-bottom: 12px; }
  .login button { width: 100%; padding: 11px; background: #222; color: #fff; border: none; cursor: pointer; font-size: 0.9rem; letter-spacing: 0.08em; }
  .login .err { color: #8b2e2e; font-size: 0.85rem; margin-bottom: 10px; }
  header { background: #222; color: #fff; padding: 14px 32px; display: flex; justify-content: space-between; align-items: center; }
  header h1 { font-size: 1rem; font-weight: 500; letter-spacing: 0.08em; }
  header a { color: #aaa; text-decoration: none; font-size: 0.85rem; }
  header a:hover { color: #fff; }
  .wrap { max-width: 1200px; margin: 0 auto; padding: 24px 20px; }
  .filters { display: flex; gap: 8px; margin-bottom: 20px; flex-wrap: wrap; }
  .filters a { padding: 7px 16px; border: 1px solid #ddd; background: #fff; text-decoration: none; color: #444; font-size: 0.82rem; letter-spacing: 0.05em; }
  .filters a.active, .filters a:hover { background: #222; color: #fff; border-color: #222; }
  .stats { display: flex; gap: 12px; margin-bottom: 20px; flex-wrap: wrap; }
  .stat { background: #fff; border: 1px solid #ddd; padding: 14px 20px; flex: 1; min-width: 120px; }
  .stat__num { font-size: 1.6rem; font-weight: 600; }
  .stat__label { font-size: 0.78rem; color: #888; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; background: #fff; }
  th { background: #222; color: #fff; padding: 10px 12px; text-align: left; font-weight: 500; font-size: 0.82rem; letter-spacing: 0.05em; }
  td { padding: 12px; border-bottom: 1px solid #eee; vertical-align: top; }
  tr:hover td { background: #fafaf8; }
  .order-num { font-weight: 600; font-size: 0.88rem; }
  .order-date { color: #888; font-size: 0.78rem; margin-top: 2px; }
  .client-name { font-weight: 500; }
  .client-contact { color: #666; font-size: 0.82rem; margin-top: 2px; }
  .items-text { font-size: 0.82rem; color: #444; white-space: pre-line; max-width: 280px; }
  .total { font-weight: 600; white-space: nowrap; }
  select.status-select { border: 1px solid #ddd; padding: 6px 10px; font-size: 0.82rem; cursor: pointer; background: #fff; border-radius: 0; }
  .status-msg { font-size: 0.75rem; margin-top: 4px; min-height: 16px; }
  .empty { text-align: center; padding: 60px; color: #888; }
</style>
</head>
<body>

<?php if (!$isAdmin): ?>
<div class="login">
  <h1>PHICANDLES · Вход</h1>
  <?php if (!empty($error)): ?><div class="err"><?= $error ?></div><?php endif; ?>
  <form method="POST">
    <input type="password" name="password" placeholder="Пароль" autofocus required>
    <button type="submit">Войти</button>
  </form>
</div>

<?php else: ?>
<header>
  <h1>PHICANDLES · Заказы</h1>
  <a href="?logout=1">Выйти</a>
</header>

<div class="wrap">

  <?php
  $counts = ['all' => count($orders)];
  foreach (['Принят','В работе','Отправлен','Доставлен'] as $s) {
      $counts[$s] = count(array_filter($orders, fn($o) => $o['status'] === $s));
  }
  $currentFilter = $_GET['status'] ?? '';
  ?>

  <div class="stats">
    <div class="stat"><div class="stat__num"><?= $counts['all'] ?></div><div class="stat__label">Всего заказов</div></div>
    <div class="stat"><div class="stat__num" style="color:#b07d2e"><?= $counts['Принят'] + $counts['В работе'] ?></div><div class="stat__label">В обработке</div></div>
    <div class="stat"><div class="stat__num" style="color:#2e6eb0"><?= $counts['Отправлен'] ?></div><div class="stat__label">Отправлено</div></div>
    <div class="stat"><div class="stat__num" style="color:#3a8a4a"><?= $counts['Доставлен'] ?></div><div class="stat__label">Доставлено</div></div>
  </div>

  <div class="filters">
    <a href="admin.php" class="<?= !$currentFilter ? 'active' : '' ?>">Все</a>
    <a href="?status=Принят" class="<?= $currentFilter==='Принят' ? 'active' : '' ?>">Принятые</a>
    <a href="?status=В работе" class="<?= $currentFilter==='В работе' ? 'active' : '' ?>">В работе</a>
    <a href="?status=Отправлен" class="<?= $currentFilter==='Отправлен' ? 'active' : '' ?>">Отправлены</a>
    <a href="?status=Доставлен" class="<?= $currentFilter==='Доставлен' ? 'active' : '' ?>">Доставлены</a>
  </div>

  <?php if (empty($orders)): ?>
    <div class="empty">Заказов нет</div>
  <?php else: ?>
  <table>
    <thead>
      <tr>
        <th>Заказ</th>
        <th>Клиент</th>
        <th>Доставка</th>
        <th>Состав</th>
        <th>Сумма</th>
        <th>Статус</th>
      </tr>
    </thead>
    <tbody>
    <?php foreach ($orders as $o): ?>
      <tr>
        <td>
          <div class="order-num"><?= htmlspecialchars($o['order_number']) ?></div>
          <div class="order-date"><?= date('d.m.Y H:i', strtotime($o['created_at'])) ?></div>
        </td>
        <td>
          <div class="client-name"><?= htmlspecialchars($o['name']) ?></div>
          <div class="client-contact"><?= htmlspecialchars($o['phone']) ?></div>
          <div class="client-contact"><?= htmlspecialchars($o['email']) ?></div>
        </td>
        <td style="max-width:160px;font-size:0.82rem;color:#444"><?= htmlspecialchars($o['address']) ?><?= $o['comment'] && $o['comment'] !== '—' ? '<br><span style="color:#888">' . htmlspecialchars($o['comment']) . '</span>' : '' ?></td>
        <td><div class="items-text"><?= htmlspecialchars($o['items']) ?></div></td>
        <td><div class="total"><?= htmlspecialchars($o['total']) ?></div></td>
        <td>
          <select class="status-select" data-id="<?= $o['id'] ?>" style="border-color:<?= statusColor($o['status']) ?>;color:<?= statusColor($o['status']) ?>">
            <?php foreach (['Принят','В работе','Отправлен','Доставлен'] as $s): ?>
              <option value="<?= $s ?>" <?= $o['status']===$s ? 'selected' : '' ?>><?= $s ?></option>
            <?php endforeach; ?>
          </select>
          <div class="status-msg" id="msg-<?= $o['id'] ?>"></div>
        </td>
      </tr>
    <?php endforeach; ?>
    </tbody>
  </table>
  <?php endif; ?>
</div>

<script>
document.querySelectorAll('.status-select').forEach(sel => {
  sel.addEventListener('change', async function() {
    const id = this.dataset.id;
    const status = this.value;
    const msg = document.getElementById('msg-' + id);
    msg.textContent = 'Сохраняем...';
    msg.style.color = '#888';

    const colors = {
      'Принят':'#888','В работе':'#b07d2e','Отправлен':'#2e6eb0','Доставлен':'#3a8a4a'
    };
    this.style.borderColor = colors[status];
    this.style.color = colors[status];

    try {
      const res = await fetch('update-status.php', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({id, status})
      });
      const json = await res.json();
      if (json.ok) {
        msg.textContent = 'Сохранено ✓';
        msg.style.color = '#3a8a4a';
        setTimeout(() => msg.textContent = '', 3000);
      } else {
        msg.textContent = 'Ошибка';
        msg.style.color = '#8b2e2e';
      }
    } catch(e) {
      msg.textContent = 'Ошибка соединения';
      msg.style.color = '#8b2e2e';
    }
  });
});
</script>
<?php endif; ?>
</body>
</html>
